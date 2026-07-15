import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
import { App } from './App.tsx';
import './index.css';

/** RPC the browser uses to build + confirm the payment tx.
 *  Defaults to the agent's own `/rpc` proxy, which forwards to Alchemy server-side
 *  so the (shared) RPC key never ships in the bundle. Override with VITE_SOLANA_RPC
 *  only if you have a browser-safe/domain-locked endpoint. */
const AGENT = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';
const RPC = (import.meta.env.VITE_SOLANA_RPC as string | undefined) ?? `${AGENT}/rpc`;

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
