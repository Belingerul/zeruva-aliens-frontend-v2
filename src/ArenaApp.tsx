"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import "@solana/wallet-adapter-react-ui/styles.css";
import { RPC_HTTP_URL } from "./utils/solanaConnection";
import ArenaGame from "./components/ArenaGame";

export default function ArenaApp() {
  const endpoint = RPC_HTTP_URL;
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ArenaGame />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
