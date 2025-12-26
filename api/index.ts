import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

console.log("[API] Initializing serverless function...");
console.log("[API] Environment check:", {
  NODE_ENV: process.env.NODE_ENV,
  hasRouter: !!appRouter,
  hasContext: !!createContext,
});

// Start transaction monitor for deposit wallets
(async () => {
  try {
    console.log("[API] Starting transaction monitor...");
    const { startTransactionMonitor } = await import("../server/_core/transactionMonitor");
    await startTransactionMonitor();
    console.log("[API] ✅ Transaction monitor started successfully");
  } catch (error) {
    console.error("[API] ❌ Failed to start transaction monitor:", error);
    if (error instanceof Error) {
      console.error("[API] Error stack:", error.stack);
    }
  }
})();

const app = express();
console.log("[API] Express app created");

// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
console.log("[API] Body parsers configured");

// CORS headers for all routes
app.use((req, res, next) => {
  console.log("[API] CORS middleware - Method:", req.method);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    console.log("[API] OPTIONS request - sending 200");
    return res.sendStatus(200);
  }
  next();
});

// Log all incoming requests for debugging - CRITICAL for Vercel debugging
app.use((req, res, next) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  req.headers['x-request-id'] = requestId;
  
  console.log(`[API] ========== INCOMING REQUEST [${requestId}] ==========`);
  console.log(`[API] Method: ${req.method}`);
  console.log(`[API] URL: ${req.url}`);
  console.log(`[API] Original URL: ${req.originalUrl}`);
  console.log(`[API] Base URL: ${req.baseUrl}`);
  console.log(`[API] Path: ${req.path}`);
  console.log(`[API] Query:`, JSON.stringify(req.query, null, 2));
  console.log(`[API] Headers:`, {
    host: req.headers.host,
    'user-agent': req.headers['user-agent'],
    'content-type': req.headers['content-type'],
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'x-forwarded-proto': req.headers['x-forwarded-proto'],
  });
  console.log(`[API] Body (first 500 chars):`, JSON.stringify(req.body || {}).substring(0, 500));
  
  // Log response when it finishes
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`[API] ========== RESPONSE [${requestId}] ==========`);
    console.log(`[API] Status: ${res.statusCode}`);
    console.log(`[API] Headers:`, res.getHeaders());
    console.log(`[API] Response (first 500 chars):`, typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500));
    return originalSend.call(this, data);
  };
  
  next();
});

// Health check endpoint - must be before catch-all
app.get("/", (req, res) => {
  console.log("[API] Health check endpoint hit");
  res.json({ 
    status: "ok", 
    message: "API is running",
    timestamp: new Date().toISOString(),
    path: req.path,
    url: req.url
  });
});

// tRPC API middleware
console.log("[API] Creating tRPC middleware...");
const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
  onError: ({ error, path, type, ctx, input }) => {
    console.error(`[tRPC] ========== ERROR ==========`);
    console.error(`[tRPC] Path: ${path}`);
    console.error(`[tRPC] Type: ${type}`);
    console.error(`[tRPC] Error message:`, error.message);
    console.error(`[tRPC] Error code:`, error.code);
    console.error(`[tRPC] Error stack:`, error.stack);
    if (error.cause) {
      console.error(`[tRPC] Error cause:`, error.cause);
    }
    if (input) {
      console.error(`[tRPC] Input:`, JSON.stringify(input, null, 2));
    }
    if (ctx) {
      console.error(`[tRPC] Context:`, JSON.stringify(ctx, null, 2));
    }
    console.error(`[tRPC] =========================`);
  },
});
console.log("[API] ✅ tRPC middleware created");

// VERCEL SERVERLESS FIX - Understanding Vercel's path handling:
// When Vercel routes /api/trpc/transaction.getRecent to this function,
// Express sees the path WITHOUT the /api prefix (Vercel strips it)
// So Express sees: /trpc/transaction.getRecent
// Therefore, we mount tRPC at /trpc

console.log("[API] Mounting tRPC middleware...");

// Wrapper middleware to log tRPC requests
const trpcWithLogging = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.log(`[tRPC] ========== tRPC REQUEST ==========`);
  console.log(`[tRPC] Path: ${req.path}`);
  console.log(`[tRPC] URL: ${req.url}`);
  console.log(`[tRPC] Method: ${req.method}`);
  console.log(`[tRPC] Query:`, req.query);
  console.log(`[tRPC] Body:`, req.body);
  console.log(`[tRPC] Attempting to route to tRPC middleware...`);
  
  trpcMiddleware(req, res, (err) => {
    if (err) {
      console.error(`[tRPC] Middleware error:`, err);
    }
    next(err);
  });
};

// Mount tRPC at /trpc (Vercel strips /api prefix when routing to serverless functions)
console.log("[API] Mounting tRPC at /trpc");
app.use("/trpc", trpcWithLogging);

// Also handle /api/trpc in case Vercel doesn't strip the prefix (defensive)
console.log("[API] Mounting tRPC at /api/trpc (defensive)");
app.use("/api/trpc", trpcWithLogging);

// Also mount at root as ultimate fallback
console.log("[API] Mounting tRPC at root (fallback)");
app.use("/", (req, res, next) => {
  if (req.path.includes('trpc') || req.url.includes('trpc')) {
    console.log(`[API] Root fallback - routing tRPC request: ${req.path}`);
    return trpcWithLogging(req, res, next);
  }
  next();
});

console.log("[API] ✅ tRPC middleware mounted");

// Catch-all for unmatched routes - return 404 with helpful message
app.use((req, res) => {
  console.error(`[API] ========== 404 NOT FOUND ==========`);
  console.error(`[API] Path: ${req.path}`);
  console.error(`[API] URL: ${req.url}`);
  console.error(`[API] Original URL: ${req.originalUrl}`);
  console.error(`[API] Method: ${req.method}`);
  console.error(`[API] Query:`, req.query);
  console.error(`[API] Headers:`, {
    host: req.headers.host,
    'content-type': req.headers['content-type'],
  });
  console.error(`[API] ===================================`);
  
  res.status(404).json({ 
    error: "Not found", 
    path: req.path, 
    url: req.url,
    originalUrl: req.originalUrl,
    method: req.method,
    message: "The requested API endpoint was not found. Check that the path is correct.",
    hint: "Expected path format: /api/trpc/[procedureName]"
  });
});

// Error handling middleware - must be last
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[API] ========== UNHANDLED ERROR ==========");
  console.error("[API] Error message:", err.message);
  console.error("[API] Error stack:", err.stack);
  console.error("[API] Request path:", req.path);
  console.error("[API] Request URL:", req.url);
  console.error("[API] ====================================");
  
  if (!res.headersSent) {
    res.status(500).json({ 
      error: "Internal server error",
      message: err.message,
      path: req.path,
      url: req.url
    });
  }
});

console.log("[API] ✅ Express app fully configured");
console.log("[API] ✅ Serverless function ready to export");

// Export the Express app as a serverless function
export default app;
