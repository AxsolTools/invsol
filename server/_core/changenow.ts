/**
 * ChangeNow API Integration
 * 
 * This service handles private SOL transactions using ChangeNow API.
 * All API keys and sensitive operations are kept server-side only.
 * 
 * Documentation: https://documenter.getpostman.com/view/8180765/SVfTPnM8?version=latest
 */

// Read API key directly from process.env at runtime
// This ensures it works in production where env vars are set by the platform

const CHANGENOW_API_URL = "https://api.changenow.io/v2";

export interface ChangeNowTransactionParams {
  fromCurrency: string; // "sol" (lowercase)
  toCurrency: string; // "sol" (lowercase)
  fromNetwork?: string; // "sol" (lowercase - ChangeNow network name)
  toNetwork?: string; // "sol" (lowercase - ChangeNow network name)
  fromAmount?: number; // Amount to send (optional if toAmount provided)
  toAmount?: number; // Amount to receive (optional if fromAmount provided)
  address: string; // Destination wallet address
  flow?: "standard" | "fixed-rate"; // Transaction flow type
  extraId?: string; // For coins that require memo/tag
}

export interface ChangeNowTransactionResponse {
  id: string;
  type: string;
  status: string;
  payinAddress: string; // Address to send funds to
  payoutAddress: string; // Destination address
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  payinExtraId?: string;
  payoutExtraId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeNowTransactionStatus {
  id: string;
  status: "waiting" | "confirming" | "exchanging" | "sending" | "finished" | "failed" | "refunded" | "expired";
  payinAddress: string;
  payoutAddress: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  payinHash?: string;
  payoutHash?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a new exchange transaction
 * This creates a transaction where user sends SOL and receives SOL at destination
 */
export async function createTransaction(
  params: ChangeNowTransactionParams
): Promise<ChangeNowTransactionResponse> {
  const apiKey = process.env.CHANGENOW_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === "") {
    throw new Error("Exchange API key is not configured. Please set CHANGENOW_API_KEY environment variable.");
  }

  const url = `${CHANGENOW_API_URL}/exchange`;
  
  // Validate required parameters
  if (!params.address || params.address.trim().length === 0) {
    throw new Error("Recipient address is required");
  }

  if (!params.fromAmount && !params.toAmount) {
    throw new Error("Either fromAmount or toAmount must be provided");
  }

  if (params.fromAmount && (params.fromAmount <= 0 || isNaN(params.fromAmount))) {
    throw new Error("Invalid fromAmount: must be a positive number");
  }

  const requestBody: any = {
    // ChangeNow expects lowercase currency tickers (sol, btc, eth)
    fromCurrency: params.fromCurrency.toLowerCase(),
    toCurrency: params.toCurrency.toLowerCase(),
    // Network must also be lowercase (sol, eth, btc)
    fromNetwork: (params.fromNetwork || "sol").toLowerCase(),
    toNetwork: (params.toNetwork || "sol").toLowerCase(),
    address: params.address.trim(),
    flow: params.flow || "standard",
  };

  // Only include amount fields if provided
  if (params.fromAmount) {
    requestBody.fromAmount = params.fromAmount;
  }
  if (params.toAmount) {
    requestBody.toAmount = params.toAmount;
  }
  if (params.extraId) {
    requestBody.extraId = params.extraId;
  }

  // Retry logic for transient failures (critical for user funds)
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add timeout for production environments (DigitalOcean App Platform compatible)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-changenow-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || `API error: ${response.status} ${response.statusText}`;
        
        // Don't retry on client errors (4xx), only on server errors (5xx) or network errors
        if (response.status >= 400 && response.status < 500) {
          throw new Error(errorMessage);
        }
        
        // Retry on server errors
        if (attempt < maxRetries - 1) {
          lastError = new Error(errorMessage);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
          continue;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Validate response has required fields
      if (!data || typeof data !== 'object') {
        throw new Error("Invalid response format from exchange API");
      }

      if (!data.id || typeof data.id !== 'string') {
        throw new Error("Invalid response: missing or invalid transaction ID");
      }

      if (!data.payinAddress || typeof data.payinAddress !== 'string') {
        throw new Error("Invalid response: missing or invalid deposit address");
      }

      // Validate address format using Solana PublicKey (more robust)
      try {
        const { PublicKey } = await import("@solana/web3.js");
        new PublicKey(data.payinAddress);
      } catch {
        throw new Error("Invalid deposit address format received - not a valid Solana address");
      }
      
      // Validate payoutAddress matches requested address
      if (!data.payoutAddress || data.payoutAddress !== params.address.trim()) {
        throw new Error("Invalid response: payout address mismatch - security validation failed");
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          // Don't retry on timeout
          throw new Error("Request timeout: The exchange service took too long to respond. Please try again.");
        }
        
        // Retry on network errors
        if (attempt < maxRetries - 1) {
          lastError = error;
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
          continue;
        }
        throw error;
      }
      lastError = new Error("Failed to create exchange transaction");
    }
  }
  
  // If we exhausted all retries, throw the last error
  throw lastError || new Error("Failed to create exchange transaction after multiple attempts");
}

/**
 * Get transaction status by ID
 * Uses v1 API endpoint which is more reliable for status checks
 */
export async function getTransactionStatus(
  transactionId: string
): Promise<ChangeNowTransactionStatus> {
  const apiKey = process.env.CHANGENOW_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === "") {
    throw new Error("Exchange API key is not configured");
  }

  // Use v1 API for status - more reliable than v2 for status checks
  const url = `https://api.changenow.io/v1/transactions/${transactionId}/${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "GET",
    });

    if (!response.ok) {
      // Don't expose provider name in error messages
      console.error("[Exchange] Status check failed:", response.status, response.statusText);
      throw new Error(`Transaction status unavailable (${response.status})`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to get transaction status");
  }
}

/**
 * Get available currencies
 */
export async function getAvailableCurrencies(): Promise<any[]> {
  const apiKey = process.env.CHANGENOW_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === "") {
    throw new Error("Exchange API key is not configured");
  }

  const url = `${CHANGENOW_API_URL}/exchange/currencies`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-changenow-api-key": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Exchange API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to get available currencies");
  }
}

/**
 * Get exchange rate for SOL to SOL
 * Note: ChangeNow API uses lowercase currency tickers (sol, btc, eth)
 */
export async function getExchangeRate(
  fromCurrency: string = "sol",
  toCurrency: string = "sol",
  fromNetwork: string = "sol",
  toNetwork: string = "sol",
  fromAmount?: number,
  toAmount?: number
): Promise<{
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
}> {
  const apiKey = process.env.CHANGENOW_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === "") {
    throw new Error("Exchange API key is not configured");
  }

  const url = new URL(`${CHANGENOW_API_URL}/exchange/estimated-amount`);
  // ChangeNow requires lowercase for all params
  url.searchParams.set("fromCurrency", fromCurrency.toLowerCase());
  url.searchParams.set("toCurrency", toCurrency.toLowerCase());
  url.searchParams.set("fromNetwork", fromNetwork.toLowerCase());
  url.searchParams.set("toNetwork", toNetwork.toLowerCase());
  if (fromAmount) {
    url.searchParams.set("fromAmount", fromAmount.toString());
  }
  if (toAmount) {
    url.searchParams.set("toAmount", toAmount.toString());
  }

  try {
    // Add timeout for serverless environments
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-changenow-api-key": apiKey,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error("Request timeout. Please try again.");
      }
      throw error;
    }
    throw new Error("Failed to get exchange rate");
  }
}

/**
 * Estimate transaction fees and receive amount
 * Returns fee information without exposing ChangeNow branding
 * Note: ChangeNow API uses lowercase currency tickers and network names
 */
export async function estimateTransactionFees(
  fromCurrency: string = "sol",
  toCurrency: string = "sol",
  fromNetwork: string = "sol",
  toNetwork: string = "sol",
  fromAmount: number
): Promise<{
  sendAmount: number;
  receiveAmount: number;
  feeAmount: number;
  feePercentage: number;
  isValid: boolean;
  transactionSpeedForecast?: string;
  toCurrency: string;
}> {
  const apiKey = process.env.CHANGENOW_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === "") {
    throw new Error("API key is not configured");
  }

  if (fromAmount <= 0 || isNaN(fromAmount)) {
    throw new Error("Invalid amount");
  }

  try {
    // Add timeout for production environments (DigitalOcean App Platform compatible)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    // Get exchange rate to calculate what the recipient will receive
    const rateInfo = await getExchangeRate(
      fromCurrency,
      toCurrency,
      fromNetwork,
      toNetwork,
      fromAmount
    );
    
    clearTimeout(timeoutId);
    
    const sendAmount = fromAmount;
    const receiveAmount = rateInfo.toAmount || fromAmount;
    const feeAmount = sendAmount - receiveAmount;
    const feePercentage = sendAmount > 0 ? (feeAmount / sendAmount) * 100 : 0;

    return {
      sendAmount,
      receiveAmount,
      feeAmount: Math.max(0, feeAmount), // Ensure non-negative
      feePercentage: Math.max(0, feePercentage),
      isValid: receiveAmount > 0 && sendAmount > 0,
      transactionSpeedForecast: (rateInfo as any).transactionSpeedForecast,
      toCurrency: toCurrency.toUpperCase(),
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error("Fee estimation timeout. Please try again.");
      }
      throw new Error(`Failed to estimate fees: ${error.message}`);
    }
    throw new Error("Failed to estimate transaction fees");
  }
}

/**
 * Validate an address via the exchange API
 * More accurate than local regex validation
 */
export async function validateAddress(
  currency: string,
  address: string
): Promise<{ result: boolean; message?: string }> {
  const apiKey = process.env.CHANGENOW_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === "") {
    throw new Error("API key is not configured");
  }

  const url = `https://api.changenow.io/v2/validate/address?currency=${currency.toLowerCase()}&address=${encodeURIComponent(address)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-changenow-api-key": apiKey,
      },
    });

    if (!response.ok) {
      // If API fails, return false but don't crash
      return { result: false, message: "Address validation unavailable" };
    }

    const data = await response.json();
    return {
      result: data.result === true,
      message: data.message,
    };
  } catch (error) {
    // Graceful fallback - allow the transaction to proceed
    console.warn("[validateAddress] API validation failed, allowing:", error);
    return { result: true, message: "Validation skipped" };
  }
}

