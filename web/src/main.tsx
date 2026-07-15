import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
import { App } from './App.tsx';
import './index.css';

/** RPC the browser uses to build + confirm the payment tx.
 *  The public `api.mainnet-beta.solana.com` blocks browser calls with 403, so we
 *  default to a keyless CORS-friendly endpoint. For production reliability set
 *  VITE_SOLANA_RPC to your own (Helius/Alchemy/QuickNode) in Cloudflare env. */
const RPC = (import.meta.env.VITE_SOLANA_RPC as string | undefined) ?? 'https://solana-rpc.publicnode.com';

function Root() {
  // Empty wallet list → the Solana Wallet Standard auto-detects installed wallets
  // (Phantom, Jupiter, Solflare, Backpack, …). No per-wallet packages needed.
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
