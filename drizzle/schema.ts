import { int, mysqlTable, text, timestamp, varchar, mysqlEnum, decimal } from "drizzle-orm/mysql-core";

/**
 * Wallets table - stores connected Solana wallets
 * No user authentication required - wallet address is the identity
 */
export const wallets = mysqlTable("wallets", {
  id: int("id").autoincrement().primaryKey(),
  publicKey: varchar("publicKey", { length: 64 }).notNull().unique(),
  isActive: int("isActive").default(1).notNull(), // 1 = active, 0 = inactive
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Transactions table - stores all private transaction operations
 */
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull(),
  type: mysqlEnum("type", ["shield", "transfer", "unshield"]).notNull(),
  amount: decimal("amount", { precision: 20, scale: 9 }).notNull(), // Amount in lamports
  amountSol: decimal("amountSol", { precision: 20, scale: 9 }).notNull(), // Amount in SOL for display
  recipientPublicKey: varchar("recipientPublicKey", { length: 64 }), // Only for transfers
  txSignature: varchar("txSignature", { length: 128 }).notNull(),
  payinAddress: varchar("payinAddress", { length: 128 }), // ChangeNow deposit address (for transfers)
  status: mysqlEnum("status", ["pending", "confirmed", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Transaction routing mappings table - stores mapping between internal transaction IDs and routing service transaction IDs
 * Replaces in-memory Map for multi-instance support
 */
export const transactionRouting = mysqlTable("transaction_routing", {
  id: int("id").autoincrement().primaryKey(),
  txSignature: varchar("txSignature", { length: 128 }).notNull().unique(), // Internal transaction ID (unique constraint)
  routingTransactionId: varchar("routingTransactionId", { length: 128 }).notNull(), // ChangeNow transaction ID
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type TransactionRouting = typeof transactionRouting.$inferSelect;
export type InsertTransactionRouting = typeof transactionRouting.$inferInsert;
