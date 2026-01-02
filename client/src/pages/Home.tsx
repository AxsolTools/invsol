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

function getStatusDisplay(status?: string): { label: string; progress: number; color: string } {
  switch (status) {
    case "waiting":
      return { label: "AWAITING DEPOSIT", progress: 10, color: "text-amber-400" };
    case "confirming":
      return { label: "VERIFYING", progress: 30, color: "text-amber-400" };
    case "exchanging":
      return { label: "BRIDGING", progress: 50, color: "text-cyan-400" };
    case "sending":
      return { label: "DELIVERING", progress: 75, color: "text-cyan-400" };
    case "finished":
      return { label: "DELIVERED", progress: 100, color: "text-emerald-400" };
    case "failed":
      return { label: "FAILED", progress: 0, color: "text-red-400" };
    case "refunded":
      return { label: "RETURNED", progress: 0, color: "text-orange-400" };
    case "expired":
      return { label: "EXPIRED", progress: 0, color: "text-gray-500" };
    default:
      return { label: "INITIALIZING", progress: 5, color: "text-gray-400" };
  }
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"home" | "bridge">("home");
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  
  const { publicKey, connected, disconnect, connecting } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const tokenGateStatus = useTokenGateStatus();

  const handleConnectWallet = useCallback(() => {
    setWalletModalVisible(true);
  }, [setWalletModalVisible]);

  const handleDisconnectWallet = useCallback(async () => {
    try {
      await disconnect();
      toast.success("Disconnected");
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  }, [disconnect]);

  const [selectedCurrency, setSelectedCurrency] = useState("sol");
  const [selectedNetwork, setSelectedNetwork] = useState("sol");
  const [isSwapMode, setIsSwapMode] = useState(false);
  const [selectedToCurrency, setSelectedToCurrency] = useState("sol");
  const [selectedToNetwork, setSelectedToNetwork] = useState("sol");

  const { data: currencies } = trpc.transaction.getSupportedCurrencies.useQuery();
  
  const currentCurrency = useMemo(() => {
    return currencies?.find(c => c.ticker === selectedCurrency);
  }, [currencies, selectedCurrency]);

  const availableNetworks = useMemo(() => {
    return currentCurrency?.networks || [];
  }, [currentCurrency]);

  const toCurrencyConfig = useMemo(() => {
    return currencies?.find(c => c.ticker === selectedToCurrency);
  }, [currencies, selectedToCurrency]);

  const availableToNetworks = useMemo(() => {
    return toCurrencyConfig?.networks || [];
  }, [toCurrencyConfig]);

  useEffect(() => {
    if (currencies) {
      const currency = currencies.find(c => c.ticker === selectedCurrency);
      if (currency) {
        setSelectedNetwork(currency.defaultNetwork);
      }
    }
  }, [selectedCurrency, currencies]);

  useEffect(() => {
    if (currencies) {
      const currency = currencies.find(c => c.ticker === selectedToCurrency);
      if (currency) {
        setSelectedToNetwork(currency.defaultNetwork);
      }
    }
  }, [selectedToCurrency, currencies]);

  const currentNetwork = useMemo(() => {
    return availableNetworks.find(n => n.id === selectedNetwork);
  }, [availableNetworks, selectedNetwork]);

  const currentToNetwork = useMemo(() => {
    return availableToNetworks.find(n => n.id === selectedToNetwork);
  }, [availableToNetworks, selectedToNetwork]);

  const handleLogoClick = () => {
    setLocation("/");
    setView("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [debouncedAmount, setDebouncedAmount] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(transferAmount);
    }, 500);
    return () => clearTimeout(timer);
  }, [transferAmount]);

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
      toast.success("Bridge route created");
    },
    onError: (error) => {
      toast.error(error.message || "Bridge creation failed");
      setTransactionResult(null);
    },
  });

  const { data: transactionStatus } = trpc.transaction.getRoutingStatus.useQuery(
    { routingTransactionId: transactionResult?.routingTransactionId || "" },
    {
      enabled: !!transactionResult?.routingTransactionId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data || typeof data !== 'object' || !('status' in data)) return 5000;
        const status = (data as { status?: string }).status;
        if (status === "finished" || status === "failed" || status === "refunded" || status === "expired") return false;
        return 5000;
      },
      refetchOnWindowFocus: true,
    }
  );

  const handleTransfer = () => {
    if (!transferRecipient || transferRecipient.trim().length === 0) {
      toast.error("Destination address required");
      return;
    }
    const amount = parseFloat(transferAmount);
    if (!transferAmount || isNaN(amount) || amount <= 0 || !isFinite(amount)) {
      toast.error("Valid amount required");
      return;
    }
    const amountStr = amount.toString();
    if (!amountStr || amountStr === "NaN" || amountStr === "Infinity") {
      toast.error("Valid amount required");
      return;
    }
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
    <div className="min-h-screen bg-[#050508] relative overflow-hidden">
      {/* Animated background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Gradient overlays */}
        <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-[#00D9FF]/[0.08] to-transparent"></div>
        <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-[#8B5CF6]/[0.05] rounded-full blur-[200px]"></div>
        <div className="absolute top-1/3 left-0 w-[600px] h-[600px] bg-[#00D9FF]/[0.04] rounded-full blur-[150px]"></div>
        
        {/* Data flow particles */}
        <div className="absolute inset-0 data-flow-container">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="data-particle"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 8}s`,
                animationDuration: `${8 + Math.random() * 4}s`
              }}
            ></div>
          ))}
        </div>
        
        {/* Network nodes */}
        <div className="absolute inset-0 network-nodes">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="network-node"
              style={{
                top: `${20 + Math.random() * 60}%`,
                left: `${10 + Math.random() * 80}%`,
                animationDelay: `${Math.random() * 3}s`
              }}
            >
              <div className="network-node-pulse"></div>
            </div>
          ))}
        </div>
        
        {/* Circuit paths */}
        <svg className="absolute inset-0 w-full h-full circuit-paths" style={{ opacity: 0.15 }}>
          <defs>
            <linearGradient id="circuitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00D9FF" stopOpacity="0.3">
                <animate attributeName="stopOpacity" values="0.3;0.6;0.3" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.3">
                <animate attributeName="stopOpacity" values="0.3;0.6;0.3" dur="3s" begin="1.5s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
          </defs>
          {[...Array(6)].map((_, i) => {
            const x1 = 10 + (i * 15);
            const y1 = 20 + (i % 3) * 30;
            const x2 = 80 - (i * 10);
            const y2 = 70 - (i % 2) * 20;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 + 20} ${x2} ${y2}`}
                stroke="url(#circuitGradient)"
                strokeWidth="1"
                fill="none"
                className="circuit-path"
                style={{
                  strokeDasharray: '200',
                  strokeDashoffset: '200',
                  animation: `circuit-flow ${4 + i}s linear infinite`,
                  animationDelay: `${i * 0.5}s`
                }}
              />
            );
          })}
        </svg>
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#00D9FF]/15 bg-[#050508]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={handleLogoClick} className="flex items-center gap-3 group">
            <div className="relative">
              <img src={APP_LOGO} alt="" className="w-9 h-9 rounded-xl" />
              <div className="absolute -inset-1 bg-[#00D9FF]/20 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
            <div className="hidden sm:block">
              <span className="text-base font-bold tracking-[0.2em] text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                INVSOL
              </span>
              <div className="h-px w-full bg-gradient-to-r from-[#00D9FF] to-transparent"></div>
            </div>
          </button>

          <div className="flex items-center gap-6">
            <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/40 hover:text-[#00D9FF] transition-colors tracking-[0.15em] uppercase">
              Community
            </a>
            
            {connected && publicKey ? (
              <button
                onClick={handleDisconnectWallet}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs bg-[#00D9FF]/5 border border-[#00D9FF]/20 text-[#00D9FF] hover:bg-[#00D9FF]/10 transition-all font-mono"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
                {publicKey.toBase58().slice(0, 4)}····{publicKey.toBase58().slice(-4)}
              </button>
            ) : (
              <button
                onClick={handleConnectWallet}
                disabled={connecting}
                className="px-5 py-2 rounded-lg text-xs font-bold tracking-[0.1em] bg-[#00D9FF] text-black hover:shadow-[0_0_30px_rgba(0,217,255,0.5)] transition-all disabled:opacity-50"
                style={{ fontFamily: "'Orbitron', sans-serif" }}
              >
                {connecting ? "···" : "CONNECT"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 pt-16">
        
        {/* Home View */}
        {view === "home" && (
          <>
            {/* Hero Section */}
            <section className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
              {/* Animated lines - removed to prevent covering content */}
              
              <div className="max-w-5xl mx-auto relative">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                  
                  {/* Left content */}
                  <div className="space-y-8 text-center lg:text-left">
                    {/* Status badge with data flow */}
                    <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-[#00D9FF]/20 bg-[#00D9FF]/5 relative overflow-hidden data-stream">
                      <span className="relative flex h-2 w-2 z-10">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00D9FF] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00D9FF]"></span>
                      </span>
                      <span className="text-[11px] font-medium text-[#00D9FF] tracking-[0.2em] uppercase relative z-10">System Online</span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00D9FF]/10 to-transparent" style={{ animation: 'data-stream-flow 2s ease-in-out infinite' }}></div>
                    </div>

                    {/* Title */}
                    <div>
                      <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[0.9]" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                        <span className="text-white">INVSOL</span>
                        <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6]">BRIDGE</span>
                      </h1>
                      <div className="mt-4 h-1 w-20 bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6] lg:mx-0 mx-auto"></div>
                    </div>

                    {/* Description */}
                    <p className="text-lg text-white/60 leading-relaxed max-w-md lg:mx-0 mx-auto">
                      Next-generation cross-chain infrastructure. Transfer assets between networks with zero traceability.
                    </p>

                    {/* Stats row */}
                    <div className="flex items-center gap-8 justify-center lg:justify-start">
                      <div>
                        <div className="text-2xl font-bold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>7+</div>
                        <div className="text-[10px] text-white/30 tracking-wider uppercase">Chains</div>
                      </div>
                      <div className="w-px h-10 bg-white/10"></div>
                      <div>
                        <div className="text-2xl font-bold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>&lt;5m</div>
                        <div className="text-[10px] text-white/30 tracking-wider uppercase">Avg Time</div>
                      </div>
                      <div className="w-px h-10 bg-white/10"></div>
                      <div>
                        <div className="text-2xl font-bold text-[#00D9FF]" style={{ fontFamily: "'Orbitron', sans-serif" }}>0</div>
                        <div className="text-[10px] text-white/30 tracking-wider uppercase">Trace</div>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                      <button
                        onClick={() => setView("bridge")}
                        className="group px-8 py-4 rounded-lg font-bold tracking-[0.1em] bg-[#00D9FF] text-black hover:shadow-[0_0_40px_rgba(0,217,255,0.5)] transition-all flex items-center justify-center gap-3"
                        style={{ fontFamily: "'Orbitron', sans-serif" }}
                      >
                        LAUNCH APP
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </button>
                      <a
                        href={COMMUNITY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-8 py-4 rounded-lg font-bold tracking-[0.1em] border border-white/10 text-white/60 hover:border-[#00D9FF]/30 hover:text-white transition-all text-center"
                        style={{ fontFamily: "'Orbitron', sans-serif" }}
                      >
                        LEARN MORE
                      </a>
                    </div>
                  </div>

                  {/* Right - Logo display */}
                  <div className="hidden lg:flex justify-center items-center">
                    <div className="relative data-stream network-activity">
                      {/* Outer ring with animated pulse */}
                      <div className="absolute -inset-16 border border-[#00D9FF]/10 rounded-full">
                        <div className="absolute inset-0 border border-[#00D9FF]/20 rounded-full animate-ping" style={{ animationDuration: '3s' }}></div>
                      </div>
                      <div className="absolute -inset-24 border border-dashed border-[#8B5CF6]/10 rounded-full">
                        <div className="absolute inset-0 border border-[#8B5CF6]/20 rounded-full animate-ping" style={{ animationDuration: '4s', animationDelay: '1s' }}></div>
                      </div>
                      <div className="absolute -inset-32 border border-[#00D9FF]/5 rounded-full"></div>
                      
                      {/* Corner accents with connection lines */}
                      <div className="absolute -top-20 -left-20 w-10 h-10 border-t-2 border-l-2 border-[#00D9FF]/30">
                        <div className="absolute -top-1 -left-1 w-2 h-2 bg-[#00D9FF] rounded-full animate-pulse"></div>
                      </div>
                      <div className="absolute -top-20 -right-20 w-10 h-10 border-t-2 border-r-2 border-[#00D9FF]/30">
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#00D9FF] rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                      </div>
                      <div className="absolute -bottom-20 -left-20 w-10 h-10 border-b-2 border-l-2 border-[#8B5CF6]/30">
                        <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-[#8B5CF6] rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
                      </div>
                      <div className="absolute -bottom-20 -right-20 w-10 h-10 border-b-2 border-r-2 border-[#8B5CF6]/30">
                        <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#8B5CF6] rounded-full animate-pulse" style={{ animationDelay: '1.5s' }}></div>
                      </div>
                      
                      {/* Glow */}
                      <div className="absolute inset-0 bg-gradient-to-br from-[#00D9FF]/20 to-[#8B5CF6]/20 rounded-3xl blur-3xl scale-150"></div>
                      
                      {/* Logo */}
                      <img 
                        src={APP_LOGO} 
                        alt="INVSOL" 
                        className="w-48 h-48 rounded-3xl relative shadow-2xl shadow-[#00D9FF]/20"
                      />
                      
                      {/* Data points with activity indicators */}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded bg-black/80 border border-[#00D9FF]/20 text-[9px] text-[#00D9FF] font-mono relative">
                        <span className="relative z-10">PROTOCOL_V2</span>
                        <span className="absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[#00D9FF] rounded-full animate-pulse"></span>
                      </div>
                      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded bg-black/80 border border-[#8B5CF6]/20 text-[9px] text-[#8B5CF6] font-mono relative">
                        <span className="relative z-10">STEALTH_MODE</span>
                        <span className="absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[#8B5CF6] rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Supported chains bar */}
                <div className="mt-20 pt-10 border-t border-white/5">
                  <div className="flex flex-wrap items-center justify-center gap-6">
                    <span className="text-[10px] text-white/20 tracking-widest uppercase">Supported</span>
                    {[
                      { symbol: 'BTC', color: '#F7931A' },
                      { symbol: 'ETH', color: '#627EEA' },
                      { symbol: 'SOL', color: '#00D9FF' },
                      { symbol: 'BNB', color: '#F3BA2F' },
                      { symbol: 'XRP', color: '#FFFFFF' },
                      { symbol: 'USDT', color: '#26A17B' },
                      { symbol: 'USDC', color: '#2775CA' },
                    ].map((asset) => (
                      <div key={asset.symbol} className="flex items-center gap-2 text-white/40 hover:text-white/60 transition-colors">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: asset.color }}></div>
                        <span className="text-xs font-medium tracking-wider">{asset.symbol}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Features Section */}
            <section className="py-32 px-6 relative">
              <div className="max-w-6xl mx-auto">
                {/* Section header */}
                <div className="text-center mb-20">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-[#00D9FF]/20 bg-[#00D9FF]/5 mb-6">
                    <span className="text-[10px] text-[#00D9FF] tracking-[0.3em] uppercase">Protocol</span>
                  </div>
                  <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    Core Technology
                  </h2>
                  <p className="text-white/40 max-w-lg mx-auto">
                    Enterprise-grade infrastructure for anonymous cross-chain transfers
                  </p>
                </div>

                {/* Feature grid */}
                <div className="grid md:grid-cols-3 gap-6">
                  {[
                    {
                      title: "Chain Agnostic",
                      desc: "Seamlessly bridge between any supported blockchain. BTC, ETH, SOL, BNB, XRP and stablecoins.",
                      accent: "#00D9FF"
                    },
                    {
                      title: "Zero Knowledge",
                      desc: "Origin and destination wallets are mathematically unlinked. No trail for analytics to follow.",
                      accent: "#8B5CF6"
                    },
                    {
                      title: "Non-Custodial",
                      desc: "Your private keys never leave your wallet. We route transactions, we don't hold funds.",
                      accent: "#00D9FF"
                    }
                  ].map((feature, i) => (
                    <div 
                      key={feature.title}
                      className="group relative p-8 rounded-2xl border border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05] transition-all duration-500 data-stream"
                    >
                      {/* Content */}
                      <div className="relative">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center mb-6"
                          style={{ backgroundColor: `${feature.accent}10`, border: `1px solid ${feature.accent}30` }}
                        >
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: feature.accent }}></div>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-3 tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                          {feature.title}
                        </h3>
                        <p className="text-sm text-white/50 leading-relaxed">
                          {feature.desc}
                        </p>
                      </div>
                      
                      {/* Bottom accent */}
                      <div 
                        className="absolute bottom-0 left-8 right-8 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: `linear-gradient(90deg, transparent, ${feature.accent}50, transparent)` }}
                      ></div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Process Section */}
            <section className="py-32 px-6 border-t border-white/5 relative">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-20">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-[#8B5CF6]/20 bg-[#8B5CF6]/5 mb-6">
                    <span className="text-[10px] text-[#8B5CF6] tracking-[0.3em] uppercase">Workflow</span>
                  </div>
                  <h2 className="text-4xl sm:text-5xl font-bold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    How It Works
                  </h2>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { title: "Configure", desc: "Select chains and enter destination", icon: "→" },
                    { title: "Generate", desc: "Receive unique deposit address", icon: "⚡" },
                    { title: "Deposit", desc: "Send funds to generated address", icon: "↓" },
                    { title: "Complete", desc: "Recipient receives anonymously", icon: "✓" },
                  ].map((step, i) => (
                    <div key={step.title} className="group relative p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:border-[#00D9FF/20 hover:bg-white/[0.03] transition-all">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-[#00D9FF]/10 border border-[#00D9FF]/20 flex items-center justify-center text-xl shrink-0 group-hover:bg-[#00D9FF]/20 transition-colors">
                          {step.icon}
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white mb-2 tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                            {step.title}
                          </h4>
                          <p className="text-sm text-white/50 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* CTA Section */}
            <section className="py-32 px-6 border-t border-white/5">
              <div className="max-w-3xl mx-auto text-center">
                <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  Ready to Bridge?
                </h2>
                <p className="text-white/40 mb-10 max-w-md mx-auto">
                  Start your first anonymous transfer in under 60 seconds.
                </p>
                <button
                  onClick={() => setView("bridge")}
                  className="px-12 py-5 rounded-lg font-bold tracking-[0.15em] bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6] text-black hover:shadow-[0_0_50px_rgba(0,217,255,0.4)] transition-all"
                  style={{ fontFamily: "'Orbitron', sans-serif" }}
                >
                  LAUNCH BRIDGE
                </button>
              </div>
            </section>

            {/* Footer */}
            <footer className="py-10 px-6 border-t border-white/5">
              <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img src={APP_LOGO} alt="" className="w-7 h-7 rounded-lg opacity-60" />
                  <span className="text-xs text-white/30 tracking-wider">INVSOL BRIDGE</span>
                </div>
                <div className="flex items-center gap-6">
                  <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="text-[10px] text-white/30 hover:text-[#00D9FF] transition-colors tracking-wider">
                    COMMUNITY
                  </a>
                  <span className="text-white/10">|</span>
                  <span className="text-[10px] text-white/20 tracking-wider">© 2026</span>
                </div>
              </div>
            </footer>
          </>
        )}

        {/* Bridge View */}
        {view === "bridge" && (
          <div className="min-h-screen flex items-center justify-center px-6 py-24">
            <div className="w-full max-w-md">
              
              {/* Back */}
              <button
                onClick={() => setView("home")}
                className="flex items-center gap-2 text-sm text-white/30 hover:text-white mb-8 transition-colors group"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span>
                <span>Back</span>
              </button>

              {/* Bridge Card */}
              <div className="relative">
                {/* Glow */}
                <div className="absolute -inset-1 bg-gradient-to-r from-[#00D9FF]/20 to-[#8B5CF6]/20 rounded-3xl blur-xl"></div>
                
                <div className="relative bg-[#0d0d12] rounded-2xl border border-white/15 overflow-hidden">
                  {/* Header */}
                  <div className="px-8 py-6 border-b border-white/5 bg-gradient-to-r from-[#00D9FF]/5 to-transparent">
                    <div className="flex items-center gap-3">
                      <img src={APP_LOGO} alt="" className="w-8 h-8 rounded-lg" />
                      <div>
                        <h1 className="text-base font-bold text-white tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                          {isSwapMode ? "CROSS-CHAIN" : "STEALTH BRIDGE"}
                        </h1>
                        <p className="text-[10px] text-white/40 tracking-wider uppercase">
                          {isSwapMode ? "Swap & Route" : "Same Asset Transfer"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-8 space-y-6">
                    
                    {/* Mode Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                      <div>
                        <span className="text-sm font-medium text-white">Cross-Chain</span>
                        <p className="text-[10px] text-white/30 mt-0.5">Swap between assets</p>
                      </div>
                      <Switch
                        checked={isSwapMode}
                        onCheckedChange={setIsSwapMode}
                        className="data-[state=checked]:bg-[#00D9FF]"
                      />
                    </div>

                    {/* Source */}
                    <div className="space-y-3">
                      <Label className="text-[10px] font-medium text-white/40 uppercase tracking-[0.2em]">
                        {isSwapMode ? "From" : "Asset"}
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                          <SelectTrigger className="bg-white/[0.02] border-white/10 text-white h-12 rounded-xl focus:border-[#00D9FF]/50 focus:ring-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0a0a0f] border-white/10 rounded-xl">
                            {currencies?.map((currency) => (
                              <SelectItem key={currency.ticker} value={currency.ticker} className="text-white focus:bg-white/5 rounded-lg">
                                <span className="font-semibold">{currency.symbol}</span>
                                <span className="text-white/30 ml-2 text-xs">{currency.name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectedNetwork} onValueChange={setSelectedNetwork} disabled={availableNetworks.length <= 1}>
                          <SelectTrigger className="bg-white/[0.02] border-white/10 text-white h-12 rounded-xl focus:border-[#00D9FF]/50 focus:ring-0 disabled:opacity-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0a0a0f] border-white/10 rounded-xl">
                            {availableNetworks.map((network) => (
                              <SelectItem key={network.id} value={network.id} className="text-white focus:bg-white/5 rounded-lg">
                                {network.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Swap indicator */}
                    {isSwapMode && (
                      <div className="flex justify-center">
                        <div className="w-10 h-10 rounded-full bg-white/[0.02] border border-white/10 flex items-center justify-center text-[#00D9FF]">
                          ↓
                        </div>
                      </div>
                    )}

                    {/* Destination Asset (Swap Mode) */}
                    {isSwapMode && (
                      <div className="space-y-3">
                        <Label className="text-[10px] font-medium text-white/40 uppercase tracking-[0.2em]">To</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <Select value={selectedToCurrency} onValueChange={setSelectedToCurrency}>
                            <SelectTrigger className="bg-white/[0.02] border-white/10 text-white h-12 rounded-xl focus:border-[#8B5CF6]/50 focus:ring-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0a0a0f] border-white/10 rounded-xl">
                              {currencies?.filter(c => c.ticker !== selectedCurrency).map((currency) => (
                                <SelectItem key={currency.ticker} value={currency.ticker} className="text-white focus:bg-white/5 rounded-lg">
                                  <span className="font-semibold">{currency.symbol}</span>
                                  <span className="text-white/30 ml-2 text-xs">{currency.name}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={selectedToNetwork} onValueChange={setSelectedToNetwork} disabled={availableToNetworks.length <= 1}>
                            <SelectTrigger className="bg-white/[0.02] border-white/10 text-white h-12 rounded-xl focus:border-[#8B5CF6]/50 focus:ring-0 disabled:opacity-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0a0a0f] border-white/10 rounded-xl">
                              {availableToNetworks.map((network) => (
                                <SelectItem key={network.id} value={network.id} className="text-white focus:bg-white/5 rounded-lg">
                                  {network.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {/* Recipient */}
                    <div className="space-y-3">
                      <Label className="text-[10px] font-medium text-white/40 uppercase tracking-[0.2em]">
                        Destination {isSwapMode && toCurrencyConfig && `(${toCurrencyConfig.symbol})`}
                      </Label>
                      <Input
                        type="text"
                        placeholder={isSwapMode ? (currentToNetwork?.addressPlaceholder || "Wallet address") : (currentNetwork?.addressPlaceholder || "Wallet address")}
                        value={transferRecipient}
                        onChange={(e) => setTransferRecipient(e.target.value)}
                        className="bg-white/[0.02] border-white/10 text-white h-12 rounded-xl font-mono text-sm focus:border-[#00D9FF]/50 focus:ring-0 placeholder:text-white/20"
                      />
                    </div>

                    {/* Amount */}
                    <div className="space-y-3">
                      <Label className="text-[10px] font-medium text-white/40 uppercase tracking-[0.2em]">Amount</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.000001"
                          placeholder="0.00"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          className="bg-white/[0.02] border-white/10 text-white h-14 rounded-xl text-xl pr-20 focus:border-[#00D9FF]/50 focus:ring-0 placeholder:text-white/20"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/40 font-semibold">
                          {currentCurrency?.symbol || "SOL"}
                        </span>
                      </div>
                    </div>

                    {/* Estimate */}
                    {transferAmount && parseFloat(transferAmount) > 0 && (
                      <div className="rounded-xl bg-white/[0.02] border border-white/5 p-5 space-y-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/30">Fee</span>
                          {isEstimatingFees ? (
                            <span className="w-20 h-4 bg-white/5 rounded animate-pulse"></span>
                          ) : feeEstimate?.feeAmount !== undefined ? (
                            <span className="text-white/60">{Number(feeEstimate.feeAmount).toFixed(6)} {currentCurrency?.symbol}</span>
                          ) : (
                            <span className="text-white/20">—</span>
                          )}
                        </div>
                        <div className="h-px bg-white/5"></div>
                        <div className="flex justify-between items-center">
                          <span className="text-white/30 text-sm">Recipient Gets</span>
                          {isEstimatingFees ? (
                            <span className="w-28 h-7 bg-white/5 rounded animate-pulse"></span>
                          ) : feeEstimate?.receiveAmount !== undefined ? (
                            <span className="text-2xl font-bold text-[#00D9FF]" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                              {Number(feeEstimate.receiveAmount).toFixed(6)}
                              <span className="text-sm ml-1 text-white/40 font-normal">{isSwapMode ? toCurrencyConfig?.symbol : currentCurrency?.symbol}</span>
                            </span>
                          ) : (
                            <span className="text-white/20">—</span>
                          )}
                        </div>
                        {feeEstimate && (feeEstimate as any).transactionSpeedForecast && (
                          <>
                            <div className="h-px bg-white/5"></div>
                            <div className="flex justify-between text-sm">
                              <span className="text-white/30">Est. Time</span>
                              <span className="text-emerald-400 font-medium">~{(feeEstimate as any).transactionSpeedForecast} min</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Submit */}
                    <TokenGate>
                      <Button
                        onClick={handleTransfer}
                        disabled={!transferRecipient || !transferAmount || transferMutation.isPending || (feeEstimate && !feeEstimate.isValid)}
                        className="w-full h-14 rounded-xl text-sm font-bold tracking-[0.15em] bg-[#00D9FF] hover:bg-[#00e5ff] text-black disabled:opacity-20 disabled:cursor-not-allowed transition-all hover:shadow-[0_0_30px_rgba(0,217,255,0.4)]"
                        style={{ fontFamily: "'Orbitron', sans-serif" }}
                      >
                        {transferMutation.isPending ? "GENERATING···" : "GENERATE DEPOSIT"}
                      </Button>
                    </TokenGate>

                    {/* Result */}
                    {transactionResult && transactionResult.payinAddress && (
                      <div className="rounded-xl bg-[#00D9FF]/5 border border-[#00D9FF]/20 p-6 space-y-5">
                        
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#00D9FF]/20 flex items-center justify-center text-[#00D9FF]">
                            ✓
                          </div>
                          <div>
                            <p className="font-semibold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>Route Generated</p>
                            <p className="text-[10px] text-white/40">Awaiting deposit</p>
                          </div>
                        </div>

                        {/* Status */}
                        {transactionStatus && typeof transactionStatus === 'object' && 'status' in transactionStatus && (
                          <div className="bg-black/30 rounded-xl p-4 space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-white/30 uppercase tracking-widest">Status</span>
                              <span className={`text-xs font-bold tracking-wider ${getStatusDisplay(String(transactionStatus.status)).color}`}>
                                {getStatusDisplay(String(transactionStatus.status)).label}
                              </span>
                            </div>
                            <Progress value={getStatusDisplay(String(transactionStatus.status)).progress} className="h-1" />
                          </div>
                        )}

                        {/* Deposit Info */}
                        <div className="space-y-4">
                          <p className="text-sm text-white/50">
                            Send exactly <span className="text-white font-bold">{transactionResult.amount?.toFixed(6)} {transactionResult.currency}</span>
                          </p>
                          
                          <div className="flex justify-center p-4 bg-white rounded-xl">
                            <QRCodeSVG value={transactionResult.payinAddress} size={160} level="H" />
                          </div>

                          <div className="flex gap-2">
                            <code className="flex-1 text-[10px] font-mono bg-black/30 text-[#00D9FF] p-3 rounded-xl break-all">
                              {transactionResult.payinAddress}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(transactionResult.payinAddress || "");
                                toast.success("Copied");
                              }}
                              className="shrink-0 border-white/10 hover:bg-white/5 rounded-xl"
                            >
                              Copy
                            </Button>
                          </div>

                          <p className="text-[10px] text-amber-400/80 bg-amber-400/10 rounded-xl p-3">
                            ⚠ Send exact amount. {transactionResult.isSwap && `Recipient gets ${transactionResult.toCurrency}.`}
                          </p>
                        </div>

                        <Button
                          variant="ghost"
                          className="w-full text-white/30 hover:text-white hover:bg-white/5 rounded-xl"
                          onClick={() => {
                            setTransactionResult(null);
                            setTransferRecipient("");
                            setTransferAmount("");
                          }}
                        >
                          New Transfer
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
