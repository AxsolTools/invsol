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
    <div className="min-h-screen bg-[#020204] relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-[#00D9FF]/[0.04] rounded-full blur-[180px]"></div>
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-[#8B5CF6]/[0.04] rounded-full blur-[180px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#00D9FF]/[0.02] rounded-full blur-[200px]"></div>
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#020204]/60 backdrop-blur-2xl border-b border-white/[0.03]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={handleLogoClick} className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-[#00D9FF]/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <img src={APP_LOGO} alt="" className="w-10 h-10 rounded-xl relative" />
            </div>
            <div className="hidden sm:block">
              <span className="text-base font-bold tracking-wider text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                INVSOL
              </span>
              <span className="text-[10px] text-[#00D9FF] tracking-[0.25em] block -mt-0.5">BRIDGE</span>
            </div>
          </button>

          <div className="flex items-center gap-5">
            <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/30 hover:text-[#00D9FF] transition-colors tracking-widest uppercase">
              Community
            </a>
            
            {connected && publicKey ? (
              <button
                onClick={handleDisconnectWallet}
                className="flex items-center gap-2.5 px-4 py-2 rounded-full text-xs bg-white/[0.03] border border-white/[0.06] text-white/60 hover:border-[#00D9FF]/30 hover:text-white transition-all"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span>
                <span className="font-mono">{publicKey.toBase58().slice(0, 4)}····{publicKey.toBase58().slice(-4)}</span>
              </button>
            ) : (
              <button
                onClick={handleConnectWallet}
                disabled={connecting}
                className="px-5 py-2 rounded-full text-xs font-bold bg-[#00D9FF] text-[#020204] hover:shadow-[0_0_30px_rgba(0,217,255,0.4)] transition-all disabled:opacity-50"
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
              {/* Center glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-radial from-[#00D9FF]/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="max-w-4xl mx-auto text-center relative">
                {/* Title with orbiting assets */}
                <div className="relative mb-8">
                  {/* Orbiting ring container */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] sm:w-[440px] sm:h-[440px] lg:w-[540px] lg:h-[540px] pointer-events-none">
                    {/* Orbit path (visual) */}
                    <div className="absolute inset-0 rounded-full border border-white/[0.04]"></div>
                    <div className="absolute inset-6 rounded-full border border-dashed border-white/[0.02]"></div>
                    
                    {/* Orbiting assets container - spins continuously */}
                    <div 
                      className="absolute inset-0"
                      style={{ animation: 'orbit-spin 25s linear infinite' }}
                    >
                      {[
                        { symbol: 'BTC', color: '#F7931A' },
                        { symbol: 'ETH', color: '#627EEA' },
                        { symbol: 'SOL', color: '#00D9FF' },
                        { symbol: 'BNB', color: '#F3BA2F' },
                        { symbol: 'XRP', color: '#FFFFFF' },
                        { symbol: 'USDT', color: '#26A17B' },
                        { symbol: 'USDC', color: '#2775CA' },
                      ].map((asset, index) => {
                        const angle = (index * 360) / 7;
                        const radians = (angle * Math.PI) / 180;
                        // Position on circle edge
                        const x = Math.cos(radians) * 50; // 50% of container
                        const y = Math.sin(radians) * 50;
                        return (
                          <div
                            key={asset.symbol}
                            className="absolute"
                            style={{
                              top: `calc(50% + ${y}%)`,
                              left: `calc(50% + ${x}%)`,
                              transform: 'translate(-50%, -50%)',
                            }}
                          >
                            <div 
                              className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-[#0a0a12] border border-white/[0.1] flex items-center gap-1.5 sm:gap-2 shadow-xl whitespace-nowrap"
                              style={{ animation: 'orbit-counter-spin 25s linear infinite' }}
                            >
                              <div 
                                className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" 
                                style={{ backgroundColor: asset.color, boxShadow: `0 0 10px ${asset.color}` }}
                              ></div>
                              <span className="text-[9px] sm:text-[11px] font-bold text-white/90 tracking-wider">{asset.symbol}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Title (centered, above orbit) */}
                  <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight relative z-10 py-20 sm:py-28" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    <span className="text-white">INVSOL</span>
                    <span className="text-[#00D9FF]"> BRIDGE</span>
                  </h1>
                </div>

                {/* Tagline */}
                <p className="text-lg sm:text-xl text-white/40 mb-12 max-w-xl mx-auto leading-relaxed">
                  The invisible bridge between blockchains. Move assets across chains with zero trace linking origin to destination.
                </p>

                {/* CTA */}
                <button
                  onClick={() => setView("bridge")}
                  className="group relative px-10 py-4 rounded-2xl font-bold tracking-wider transition-all"
                  style={{ fontFamily: "'Orbitron', sans-serif" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00D9FF] to-[#00b3d9] rounded-2xl"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00D9FF] to-[#00b3d9] rounded-2xl blur-xl opacity-50 group-hover:opacity-80 transition-opacity"></div>
                  <span className="relative text-[#020204] flex items-center gap-3">
                    ENTER BRIDGE
                    <span className="text-lg">→</span>
                  </span>
                </button>
              </div>
            </section>

            {/* Features Section */}
            <section className="py-32 px-6 border-t border-white/[0.03]">
              <div className="max-w-5xl mx-auto">
                
                {/* Section header */}
                <div className="text-center mb-20">
                  <span className="text-[10px] text-[#00D9FF] tracking-[0.4em] uppercase mb-4 block">Protocol Features</span>
                  <h2 className="text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    How the Bridge Works
                  </h2>
                </div>

                {/* Feature cards */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  
                  {/* Card 1 */}
                  <div className="group bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.04] hover:border-[#00D9FF]/20 rounded-2xl p-8 transition-all duration-500">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00D9FF]/20 to-[#00D9FF]/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <div className="w-6 h-6 border-2 border-[#00D9FF] rounded-lg relative">
                        <div className="absolute inset-1 bg-[#00D9FF] rounded-sm"></div>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      Chain Agnostic
                    </h3>
                    <p className="text-sm text-white/40 leading-relaxed">
                      Bridge between any supported chain seamlessly. BTC to SOL, ETH to BNB, or any combination.
                    </p>
                  </div>

                  {/* Card 2 */}
                  <div className="group bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.04] hover:border-[#8B5CF6]/20 rounded-2xl p-8 transition-all duration-500">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8B5CF6]/20 to-[#8B5CF6]/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <div className="relative w-6 h-6">
                        <div className="absolute inset-0 border-2 border-[#8B5CF6] rounded-full"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-[#8B5CF6] rounded-full"></div>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      Zero Trace
                    </h3>
                    <p className="text-sm text-white/40 leading-relaxed">
                      Origin and destination are mathematically unlinked. No trail for analytics to follow.
                    </p>
                  </div>

                  {/* Card 3 */}
                  <div className="group bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.04] hover:border-[#00D9FF]/20 rounded-2xl p-8 transition-all duration-500">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00D9FF]/20 to-[#8B5CF6]/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <div className="w-6 h-6 relative">
                        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00D9FF]"></div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#8B5CF6]"></div>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      Self-Custody
                    </h3>
                    <p className="text-sm text-white/40 leading-relaxed">
                      Your keys never leave your wallet. We route, we don't hold.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Process Section */}
            <section className="py-32 px-6 border-t border-white/[0.03]">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-20">
                  <span className="text-[10px] text-[#8B5CF6] tracking-[0.4em] uppercase mb-4 block">Simple Process</span>
                  <h2 className="text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    Four Steps to Invisible
                  </h2>
                </div>

                <div className="space-y-0">
                  {[
                    { num: "01", title: "Configure", desc: "Select source asset, destination asset, and receiving wallet address" },
                    { num: "02", title: "Generate", desc: "System creates a unique one-time deposit address for your transfer" },
                    { num: "03", title: "Deposit", desc: "Send the exact amount to the generated address from any wallet" },
                    { num: "04", title: "Receive", desc: "Destination wallet receives funds with no traceable connection" },
                  ].map((step, i) => (
                    <div key={step.num} className="flex items-start gap-8 py-8 border-b border-white/[0.03] last:border-0">
                      <span className="text-5xl font-black text-white/[0.04] shrink-0 w-20" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                        {step.num}
                      </span>
                      <div>
                        <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                          {step.title}
                        </h3>
                        <p className="text-white/40 leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* CTA Section */}
            <section className="py-32 px-6 border-t border-white/[0.03]">
              <div className="max-w-2xl mx-auto text-center">
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  Start Bridging
                </h2>
                <p className="text-white/40 mb-10">
                  Your first invisible transfer takes less than a minute to set up.
                </p>
                <button
                  onClick={() => setView("bridge")}
                  className="px-12 py-4 rounded-2xl bg-white text-[#020204] font-bold tracking-wider hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all"
                  style={{ fontFamily: "'Orbitron', sans-serif" }}
                >
                  OPEN BRIDGE
                </button>
              </div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-6 border-t border-white/[0.03]">
              <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img src={APP_LOGO} alt="" className="w-8 h-8 rounded-lg opacity-40" />
                  <span className="text-sm text-white/20">INVSOL BRIDGE</span>
                </div>
                <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-white/20 hover:text-[#00D9FF] transition-colors">
                  Join Community →
                </a>
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
              <div className="bg-[#0a0a10] rounded-3xl border border-white/[0.05] shadow-2xl overflow-hidden">
                
                {/* Header */}
                <div className="px-8 py-6 bg-gradient-to-r from-[#00D9FF]/[0.08] to-transparent border-b border-white/[0.03]">
                  <div className="flex items-center gap-3">
                    <img src={APP_LOGO} alt="" className="w-8 h-8 rounded-lg" />
                    <div>
                      <h1 className="text-lg font-bold text-white tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                        {isSwapMode ? "CROSS-CHAIN BRIDGE" : "STEALTH BRIDGE"}
                      </h1>
                      <p className="text-[11px] text-white/30 tracking-wider uppercase">
                        {isSwapMode ? "Swap & Route Anonymously" : "Same Asset · Broken Chain"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-8 space-y-6">
                  
                  {/* Mode Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                    <div>
                      <span className="text-sm font-medium text-white">Cross-Chain</span>
                      <p className="text-[11px] text-white/30 mt-0.5">Convert between assets</p>
                    </div>
                    <Switch
                      checked={isSwapMode}
                      onCheckedChange={setIsSwapMode}
                      className="data-[state=checked]:bg-[#00D9FF]"
                    />
                  </div>

                  {/* Source */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-medium text-white/40 uppercase tracking-widest">
                        {isSwapMode ? "From" : "Asset"}
                      </Label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                        <SelectTrigger className="bg-white/[0.02] border-white/[0.05] text-white h-12 rounded-xl focus:border-[#00D9FF]/50 focus:ring-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0a0a10] border-white/[0.05] rounded-xl">
                          {currencies?.map((currency) => (
                            <SelectItem key={currency.ticker} value={currency.ticker} className="text-white focus:bg-white/[0.04] rounded-lg">
                              <span className="font-semibold">{currency.symbol}</span>
                              <span className="text-white/30 ml-2 text-xs">{currency.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={selectedNetwork} onValueChange={setSelectedNetwork} disabled={availableNetworks.length <= 1}>
                        <SelectTrigger className="bg-white/[0.02] border-white/[0.05] text-white h-12 rounded-xl focus:border-[#00D9FF]/50 focus:ring-0 disabled:opacity-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0a0a10] border-white/[0.05] rounded-xl">
                          {availableNetworks.map((network) => (
                            <SelectItem key={network.id} value={network.id} className="text-white focus:bg-white/[0.04] rounded-lg">
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
                      <div className="w-10 h-10 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center">
                        <span className="text-[#00D9FF] text-lg">↓</span>
                      </div>
                    </div>
                  )}

                  {/* Destination Asset (Swap Mode) */}
                  {isSwapMode && (
                    <div className="space-y-3">
                      <Label className="text-[11px] font-medium text-white/40 uppercase tracking-widest">To</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Select value={selectedToCurrency} onValueChange={setSelectedToCurrency}>
                          <SelectTrigger className="bg-white/[0.02] border-white/[0.05] text-white h-12 rounded-xl focus:border-[#8B5CF6]/50 focus:ring-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0a0a10] border-white/[0.05] rounded-xl">
                            {currencies?.filter(c => c.ticker !== selectedCurrency).map((currency) => (
                              <SelectItem key={currency.ticker} value={currency.ticker} className="text-white focus:bg-white/[0.04] rounded-lg">
                                <span className="font-semibold">{currency.symbol}</span>
                                <span className="text-white/30 ml-2 text-xs">{currency.name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectedToNetwork} onValueChange={setSelectedToNetwork} disabled={availableToNetworks.length <= 1}>
                          <SelectTrigger className="bg-white/[0.02] border-white/[0.05] text-white h-12 rounded-xl focus:border-[#8B5CF6]/50 focus:ring-0 disabled:opacity-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0a0a10] border-white/[0.05] rounded-xl">
                            {availableToNetworks.map((network) => (
                              <SelectItem key={network.id} value={network.id} className="text-white focus:bg-white/[0.04] rounded-lg">
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
                    <Label className="text-[11px] font-medium text-white/40 uppercase tracking-widest">
                      Receiving Wallet {isSwapMode && toCurrencyConfig && `(${toCurrencyConfig.symbol})`}
                    </Label>
                    <Input
                      type="text"
                      placeholder={isSwapMode ? (currentToNetwork?.addressPlaceholder || "Paste address") : (currentNetwork?.addressPlaceholder || "Paste address")}
                      value={transferRecipient}
                      onChange={(e) => setTransferRecipient(e.target.value)}
                      className="bg-white/[0.02] border-white/[0.05] text-white h-12 rounded-xl font-mono text-sm focus:border-[#00D9FF]/50 focus:ring-0 placeholder:text-white/15"
                    />
                  </div>

                  {/* Amount */}
                  <div className="space-y-3">
                    <Label className="text-[11px] font-medium text-white/40 uppercase tracking-widest">Amount</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.000001"
                        placeholder="0.00"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        className="bg-white/[0.02] border-white/[0.05] text-white h-14 rounded-xl text-xl pr-20 focus:border-[#00D9FF]/50 focus:ring-0 placeholder:text-white/15"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/30 font-semibold">
                        {currentCurrency?.symbol || "SOL"}
                      </span>
                    </div>
                  </div>

                  {/* Estimate */}
                  {transferAmount && parseFloat(transferAmount) > 0 && (
                    <div className="rounded-2xl bg-white/[0.01] border border-white/[0.04] p-5 space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/30">Bridge Fee</span>
                        {isEstimatingFees ? (
                          <span className="w-20 h-4 bg-white/[0.04] rounded animate-pulse"></span>
                        ) : feeEstimate?.feeAmount !== undefined ? (
                          <span className="text-white/60">{Number(feeEstimate.feeAmount).toFixed(6)} {currentCurrency?.symbol}</span>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </div>
                      <div className="h-px bg-white/[0.04]"></div>
                      <div className="flex justify-between items-center">
                        <span className="text-white/30 text-sm">Recipient Gets</span>
                        {isEstimatingFees ? (
                          <span className="w-28 h-7 bg-white/[0.04] rounded animate-pulse"></span>
                        ) : feeEstimate?.receiveAmount !== undefined ? (
                          <span className="text-2xl font-bold text-[#00D9FF]">
                            {Number(feeEstimate.receiveAmount).toFixed(6)}
                            <span className="text-sm ml-1 text-white/40">{isSwapMode ? toCurrencyConfig?.symbol : currentCurrency?.symbol}</span>
                          </span>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </div>
                      {feeEstimate && (feeEstimate as any).transactionSpeedForecast && (
                        <>
                          <div className="h-px bg-white/[0.04]"></div>
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
                      className="w-full h-14 rounded-2xl text-sm font-bold tracking-wider bg-gradient-to-r from-[#00D9FF] to-[#00b3d9] hover:from-[#00e5ff] hover:to-[#00c4e5] text-[#020204] disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-[0_0_30px_rgba(0,217,255,0.2)] hover:shadow-[0_0_40px_rgba(0,217,255,0.4)]"
                      style={{ fontFamily: "'Orbitron', sans-serif" }}
                    >
                      {transferMutation.isPending ? "GENERATING···" : "GENERATE DEPOSIT"}
                    </Button>
                  </TokenGate>

                  {/* Result */}
                  {transactionResult && transactionResult.payinAddress && (
                    <div className="rounded-2xl bg-[#00D9FF]/[0.03] border border-[#00D9FF]/20 p-6 space-y-5">
                      
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#00D9FF]/20 flex items-center justify-center">
                          <span className="text-[#00D9FF] text-lg">✓</span>
                        </div>
                        <div>
                          <p className="font-semibold text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>Bridge Ready</p>
                          <p className="text-[11px] text-white/40">Deposit to complete transfer</p>
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
                        
                        <div className="flex justify-center p-4 bg-white rounded-2xl">
                          <QRCodeSVG value={transactionResult.payinAddress} size={160} level="H" />
                        </div>

                        <div className="flex gap-2">
                          <code className="flex-1 text-[11px] font-mono bg-black/30 text-[#00D9FF] p-3 rounded-xl break-all">
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

                        <p className="text-[11px] text-amber-400/80 bg-amber-400/10 rounded-xl p-3">
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
        )}
      </main>
    </div>
  );
}
