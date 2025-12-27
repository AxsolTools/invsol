/**
 * Multi-Currency Configuration for Private Transfers
 * Supports 7 major cryptocurrencies with their respective networks
 */

export interface NetworkConfig {
  id: string;           // ChangeNow network identifier (lowercase)
  name: string;         // Display name
  addressPlaceholder: string;
}

export interface CurrencyConfig {
  ticker: string;       // Currency ticker (lowercase for API)
  name: string;         // Full name
  symbol: string;       // Display symbol (uppercase)
  networks: NetworkConfig[];
  defaultNetwork: string;
  decimals: number;
  minAmount: number;    // Minimum amount for transfers
}

// Address validation patterns for each blockchain type
export const ADDRESS_PATTERNS = {
  // Solana: Base58, 32-44 characters
  sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  
  // Ethereum/EVM: 0x + 40 hex chars
  evm: /^0x[a-fA-F0-9]{40}$/,
  
  // Bitcoin: Legacy (1), SegWit (3), Bech32 (bc1)
  btc: /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})$/,
  
  // XRP: r-address
  xrp: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/,
  
  // Tron: T + 33 base58 chars
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
};

// Map networks to their address pattern type
export const NETWORK_ADDRESS_TYPE: Record<string, keyof typeof ADDRESS_PATTERNS> = {
  sol: "sol",
  eth: "evm",
  bsc: "evm",
  arbitrum: "evm",
  optimism: "evm",
  base: "evm",
  polygon: "evm",
  opbnb: "evm",
  btc: "btc",
  xrp: "xrp",
  trx: "tron",
  trc20: "tron",
  erc20: "evm",
};

/**
 * Supported currencies configuration
 * Each currency defines its networks, validation, and display properties
 */
export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  {
    ticker: "sol",
    name: "Solana",
    symbol: "SOL",
    networks: [
      { id: "sol", name: "Solana", addressPlaceholder: "Solana address (e.g., 7EqQ...)" },
    ],
    defaultNetwork: "sol",
    decimals: 9,
    minAmount: 0.1,
  },
  {
    ticker: "btc",
    name: "Bitcoin",
    symbol: "BTC",
    networks: [
      { id: "btc", name: "Bitcoin", addressPlaceholder: "Bitcoin address (e.g., bc1q... or 1...)" },
    ],
    defaultNetwork: "btc",
    decimals: 8,
    minAmount: 0.0005,
  },
  {
    ticker: "eth",
    name: "Ethereum",
    symbol: "ETH",
    networks: [
      { id: "eth", name: "Ethereum", addressPlaceholder: "ETH address (0x...)" },
      { id: "arbitrum", name: "Arbitrum", addressPlaceholder: "Arbitrum address (0x...)" },
      { id: "optimism", name: "Optimism", addressPlaceholder: "Optimism address (0x...)" },
      { id: "base", name: "Base", addressPlaceholder: "Base address (0x...)" },
    ],
    defaultNetwork: "eth",
    decimals: 18,
    minAmount: 0.005,
  },
  {
    ticker: "bnb",
    name: "BNB",
    symbol: "BNB",
    networks: [
      { id: "bsc", name: "BNB Smart Chain", addressPlaceholder: "BSC address (0x...)" },
      { id: "opbnb", name: "opBNB", addressPlaceholder: "opBNB address (0x...)" },
    ],
    defaultNetwork: "bsc",
    decimals: 18,
    minAmount: 0.01,
  },
  {
    ticker: "xrp",
    name: "XRP",
    symbol: "XRP",
    networks: [
      { id: "xrp", name: "XRP Ledger", addressPlaceholder: "XRP address (r...)" },
    ],
    defaultNetwork: "xrp",
    decimals: 6,
    minAmount: 10,
  },
  {
    ticker: "usdt",
    name: "Tether",
    symbol: "USDT",
    networks: [
      { id: "eth", name: "Ethereum (ERC20)", addressPlaceholder: "ETH address (0x...)" },
      { id: "trx", name: "Tron (TRC20)", addressPlaceholder: "Tron address (T...)" },
      { id: "bsc", name: "BNB Smart Chain", addressPlaceholder: "BSC address (0x...)" },
      { id: "sol", name: "Solana", addressPlaceholder: "Solana address" },
      { id: "polygon", name: "Polygon", addressPlaceholder: "Polygon address (0x...)" },
      { id: "arbitrum", name: "Arbitrum", addressPlaceholder: "Arbitrum address (0x...)" },
      { id: "optimism", name: "Optimism", addressPlaceholder: "Optimism address (0x...)" },
    ],
    defaultNetwork: "eth",
    decimals: 6,
    minAmount: 10,
  },
  {
    ticker: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    networks: [
      { id: "eth", name: "Ethereum (ERC20)", addressPlaceholder: "ETH address (0x...)" },
      { id: "polygon", name: "Polygon", addressPlaceholder: "Polygon address (0x...)" },
      { id: "sol", name: "Solana", addressPlaceholder: "Solana address" },
      { id: "arbitrum", name: "Arbitrum", addressPlaceholder: "Arbitrum address (0x...)" },
      { id: "base", name: "Base", addressPlaceholder: "Base address (0x...)" },
    ],
    defaultNetwork: "eth",
    decimals: 6,
    minAmount: 10,
  },
];

/**
 * Get currency configuration by ticker
 */
export function getCurrency(ticker: string): CurrencyConfig | undefined {
  return SUPPORTED_CURRENCIES.find(c => c.ticker.toLowerCase() === ticker.toLowerCase());
}

/**
 * Get network configuration for a currency
 */
export function getNetwork(ticker: string, networkId: string): NetworkConfig | undefined {
  const currency = getCurrency(ticker);
  return currency?.networks.find(n => n.id.toLowerCase() === networkId.toLowerCase());
}

/**
 * Validate address format for a given network
 */
export function isValidAddress(address: string, networkId: string): boolean {
  if (!address || typeof address !== "string") return false;
  
  const addressType = NETWORK_ADDRESS_TYPE[networkId.toLowerCase()];
  if (!addressType) {
    // Unknown network, allow any non-empty address
    return address.length >= 20;
  }
  
  const pattern = ADDRESS_PATTERNS[addressType];
  return pattern.test(address.trim());
}

/**
 * Get address validation error message for a network
 */
export function getAddressValidationError(networkId: string): string {
  const type = NETWORK_ADDRESS_TYPE[networkId.toLowerCase()];
  
  switch (type) {
    case "sol":
      return "Invalid Solana address. Must be a valid Base58 address (32-44 characters)";
    case "evm":
      return "Invalid address. Must start with 0x followed by 40 hexadecimal characters";
    case "btc":
      return "Invalid Bitcoin address. Must be a valid Legacy (1...), SegWit (3...), or Bech32 (bc1...) address";
    case "xrp":
      return "Invalid XRP address. Must start with 'r' followed by 24-34 characters";
    case "tron":
      return "Invalid Tron address. Must start with 'T' followed by 33 characters";
    default:
      return "Invalid address format";
  }
}

/**
 * Get all supported currency tickers
 */
export function getSupportedTickers(): string[] {
  return SUPPORTED_CURRENCIES.map(c => c.ticker);
}

/**
 * Get all networks for a currency
 */
export function getNetworksForCurrency(ticker: string): NetworkConfig[] {
  return getCurrency(ticker)?.networks || [];
}

