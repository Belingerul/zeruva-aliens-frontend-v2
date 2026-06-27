"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

interface TopBarProps {
  backHref?: string;
  title?: string;
}

export default function TopBar({ backHref, title }: TopBarProps) {
  return (
    <div className="w-full px-4 md:px-6 py-2 bg-black/40 border-b border-gray-800 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center gap-1 text-gray-400 hover:text-cyan-300 text-sm font-medium transition-colors shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/ui-back.png" alt="" className="w-4 h-4 object-contain" />
            Hub
          </Link>
        )}
        <WalletMultiButtonDynamic />
      </div>

      <div className="flex-1 text-center min-w-0">
        <div className="text-lg sm:text-2xl font-black bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent leading-none truncate">
          ZERUVA
        </div>
        {title && (
          <div className="text-[10px] sm:text-xs text-gray-500 font-medium tracking-widest uppercase truncate">
            {title}
          </div>
        )}
      </div>

      <div className="min-w-[80px] sm:min-w-[120px]" />
    </div>
  );
}
