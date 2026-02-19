"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import "@solana/wallet-adapter-react-ui/styles.css";
import TopBar from "./components/TopBar";
import GreatExpeditionPanel from "./components/GreatExpeditionPanel";
import {
  clearAuthToken,
  getAuthToken,
  getAuthWallet,
  getNonce,
  setAuthToken,
  verifySignature,
} from "./api";

// Minimal base58 encoder (avoids adding new deps)
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes: Uint8Array): string {

  if (!bytes.length) return "";

  const digits: number[] = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j] * 256 + carry;
      digits[j] = x % 58;
      carry = (x / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  // leading zeros
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  let out = "";
  for (let i = 0; i < zeros; i++) out += "1";
  for (let i = digits.length - 1; i >= 0; i--)
    out += BASE58_ALPHABET[digits[i]];
  return out;
}

// Global login mutex (module-level). Needed because in dev/hot-reload the component can remount,
// and a useRef mutex resets, causing multiple Phantom signature prompts.
let appLoginInFlight: Promise<void> | null = null;

function AppContent() {
  const [authReady, setAuthReady] = useState(false);
  const wallet = useWallet();

  useEffect(() => {
    let cancelled = false;

    async function loginAndRegister() {
      if (!wallet.connected || !wallet.publicKey) {
        if (!cancelled) setAuthReady(false);
        return;
      }

      if (!cancelled) setAuthReady(false);

      const walletAddress = wallet.publicKey.toString();

      // If token exists but belongs to a different wallet, clear it.
      const existingToken = getAuthToken();
      const existingWallet = getAuthWallet();
      if (existingToken && existingWallet && existingWallet !== walletAddress) {
        clearAuthToken();
      }

      // Ensure wallet supports signing
      if (!wallet.signMessage) {
        console.error("Wallet does not support signMessage");
        return;
      }

      // If we already have a token for this wallet, just register.
      if (getAuthToken() && getAuthWallet() === walletAddress) {
        await registerUser();
        if (!cancelled) setAuthReady(true);
        return;
      }

      // Login flow can occasionally fail if the nonce expires or gets consumed.
      // Retry once to avoid the “two bearer tokens” UX.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // 1) Get nonce
          const { nonce, message } = await getNonce(walletAddress);

          // 2) Sign message
          const encoded = new TextEncoder().encode(message);
          const signed = await wallet.signMessage(encoded);

          // 3) Send signature to backend (base58)
          const signature = base58Encode(signed);

          const { token } = await verifySignature(walletAddress, nonce, signature);
          setAuthToken(token, walletAddress);

          await registerUser();
          if (!cancelled) setAuthReady(true);
          return;
        } catch (e: any) {
          const msg = e?.message || String(e);
          const isNonce = /Invalid\/expired nonce/i.test(msg);
          if (attempt === 0 && isNonce) {
            // retry once
            continue;
          }
          throw e;
        }
      }
    }

    if (appLoginInFlight) {
      // Prevent multiple concurrent login attempts (causes multiple Phantom signature popups)
      return;
    }

    appLoginInFlight = loginAndRegister()
      .catch((err) => {
        console.error("Auth/register failed:", err);
        if (!cancelled) setAuthReady(false);
      })
      .finally(() => {
        appLoginInFlight = null;
      });

    return () => {
      cancelled = true;
    };
  }, [wallet.connected, wallet.publicKey, wallet.signMessage]);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-dvh lg:h-dvh flex flex-col bg-gradient-to-br from-gray-950 via-gray-900 to-black">
      <TopBar />

      <div className="flex-1 min-h-0 px-4 sm:px-6 lg:px-8 pb-6 pt-4">
        {/* v2: Great Expedition only (no aliens/spaceship assignment system) */}
        <GreatExpeditionPanel />

        <div className="mt-4 rounded-xl border border-gray-800 bg-black/30 p-4 text-sm text-gray-300">
          <div className="font-semibold text-gray-100">Crew Hangar (coming next)</div>
          <div className="text-gray-400 text-xs mt-1">
            We’ll repurpose the old Aliens tab into Crew progression: badges, streaks, cosmetics, and free entries — without changing luck.
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const endpoint = process.env.VITE_RPC_URL || "https://api.devnet.solana.com";
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets}>
        <WalletModalProvider>
          <AppContent />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
