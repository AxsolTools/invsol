import { pgTable, serial, text, timestamp, varchar, numeric, integer, pgEnum } from "drizzle-orm/pg-core";

// Enums for PostgreSQL
export const transactionTypeEnum = pgEnum("transaction_type", ["shield", "transfer", "unshield"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "confirmed", "failed"]);

/**
 * Wallets table - stores connected Solana wallets
 * No user authentication required - wallet address is the identity
 */
export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  publicKey: varchar("publicKey", { length: 64 }).notNull().unique(),
  isActive: integer("isActive").default(1).notNull(), // 1 = active, 0 = inactive
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/**
 * Transactions table - stores all private transaction operations
 */
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("walletId").notNull(),
  type: transactionTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 20, scale: 9 }).notNull(), // Amount in lamports
  amountSol: numeric("amountSol", { precision: 20, scale: 9 }).notNull(), // Amount in SOL for display
  recipientPublicKey: varchar("recipientPublicKey", { length: 64 }), // Only for transfers
  txSignature: varchar("txSignature", { length: 128 }).notNull(),
  payinAddress: varchar("payinAddress", { length: 128 }), // Deposit address (for transfers)
  status: transactionStatusEnum("status").default("pending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/**
 * Transaction routing mappings table - stores mapping between internal transaction IDs and routing service transaction IDs
 * Replaces in-memory Map for multi-instance support
 */
export const transactionRouting = pgTable("transaction_routing", {
  id: serial("id").primaryKey(),
  txSignature: varchar("txSignature", { length: 128 }).notNull().unique(), // Internal transaction ID (unique constraint)
  routingTransactionId: varchar("routingTransactionId", { length: 128 }).notNull(), // Routing service transaction ID
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type TransactionRouting = typeof transactionRouting.$inferSelect;
export type InsertTransactionRouting = typeof transactionRouting.$inferInsert;
