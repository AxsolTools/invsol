/**
 * API Queue System - Prevents hitting ChangeNow rate limits
 * Queue manages API calls to ChangeNow to ensure we stay under 1800 req/min (30 req/sec)
 * This runs automatically in the background - frontend never sees it
 */

type QueueItem = {
  id: string;
  type: "createTransaction" | "getStatus" | "estimateFees";
  params: any;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  priority: number; // Higher priority = processed first (status checks are higher priority)
};

class APIQueue {
  private queue: QueueItem[] = [];
  private processing = false;
  private readonly maxRequestsPerSecond = 25; // Stay under 30 req/sec limit (safe buffer)
  private readonly minDelayBetweenRequests = 1000 / this.maxRequestsPerSecond; // ~40ms between requests
  private lastRequestTime = 0;

  /**
   * Add item to queue
   */
  enqueue<T>(
    type: QueueItem["type"],
    params: any,
    priority: number = 0
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem = {
        id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        params,
        resolve,
        reject,
        priority,
      };

      // Insert based on priority (higher priority first)
      const insertIndex = this.queue.findIndex((q) => q.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(item);
      } else {
        this.queue.splice(insertIndex, 0, item);
      }

      this.processQueue();
    });
  }

  /**
   * Process queue items one by one, respecting rate limits
   */
  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      try {
        // Enforce rate limit - wait if needed
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minDelayBetweenRequests) {
          const waitTime = this.minDelayBetweenRequests - timeSinceLastRequest;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();

        // Execute the API call
        let result: any;
        switch (item.type) {
          case "createTransaction":
            const { createTransaction } = await import("./changenow");
            result = await createTransaction(item.params);
            break;
          case "getStatus":
            const { getTransactionStatus } = await import("./changenow");
            result = await getTransactionStatus(item.params.transactionId);
            break;
          case "estimateFees":
            const { estimateTransactionFees } = await import("./changenow");
            result = await estimateTransactionFees(
              item.params.fromCurrency,
              item.params.toCurrency,
              item.params.fromAmount
            );
            break;
          default:
            throw new Error(`Unknown queue item type: ${item.type}`);
        }

        item.resolve(result);
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.processing = false;
  }

  /**
   * Get queue status (for monitoring)
   */
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
    };
  }
}

// Singleton instance
const apiQueue = new APIQueue();

/**
 * Queue a transaction creation request
 */
export async function queueCreateTransaction(params: any) {
  return apiQueue.enqueue("createTransaction", params, 1); // Normal priority
}

/**
 * Queue a status check request (higher priority)
 */
export async function queueGetTransactionStatus(transactionId: string) {
  return apiQueue.enqueue("getStatus", { transactionId }, 10); // High priority for status checks
}

/**
 * Queue a fee estimation request
 */
export async function queueEstimateFees(fromCurrency: string, toCurrency: string, fromAmount: number) {
  return apiQueue.enqueue("estimateFees", { fromCurrency, toCurrency, fromAmount }, 5); // Medium priority
}

/**
 * Get queue status for monitoring
 */
export function getQueueStatus() {
  return apiQueue.getQueueStatus();
}

