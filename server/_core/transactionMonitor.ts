/**
 * Transaction Monitor - Stores routing transaction ID mappings in database
 * Replaces in-memory Map for multi-instance support and persistence
 */

import * as db from "../db";

/**
 * Initialize transaction monitor
 */
export async function startTransactionMonitor() {
  console.log(`[Monitor] Transaction monitor initialized - using database for routing mappings`);
}

/**
 * Store routing transaction ID mapping in database
 */
export async function storeRoutingTransactionId(transactionId: string, routingTransactionId: string) {
  try {
    await db.storeTransactionRouting({
      txSignature: transactionId,
      routingTransactionId: routingTransactionId,
    });
    console.log(`[Monitor] Stored routing transaction mapping: ${transactionId} -> ${routingTransactionId}`);
  } catch (error) {
    console.error(`[Monitor] Failed to store routing transaction mapping:`, error);
    throw error;
  }
}

/**
 * Get routing transaction ID for our internal transaction ID from database
 */
export async function getRoutingTransactionId(transactionId: string): Promise<string | null> {
  try {
    return await db.getRoutingTransactionId(transactionId);
  } catch (error) {
    console.error(`[Monitor] Failed to get routing transaction ID:`, error);
    return null;
  }
}
