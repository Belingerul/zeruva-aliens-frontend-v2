"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

interface TopBarProps {
  backHref?: string;
  title?: string;
  icon?: string;
}

// Compact "connected" status that lives top-right, in line with the title.
function ConnectedPill() {
  const { connected, publicKey } = useWallet();
  if (!connected || !publicKey) return null;
  const addr = publicKey.toBase58();
  const short = `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  return (
    <button
      type="button"
      title="Copy wallet address"
      onClick={() => {
        try {
          navigator.clipboard?.writeText(addr);
        } catch {
          /* ignore */
        }
      }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/15 transition-colors max-w-full"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
      <span className="font-mono truncate">{short}</span>
    </button>
  );
}

export default function TopBar({ backHref, title, icon }: TopBarProps) {
  return (
    <div className="w-full px-3 md:px-6 py-2 bg-black/40 border-b border-gray-800 flex items-center justify-between gap-2 sm:gap-3">
      {/* LEFT: nav + connect button + realm logo (logo sits by the connect button) */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0">
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center gap-1 text-gray-400 hover:text-cyan-300 text-sm font-medium transition-colors shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/ui-back.png" alt="" className="w-4 h-4 object-contain" />
            <span className="hidden sm:inline">Hub</span>
          </Link>
        )}

        <WalletMultiButtonDynamic />

        {icon && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={icon}
            alt=""
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0 drop-shadow-[0_0_12px_rgba(34,211,238,0.85)]"
          />
        )}
      </div>

      {/* CENTER: brand + title, centered (separated from the connect button) */}
      <div className="flex flex-1 items-center justify-center gap-1.5 min-w-0 leading-none">
        <span className="text-base sm:text-xl font-black bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent truncate">
          ZERUVA
        </span>
        {title && (
          <>
            <span className="hidden sm:inline text-gray-600">·</span>
            <span
              className="hidden sm:inline text-sm font-extrabold tracking-[0.18em] uppercase text-cyan-100 truncate"
              style={{ textShadow: "0 0 14px rgba(34,211,238,0.55)" }}
            >
              {title}
            </span>
          </>
        )}
      </div>

      {/* RIGHT: connected status, top-right, in line with the title */}
      <div className="flex items-center justify-end shrink-0 min-w-0 max-w-[40%]">
        <ConnectedPill />
      </div>
    </div>
  );
}
