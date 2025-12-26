import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { COMMUNITY_URL, APP_LOGO } from "@/const";

export default function Home() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"transfer" | "history" | "about">("about");
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const handleLogoClick = () => {
    setLocation("/");
    setActiveTab("about");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Estimate fees when amount changes (with debouncing)
  const [debouncedAmount, setDebouncedAmount] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(transferAmount);
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timer);
  }, [transferAmount]);

  const { data: feeEstimate, isLoading: isEstimatingFees } = trpc.transaction.estimateFees.useQuery(
    { amountSol: debouncedAmount },
    {
      enabled: !!debouncedAmount && parseFloat(debouncedAmount) > 0 && !isNaN(parseFloat(debouncedAmount)),
      refetchOnWindowFocus: false,
    }
  );

  const [transactionResult, setTransactionResult] = useState<{
    txSignature: string;
    payinAddress?: string;
  } | null>(null);

  const transferMutation = trpc.transaction.transfer.useMutation({
    onSuccess: (data) => {
      setTransactionResult({
        txSignature: data.txSignature,
        payinAddress: data.payinAddress,
      });
      toast.success("Transaction created! Please send SOL to complete the transfer.");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create transaction");
      setTransactionResult(null);
    },
  });

  const handleTransfer = () => {
    // Validate inputs
    if (!transferRecipient || transferRecipient.trim().length === 0) {
      toast.error("Please enter a recipient address");
      return;
    }

    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    transferMutation.mutate({
      recipientPublicKey: transferRecipient.trim(),
      amountSol: transferAmount,
    });
  };

  return (
    <div className="min-h-screen gradient-bg">
      {/* Navigation */}
      <nav className="border-b border-[#333333] backdrop-blur-xl bg-black/95 sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <button
              onClick={handleLogoClick}
              className="flex items-center space-x-4 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <img src={APP_LOGO} alt="NULLROUTE" className="w-10 h-10 rounded-lg" />
              <span className="text-xl font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                NULLROUTE
              </span>
            </button>

            {/* Nav Links */}
            <div className="hidden md:flex items-center space-x-2">
              <button
                onClick={() => setActiveTab("about")}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "about"
                    ? "bg-primary text-white"
                    : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
                }`}
              >
                About
              </button>
              <button
                onClick={() => setActiveTab("transfer")}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "transfer"
                    ? "bg-primary text-white"
                    : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
                }`}
              >
                Transfer
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "history"
                    ? "bg-primary text-white"
                    : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
                }`}
              >
                History
              </button>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-4">
              <a
                href={COMMUNITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-[#1a1a1a] transition-all"
              >
                Community
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/* Mobile Tab Selector */}
        <div className="md:hidden flex space-x-2 mb-6">
          <button
            onClick={() => setActiveTab("about")}
            className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "about"
                ? "bg-primary text-white"
                : "bg-[#1a1a1a] text-gray-400"
            }`}
          >
            About
          </button>
          <button
            onClick={() => setActiveTab("transfer")}
            className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "transfer"
                ? "bg-primary text-white"
                : "bg-[#1a1a1a] text-gray-400"
            }`}
          >
            Transfer
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "history"
                ? "bg-primary text-white"
                : "bg-[#1a1a1a] text-gray-400"
            }`}
          >
            History
          </button>
        </div>

        {/* About Tab */}
        {activeTab === "about" && (
          <div className="max-w-5xl mx-auto space-y-10">
            {/* Hero Section - Modern Layout */}
            <div className="text-center space-y-8 py-16">
              <div className="flex justify-center">
                <img src={APP_LOGO} alt="NULLROUTE" className="w-40 h-40 rounded-2xl border-2 border-primary shadow-[0_0_40px_rgba(5,79,252,0.4)]" />
              </div>
              <div className="space-y-6">
                <h1 className="text-6xl md:text-7xl font-bold tracking-tight text-white">
                  NR <span className="text-primary">Ø</span> ROUTE
                </h1>
                
                {/* Technical Specifications */}
                <div className="flex flex-wrap justify-center items-center gap-6 text-sm font-mono text-gray-400">
                  <div className="px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333333]">
                    <span className="text-primary">80%</span> MIN.
                  </div>
                  <div className="px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333333]">
                    NR24-61-R122
                  </div>
                  <div className="px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333333]">
                    PRIVACY TRANSP.
                  </div>
                  <div className="px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333333]">
                    NR24-ZK51-R122
                  </div>
                </div>

                {/* NULLROUTE Highlight Box */}
                <div className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-primary border-2 border-white/20 shadow-[0_0_40px_rgba(5,79,252,0.6)]">
                  <span className="text-2xl font-bold text-white tracking-wide">NULLROUTE</span>
                </div>

                {/* Core Features */}
                <div className="space-y-3 max-w-3xl mx-auto">
                  <p className="text-xl text-white font-semibold leading-relaxed">
                    NULL-ROUTE ENCRYPTED PATHWAY REGISTER
                  </p>
                  <p className="text-xl text-white font-semibold leading-relaxed">
                    CERTIFIED GHOST TX CHANNEL
                  </p>
                  <p className="text-xl text-white font-semibold leading-relaxed">
                    UNTRACEABLE LEDGER MIGRATION
                  </p>
                </div>

                {/* Compliance Badge */}
                <div className="inline-flex items-center space-x-2 px-6 py-3 rounded-lg bg-[#1a1a1a] border-2 border-primary/50">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                  <span className="text-sm font-semibold text-primary">COMPLIANT WITH VOID STANDARD Ø</span>
                </div>
              </div>
            </div>

            {/* Features - Asymmetric Magazine Style */}
            <div className="py-32 relative overflow-hidden">
              {/* Diagonal accent line */}
              <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-30"></div>
              
              <div className="max-w-7xl mx-auto px-4">
                {/* Feature 01 - Large Left, Small Right */}
                <div className="mb-32 relative">
                  <div className="grid grid-cols-12 gap-8 items-start">
                    <div className="col-span-12 md:col-span-7">
                      <div className="mb-4">
                        <span className="text-primary font-mono text-xs tracking-[0.3em] opacity-60">FEATURE 01</span>
                      </div>
                      <h3 className="text-7xl md:text-8xl font-black text-white mb-8 leading-[0.9] tracking-tighter">
                        COMPLETE<br />PRIVACY
                      </h3>
                      <div className="w-24 h-1 bg-primary mb-8"></div>
                      <p className="text-xl text-gray-300 leading-relaxed max-w-xl">
                        Your transaction details, amounts, and recipient addresses remain completely private and untraceable. Every transfer is encrypted through our null-route pathway.
                      </p>
                    </div>
                    <div className="col-span-12 md:col-span-5 md:pt-32">
                      <div className="relative">
                        <div className="absolute -top-8 -right-8 w-32 h-32 border-2 border-primary/20 rotate-45"></div>
                        <div className="relative bg-[#0a0a0a] border-2 border-primary/30 p-8 transform -rotate-1 hover:rotate-0 transition-transform duration-300">
                          <div className="text-6xl font-black text-primary/20 mb-4">01</div>
                          <div className="text-sm text-gray-400 font-mono tracking-wider">ENCRYPTED PATHWAY</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Feature 02 - Small Left, Large Right */}
                <div className="mb-32 relative">
                  <div className="grid grid-cols-12 gap-8 items-start">
                    <div className="col-span-12 md:col-span-5 order-2 md:order-1">
                      <div className="relative">
                        <div className="absolute -bottom-8 -left-8 w-32 h-32 border-2 border-primary/20 -rotate-45"></div>
                        <div className="relative bg-[#0a0a0a] border-2 border-primary/30 p-8 transform rotate-1 hover:rotate-0 transition-transform duration-300">
                          <div className="text-6xl font-black text-primary/20 mb-4">02</div>
                          <div className="text-sm text-gray-400 font-mono tracking-wider">INSTANT NETWORK</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-12 md:col-span-7 order-1 md:order-2 md:text-right">
                      <div className="mb-4 md:text-right">
                        <span className="text-primary font-mono text-xs tracking-[0.3em] opacity-60">FEATURE 02</span>
                      </div>
                      <h3 className="text-7xl md:text-8xl font-black text-white mb-8 leading-[0.9] tracking-tighter">
                        LIGHTNING<br />FAST
                      </h3>
                      <div className="w-24 h-1 bg-primary mb-8 md:ml-auto"></div>
                      <p className="text-xl text-gray-300 leading-relaxed max-w-xl md:ml-auto">
                        Leverage Solana's high-speed network for instant private transactions with minimal fees. No waiting, no delays.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Feature 03 - Centered Large */}
                <div className="relative">
                  <div className="max-w-4xl mx-auto text-center">
                    <div className="mb-4">
                      <span className="text-primary font-mono text-xs tracking-[0.3em] opacity-60">FEATURE 03</span>
                    </div>
                    <h3 className="text-7xl md:text-9xl font-black text-white mb-8 leading-[0.85] tracking-tighter">
                      SECURE<br />&<br />TRUSTLESS
                    </h3>
                    <div className="w-32 h-1 bg-primary mx-auto mb-8"></div>
                    <p className="text-xl text-gray-300 leading-relaxed max-w-2xl mx-auto mb-12">
                      Non-custodial solution where you maintain full control of your funds through your wallet. No intermediaries, no trust required.
                    </p>
                    <div className="inline-block relative">
                      <div className="absolute inset-0 border-2 border-primary/30 transform rotate-3"></div>
                      <div className="relative bg-[#0a0a0a] border-2 border-primary p-6 transform -rotate-1">
                        <div className="text-5xl font-black text-primary/20 mb-2">03</div>
                        <div className="text-xs text-gray-400 font-mono tracking-widest">NON-CUSTODIAL</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* How It Works - Diagonal Flow Layout */}
            <div className="py-32 relative">
              {/* Connecting line visual */}
              <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/20 via-primary/40 to-primary/20 transform -translate-x-1/2"></div>
              
              <div className="max-w-6xl mx-auto px-4">
                <div className="mb-24 text-center">
                  <h2 className="text-8xl md:text-9xl font-black text-white mb-4 tracking-tighter leading-[0.9]">
                    HOW IT<br />WORKS
                  </h2>
                  <div className="w-40 h-1 bg-primary mx-auto"></div>
                </div>

                <div className="space-y-32 relative">
                  {/* Step 1 - Left Aligned */}
                  <div className="relative">
                    <div className="grid grid-cols-12 gap-8 items-center">
                      <div className="col-span-12 md:col-span-6">
                        <div className="relative">
                          <div className="absolute -left-8 top-0 text-[120px] md:text-[180px] font-black text-primary/10 leading-none">01</div>
                          <div className="relative">
                            <div className="mb-3">
                              <span className="text-primary font-mono text-xs tracking-[0.3em] opacity-60">STEP ONE</span>
                            </div>
                            <h3 className="text-5xl md:text-6xl font-black text-white mb-6 leading-tight tracking-tighter">
                              ENTER TRANSFER<br />DETAILS
                            </h3>
                            <div className="w-20 h-1 bg-primary mb-6"></div>
                            <p className="text-lg text-gray-300 leading-relaxed">
                              Navigate to the "Transfer" tab and enter the recipient's Solana wallet address and the amount of SOL you want to send privately.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <div className="relative">
                          <div className="absolute inset-0 border-2 border-primary/20 transform rotate-6"></div>
                          <div className="relative bg-[#0a0a0a] border-2 border-primary p-8 transform -rotate-2 hover:rotate-0 transition-transform duration-300">
                            <div className="text-4xl font-black text-primary mb-4">→</div>
                            <div className="text-sm text-gray-400 font-mono">TRANSFER FORM</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 - Right Aligned */}
                  <div className="relative">
                    <div className="grid grid-cols-12 gap-8 items-center">
                      <div className="col-span-12 md:col-span-6 order-2 md:order-1">
                        <div className="relative">
                          <div className="absolute inset-0 border-2 border-primary/20 transform -rotate-6"></div>
                          <div className="relative bg-[#0a0a0a] border-2 border-primary p-8 transform rotate-2 hover:rotate-0 transition-transform duration-300">
                            <div className="text-4xl font-black text-primary mb-4">→</div>
                            <div className="text-sm text-gray-400 font-mono">TRANSACTION CREATION</div>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-12 md:col-span-6 order-1 md:order-2 md:text-right">
                        <div className="relative">
                          <div className="absolute -right-8 top-0 text-[120px] md:text-[180px] font-black text-primary/10 leading-none">02</div>
                          <div className="relative">
                            <div className="mb-3 md:text-right">
                              <span className="text-primary font-mono text-xs tracking-[0.3em] opacity-60">STEP TWO</span>
                            </div>
                            <h3 className="text-5xl md:text-6xl font-black text-white mb-6 leading-tight tracking-tighter">
                              CREATE TRANSACTION
                            </h3>
                            <div className="w-20 h-1 bg-primary mb-6 md:ml-auto"></div>
                            <p className="text-lg text-gray-300 leading-relaxed">
                              Click "Create Transaction" to generate a private deposit address. Review the fee estimate and transaction details before proceeding.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 - Left Aligned */}
                  <div className="relative">
                    <div className="grid grid-cols-12 gap-8 items-center">
                      <div className="col-span-12 md:col-span-6">
                        <div className="relative">
                          <div className="absolute -left-8 top-0 text-[120px] md:text-[180px] font-black text-primary/10 leading-none">03</div>
                          <div className="relative">
                            <div className="mb-3">
                              <span className="text-primary font-mono text-xs tracking-[0.3em] opacity-60">STEP THREE</span>
                            </div>
                            <h3 className="text-5xl md:text-6xl font-black text-white mb-6 leading-tight tracking-tighter">
                              INITIATE PRIVATE<br />TRANSFER
                            </h3>
                            <div className="w-20 h-1 bg-primary mb-6"></div>
                            <p className="text-lg text-gray-300 leading-relaxed">
                              Click "Send Privately" to initiate the transaction. Your SOL will be routed through our secure exchange infrastructure, ensuring complete privacy.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <div className="relative">
                          <div className="absolute inset-0 border-2 border-primary/20 transform rotate-6"></div>
                          <div className="relative bg-[#0a0a0a] border-2 border-primary p-8 transform -rotate-2 hover:rotate-0 transition-transform duration-300">
                            <div className="text-4xl font-black text-primary mb-4">→</div>
                            <div className="text-sm text-gray-400 font-mono">PRIVATE ROUTING</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 4 - Centered Large */}
                  <div className="relative">
                    <div className="max-w-3xl mx-auto text-center">
                      <div className="relative inline-block mb-8">
                        <div className="absolute -left-12 top-1/2 transform -translate-y-1/2 text-[100px] font-black text-primary/10">04</div>
                        <div className="relative">
                          <div className="mb-3">
                            <span className="text-primary font-mono text-xs tracking-[0.3em] opacity-60">STEP FOUR</span>
                          </div>
                          <h3 className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight tracking-tighter">
                            RECEIVE<br />CONFIRMATION
                          </h3>
                          <div className="w-32 h-1 bg-primary mx-auto mb-6"></div>
                          <p className="text-lg text-gray-300 leading-relaxed">
                            Once processed, you'll receive confirmation. The recipient receives SOL with no traceable connection to your original transaction.
                          </p>
                        </div>
                      </div>
                      <div className="relative inline-block">
                        <div className="absolute inset-0 border-2 border-primary/30 transform rotate-3"></div>
                        <div className="relative bg-[#0a0a0a] border-2 border-primary p-8 transform -rotate-1">
                          <div className="text-5xl font-black text-primary mb-2">✓</div>
                          <div className="text-xs text-gray-400 font-mono tracking-widest">COMPLETE</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Why Privacy Matters - Editorial Layout */}
            <div className="py-24">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-6xl font-bold text-white mb-16 tracking-tight">Why Privacy Matters</h2>
                <div className="space-y-8 text-gray-400 leading-relaxed">
                  <p className="text-xl text-white leading-relaxed">
                    Financial privacy is a fundamental right. On public blockchains, every transaction you make is permanently recorded 
                    and visible to anyone. This means your entire financial history, wallet balance, and transaction patterns can be 
                    analyzed by blockchain analytics companies, competitors, or malicious actors.
                  </p>
                  <p className="text-lg leading-relaxed">
                    NULLROUTE solves this problem by giving you the choice to keep your transactions private. Whether you're a business 
                    protecting sensitive financial operations, an individual maintaining personal privacy, or a trader avoiding front-running 
                    attacks, private transactions ensure your financial activity remains confidential while still benefiting from Solana's 
                    speed and low costs.
                  </p>
                  <p className="text-lg leading-relaxed">
                    Privacy is not about hiding illegal activity - it's about maintaining the same level of financial confidentiality that 
                    traditional banking systems provide, but in a decentralized and trustless environment.
                  </p>
                </div>
              </div>
            </div>

            {/* Technical Details - Modern Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="crypto-card rounded-xl p-8 space-y-4 border-2 border-transparent">
                <h3 className="text-2xl font-bold text-white">Network & Fees</h3>
                <div className="space-y-4 text-gray-400">
                  <p>
                    <strong className="text-white">Network:</strong> NULLROUTE operates on Solana, providing fast and low-cost transactions.
                  </p>
                  <p>
                    <strong className="text-white">Transaction Fees:</strong> Minimal fees that are significantly lower than Ethereum-based solutions.
                  </p>
                </div>
              </div>

              <div className="crypto-card rounded-xl p-8 space-y-4 border-2 border-transparent">
                <h3 className="text-2xl font-bold text-white">Security & Control</h3>
                <div className="space-y-4 text-gray-400">
                  <p>
                    <strong className="text-white">Security:</strong> All transactions are processed through secure, audited exchange infrastructure.
                  </p>
                  <p>
                    <strong className="text-white">Non-Custodial:</strong> You always maintain full control of your funds through your wallet's private keys.
                  </p>
                </div>
              </div>
            </div>

            {/* Get Started CTA */}
            <div className="text-center py-16">
              <p className="text-xl text-gray-400 mb-8">
                Ready to start making private transactions on Solana?
              </p>
              <button
                onClick={() => setActiveTab("transfer")}
                className="btn-hover-lift px-12 py-6 rounded-xl bg-primary hover:bg-[#0a5fff] text-white font-bold text-lg shadow-[0_0_40px_rgba(5,79,252,0.4)] transition-all"
              >
                Start Private Transfer
              </button>
            </div>

            {/* Footer */}
            <div className="text-center text-sm text-gray-500 pt-8 border-t border-[#333333]">
              <p className="text-white font-semibold">Powered by NULLROUTE on Solana</p>
              <p className="mt-2">
                <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors text-primary">
                  Join Community
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Transfer Tab */}
        {activeTab === "transfer" && (
          <div className="max-w-2xl mx-auto">
            {/* Private Transfer - Centered Single Window */}
            <div className="crypto-card rounded-xl p-10 border-2 border-transparent">
              <div className="mb-8 text-center">
                <h3 className="text-3xl font-bold mb-3 text-white">Private Transfer</h3>
                <p className="text-gray-400">Send SOL privately using secure exchange infrastructure</p>
              </div>
              <div className="space-y-6">
                <div>
                  <Label htmlFor="transfer-recipient" className="text-sm font-semibold mb-2 block text-white">Recipient Address</Label>
                  <Input
                    id="transfer-recipient"
                    type="text"
                    placeholder="Solana address..."
                    value={transferRecipient}
                    onChange={(e) => setTransferRecipient(e.target.value)}
                    className="bg-[#1a1a1a] border-[#333333] text-white font-mono text-sm h-12 focus:border-primary"
                  />
                </div>
                <div>
                  <Label htmlFor="transfer-amount" className="text-sm font-semibold mb-2 block text-white">Amount (SOL)</Label>
                  <Input
                    id="transfer-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="bg-[#1a1a1a] border-[#333333] text-white h-12 focus:border-primary"
                  />
                </div>

                {/* Fee Estimation Display */}
                {transferAmount && parseFloat(transferAmount) > 0 && (
                  <div className="rounded-lg bg-[#1a1a1a] border border-[#333333] p-5 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Transaction Fee:</span>
                      {isEstimatingFees ? (
                        <span className="shimmer inline-block w-20 h-4 rounded"></span>
                      ) : feeEstimate ? (
                        <span className="font-semibold text-white">
                          {feeEstimate.feeAmount.toFixed(6)} SOL ({feeEstimate.feePercentage.toFixed(2)}%)
                        </span>
                      ) : (
                        <span className="text-gray-500">Calculating...</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">You Send:</span>
                      <span className="font-bold text-white">{parseFloat(transferAmount || "0").toFixed(6)} SOL</span>
                    </div>
                    <div className="flex items-center justify-between text-sm border-t border-[#333333] pt-3">
                      <span className="text-gray-400">Recipient Receives:</span>
                      {isEstimatingFees ? (
                        <span className="shimmer inline-block w-20 h-4 rounded"></span>
                      ) : feeEstimate ? (
                        <span className="font-bold text-primary">
                          {feeEstimate.receiveAmount.toFixed(6)} SOL
                        </span>
                      ) : (
                        <span className="text-gray-500">Calculating...</span>
                      )}
                    </div>
                    {feeEstimate && feeEstimate.feeAmount > 0 && (
                      <p className="text-xs text-gray-500 pt-2 border-t border-[#333333]">
                        Fees are included in the exchange rate and cover network and processing costs.
                      </p>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleTransfer}
                  disabled={!transferRecipient || !transferAmount || transferMutation.isPending || (feeEstimate && !feeEstimate.isValid)}
                  className="w-full btn-hover-lift bg-primary hover:bg-[#0a5fff] h-14 text-base font-bold text-white shadow-[0_0_30px_rgba(5,79,252,0.4)]"
                >
                  {transferMutation.isPending ? "Creating Transaction..." : "Create Transaction"}
                </Button>

                {/* Transaction Result - Show payinAddress and instructions */}
                {transactionResult && transactionResult.payinAddress && (
                  <div className="rounded-lg bg-primary/10 border-2 border-primary/30 p-6 space-y-4">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 space-y-3">
                        <div>
                          <h4 className="font-bold text-white mb-2 text-lg">Transaction Created Successfully</h4>
                          <p className="text-sm text-gray-400 mb-4">
                            To complete your private transfer, send <strong className="text-white">{parseFloat(transferAmount || "0").toFixed(6)} SOL</strong> to the address below:
                          </p>
                        </div>
                        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#333333]">
                          <Label className="text-xs text-gray-400 mb-2 block">Send SOL to this address:</Label>
                          <div className="flex items-center space-x-2">
                            <code className="flex-1 font-mono text-sm bg-[#0a0a0a] text-white p-3 rounded break-all border border-[#333333]">
                              {transactionResult.payinAddress}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(transactionResult.payinAddress || "");
                                toast.success("Address copied to clipboard!");
                              }}
                              className="shrink-0"
                            >
                              Copy
                            </Button>
                          </div>
                        </div>
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                          <p className="text-xs text-yellow-700 dark:text-yellow-400">
                            <strong>Important:</strong> Send exactly <strong>{parseFloat(transferAmount || "0").toFixed(6)} SOL</strong> to this address. 
                            The transaction will be processed automatically once the funds are received.
                          </p>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-[#333333]">
                          <span className="text-xs text-gray-400">Transaction ID:</span>
                          <code className="text-xs font-mono text-gray-500">{transactionResult.txSignature.slice(0, 16)}...</code>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setTransactionResult(null);
                            setTransferRecipient("");
                            setTransferAmount("");
                          }}
                        >
                          Create New Transaction
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="max-w-4xl mx-auto">
            <div className="crypto-card rounded-xl p-8 border-2 border-transparent">
              <h3 className="text-2xl font-bold mb-6 text-white">Transaction History</h3>
              <div className="text-center py-12 text-gray-400">
                <p className="text-white">Transaction history is not available</p>
                <p className="text-sm mt-2">Start by making a private transfer</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
