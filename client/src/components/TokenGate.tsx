import { FC, ReactNode, useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { NULL_REQUIRED_BALANCE } from '@shared/const';

interface TokenGateProps {
  children: ReactNode;
  /** Called when user tries to access gated content but is not eligible */
  onGateBlocked?: () => void;
}

interface TokenGateState {
  status: 'idle' | 'checking' | 'eligible' | 'ineligible' | 'error';
  balance?: number;
  errorMessage?: string;
}

/**
 * TokenGate component - Guards transaction features behind NULL token holdings
 * 
 * Usage:
 * <TokenGate>
 *   <YourTransactionButton />
 * </TokenGate>
 * 
 * This will:
 * 1. Show a "Connect Wallet" prompt if wallet not connected
 * 2. Verify token holdings when wallet is connected
 * 3. Show children only if user holds >= 5M NULL tokens
 * 4. Show a prompt to acquire tokens if holdings are insufficient
 */
export const TokenGate: FC<TokenGateProps> = ({ children, onGateBlocked }) => {
  const { publicKey, connected, connecting } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const [gateState, setGateState] = useState<TokenGateState>({ status: 'idle' });

  // Query for token verification
  const verifyQuery = trpc.wallet.verifyTokenGate.useQuery(
    { publicKey: publicKey?.toBase58() || '' },
    {
      enabled: connected && !!publicKey,
      staleTime: 30000, // Cache for 30 seconds
      refetchOnWindowFocus: false,
    }
  );

  // Update gate state based on query results
  useEffect(() => {
    if (!connected || !publicKey) {
      setGateState({ status: 'idle' });
      return;
    }

    if (verifyQuery.isLoading) {
      setGateState({ status: 'checking' });
      return;
    }

    if (verifyQuery.isError) {
      setGateState({ 
        status: 'error', 
        errorMessage: verifyQuery.error?.message || 'Failed to verify token holdings' 
      });
      return;
    }

    if (verifyQuery.data) {
      if (verifyQuery.data.isEligible) {
        setGateState({ status: 'eligible', balance: verifyQuery.data.balance });
      } else {
        setGateState({ status: 'ineligible', balance: verifyQuery.data.balance });
        onGateBlocked?.();
      }
    }
  }, [connected, publicKey, verifyQuery.isLoading, verifyQuery.isError, verifyQuery.data, onGateBlocked]);

  const handleConnectWallet = useCallback(() => {
    setWalletModalVisible(true);
  }, [setWalletModalVisible]);

  const handleRetryVerification = useCallback(() => {
    verifyQuery.refetch();
  }, [verifyQuery]);

  // If wallet is connected and eligible, render children
  if (connected && gateState.status === 'eligible') {
    return <>{children}</>;
  }

  // Show appropriate gate UI based on state
  return (
    <div className="rounded-xl bg-[#1a1a1a] border-2 border-primary/30 p-8 text-center space-y-6">
      {/* Not connected state */}
      {!connected && !connecting && (
        <>
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">Connect Your Wallet</h3>
            <p className="text-gray-400 max-w-sm mx-auto">
              To use the transfer feature, connect your Phantom wallet and hold at least{' '}
              <span className="text-primary font-semibold">{NULL_REQUIRED_BALANCE.toLocaleString()} NULL</span> tokens.
            </p>
          </div>
          <Button
            onClick={handleConnectWallet}
            className="btn-hover-lift bg-primary hover:bg-[#0a5fff] text-white font-bold px-8 py-3 shadow-[0_0_30px_rgba(5,79,252,0.4)]"
          >
            Connect Wallet
          </Button>
        </>
      )}

      {/* Connecting state */}
      {connecting && (
        <div className="space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white">Connecting...</h3>
          <p className="text-gray-400">Please approve the connection in your wallet.</p>
        </div>
      )}

      {/* Checking holdings state */}
      {connected && gateState.status === 'checking' && (
        <div className="space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white">Verifying Holdings...</h3>
          <p className="text-gray-400">Checking your NULL token balance.</p>
        </div>
      )}

      {/* Ineligible state - not enough tokens */}
      {connected && gateState.status === 'ineligible' && (
        <>
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">Insufficient NULL Holdings</h3>
            <div className="space-y-2">
              <p className="text-gray-400">
                Your current balance: <span className="text-white font-mono">{(gateState.balance || 0).toLocaleString()} NULL</span>
              </p>
              <p className="text-gray-400">
                Required: <span className="text-primary font-mono">{NULL_REQUIRED_BALANCE.toLocaleString()} NULL</span>
              </p>
            </div>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              You need at least {NULL_REQUIRED_BALANCE.toLocaleString()} NULL tokens to use the transfer feature.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => {
                navigator.clipboard.writeText("B7tP6jNAcSmnvcuKsTFdvTAJHMkEQaXse8TMxoq2pump");
                // Could add toast notification here
              }}
              variant="outline"
              className="border-primary/50 text-primary hover:bg-primary/10"
            >
              Copy Token Address
            </Button>
            <Button
              onClick={handleRetryVerification}
              className="bg-primary hover:bg-[#0a5fff] text-white"
            >
              Check Again
            </Button>
          </div>
        </>
      )}

      {/* Error state */}
      {connected && gateState.status === 'error' && (
        <>
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-yellow-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">Verification Error</h3>
            <p className="text-gray-400 max-w-sm mx-auto">
              {gateState.errorMessage || 'Unable to verify your token holdings. Please try again.'}
            </p>
          </div>
          <Button
            onClick={handleRetryVerification}
            className="bg-primary hover:bg-[#0a5fff] text-white"
          >
            Try Again
          </Button>
        </>
      )}
    </div>
  );
};

/**
 * Hook to check token gate eligibility without rendering UI
 * Useful for conditionally disabling buttons
 */
export function useTokenGateStatus() {
  const { publicKey, connected } = useWallet();
  
  const verifyQuery = trpc.wallet.verifyTokenGate.useQuery(
    { publicKey: publicKey?.toBase58() || '' },
    {
      enabled: connected && !!publicKey,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  );

  return {
    isConnected: connected,
    isChecking: verifyQuery.isLoading,
    isEligible: verifyQuery.data?.isEligible ?? false,
    balance: verifyQuery.data?.balance ?? 0,
    required: NULL_REQUIRED_BALANCE,
    refetch: verifyQuery.refetch,
  };
}

export default TokenGate;

