import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { COMMUNITY_URL, APP_LOGO } from "@/const";
import { QRCodeSVG } from "qrcode.react";
import { TokenGate, useTokenGateStatus } from "@/components/TokenGate";

// Map internal status to user-friendly status and progress (generic labels only)
function getStatusDisplay(status?: string): { label: string; progress: number; color: string } {
  switch (status) {
    case "waiting":
      return { label: "Awaiting Deposit", progress: 10, color: "text-yellow-400" };
    case "confirming":
      return { label: "Confirming Deposit", progress: 30, color: "text-yellow-400" };
    case "exchanging":
      return { label: "Processing Exchange", progress: 50, color: "text-cyan-400" };
    case "sending":
      return { label: "Sending to Recipient", progress: 75, color: "text-cyan-400" };
    case "finished":
      return { label: "Completed", progress: 100, color: "text-emerald-400" };
    case "failed":
      return { label: "Failed", progress: 0, color: "text-red-400" };
    case "refunded":
      return { label: "Refunded", progress: 0, color: "text-orange-400" };
    case "expired":
      return { label: "Expired", progress: 0, color: "text-gray-500" };
    default:
      return { label: "Processing", progress: 5, color: "text-gray-400" };
  }
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"transfer" | "about">("about");
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  
  // Wallet connection
  const { publicKey, connected, disconnect, connecting } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const tokenGateStatus = useTokenGateStatus();

  const handleConnectWallet = useCallback(() => {
    setWalletModalVisible(true);
  }, [setWalletModalVisible]);

  const handleDisconnectWallet = useCallback(async () => {
    try {
      await disconnect();
      toast.success("Wallet disconnected");
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  }, [disconnect]);
  const [selectedCurrency, setSelectedCurrency] = useState("sol");
  const [selectedNetwork, setSelectedNetwork] = useState("sol");
  
  // Cross-chain swap mode
  const [isSwapMode, setIsSwapMode] = useState(false);
  const [selectedToCurrency, setSelectedToCurrency] = useState("sol");
  const [selectedToNetwork, setSelectedToNetwork] = useState("sol");

  // Fetch supported currencies
  const { data: currencies } = trpc.transaction.getSupportedCurrencies.useQuery();
  
  // Get the current FROM currency config
  const currentCurrency = useMemo(() => {
    return currencies?.find(c => c.ticker === selectedCurrency);
  }, [currencies, selectedCurrency]);

  // Get available networks for FROM currency
  const availableNetworks = useMemo(() => {
    return currentCurrency?.networks || [];
  }, [currentCurrency]);

  // Get the current TO currency config (for swaps)
  const toCurrencyConfig = useMemo(() => {
    return currencies?.find(c => c.ticker === selectedToCurrency);
  }, [currencies, selectedToCurrency]);

  // Get available networks for TO currency
  const availableToNetworks = useMemo(() => {
    return toCurrencyConfig?.networks || [];
  }, [toCurrencyConfig]);

  // When FROM currency changes, reset to default network immediately
  useEffect(() => {
    if (currencies) {
      const currency = currencies.find(c => c.ticker === selectedCurrency);
      if (currency) {
        setSelectedNetwork(currency.defaultNetwork);
      }
    }
  }, [selectedCurrency, currencies]);

  // When TO currency changes, reset to default TO network
  useEffect(() => {
    if (currencies) {
      const currency = currencies.find(c => c.ticker === selectedToCurrency);
      if (currency) {
        setSelectedToNetwork(currency.defaultNetwork);
      }
    }
  }, [selectedToCurrency, currencies]);

  // Get current FROM network config for placeholder
  const currentNetwork = useMemo(() => {
    return availableNetworks.find(n => n.id === selectedNetwork);
  }, [availableNetworks, selectedNetwork]);

  // Get current TO network config for placeholder
  const currentToNetwork = useMemo(() => {
    return availableToNetworks.find(n => n.id === selectedToNetwork);
  }, [availableToNetworks, selectedToNetwork]);

  const handleLogoClick = () => {
    setLocation("/");
    setActiveTab("about");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Estimate fees when amount/currency/network changes (with debouncing)
  const [debouncedAmount, setDebouncedAmount] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(transferAmount);
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timer);
  }, [transferAmount]);

  // Check if networks are valid before querying
  const isNetworkValid = useMemo(() => {
    return availableNetworks.some(n => n.id === selectedNetwork);
  }, [availableNetworks, selectedNetwork]);

  const isToNetworkValid = useMemo(() => {
    if (!isSwapMode) return true;
    return availableToNetworks.some(n => n.id === selectedToNetwork);
  }, [isSwapMode, availableToNetworks, selectedToNetwork]);

  const { data: feeEstimate, isLoading: isEstimatingFees } = trpc.transaction.estimateFees.useQuery(
    { 
      amount: debouncedAmount,
      currency: selectedCurrency,
      network: selectedNetwork,
      toCurrency: isSwapMode ? selectedToCurrency : undefined,
      toNetwork: isSwapMode ? selectedToNetwork : undefined,
    },
    {
      enabled: !!debouncedAmount && parseFloat(debouncedAmount) > 0 && !isNaN(parseFloat(debouncedAmount)) && isNetworkValid && isToNetworkValid,
      refetchOnWindowFocus: false,
    }
  );

  const [transactionResult, setTransactionResult] = useState<{
    txSignature: string;
    payinAddress?: string;
    routingTransactionId?: string;
    amount?: number;
    currency?: string;
    toCurrency?: string;
    network?: string;
    toNetwork?: string;
    isSwap?: boolean;
  } | null>(null);

  const transferMutation = trpc.transaction.transfer.useMutation({
    onSuccess: (data) => {
      setTransactionResult({
        txSignature: data.txSignature,
        payinAddress: data.payinAddress,
        routingTransactionId: data.routingTransactionId,
        amount: data.amount,
        currency: data.currency,
        toCurrency: data.toCurrency,
        network: data.network,
        toNetwork: data.toNetwork,
        isSwap: data.isSwap,
      });
      const actionText = data.isSwap 
        ? `Swap created! Send ${data.currency} to receive ${data.toCurrency}.`
        : `Transaction created! Please send ${data.currency} to complete the transfer.`;
      toast.success(actionText);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create transaction");
      setTransactionResult(null);
    },
  });

  // Poll for transaction status
  const { data: transactionStatus } = trpc.transaction.getRoutingStatus.useQuery(
    { routingTransactionId: transactionResult?.routingTransactionId || "" },
    {
      enabled: !!transactionResult?.routingTransactionId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data || typeof data !== 'object' || !('status' in data)) {
          return 5000; // Continue polling if no data yet
        }
        const status = (data as { status?: string }).status;
        // Stop polling if transaction is finished, failed, refunded, or expired
        if (status === "finished" || status === "failed" || status === "refunded" || status === "expired") {
          return false;
        }
        // Poll every 5 seconds for active transactions
        return 5000;
      },
      refetchOnWindowFocus: true,
    }
  );

  const handleTransfer = () => {
    // Validate inputs
    if (!transferRecipient || transferRecipient.trim().length === 0) {
      toast.error("Please enter a recipient address");
      return;
    }

    const amount = parseFloat(transferAmount);
    if (!transferAmount || isNaN(amount) || amount <= 0 || !isFinite(amount)) {
      toast.error("Please enter a valid amount");
      return;
    }

    // Ensure amount is a valid string representation
    const amountStr = amount.toString();
    if (!amountStr || amountStr === "NaN" || amountStr === "Infinity") {
      toast.error("Please enter a valid amount");
      return;
    }

    // Submit transfer transaction to backend
    transferMutation.mutate({
      recipientAddress: transferRecipient.trim(),
      amount: amountStr,
      currency: selectedCurrency,
      network: selectedNetwork,
      toCurrency: isSwapMode ? selectedToCurrency : undefined,
      toNetwork: isSwapMode ? selectedToNetwork : undefined,
    });
  };

  return (
    <div className="min-h-screen gradient-bg relative">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-[#1a1a2e]">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <button
              onClick={handleLogoClick}
              className="flex items-center gap-3 hover:opacity-90 transition-all duration-300 group"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full group-hover:bg-cyan-500/30 transition-all duration-300"></div>
                <img src={APP_LOGO} alt="INVSOL" className="w-10 h-10 md:w-12 md:h-12 rounded-xl relative z-10" />
              </div>
              <div className="hidden sm:block">
                <span className="text-xl md:text-2xl font-bold tracking-wider text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  INV<span className="text-[#00D9FF]">SOL</span>
                </span>
                <div className="text-[10px] text-gray-500 tracking-[0.2em] uppercase -mt-1">Invisible Solutions</div>
              </div>
            </button>

            {/* Center Nav */}
            <div className="hidden md:flex items-center gap-1 p-1 rounded-lg bg-[#0a0a0f]/80 border border-[#1a1a2e]">
              <button
                onClick={() => setActiveTab("about")}
                className={`px-5 py-2 rounded-md text-sm font-semibold tracking-wide transition-all duration-300 ${
                  activeTab === "about"
                    ? "bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6] text-black"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                style={{ fontFamily: "'Orbitron', sans-serif" }}
              >
                ABOUT
              </button>
              <button
                onClick={() => setActiveTab("transfer")}
                className={`px-5 py-2 rounded-md text-sm font-semibold tracking-wide transition-all duration-300 ${
                  activeTab === "transfer"
                    ? "bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6] text-black"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                style={{ fontFamily: "'Orbitron', sans-serif" }}
              >
                TRANSFER
              </button>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 md:gap-3">
              <a
                href={COMMUNITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-[#00D9FF] border border-transparent hover:border-[#00D9FF]/30 transition-all duration-300"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span>Community</span>
              </a>
              
              {/* Wallet Button */}
              {connected && publicKey ? (
                <div className="flex items-center gap-2">
                  {tokenGateStatus.isEligible && (
                    <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                      <span className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">Verified</span>
                    </div>
                  )}
                  <button
                    onClick={handleDisconnectWallet}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-[#0a0a0f] border border-[#1a1a2e] text-white hover:border-red-500/50 hover:bg-red-500/10 transition-all duration-300 group"
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-400 group-hover:bg-red-400 transition-colors"></div>
                    <span className="font-mono">
                      {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectWallet}
                  disabled={connecting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-[#00D9FF] to-[#0099b3] text-black hover:shadow-[0_0_30px_rgba(0,217,255,0.4)] transition-all duration-300 disabled:opacity-50"
                  style={{ fontFamily: "'Orbitron', sans-serif" }}
                >
                  {connecting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="hidden sm:inline">CONNECTING</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span className="hidden sm:inline">CONNECT</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-effect border-t border-[#1a1a2e] px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("about")}
            className={`flex-1 py-3 rounded-lg text-sm font-bold tracking-wider transition-all duration-300 ${
              activeTab === "about"
                ? "bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6] text-black"
                : "bg-[#0a0a0f] text-gray-400 border border-[#1a1a2e]"
            }`}
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            ABOUT
          </button>
          <button
            onClick={() => setActiveTab("transfer")}
            className={`flex-1 py-3 rounded-lg text-sm font-bold tracking-wider transition-all duration-300 ${
              activeTab === "transfer"
                ? "bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6] text-black"
                : "bg-[#0a0a0f] text-gray-400 border border-[#1a1a2e]"
            }`}
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            TRANSFER
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 pt-24 md:pt-28 pb-24 md:pb-12 relative z-10">
        
        {/* About Tab */}
        {activeTab === "about" && (
          <div className="max-w-6xl mx-auto space-y-16 md:space-y-32">
            
            {/* Hero Section */}
            <section className="relative py-12 md:py-24">
              {/* Background glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#00D9FF]/5 rounded-full blur-[120px] pointer-events-none"></div>
              <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#8B5CF6]/5 rounded-full blur-[100px] pointer-events-none"></div>
              
              <div className="relative text-center space-y-8">
                {/* Logo */}
                <div className="flex justify-center">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#00D9FF]/30 to-[#8B5CF6]/30 blur-3xl rounded-full scale-150 group-hover:scale-175 transition-transform duration-700"></div>
                    <img 
                      src={APP_LOGO} 
                      alt="INVSOL" 
                      className="w-32 h-32 md:w-48 md:h-48 rounded-3xl relative z-10 border-2 border-[#1a1a2e] shadow-2xl"
                    />
                  </div>
                </div>

                {/* Title */}
                <div className="space-y-4">
                  <h1 
                    className="text-5xl md:text-8xl font-black tracking-wider"
                    style={{ fontFamily: "'Orbitron', sans-serif" }}
                  >
                    <span className="text-white">INV</span>
                    <span className="gradient-text">SOL</span>
                  </h1>
                  <p className="text-lg md:text-2xl text-gray-400 tracking-[0.3em] uppercase" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                    Invisible Solutions
                  </p>
                </div>

                {/* Supported currencies */}
                <div className="flex flex-wrap justify-center gap-3 md:gap-4 pt-4">
                  {['SOL', 'BTC', 'ETH', 'BNB', 'XRP', 'USDT', 'USDC'].map((currency, i) => (
                    <div 
                      key={currency}
                      className="px-4 py-2 rounded-lg bg-[#0a0a0f]/80 border border-[#1a1a2e] hover:border-[#00D9FF]/50 transition-all duration-300"
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      <span className="text-sm font-bold text-[#00D9FF]" style={{ fontFamily: "'Orbitron', sans-serif" }}>{currency}</span>
                    </div>
                  ))}
                </div>

                {/* Taglines */}
                <div className="space-y-3 pt-8">
                  <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-gradient-to-r from-[#00D9FF]/10 to-[#8B5CF6]/10 border border-[#00D9FF]/20">
                    <div className="w-2 h-2 rounded-full bg-[#00D9FF] animate-pulse"></div>
                    <span className="text-sm md:text-base font-semibold text-[#00D9FF] tracking-wider uppercase">Ghost Protocol Active</span>
                  </div>
                </div>

                {/* CTA */}
                <div className="pt-8">
                  <button
                    onClick={() => setActiveTab("transfer")}
                    className="group relative px-8 py-4 rounded-xl font-bold text-lg tracking-wider overflow-hidden transition-all duration-300 hover:scale-105"
                    style={{ fontFamily: "'Orbitron', sans-serif" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6]"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6] blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                    <span className="relative text-black">START TRANSFER</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Features Grid */}
            <section className="relative">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-bold tracking-wider text-white mb-4" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  WHY <span className="text-[#00D9FF]">INVSOL</span>
                </h2>
                <div className="w-24 h-1 bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6] mx-auto rounded-full"></div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                {/* Feature 1 */}
                <div className="group crypto-card rounded-2xl p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D9FF]/10 rounded-full blur-3xl group-hover:bg-[#00D9FF]/20 transition-all duration-500"></div>
                  <div className="relative space-y-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#00D9FF]/20 to-transparent flex items-center justify-center border border-[#00D9FF]/30">
                      <svg className="w-7 h-7 text-[#00D9FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      ZERO TRACE
                    </h3>
                    <p className="text-gray-400 leading-relaxed">
                      Your transactions vanish into the void. Complete anonymity with zero blockchain footprint linking sender to recipient.
                    </p>
                  </div>
                </div>

                {/* Feature 2 */}
                <div className="group crypto-card rounded-2xl p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#8B5CF6]/10 rounded-full blur-3xl group-hover:bg-[#8B5CF6]/20 transition-all duration-500"></div>
                  <div className="relative space-y-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#8B5CF6]/20 to-transparent flex items-center justify-center border border-[#8B5CF6]/30">
                      <svg className="w-7 h-7 text-[#8B5CF6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      INSTANT
                    </h3>
                    <p className="text-gray-400 leading-relaxed">
                      Powered by high-speed networks. Your private transfers complete in minutes, not hours. Speed without compromise.
                    </p>
                  </div>
                </div>

                {/* Feature 3 */}
                <div className="group crypto-card rounded-2xl p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D9FF]/10 rounded-full blur-3xl group-hover:bg-[#00D9FF]/20 transition-all duration-500"></div>
                  <div className="relative space-y-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#00D9FF]/20 to-[#8B5CF6]/20 flex items-center justify-center border border-[#00D9FF]/30">
                      <svg className="w-7 h-7 text-[#00D9FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      NON-CUSTODIAL
                    </h3>
                    <p className="text-gray-400 leading-relaxed">
                      Your keys, your crypto. We never hold your funds. Full control remains with you throughout the entire process.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* How It Works */}
            <section className="relative">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-bold tracking-wider text-white mb-4" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  HOW IT <span className="text-[#8B5CF6]">WORKS</span>
                </h2>
                <div className="w-24 h-1 bg-gradient-to-r from-[#8B5CF6] to-[#00D9FF] mx-auto rounded-full"></div>
              </div>

              <div className="relative">
                {/* Connecting line */}
                <div className="hidden md:block absolute top-24 left-[16.666%] right-[16.666%] h-px bg-gradient-to-r from-[#00D9FF]/50 via-[#8B5CF6]/50 to-[#00D9FF]/50"></div>
                
                <div className="grid md:grid-cols-4 gap-8">
                  {[
                    { step: '01', title: 'ENTER DETAILS', desc: 'Select currency and enter recipient address with amount' },
                    { step: '02', title: 'CREATE TX', desc: 'Generate a unique deposit address for your transfer' },
                    { step: '03', title: 'SEND FUNDS', desc: 'Deposit crypto to the generated address' },
                    { step: '04', title: 'COMPLETE', desc: 'Funds arrive privately with no traceable link' },
                  ].map((item, i) => (
                    <div key={item.step} className="relative text-center group">
                      <div className="relative z-10 mb-6">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#00D9FF]/10 to-[#8B5CF6]/10 border border-[#1a1a2e] flex items-center justify-center group-hover:border-[#00D9FF]/50 transition-all duration-300">
                          <span className="text-2xl font-black text-[#00D9FF]" style={{ fontFamily: "'Orbitron', sans-serif" }}>{item.step}</span>
                        </div>
                      </div>
                      <h4 className="text-lg font-bold text-white mb-2 tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>{item.title}</h4>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Privacy Section */}
            <section className="relative">
              <div className="crypto-card rounded-3xl p-8 md:p-12 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#00D9FF]/5 to-[#8B5CF6]/5"></div>
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-[#8B5CF6]/10 rounded-full blur-3xl"></div>
                
                <div className="relative max-w-3xl">
                  <h2 className="text-3xl md:text-4xl font-bold tracking-wider text-white mb-6" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    PRIVACY IS A <span className="text-[#8B5CF6]">RIGHT</span>
                  </h2>
                  <div className="space-y-4 text-gray-400 leading-relaxed">
                    <p className="text-lg text-gray-300">
                      On public blockchains, every transaction is permanently visible. Your financial history, patterns, and wallet balance exposed to anyone.
                    </p>
                    <p>
                      INVSOL gives you the choice to keep your transactions private. Whether protecting business operations, maintaining personal privacy, or avoiding front-running—your financial activity stays confidential.
                    </p>
                    <p>
                      Privacy isn't about hiding. It's about maintaining the financial confidentiality that should be standard.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Footer */}
            <footer className="text-center pt-12 border-t border-[#1a1a2e]">
              <div className="flex items-center justify-center gap-3 mb-4">
                <img src={APP_LOGO} alt="INVSOL" className="w-8 h-8 rounded-lg" />
                <span className="text-lg font-bold tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  INV<span className="text-[#00D9FF]">SOL</span>
                </span>
              </div>
              <a 
                href={COMMUNITY_URL} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-sm text-[#00D9FF] hover:text-[#8B5CF6] transition-colors duration-300"
              >
                Join the Community →
              </a>
              <p className="text-xs text-gray-600 mt-4">Invisible Solutions</p>
            </footer>
          </div>
        )}

        {/* Transfer Tab */}
        {activeTab === "transfer" && (
          <div className="max-w-xl mx-auto">
            {/* Transfer Card */}
            <div className="crypto-card rounded-2xl p-6 md:p-8 relative overflow-hidden">
              {/* Background accents */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#00D9FF]/5 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#8B5CF6]/5 rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="relative">
                {/* Header */}
                <div className="text-center mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-wider text-white mb-2" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    PRIVATE <span className="text-[#00D9FF]">TRANSFER</span>
                  </h2>
                  <p className="text-sm text-gray-500">Send crypto with complete anonymity</p>
                </div>

                <div className="space-y-5">
                  {/* Swap Mode Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-[#0a0a0f] border border-[#1a1a2e]">
                    <div>
                      <Label className="text-sm font-semibold text-white">Cross-Chain Swap</Label>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {isSwapMode ? "Send one currency, receive another" : "Same currency transfer"}
                      </p>
                    </div>
                    <Switch
                      checked={isSwapMode}
                      onCheckedChange={setIsSwapMode}
                      className="data-[state=checked]:bg-[#00D9FF]"
                    />
                  </div>

                  {/* FROM Currency */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-400 tracking-wider uppercase">
                      {isSwapMode ? "You Send" : "Currency"}
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                        <SelectTrigger className="bg-[#0a0a0f] border-[#1a1a2e] text-white h-12 focus:border-[#00D9FF] focus:ring-[#00D9FF]/20">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0a0a0f] border-[#1a1a2e]">
                          {currencies?.map((currency) => (
                            <SelectItem
                              key={currency.ticker}
                              value={currency.ticker}
                              className="text-white hover:bg-[#1a1a2e] focus:bg-[#1a1a2e]"
                            >
                              <span className="flex items-center gap-2">
                                <span className="font-bold text-[#00D9FF]">{currency.symbol}</span>
                                <span className="text-gray-400">{currency.name}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select 
                        value={selectedNetwork} 
                        onValueChange={setSelectedNetwork}
                        disabled={availableNetworks.length <= 1}
                      >
                        <SelectTrigger className="bg-[#0a0a0f] border-[#1a1a2e] text-white h-12 focus:border-[#00D9FF] disabled:opacity-60">
                          <SelectValue placeholder="Network" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0a0a0f] border-[#1a1a2e]">
                          {availableNetworks.map((network) => (
                            <SelectItem
                              key={network.id}
                              value={network.id}
                              className="text-white hover:bg-[#1a1a2e] focus:bg-[#1a1a2e]"
                            >
                              {network.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* TO Currency (Swap Mode) */}
                  {isSwapMode && (
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-gray-400 tracking-wider uppercase">You Receive</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Select value={selectedToCurrency} onValueChange={setSelectedToCurrency}>
                          <SelectTrigger className="bg-[#0a0a0f] border-[#1a1a2e] text-white h-12 focus:border-[#8B5CF6]">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0a0a0f] border-[#1a1a2e]">
                            {currencies?.filter(c => c.ticker !== selectedCurrency).map((currency) => (
                              <SelectItem
                                key={currency.ticker}
                                value={currency.ticker}
                                className="text-white hover:bg-[#1a1a2e] focus:bg-[#1a1a2e]"
                              >
                                <span className="flex items-center gap-2">
                                  <span className="font-bold text-[#8B5CF6]">{currency.symbol}</span>
                                  <span className="text-gray-400">{currency.name}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select 
                          value={selectedToNetwork} 
                          onValueChange={setSelectedToNetwork}
                          disabled={availableToNetworks.length <= 1}
                        >
                          <SelectTrigger className="bg-[#0a0a0f] border-[#1a1a2e] text-white h-12 focus:border-[#8B5CF6] disabled:opacity-60">
                            <SelectValue placeholder="Network" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0a0a0f] border-[#1a1a2e]">
                            {availableToNetworks.map((network) => (
                              <SelectItem
                                key={network.id}
                                value={network.id}
                                className="text-white hover:bg-[#1a1a2e] focus:bg-[#1a1a2e]"
                              >
                                {network.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Recipient */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-400 tracking-wider uppercase">
                      Recipient Address {isSwapMode && toCurrencyConfig && `(${toCurrencyConfig.symbol})`}
                    </Label>
                    <Input
                      type="text"
                      placeholder={isSwapMode ? (currentToNetwork?.addressPlaceholder || "Enter address...") : (currentNetwork?.addressPlaceholder || "Enter address...")}
                      value={transferRecipient}
                      onChange={(e) => setTransferRecipient(e.target.value)}
                      className="bg-[#0a0a0f] border-[#1a1a2e] text-white font-mono text-sm h-12 focus:border-[#00D9FF] focus:ring-[#00D9FF]/20 placeholder:text-gray-600"
                    />
                  </div>

                  {/* Amount */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-400 tracking-wider uppercase">
                      Amount ({currentCurrency?.symbol || "SOL"})
                    </Label>
                    <Input
                      type="number"
                      step="0.000001"
                      placeholder="0.00"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="bg-[#0a0a0f] border-[#1a1a2e] text-white h-12 text-lg focus:border-[#00D9FF] focus:ring-[#00D9FF]/20 placeholder:text-gray-600"
                    />
                  </div>

                  {/* Fee Estimate */}
                  {transferAmount && parseFloat(transferAmount) > 0 && !isNaN(parseFloat(transferAmount)) && (
                    <div className="rounded-xl bg-[#0a0a0f] border border-[#1a1a2e] p-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Fee:</span>
                        {isEstimatingFees ? (
                          <span className="shimmer inline-block w-20 h-4 rounded"></span>
                        ) : feeEstimate && typeof feeEstimate.feeAmount === 'number' ? (
                          <span className="font-medium text-gray-300">
                            {Number(feeEstimate.feeAmount).toFixed(6)} {currentCurrency?.symbol} ({Number(feeEstimate.feePercentage).toFixed(2)}%)
                          </span>
                        ) : (
                          <span className="text-gray-600">Calculating...</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">You Send:</span>
                        <span className="font-semibold text-white">
                          {Number(parseFloat(transferAmount || "0") || 0).toFixed(6)} {currentCurrency?.symbol}
                        </span>
                      </div>
                      <div className="h-px bg-[#1a1a2e]"></div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-sm">Recipient Gets:</span>
                        {isEstimatingFees ? (
                          <span className="shimmer inline-block w-24 h-5 rounded"></span>
                        ) : feeEstimate && typeof feeEstimate.receiveAmount === 'number' ? (
                          <span className="font-bold text-lg text-[#00D9FF]">
                            {Number(feeEstimate.receiveAmount).toFixed(6)} {isSwapMode ? toCurrencyConfig?.symbol : currentCurrency?.symbol}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </div>
                      {feeEstimate && (feeEstimate as any).transactionSpeedForecast && (
                        <>
                          <div className="h-px bg-[#1a1a2e]"></div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">Est. Time:</span>
                            <span className="font-medium text-emerald-400">~{(feeEstimate as any).transactionSpeedForecast} min</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Submit Button */}
                  <TokenGate>
                    <Button
                      onClick={handleTransfer}
                      disabled={!transferRecipient || !transferAmount || transferMutation.isPending || (feeEstimate && !feeEstimate.isValid)}
                      className="w-full h-14 text-base font-bold tracking-wider bg-gradient-to-r from-[#00D9FF] to-[#0099b3] hover:from-[#00e5ff] hover:to-[#00b3cc] text-black shadow-lg shadow-[#00D9FF]/20 hover:shadow-[#00D9FF]/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ fontFamily: "'Orbitron', sans-serif" }}
                    >
                      {transferMutation.isPending ? "CREATING..." : "CREATE TRANSACTION"}
                    </Button>
                  </TokenGate>

                  {/* Transaction Result */}
                  {transactionResult && transactionResult.payinAddress && (
                    <div className="rounded-xl bg-gradient-to-br from-[#00D9FF]/10 to-[#8B5CF6]/10 border border-[#00D9FF]/30 p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#00D9FF]/20 flex items-center justify-center">
                          <svg className="w-5 h-5 text-[#00D9FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="font-bold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>Transaction Created</h4>
                          <p className="text-xs text-gray-400">Send funds to complete transfer</p>
                        </div>
                      </div>

                      {/* Status Bar */}
                      {(() => {
                        if (!transactionStatus || typeof transactionStatus !== 'object' || !('status' in transactionStatus)) return null;
                        const status = String((transactionStatus as { status?: string }).status || "");
                        const statusDisplay = getStatusDisplay(status);
                        const payoutHash = (transactionStatus as { payoutHash?: string }).payoutHash;
                        
                        return (
                          <div className="bg-[#0a0a0f] rounded-lg p-4 border border-[#1a1a2e] space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status</span>
                              <span className={`text-sm font-bold ${statusDisplay.color}`}>{statusDisplay.label}</span>
                            </div>
                            <Progress value={statusDisplay.progress} className="h-1.5" />
                            <div className="text-xs text-gray-500">
                              {status === "waiting" && "Waiting for deposit..."}
                              {status === "confirming" && "Confirming on network..."}
                              {status === "exchanging" && "Processing through ghost protocol..."}
                              {status === "sending" && "Sending to recipient..."}
                              {status === "finished" && (
                                <span className="text-emerald-400">✓ Complete! {payoutHash && `Hash: ${payoutHash.slice(0, 12)}...`}</span>
                              )}
                              {status === "failed" && <span className="text-red-400">Transaction failed</span>}
                              {status === "refunded" && <span className="text-orange-400">Funds refunded</span>}
                              {status === "expired" && <span className="text-gray-500">Expired - create new transaction</span>}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Deposit Address */}
                      <div className="space-y-3">
                        <p className="text-sm text-gray-400">
                          Send <span className="text-white font-bold">{transactionResult.amount?.toFixed(6)} {transactionResult.currency}</span> to:
                        </p>
                        
                        {/* QR Code */}
                        <div className="flex justify-center p-4 bg-white rounded-xl">
                          <QRCodeSVG 
                            value={transactionResult.payinAddress || ""} 
                            size={140}
                            level="H"
                            includeMargin={false}
                          />
                        </div>

                        {/* Address */}
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs font-mono bg-[#0a0a0f] text-[#00D9FF] p-3 rounded-lg border border-[#1a1a2e] break-all">
                            {transactionResult.payinAddress}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(transactionResult.payinAddress || "");
                              toast.success("Copied!");
                            }}
                            className="shrink-0 border-[#1a1a2e] hover:border-[#00D9FF] hover:bg-[#00D9FF]/10"
                          >
                            Copy
                          </Button>
                        </div>

                        {/* Warning */}
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                          <p className="text-xs text-yellow-400">
                            <strong>Important:</strong> Send exactly {transactionResult.amount?.toFixed(6)} {transactionResult.currency}.
                            {transactionResult.isSwap && ` Recipient receives ${transactionResult.toCurrency}.`}
                          </p>
                        </div>

                        {/* TX ID */}
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-[#1a1a2e]">
                          <span className="text-gray-500">TX ID:</span>
                          <code className="font-mono text-gray-600">{transactionResult.txSignature.slice(0, 16)}...</code>
                        </div>

                        {/* New Transaction */}
                        <Button
                          variant="outline"
                          className="w-full border-[#1a1a2e] hover:border-[#8B5CF6] hover:bg-[#8B5CF6]/10 text-white"
                          onClick={() => {
                            setTransactionResult(null);
                            setTransferRecipient("");
                            setTransferAmount("");
                          }}
                        >
                          New Transaction
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Coming Soon */}
            <div className="mt-6 crypto-card rounded-xl p-6 border-dashed border-[#1a1a2e] opacity-50">
              <div className="text-center space-y-3">
                <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#8B5CF6]/20 text-[#8B5CF6] border border-[#8B5CF6]/30">
                  Coming Soon
                </span>
                <h4 className="text-lg font-bold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>Fiat Gateway</h4>
                <p className="text-xs text-gray-500">Buy & sell crypto with USD/EUR</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
