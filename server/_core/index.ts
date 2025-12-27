import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Verify ChangeNow API key is configured at startup
  const changenowApiKey = process.env.CHANGENOW_API_KEY;
  if (!changenowApiKey) {
    console.warn("[Server] ⚠️  WARNING: CHANGENOW_API_KEY environment variable is not set. Fee estimation and transactions will fail.");
  } else {
    console.log("[Server] ✓ ChangeNow API key is configured");
  }
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // CORS headers for all routes
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Rate limiting - protect against abuse
  try {
    const { apiRateLimiter } = await import("./rateLimiter");
    // Apply general rate limiting to all API routes
    app.use("/api", apiRateLimiter);
    console.log("[Server] Rate limiting enabled");
  } catch (error) {
    console.error("[Server] Failed to enable rate limiting:", error);
  }
  
  // Initialize transaction monitor (routing service handles all monitoring)
  try {
    const { startTransactionMonitor } = await import("./transactionMonitor");
    await startTransactionMonitor();
    console.log("[Server] Transaction monitor initialized");
  } catch (error) {
    console.error("[Server] Failed to initialize transaction monitor:", error);
  }
  
  // tRPC API - handle all HTTP methods
  const trpcMiddleware = createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ error, path, type }) => {
      console.error(`[tRPC] Error on path ${path} (${type}):`, error);
    },
  });
  
  app.all("/api/trpc/*", trpcMiddleware);
  
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
