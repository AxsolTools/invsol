# Concurrency & Multi-User Handling Fixes

## Overview
This document outlines all the fixes implemented to handle multiple simultaneous visitors and ensure proper fund handling across different users, browsers, and devices.

## Changes Implemented

### 1. ✅ Database Transaction Routing Table
- **File**: `drizzle/schema.ts`, `server/db.ts`
- **What**: Replaced in-memory `Map` with persistent database table
- **Migration**: `drizzle/0005_add_transaction_routing_and_constraints.sql`
- **Impact**: 
  - Works across multiple server instances
  - Survives server restarts
  - Supports load balancing

### 2. ✅ UNIQUE Constraint on Transaction Signatures
- **File**: `drizzle/0005_add_transaction_routing_and_constraints.sql`
- **What**: Added UNIQUE constraint on `transactions.txSignature`
- **Impact**: Prevents duplicate transactions, ensures idempotency

### 3. ✅ Backend API Queue System
- **File**: `server/_core/apiQueue.ts`
- **What**: Automatic queue system for ChangeNow API calls
- **Features**:
  - Limits to 25 requests/second (under ChangeNow's 30 req/sec limit)
  - Priority-based queue (status checks have higher priority)
  - Automatic rate limiting (invisible to frontend)
  - Queue waits in background - no user waiting needed
- **Impact**: Prevents hitting ChangeNow API rate limits automatically

### 4. ✅ Rate Limiting Middleware
- **File**: `server/_core/rateLimiter.ts`, `server/_core/index.ts`
- **What**: IP-based rate limiting
- **Limits**:
  - General API: 100 requests/minute per IP
  - Transaction creation: 10 requests/minute per IP (via transactionRateLimiter - can be added)
- **Impact**: Prevents API abuse and DoS attacks

### 5. ✅ Increased Database Connection Pool
- **File**: `server/db.ts`
- **What**: Increased from 10 to 20 connections (configurable via `DB_MAX_CONNECTIONS` env var)
- **Impact**: Better concurrency handling

### 6. ✅ Request Deduplication/Idempotency
- **File**: `server/routers.ts` - `transfer` mutation
- **What**: Checks for existing transactions before creating new ones
- **Impact**: Prevents duplicate transactions if user clicks multiple times

### 7. ✅ User Isolation
- **Status polling is isolated per transaction** via unique `routingTransactionId`
- Each transaction gets unique `payinAddress` from ChangeNow
- Status bar displays are unique per transaction (based on `transactionResult.routingTransactionId`)
- No cross-contamination between different users/browsers/devices

## Database Migration Required

⚠️ **IMPORTANT**: Run this migration in your PostgreSQL database:

```sql
-- File: drizzle/0005_add_transaction_routing_and_constraints.sql
```

This migration:
1. Adds UNIQUE constraint on `transactions.txSignature`
2. Creates `transaction_routing` table for ID mappings
3. Adds indexes for performance

## Environment Variables

Optional (has defaults):
- `DB_MAX_CONNECTIONS` - Database connection pool size (default: 20)

## Status Display

The status bar is:
- ✅ Unique per transaction (isolated by `routingTransactionId`)
- ✅ Matches website theme (dark background, primary colors, matching borders)
- ✅ Shows real-time progress with appropriate colors
- ✅ Updates automatically via polling (every 5 seconds)
- ✅ Stops polling when transaction completes

## Testing Checklist

- [ ] Run database migration
- [ ] Test multiple users creating transactions simultaneously
- [ ] Test status polling for multiple transactions at once
- [ ] Verify no rate limit errors occur
- [ ] Verify transactions are not duplicated
- [ ] Verify status updates don't interfere between users

## Architecture Notes

1. **Queue System**: All ChangeNow API calls go through the queue automatically
2. **Rate Limiting**: Applied at middleware level, per IP address
3. **User Isolation**: Each transaction is completely isolated by unique IDs
4. **Database**: All mappings stored in database for multi-instance support

