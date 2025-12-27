/**
 * Run database migration script
 * Executes the SQL migration file directly against the database
 */

import "dotenv/config";
import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ Error: DATABASE_URL environment variable is not set");
    console.error("Please set DATABASE_URL in your .env file or environment variables");
    process.exit(1);
  }

  // Run migrations in order
  const migrationFiles = [
    join(process.cwd(), "drizzle", "0004_postgres_migration.sql"),
    join(process.cwd(), "drizzle", "0005_add_transaction_routing_and_constraints.sql"),
  ];
  
  try {
    let allSql = "";
    for (const migrationFile of migrationFiles) {
      console.log("📄 Reading migration file:", migrationFile);
      allSql += readFileSync(migrationFile, "utf-8") + "\n";
    }
    const sql = allSql;
    
    console.log("🔌 Connecting to database...");
    const db = postgres(databaseUrl);
    
    console.log("▶️  Running migration...");
    await db.unsafe(sql);
    
    console.log("✅ Migration completed successfully!");
    
    // Verify the migration worked
    console.log("🔍 Verifying migration...");
    const tables = await db`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'transaction_routing'
    `;
    
    if (tables.length > 0) {
      console.log("✅ transaction_routing table exists");
    } else {
      console.warn("⚠️  Warning: transaction_routing table not found");
    }
    
    const constraints = await db`
      SELECT conname 
      FROM pg_constraint 
      WHERE conname = 'transactions_txsignature_unique'
    `;
    
    if (constraints.length > 0) {
      console.log("✅ UNIQUE constraint on transactions.txSignature exists");
    } else {
      console.warn("⚠️  Warning: UNIQUE constraint not found");
    }
    
    await db.end();
    console.log("✨ All done!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
    }
    process.exit(1);
  }
}

runMigration();

