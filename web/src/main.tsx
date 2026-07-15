import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
import { App } from './App.tsx';
import './index.css';

/** RPC the browser uses to build + confirm the payment tx. Public mainnet by
 *  default; override with VITE_SOLANA_RPC (e.g. an Alchemy endpoint). */
const RPC = (import.meta.env.VITE_SOLANA_RPC as string | undefined) ?? 'https://api.mainnet-beta.solana.com';

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
