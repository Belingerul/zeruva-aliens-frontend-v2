"use client";

import { useMemo, useEffect } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import "@solana/wallet-adapter-react-ui/styles.css";
import MarketplacePanel from "./components/MarketplacePanel";
import {
  getAuthToken,
  getAuthWallet,
  clearAuthToken,
  AUTH_CHANGED_EVENT,
} from "./api";

// Keeps the stored JWT in sync when the wallet changes.
function WalletAuthSync() {
  const wallet = useWallet();
  const walletAddr = wallet.publicKey?.toBase58() ?? null;

  useEffect(() => {
    const storedWallet = getAuthWallet();
    const token = getAuthToken();
    if (token && storedWallet && walletAddr && storedWallet !== walletAddr) {
      clearAuthToken();
    }
    if (!wallet.connected) {
      clearAuthToken();
    }
  }, [walletAddr, wallet.connected]);

  // Re-clear on AUTH_CHANGED_EVENT (e.g. 401 from another tab component)
  useEffect(() => {
    const handler = () => {
      const storedWallet = getAuthWallet();
      const token = getAuthToken();
      if (token && storedWallet && walletAddr && storedWallet !== walletAddr) {
        clearAuthToken();
      }
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, handler);
  }, [walletAddr]);

  return null;
}

export default function MarketplaceApp() {
  const endpoint =
    process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletAuthSync />
          <MarketplacePanel />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
