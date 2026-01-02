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
      {/* Animated background - visible data flow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Gradient overlays */}
        <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-[#00D9FF]/[0.08] to-transparent"></div>
        <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-[#8B5CF6]/[0.05] rounded-full blur-[200px]"></div>
        
        {/* Visible data flow lines */}
        <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.2 }}>
          <defs>
            <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00D9FF" stopOpacity="0.6">
                <animate attributeName="stopOpacity" values="0.3;0.8;0.3" dur="4s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.6">
                <animate attributeName="stopOpacity" values="0.3;0.8;0.3" dur="4s" begin="2s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
          </defs>
          {/* Animated connection lines */}
          <path
            d="M 10 20 Q 200 100 400 50 T 800 80"
            stroke="url(#flowGradient)"
            strokeWidth="2"
            fill="none"
            strokeDasharray="10 5"
            className="flow-line"
          />
          <path
            d="M 100 400 Q 300 300 500 350 T 900 380"
            stroke="url(#flowGradient)"
            strokeWidth="2"
            fill="none"
            strokeDasharray="10 5"
            className="flow-line"
            style={{ animationDelay: '1s' }}
          />
          <path
            d="M 50 600 Q 250 500 450 550 T 850 580"
            stroke="url(#flowGradient)"
            strokeWidth="2"
            fill="none"
            strokeDasharray="10 5"
            className="flow-line"
            style={{ animationDelay: '2s' }}
          />
        </svg>

        {/* Visible network nodes */}
        {[
          { x: '15%', y: '25%', delay: '0s' },
          { x: '35%', y: '15%', delay: '0.5s' },
          { x: '55%', y: '30%', delay: '1s' },
          { x: '75%', y: '20%', delay: '1.5s' },
          { x: '25%', y: '70%', delay: '2s' },
          { x: '65%', y: '75%', delay: '2.5s' },
        ].map((node, i) => (
          <div
            key={i}
            className="network-node-visible"
            style={{
              left: node.x,
              top: node.y,
              animationDelay: node.delay
            }}
          >
            <div className="node-core"></div>
            <div className="node-pulse-ring"></div>
            <div className="node-pulse-ring" style={{ animationDelay: '0.5s' }}></div>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#00D9FF]/15 bg-[#050508]/95 backdrop-blur-xl">
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
          <div className="max-w-7xl mx-auto px-6">
            
            {/* Hero Section - Centered & Organized */}
            <section className="min-h-[90vh] flex flex-col justify-center py-20">
              <div className="text-center max-w-4xl mx-auto space-y-12">
                
                {/* Status Indicator */}
                <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-[#00D9FF]/30 bg-[#00D9FF]/10">
                  <div className="relative">
                    <div className="absolute inset-0 bg-[#00D9FF] rounded-full animate-ping opacity-75"></div>
                    <div className="relative w-2.5 h-2.5 bg-[#00D9FF] rounded-full"></div>
                  </div>
                  <span className="text-xs font-medium text-[#00D9FF] tracking-[0.2em] uppercase">Network Active</span>
                </div>

                {/* Logo & Title */}
                <div className="space-y-6">
                  <div className="flex justify-center">
                    <div className="relative">
                      <div className="absolute -inset-8 bg-gradient-to-br from-[#00D9FF]/30 to-[#8B5CF6]/30 rounded-3xl blur-2xl"></div>
                      <img src={APP_LOGO} alt="INVSOL" className="w-32 h-32 rounded-3xl relative" />
                    </div>
                  </div>
                  
                  <div>
                    <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95]" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      <span className="text-white">INVSOL</span>
                      <br />
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D9FF] via-[#8B5CF6] to-[#00D9FF] bg-[length:200%_100%] animate-gradient-shift">
                        BRIDGE
                      </span>
                    </h1>
                    <div className="mt-6 h-1.5 w-32 bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6] mx-auto"></div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xl text-white/60 leading-relaxed max-w-2xl mx-auto">
                  Advanced cross-chain routing protocol. Transfer assets across blockchains with complete anonymity and zero traceability.
                </p>

                {/* Stats - Horizontal Bar */}
                <div className="flex items-center justify-center gap-12 py-8 px-8 bg-white/[0.02] rounded-2xl border border-white/10">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>7+</div>
                    <div className="text-xs text-white/40 tracking-wider uppercase">Blockchains</div>
                  </div>
                  <div className="w-px h-12 bg-white/10"></div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-[#00D9FF] mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>&lt;5m</div>
                    <div className="text-xs text-white/40 tracking-wider uppercase">Avg Time</div>
                  </div>
                  <div className="w-px h-12 bg-white/10"></div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-[#8B5CF6] mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>0%</div>
                    <div className="text-xs text-white/40 tracking-wider uppercase">Trace</div>
                  </div>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={() => setView("bridge")}
                    className="group px-10 py-4 rounded-xl font-bold tracking-[0.15em] bg-gradient-to-r from-[#00D9FF] to-[#00b3d9] text-black hover:shadow-[0_0_50px_rgba(0,217,255,0.5)] transition-all flex items-center justify-center gap-3"
                    style={{ fontFamily: "'Orbitron', sans-serif" }}
                  >
                    INITIATE TRANSFER
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </button>
                  <a
                    href={COMMUNITY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-10 py-4 rounded-xl font-bold tracking-[0.15em] border-2 border-white/20 text-white/70 hover:border-[#00D9FF]/50 hover:text-white transition-all text-center"
                    style={{ fontFamily: "'Orbitron', sans-serif" }}
                  >
                    DOCUMENTATION
                  </a>
                </div>

                {/* Supported Assets - Clean List */}
                <div className="pt-8">
                  <div className="text-xs text-white/30 tracking-widest uppercase mb-4">Supported Assets</div>
                  <div className="flex flex-wrap items-center justify-center gap-4">
                    {[
                      { symbol: 'BTC', color: '#F7931A' },
                      { symbol: 'ETH', color: '#627EEA' },
                      { symbol: 'SOL', color: '#00D9FF' },
                      { symbol: 'BNB', color: '#F3BA2F' },
                      { symbol: 'XRP', color: '#FFFFFF' },
                      { symbol: 'USDT', color: '#26A17B' },
                      { symbol: 'USDC', color: '#2775CA' },
                    ].map((asset) => (
                      <div 
                        key={asset.symbol} 
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.03] border border-white/10 hover:border-[#00D9FF]/30 transition-all"
                      >
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: asset.color, boxShadow: `0 0 8px ${asset.color}80` }}
                        ></div>
                        <span className="text-sm font-medium text-white/70">{asset.symbol}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Features Section - Clean Grid */}
            <section className="py-24 border-t border-white/10">
              <div className="max-w-6xl mx-auto">
                <div className="text-center mb-16">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#00D9FF]/20 bg-[#00D9FF]/5 mb-6">
                    <span className="text-[10px] text-[#00D9FF] tracking-[0.3em] uppercase">Technology</span>
                  </div>
                  <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    Protocol Architecture
                  </h2>
                  <p className="text-white/50 max-w-xl mx-auto">
                    Built on advanced routing technology for secure, anonymous cross-chain transfers
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                  {[
                    {
                      title: "Multi-Chain Support",
                      desc: "Connect to Bitcoin, Ethereum, Solana, BNB Chain, XRP, and major stablecoins. Seamless routing between any combination.",
                      accent: "#00D9FF",
                      icon: "◉"
                    },
                    {
                      title: "Zero Traceability",
                      desc: "Advanced routing algorithms mathematically sever the connection between origin and destination wallets.",
                      accent: "#8B5CF6",
                      icon: "◉"
                    },
                    {
                      title: "Self-Custody",
                      desc: "Your private keys remain in your wallet. We facilitate routing but never hold or control your funds.",
                      accent: "#00D9FF",
                      icon: "◉"
                    }
                  ].map((feature, i) => (
                    <div 
                      key={feature.title}
                      className="group relative p-8 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04] transition-all duration-300"
                    >
                      <div className="flex items-start gap-4 mb-6">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                          style={{ 
                            backgroundColor: `${feature.accent}15`, 
                            border: `1px solid ${feature.accent}30`,
                            color: feature.accent
                          }}
                        >
                          {feature.icon}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white mb-2 tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                            {feature.title}
                          </h3>
                        </div>
                      </div>
                      <p className="text-sm text-white/50 leading-relaxed">
                        {feature.desc}
                      </p>
                      <div 
                        className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: `linear-gradient(90deg, transparent, ${feature.accent}, transparent)` }}
                      ></div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Process Section - Visual Flow */}
            <section className="py-24 border-t border-white/10">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-16">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#8B5CF6]/20 bg-[#8B5CF6]/5 mb-6">
                    <span className="text-[10px] text-[#8B5CF6] tracking-[0.3em] uppercase">Process</span>
                  </div>
                  <h2 className="text-4xl sm:text-5xl font-bold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    Transfer Workflow
                  </h2>
                </div>

                <div className="relative">
                  {/* Connection line - visible */}
                  <div className="hidden lg:block absolute top-12 left-0 right-0 h-0.5">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#00D9FF]/20 via-[#8B5CF6]/20 to-[#00D9FF]/20"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00D9FF] to-transparent flow-dot" style={{ width: '20px', height: '2px' }}></div>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
                    {[
                      { title: "Configure", desc: "Select source and destination chains, enter recipient address", icon: "→" },
                      { title: "Generate", desc: "System creates a unique one-time deposit address", icon: "⚡" },
                      { title: "Deposit", desc: "Send exact amount from any wallet to the address", icon: "↓" },
                      { title: "Complete", desc: "Funds arrive at destination with broken chain link", icon: "✓" },
                    ].map((step, i) => (
                      <div 
                        key={step.title} 
                        className="relative bg-white/[0.02] rounded-xl border border-white/10 p-6 hover:border-[#00D9FF]/30 hover:bg-white/[0.04] transition-all group"
                      >
                        <div className="flex flex-col items-center text-center space-y-4">
                          <div className="w-14 h-14 rounded-xl bg-[#00D9FF]/10 border border-[#00D9FF]/30 flex items-center justify-center text-2xl group-hover:bg-[#00D9FF]/20 group-hover:scale-110 transition-all">
                            {step.icon}
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-white mb-2 tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                              {step.title}
                            </h4>
                            <p className="text-xs text-white/50 leading-relaxed">{step.desc}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 border-t border-white/10">
              <div className="max-w-3xl mx-auto text-center space-y-8">
                <h2 className="text-4xl sm:text-5xl font-bold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  Start Bridging
                </h2>
                <p className="text-lg text-white/50 max-w-xl mx-auto">
                  Create your first anonymous cross-chain transfer in under 60 seconds.
                </p>
                <button
                  onClick={() => setView("bridge")}
                  className="px-12 py-5 rounded-xl font-bold tracking-[0.15em] bg-gradient-to-r from-[#00D9FF] to-[#8B5CF6] text-white hover:shadow-[0_0_50px_rgba(0,217,255,0.4)] transition-all"
                  style={{ fontFamily: "'Orbitron', sans-serif" }}
                >
                  LAUNCH INTERFACE
                </button>
              </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-white/10">
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
          </div>
        )}

        {/* Bridge View - Completely Redesigned */}
        {view === "bridge" && (
          <div className="min-h-screen py-12 px-6">
            <div className="max-w-7xl mx-auto">
              
              {/* Top Navigation */}
              <div className="flex items-center justify-between mb-12">
                <button
                  onClick={() => setView("home")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-all"
                >
                  <span>←</span>
                  <span>Dashboard</span>
                </button>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 rounded-full bg-[#00D9FF]/10 border border-[#00D9FF]/20">
                    <span className="text-[10px] text-[#00D9FF] font-mono">SESSION_ACTIVE</span>
                  </div>
                </div>
              </div>

              {/* Main Content - Split Layout */}
              <div className="grid lg:grid-cols-3 gap-8">
                
                {/* Left Panel - Configuration */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Mode Selection - Visual Toggle */}
                  <div className="bg-[#0a0a0f] rounded-xl border border-white/10 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-white mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                          Transfer Mode
                        </h2>
                        <p className="text-xs text-white/40">Choose routing configuration</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setIsSwapMode(false)}
                        className={`p-6 rounded-lg border-2 transition-all text-left ${
                          !isSwapMode
                            ? 'border-[#00D9FF] bg-[#00D9FF]/10'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-3 h-3 rounded-full ${!isSwapMode ? 'bg-[#00D9FF]' : 'bg-white/20'}`}></div>
                          <span className="text-sm font-bold text-white">Direct Route</span>
                        </div>
                        <p className="text-xs text-white/50">Same asset, different wallet</p>
                      </button>
                      
                      <button
                        onClick={() => setIsSwapMode(true)}
                        className={`p-6 rounded-lg border-2 transition-all text-left ${
                          isSwapMode
                            ? 'border-[#8B5CF6] bg-[#8B5CF6]/10'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-3 h-3 rounded-full ${isSwapMode ? 'bg-[#8B5CF6]' : 'bg-white/20'}`}></div>
                          <span className="text-sm font-bold text-white">Asset Conversion</span>
                        </div>
                        <p className="text-xs text-white/50">Convert between different assets</p>
                      </button>
                    </div>
                  </div>

                  {/* Source Configuration */}
                  <div className="bg-[#0a0a0f] rounded-xl border border-white/10 p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <div className="w-2 h-2 rounded-full bg-[#00D9FF]"></div>
                      <h3 className="text-sm font-bold text-white">Source Configuration</h3>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-white/50 mb-2 uppercase tracking-wider">Asset</label>
                        <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                          <SelectTrigger className="bg-[#050508] border-white/10 text-white h-12 rounded-lg focus:border-[#00D9FF]/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0a0a0f] border-white/10">
                            {currencies?.map((currency) => (
                              <SelectItem key={currency.ticker} value={currency.ticker} className="text-white">
                                <span className="font-semibold">{currency.symbol}</span>
                                <span className="text-white/40 ml-2">{currency.name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-white/50 mb-2 uppercase tracking-wider">Network</label>
                        <Select value={selectedNetwork} onValueChange={setSelectedNetwork} disabled={availableNetworks.length <= 1}>
                          <SelectTrigger className="bg-[#050508] border-white/10 text-white h-12 rounded-lg focus:border-[#00D9FF]/50 disabled:opacity-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0a0a0f] border-white/10">
                            {availableNetworks.map((network) => (
                              <SelectItem key={network.id} value={network.id} className="text-white">
                                {network.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Destination Configuration (Swap Mode) */}
                  {isSwapMode && (
                    <div className="bg-[#0a0a0f] rounded-xl border border-white/10 p-6">
                      <div className="flex items-center gap-2 mb-6">
                        <div className="w-2 h-2 rounded-full bg-[#8B5CF6]"></div>
                        <h3 className="text-sm font-bold text-white">Destination Configuration</h3>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-white/50 mb-2 uppercase tracking-wider">Target Asset</label>
                          <Select value={selectedToCurrency} onValueChange={setSelectedToCurrency}>
                            <SelectTrigger className="bg-[#050508] border-white/10 text-white h-12 rounded-lg focus:border-[#8B5CF6]/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0a0a0f] border-white/10">
                              {currencies?.filter(c => c.ticker !== selectedCurrency).map((currency) => (
                                <SelectItem key={currency.ticker} value={currency.ticker} className="text-white">
                                  <span className="font-semibold">{currency.symbol}</span>
                                  <span className="text-white/40 ml-2">{currency.name}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <label className="block text-xs text-white/50 mb-2 uppercase tracking-wider">Target Network</label>
                          <Select value={selectedToNetwork} onValueChange={setSelectedToNetwork} disabled={availableToNetworks.length <= 1}>
                            <SelectTrigger className="bg-[#050508] border-white/10 text-white h-12 rounded-lg focus:border-[#8B5CF6]/50 disabled:opacity-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0a0a0f] border-white/10">
                              {availableToNetworks.map((network) => (
                                <SelectItem key={network.id} value={network.id} className="text-white">
                                  {network.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Recipient & Amount */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-[#0a0a0f] rounded-xl border border-white/10 p-6">
                      <label className="block text-xs text-white/50 mb-3 uppercase tracking-wider mb-3">
                      Recipient Address {isSwapMode && toCurrencyConfig && `(${toCurrencyConfig.symbol})`}
                      </label>
                      <Input
                        type="text"
                        placeholder={isSwapMode ? (currentToNetwork?.addressPlaceholder || "0x...") : (currentNetwork?.addressPlaceholder || "0x...")}
                        value={transferRecipient}
                        onChange={(e) => setTransferRecipient(e.target.value)}
                        className="bg-[#050508] border-white/10 text-white h-12 font-mono text-sm rounded-lg focus:border-[#00D9FF]/50 placeholder:text-white/20"
                      />
                    </div>
                    
                    <div className="bg-[#0a0a0f] rounded-xl border border-white/10 p-6">
                      <label className="block text-xs text-white/50 mb-3 uppercase tracking-wider">Transfer Amount</label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.000001"
                          placeholder="0.00"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          className="bg-[#050508] border-white/10 text-white h-12 text-lg rounded-lg pr-16 focus:border-[#00D9FF]/50 placeholder:text-white/20"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/40 font-semibold">
                          {currentCurrency?.symbol || "SOL"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Fee Estimate & Submit */}
                  <div className="bg-[#0a0a0f] rounded-xl border border-white/10 p-6">
                    {transferAmount && parseFloat(transferAmount) > 0 ? (
                      <div className="space-y-4 mb-6">
                        <div className="flex items-center justify-between py-3 border-b border-white/5">
                          <span className="text-sm text-white/50">Network Fee</span>
                          {isEstimatingFees ? (
                            <span className="w-24 h-4 bg-white/5 rounded animate-pulse"></span>
                          ) : feeEstimate?.feeAmount !== undefined ? (
                            <span className="text-sm text-white/70 font-mono">{Number(feeEstimate.feeAmount).toFixed(6)} {currentCurrency?.symbol}</span>
                          ) : (
                            <span className="text-sm text-white/30">—</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between py-3 border-b border-white/5">
                          <span className="text-sm text-white/50">Output Amount</span>
                          {isEstimatingFees ? (
                            <span className="w-32 h-6 bg-white/5 rounded animate-pulse"></span>
                          ) : feeEstimate?.receiveAmount !== undefined ? (
                            <span className="text-xl font-bold text-[#00D9FF]" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                              {Number(feeEstimate.receiveAmount).toFixed(6)} {isSwapMode ? toCurrencyConfig?.symbol : currentCurrency?.symbol}
                            </span>
                          ) : (
                            <span className="text-sm text-white/30">—</span>
                          )}
                        </div>
                        {feeEstimate && (feeEstimate as any).transactionSpeedForecast && (
                          <div className="flex items-center justify-between py-2">
                            <span className="text-xs text-white/40">Estimated Duration</span>
                            <span className="text-xs text-emerald-400 font-medium">~{(feeEstimate as any).transactionSpeedForecast} minutes</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <p className="text-sm text-white/30">Enter amount to view fee estimate</p>
                      </div>
                    )}
                    
                    <TokenGate>
                      <Button
                        onClick={handleTransfer}
                        disabled={!transferRecipient || !transferAmount || transferMutation.isPending || (feeEstimate && !feeEstimate.isValid)}
                        className="w-full h-14 rounded-lg text-sm font-bold tracking-wider bg-gradient-to-r from-[#00D9FF] to-[#00b3d9] hover:from-[#00e5ff] hover:to-[#00c4e5] text-black disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                        style={{ fontFamily: "'Orbitron', sans-serif" }}
                      >
                        {transferMutation.isPending ? "INITIATING ROUTE..." : "INITIATE TRANSFER"}
                      </Button>
                    </TokenGate>
                  </div>
                </div>

                {/* Right Panel - Info & Result */}
                <div className="space-y-6">
                  
                  {/* Info Panel */}
                  {!transactionResult && (
                    <div className="bg-[#0a0a0f] rounded-xl border border-white/10 p-6 sticky top-24">
                      <h3 className="text-sm font-bold text-white mb-4" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                        Transfer Details
                      </h3>
                      <div className="space-y-4 text-xs">
                        <div>
                          <span className="text-white/40">Mode:</span>
                          <span className="text-white ml-2">{isSwapMode ? "Asset Conversion" : "Direct Route"}</span>
                        </div>
                        <div>
                          <span className="text-white/40">Source:</span>
                          <span className="text-white ml-2">{currentCurrency?.symbol || "—"} ({currentNetwork?.name || "—"})</span>
                        </div>
                        {isSwapMode && (
                          <div>
                            <span className="text-white/40">Target:</span>
                            <span className="text-white ml-2">{toCurrencyConfig?.symbol || "—"} ({currentToNetwork?.name || "—"})</span>
                          </div>
                        )}
                        <div className="pt-4 border-t border-white/5">
                          <p className="text-white/50 leading-relaxed">
                            Your transaction will be routed through our infrastructure with zero traceability.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Result Panel */}
                  {transactionResult && transactionResult.payinAddress && (
                    <div className="bg-[#0a0a0f] rounded-xl border border-[#00D9FF]/30 p-6 space-y-6 sticky top-24">
                      
                      {/* Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-white/10">
                        <div>
                          <h3 className="text-sm font-bold text-white mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                            Deposit Address
                          </h3>
                          <p className="text-[10px] text-white/40">Send funds to complete transfer</p>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-[#00D9FF]/20 flex items-center justify-center">
                          <span className="text-[#00D9FF] text-sm">✓</span>
                        </div>
                      </div>

                      {/* Status */}
                      {transactionStatus && typeof transactionStatus === 'object' && 'status' in transactionStatus && (
                        <div className="bg-black/40 rounded-lg p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-white/40 uppercase tracking-wider">Processing</span>
                            <span className={`text-xs font-bold ${getStatusDisplay(String(transactionStatus.status)).color}`}>
                              {getStatusDisplay(String(transactionStatus.status)).label}
                            </span>
                          </div>
                          <Progress value={getStatusDisplay(String(transactionStatus.status)).progress} className="h-1.5" />
                        </div>
                      )}

                      {/* Amount Info */}
                      <div className="bg-[#050508] rounded-lg p-4 border border-white/5">
                        <div className="text-xs text-white/50 mb-2">Deposit Amount</div>
                        <div className="text-lg font-bold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                          {transactionResult.amount?.toFixed(6)} {transactionResult.currency}
                        </div>
                        {transactionResult.isSwap && (
                          <div className="text-xs text-white/40 mt-2">
                            → Receives {transactionResult.toCurrency}
                          </div>
                        )}
                      </div>

                      {/* QR Code */}
                      <div className="flex justify-center p-4 bg-white rounded-lg">
                        <QRCodeSVG value={transactionResult.payinAddress} size={180} level="H" />
                      </div>

                      {/* Address */}
                      <div>
                        <label className="block text-xs text-white/50 mb-2 uppercase tracking-wider">Address</label>
                        <div className="flex gap-2">
                          <code className="flex-1 text-[10px] font-mono bg-[#050508] text-[#00D9FF] p-3 rounded-lg break-all border border-white/5">
                            {transactionResult.payinAddress}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(transactionResult.payinAddress || "");
                              toast.success("Copied");
                            }}
                            className="shrink-0 border-white/10 hover:bg-white/5 rounded-lg"
                          >
                            Copy
                          </Button>
                        </div>
                      </div>

                      {/* Warning */}
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                        <p className="text-[10px] text-amber-400/90 leading-relaxed">
                          Send the exact amount shown above. {transactionResult.isSwap && `Recipient will receive ${transactionResult.toCurrency}.`}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          className="w-full border-white/10 hover:bg-white/5 rounded-lg"
                          onClick={() => {
                            setTransactionResult(null);
                            setTransferRecipient("");
                            setTransferAmount("");
                          }}
                        >
                          Create New Transfer
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
