import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: FC<WalletProviderProps> = ({ children }) => {
  // Get RPC endpoint from environment or use devnet
  const endpoint = useMemo(() => {
    const rpcEndpoint = import.meta.env.VITE_SOLANA_RPC_ENDPOINT;
    if (rpcEndpoint && rpcEndpoint.trim() !== '') {
      return rpcEndpoint.trim();
    }
    // Fallback to devnet
    return clusterApiUrl('devnet');
  }, []);

  // Initialize wallet adapters
  const wallets = useMemo(
    () => {
      const walletAdapters = [];
      
      try {
        walletAdapters.push(new PhantomWalletAdapter());
      } catch (error) {
        console.warn('PhantomWalletAdapter not available:', error);
      }
      
      try {
        walletAdapters.push(new SolflareWalletAdapter());
      } catch (error) {
        console.warn('SolflareWalletAdapter not available:', error);
      }
      
      try {
        walletAdapters.push(new TorusWalletAdapter());
      } catch (error) {
        console.warn('TorusWalletAdapter not available:', error);
      }
      
      try {
        walletAdapters.push(new LedgerWalletAdapter());
      } catch (error) {
        console.warn('LedgerWalletAdapter not available:', error);
      }
      
      return walletAdapters;
    },
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider 
        wallets={wallets} 
        autoConnect={true}
        onError={(error) => {
          console.error('Wallet adapter error:', error);
        }}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
