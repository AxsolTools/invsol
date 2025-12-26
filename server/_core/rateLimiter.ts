/**
 * Rate Limiter Middleware - Prevents API abuse
 * Protects against DoS and ensures fair usage across all users
 */

import type { Request, Response, NextFunction } from "express";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (for single instance) - consider Redis for multi-instance
const store: RateLimitStore = {};

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 60000);

/**
 * Get client identifier from request
 */
function getClientId(req: Request): string {
  // Use IP address as identifier (works across different browsers/devices)
  // For production, consider using a session token or user ID if you add auth
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded 
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0].trim())
    : req.socket.remoteAddress || "unknown";
  
  return ip;
}

/**
 * Rate limiter options
 */
export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string; // Error message when limit exceeded
}

/**
 * Create rate limiter middleware
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, message = "Too many requests, please try again later" } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = getClientId(req);
    const now = Date.now();

    // Get or create entry for this client
    if (!store[clientId] || store[clientId].resetTime < now) {
      store[clientId] = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    // Increment count
    store[clientId].count++;

    // Check if limit exceeded
    if (store[clientId].count > maxRequests) {
      const retryAfter = Math.ceil((store[clientId].resetTime - now) / 1000);
      res.status(429).json({
        error: message,
        retryAfter, // Seconds until reset
      });
      return;
    }

    // Add rate limit headers
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - store[clientId].count));
    res.setHeader("X-RateLimit-Reset", new Date(store[clientId].resetTime).toISOString());

    next();
  };
}

/**
 * General API rate limiter - 100 requests per minute per IP
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: "Too many API requests. Please slow down.",
});

/**
 * Strict rate limiter for transaction creation - 10 requests per minute per IP
 */
export const transactionRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: "Too many transaction requests. Please wait before creating another transaction.",
});

