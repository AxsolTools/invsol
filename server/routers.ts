import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as solana from "./solana";
import { TRPCError } from "@trpc/server";
import { 
  SUPPORTED_CURRENCIES, 
  getCurrency, 
  getNetwork, 
  isValidAddress, 
  getAddressValidationError 
} from "./_core/currencies";

export const appRouter = router({
  // Wallet operations
  wallet: router({
    // Connect a wallet (upsert)
    connect: publicProcedure
      .input(
        z.object({
          publicKey: z.string().min(32).max(64),
        })
      )
      .mutation(async ({ input }) => {
        try {
          // Validate Solana public key format
          if (!solana.isValidPublicKey(input.publicKey)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid Solana public key format. Please ensure you're using a valid Solana wallet address.",
            });
          }

          console.log(`[Wallet] Attempting to register wallet: ${input.publicKey.slice(0, 8)}...`);
          
          // Check database connection first
          const dbInstance = await db.getDb();
          if (!dbInstance) {
            console.error("[Wallet] Database not available");
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database connection failed. Please check server configuration.",
            });
          }
          
          const walletId = await db.upsertWallet(input.publicKey);
          const wallet = await db.getWalletByPublicKey(input.publicKey);

          if (!wallet) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Wallet was created but could not be retrieved. Please try again.",
            });
          }

          console.log(`[Wallet] Successfully registered wallet: ${input.publicKey.slice(0, 8)}... (ID: ${walletId})`);

          return {
            success: true,
            wallet,
          };
        } catch (error) {
          // Log the full error for debugging
          console.error("[Wallet] Registration error:", error);
          console.error("[Wallet] Error stack:", error instanceof Error ? error.stack : "No stack trace");
          
          // If it's already a TRPCError, re-throw it
          if (error instanceof TRPCError) {
            throw error;
          }

          // Provide more specific error messages
          const errorMessage = error instanceof Error ? error.message : "Failed to connect wallet";
          
          // Check for database-related errors
          if (errorMessage.includes("Database") || errorMessage.includes("DATABASE_URL") || errorMessage.includes("relation") || errorMessage.includes("does not exist")) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database tables not found. Please run database migrations first.",
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: errorMessage,
          });
        }
      }),

    // List connected wallets (for a given public key)
    list: publicProcedure
      .input(
        z.object({
          publicKey: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        if (!input?.publicKey) {
          return [];
        }

        const wallet = await db.getWalletByPublicKey(input.publicKey);
        return wallet ? [wallet] : [];
      }),

    // Disconnect a wallet (mark as inactive)
    disconnect: publicProcedure
      .input(
        z.object({
          publicKey: z.string().min(32).max(64),
        })
      )
      .mutation(async ({ input }) => {
        try {
          // Validate Solana public key format
          if (!solana.isValidPublicKey(input.publicKey)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid Solana public key format",
            });
          }

          const wallet = await db.getWalletByPublicKey(input.publicKey);
          
          if (!wallet) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Wallet not found",
            });
          }

          // Mark wallet as inactive
          const dbInstance = await db.getDb();
          if (!dbInstance) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database not available",
            });
          }

          const { wallets } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          
          await (dbInstance as any).update(wallets as any)
            .set({ isActive: 0, updatedAt: new Date() })
            .where(eq(wallets.publicKey, input.publicKey));

          console.log(`[Wallet] Disconnected wallet: ${input.publicKey.slice(0, 8)}...`);

          return {
            success: true,
            message: "Wallet disconnected successfully",
          };
        } catch (error) {
          console.error("[Wallet] Disconnect error:", error);
          
          if (error instanceof TRPCError) {
            throw error;
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to disconnect wallet",
          });
        }
      }),

    // Get wallet balance from Solana
    getBalance: publicProcedure
      .input(
        z.object({
          publicKey: z.string().min(32).max(64),
        })
      )
      .query(async ({ input }) => {
        try {
          const balance = await solana.getBalance(input.publicKey);
          return {
            publicKey: input.publicKey,
            balance,
            balanceSol: balance / solana.LAMPORTS_PER_SOL,
          };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to fetch balance",
          });
        }
      }),

    // Get private balance (Light Protocol)
    getPrivateBalance: publicProcedure
      .input(
        z.object({
          publicKey: z.string().min(32).max(64),
        })
      )
      .query(async ({ input }) => {
        try {
          const privateBalance = await solana.getPrivateBalance(input.publicKey);
          return {
            publicKey: input.publicKey,
            privateBalance,
            privateBalanceSol: privateBalance / solana.LAMPORTS_PER_SOL,
          };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to fetch private balance",
          });
        }
      }),
  }),

  // Transaction operations
  transaction: router({
    // Shield operation (public -> private)
    shield: publicProcedure
      .input(
        z.object({
          publicKey: z.string().min(32).max(64),
          amountSol: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          // Ensure wallet exists
          const wallet = await db.getWalletByPublicKey(input.publicKey);
          if (!wallet) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "No wallet connected. Please connect your wallet first.",
            });
          }

          const amount = parseFloat(input.amountSol);
          if (isNaN(amount) || amount <= 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid amount",
            });
          }

          // Perform shield operation via Light Protocol
          const txSignature = await solana.shieldAssets(input.publicKey, amount);

          const walletRecord: any = wallet;
          // Record transaction
          await db.createTransaction({
            walletId: walletRecord?.id,
            type: "shield",
            amount: String(amount * solana.LAMPORTS_PER_SOL),
            amountSol: String(amount),
            txSignature,
            status: "pending",
            recipientPublicKey: null,
          });

          return {
            success: true,
            txSignature,
          };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Shield operation failed",
          });
        }
      }),

    // Get supported currencies and their networks
    getSupportedCurrencies: publicProcedure.query(() => {
      return SUPPORTED_CURRENCIES.map(c => ({
        ticker: c.ticker,
        name: c.name,
        symbol: c.symbol,
        networks: c.networks,
        defaultNetwork: c.defaultNetwork,
        minAmount: c.minAmount,
      }));
    }),

    // Estimate transaction fees (before processing)
    estimateFees: publicProcedure
      .input(
        z.object({
          amount: z.string(),
          currency: z.string().default("sol"),
          network: z.string().default("sol"),
        })
      )
      .query(async ({ input }) => {
        try {
          const amount = parseFloat(input.amount);
          if (isNaN(amount) || amount <= 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid amount",
            });
          }

          // Validate currency exists
          const currencyConfig = getCurrency(input.currency);
          if (!currencyConfig) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Unsupported currency: ${input.currency}`,
            });
          }

          // Validate network exists for this currency
          const networkConfig = getNetwork(input.currency, input.network);
          if (!networkConfig) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Unsupported network ${input.network} for ${currencyConfig.symbol}`,
            });
          }

          // Check minimum amount
          if (amount < currencyConfig.minAmount) {
            return {
              sendAmount: amount,
              receiveAmount: 0,
              feeAmount: 0,
              feePercentage: 0,
              isValid: false,
              error: `Minimum amount is ${currencyConfig.minAmount} ${currencyConfig.symbol}`,
            };
          }

          // Direct ChangeNow estimate call with selected currency/network
          // ChangeNow API requires lowercase currency tickers and network names
          const { estimateTransactionFees } = await import("./_core/changenow");
          const feeEstimate = await estimateTransactionFees(
            input.currency.toLowerCase(),
            input.currency.toLowerCase(), // Same currency for privacy
            input.network.toLowerCase(),
            input.network.toLowerCase(),
            amount
          );

          return {
            sendAmount: Number(feeEstimate.sendAmount ?? amount),
            receiveAmount: Number(feeEstimate.receiveAmount ?? amount),
            feeAmount: Number(feeEstimate.feeAmount ?? 0),
            feePercentage: Number(feeEstimate.feePercentage ?? 0),
            isValid: !!feeEstimate.isValid,
            currency: currencyConfig.symbol,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to estimate fees",
          });
        }
      }),

    // Create transfer - user sends crypto to deposit wallet via exchange routing
    transfer: publicProcedure
      .input(
        z
          .object({
            recipientAddress: z.string().min(20).max(100),
            amount: z.string(),
            currency: z.string().default("sol"),
            network: z.string().default("sol"),
          })
          .nullish()
      )
      .mutation(async ({ input, ctx }) => {
        try {
          // tRPC v11 batch format: {"0": {"json": {...}}}
          const rawBody = (ctx.req as any)?.body;
          const batchInput = rawBody?.["0"]?.json;
          const payload = input ?? batchInput;

          if (!payload || !payload.recipientAddress || !payload.amount) {
            console.error("[Transfer] Missing payload. input:", input, "batchInput:", batchInput);
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Missing transfer payload (recipientAddress, amount)",
            });
          }

          // Get currency/network with defaults
          const currency = (payload.currency || "sol").toLowerCase();
          const network = (payload.network || currency).toLowerCase();

          // Validate currency exists
          const currencyConfig = getCurrency(currency);
          if (!currencyConfig) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Unsupported currency: ${currency}`,
            });
          }

          // Validate network exists for this currency
          const networkConfig = getNetwork(currency, network);
          if (!networkConfig) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Unsupported network ${network} for ${currencyConfig.symbol}`,
            });
          }

          // Validate recipient address format based on network
          if (!isValidAddress(payload.recipientAddress, network)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: getAddressValidationError(network),
            });
          }

          const amount = parseFloat(payload.amount);
          if (isNaN(amount) || amount <= 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid amount",
            });
          }

          // Check minimum amount
          if (amount < currencyConfig.minAmount) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Minimum amount is ${currencyConfig.minAmount} ${currencyConfig.symbol}`,
            });
          }

          // Create private routing transaction via exchange API
          console.log(`[Transfer] Creating transaction: ${amount} ${currencyConfig.symbol} on ${network}`);
          const { queueCreateTransaction } = await import("./_core/apiQueue");
          const routingTx: any = await queueCreateTransaction({
            fromCurrency: currency,
            toCurrency: currency, // Same currency for privacy
            fromNetwork: network,
            toNetwork: network,
            fromAmount: amount,
            address: payload.recipientAddress.trim(),
            flow: "standard",
          });

          // Generate user-friendly transaction reference (hide internal IDs)
          const { nanoid } = await import("nanoid");
          const userTxRef = `NR-${nanoid(8).toUpperCase()}`;
          
          // Log for debugging
          console.log("[Transfer] Transaction created successfully, ID:", routingTx.id, "Length:", routingTx.id?.length);

          // Try to store in database (optional - don't fail if DB unavailable)
          try {
            const { storeRoutingTransactionId } = await import("./_core/transactionMonitor");
            await storeRoutingTransactionId(userTxRef, routingTx.id);
            
            const placeholderWallet = await db.getWalletByPublicKey("DEPOSIT_PLACEHOLDER");
            const walletId = placeholderWallet?.id || (await db.upsertWallet("DEPOSIT_PLACEHOLDER").catch(() => 1));
            
            await db.createTransaction({
              walletId: typeof walletId === 'number' ? walletId : 1,
              type: "transfer",
              amount: String(amount),
              amountSol: String(amount), // Legacy field, now holds any currency amount
              recipientPublicKey: payload.recipientAddress,
              txSignature: userTxRef,
              payinAddress: routingTx.payinAddress,
              status: "pending",
            });
            console.log("[Transfer] Transaction saved to database");
          } catch (dbError) {
            console.warn("[Transfer] Database unavailable, transaction created but not persisted");
          }

          // Return success with sanitized data
          return {
            success: true,
            txSignature: userTxRef,
            payinAddress: routingTx.payinAddress,
            routingTransactionId: routingTx.id,
            amount: amount,
            currency: currencyConfig.symbol,
            network: network,
            recipientAddress: payload.recipientAddress,
          };
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          const errorMessage = error instanceof Error ? error.message : "Transfer operation failed";
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: errorMessage,
          });
        }
      }),

    // Unshield operation (private -> public)
    unshield: publicProcedure
      .input(
        z.object({
          publicKey: z.string().min(32).max(64),
          amountSol: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          // Ensure wallet exists
          const wallet = await db.getWalletByPublicKey(input.publicKey);
          if (!wallet) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "No wallet connected. Please connect your wallet first.",
            });
          }

          const amount = parseFloat(input.amountSol);
          if (isNaN(amount) || amount <= 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid amount",
            });
          }

          const walletRecord: any = wallet;

          // Perform unshield operation via Light Protocol
          const txSignature = await solana.unshieldAssets(input.publicKey, amount);

          // Record transaction
          await db.createTransaction({
            walletId: walletRecord?.id,
            type: "unshield",
            amount: String(amount * solana.LAMPORTS_PER_SOL),
            amountSol: String(amount),
            txSignature,
            status: "pending",
            recipientPublicKey: null,
          });

          return {
            success: true,
            txSignature,
          };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Unshield operation failed",
          });
        }
      }),

    // Get recent transactions (last 50)
    getRecent: publicProcedure
      .query(async () => {
        const dbInstance = await db.getDb();
        if (!dbInstance) {
          return [];
        }

          const { transactions } = await import("../drizzle/schema");
          const { desc } = await import("drizzle-orm");

          return await (dbInstance as any)
            .select()
            .from(transactions as any)
            .orderBy(desc((transactions as any).createdAt))
            .limit(50);
      }),

    // Get transaction history for a specific wallet
    history: publicProcedure
      .input(
        z.object({
          publicKey: z.string().min(32).max(64),
        })
      )
      .query(async ({ input }) => {
        const wallet: any = await db.getWalletByPublicKey(input.publicKey);
        if (!wallet) {
          return [];
        }

        return await db.getTransactionsByWalletId(wallet.id);
      }),

    // Get single transaction by signature
    getTransaction: publicProcedure
      .input(
        z.object({
          txSignature: z.string(),
        })
      )
      .query(async ({ input }) => {
        const tx: any = await db.getTransactionBySignature(input.txSignature);
        if (!tx) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }
        
        // Get routing status (internal routing service) via queue
        let routingStatus = null;
        if (tx.payinAddress && tx.status === "pending") {
          try {
            const { getRoutingTransactionId } = await import("./_core/transactionMonitor");
            const routingTxId = await getRoutingTransactionId(input.txSignature);
            if (routingTxId) {
              const { queueGetTransactionStatus } = await import("./_core/apiQueue");
              routingStatus = await queueGetTransactionStatus(routingTxId);
            }
          } catch (error) {
            console.warn(`[GetTransaction] Could not get routing status:`, error);
          }
        }
        
        return {
          ...tx,
          routingStatus,
        };
      }),

    // Get routing transaction status (internal) - uses queue to prevent rate limits
    getRoutingStatus: publicProcedure
      .input(
        z.object({
          routingTransactionId: z.string(),
        })
      )
      .query(async ({ input }) => {
        try {
          const { queueGetTransactionStatus } = await import("./_core/apiQueue");
          const rawStatus: any = await queueGetTransactionStatus(input.routingTransactionId);
          
          // Return only sanitized status info - hide internal details
          return {
            status: rawStatus.status as string,
            fromAmount: rawStatus.fromAmount as number,
            toAmount: rawStatus.toAmount as number,
            // Only show truncated payout hash when completed (for user verification)
            payoutHash: rawStatus.payoutHash ? `${String(rawStatus.payoutHash).slice(0, 16)}...` : undefined,
            createdAt: rawStatus.createdAt as string,
            updatedAt: rawStatus.updatedAt as string,
          };
        } catch (error) {
          // If transaction not found yet (404) or API error, return waiting status
          // This prevents 500 errors from flooding the frontend during initial polling
          console.warn("[getRoutingStatus] Status check failed, returning waiting:", 
            error instanceof Error ? error.message : error);
          return {
            status: "waiting",
            fromAmount: 0,
            toAmount: 0,
            payoutHash: undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
      }),

    // Confirm transaction status
    confirmTransaction: publicProcedure
      .input(
        z.object({
          txSignature: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const tx = await db.getTransactionBySignature(input.txSignature);
        if (!tx) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        try {
          const confirmed = await solana.confirmTransaction(input.txSignature);
          await db.updateTransactionStatus(
            input.txSignature,
            confirmed ? "confirmed" : "failed",
            confirmed ? undefined : "Transaction failed to confirm"
          );

          return {
            success: true,
            confirmed,
          };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to confirm transaction",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
