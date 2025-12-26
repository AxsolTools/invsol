import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { wallets, transactions, transactionRouting, InsertWallet, InsertTransaction, InsertTransactionRouting } from "../drizzle/schema";
import * as schema from "../drizzle/schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

// Lazily create the drizzle instance
export async function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      console.error("[Database] DATABASE_URL environment variable is not set");
      return null;
    }
    
    try {
      // Create postgres connection (increased pool size for concurrency)
      const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS || "20");
      _sql = postgres(process.env.DATABASE_URL, { max: maxConnections });
      
      // Create drizzle instance with postgres connection and schema
      _db = drizzle(_sql, { schema });
      
      // Test the connection by attempting a simple query
      await _sql`SELECT 1`;
      console.log("[Database] Connected successfully to PostgreSQL");
    } catch (error) {
      console.error("[Database] Failed to connect:", error);
      const errorDetails = error instanceof Error ? error.message : String(error);
      console.error("[Database] Error details:", errorDetails);
      _db = null;
      _sql = null;
    }
  }
  return _db;
}

// Wallet operations
export async function upsertWallet(publicKey: string): Promise<number> {
  const db = await getDb();
  if (!db) {
    const errorMsg = process.env.DATABASE_URL 
      ? "Database connection failed. Please check your database configuration."
      : "Database not configured. DATABASE_URL environment variable is missing.";
    console.error("[Database] upsertWallet failed:", errorMsg);
    throw new Error(errorMsg);
  }

  try {
    // Check if wallet exists
    const existing = await db.select().from(wallets).where(eq(wallets.publicKey, publicKey)).limit(1);
    
    if (existing.length > 0) {
      // Update existing wallet
      await db.update(wallets)
        .set({ isActive: 1, updatedAt: new Date() })
        .where(eq(wallets.publicKey, publicKey));
      console.log(`[Database] Updated existing wallet: ${publicKey.slice(0, 8)}...`);
      return existing[0]!.id;
    }

    // Insert new wallet
    const result = await db.insert(wallets).values({
      publicKey,
      isActive: 1,
    }).returning({ id: wallets.id });

    // PostgreSQL returns the inserted row with returning()
    if (!result || result.length === 0) {
      throw new Error("Failed to get insert ID from database - insert may have failed");
    }
    
    const walletId = result[0].id;
    console.log(`[Database] Created new wallet: ${publicKey.slice(0, 8)}... (ID: ${walletId})`);
    return walletId;
  } catch (error) {
    console.error("[Database] Error in upsertWallet:", error);
    throw new Error(
      error instanceof Error 
        ? `Database operation failed: ${error.message}`
        : "Database operation failed"
    );
  }
}

export async function getWalletByPublicKey(publicKey: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(wallets).where(eq(wallets.publicKey, publicKey)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getWalletsByPublicKeys(publicKeys: string[]) {
  const db = await getDb();
  if (!db || publicKeys.length === 0) return [];

  // Note: This is a simple implementation. For production, use proper SQL IN clause
  const results = await Promise.all(
    publicKeys.map(pk => db.select().from(wallets).where(eq(wallets.publicKey, pk)).limit(1))
  );
  
  return results.filter(r => r.length > 0).map(r => r[0]!);
}

// Transaction operations
export async function createTransaction(tx: InsertTransaction) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.insert(transactions).values(tx).returning({ id: transactions.id });
  
  // PostgreSQL returns the inserted row with returning()
  if (!result || result.length === 0) {
    throw new Error("Failed to get insert ID from database - insert may have failed");
  }
  return result[0].id;
}

export async function getTransactionsByWalletId(walletId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(transactions)
    .where(eq(transactions.walletId, walletId))
    .orderBy(desc(transactions.createdAt))
    .limit(50);
}

export async function getTransactionBySignature(txSignature: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(transactions)
    .where(eq(transactions.txSignature, txSignature))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function updateTransactionStatus(
  txSignature: string,
  status: "pending" | "confirmed" | "failed",
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(transactions)
    .set({
      status,
      errorMessage: errorMessage || null,
      updatedAt: new Date(),
    })
    .where(eq(transactions.txSignature, txSignature));
}

// Transaction routing operations
export async function storeTransactionRouting(tx: InsertTransactionRouting) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    // Try to insert first
    await db.insert(transactionRouting).values(tx);
  } catch (error: any) {
    // If duplicate, update instead (idempotency)
    if (error?.code === "23505" || error?.message?.includes("unique") || error?.message?.includes("duplicate")) {
      await db
        .update(transactionRouting)
        .set({
          routingTransactionId: tx.routingTransactionId,
          updatedAt: new Date(),
        })
        .where(eq(transactionRouting.txSignature, tx.txSignature));
    } else {
      console.error("[Database] Error in storeTransactionRouting:", error);
      throw error;
    }
  }
}

export async function getTransactionRouting(txSignature: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(transactionRouting)
    .where(eq(transactionRouting.txSignature, txSignature))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function getRoutingTransactionId(txSignature: string): Promise<string | null> {
  const routing = await getTransactionRouting(txSignature);
  return routing?.routingTransactionId || null;
}
