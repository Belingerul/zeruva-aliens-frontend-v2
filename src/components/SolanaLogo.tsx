"use client";

// Solana mark — drop next to any SOL amount or pay action.
// Asset lives at /brand/solana.png (the official gradient three-bar logo).
export default function SolanaLogo({
  size = 16,
  className = "",
  title = "SOL",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/solana.png"
      alt={title}
      width={size}
      height={size}
      className={`inline-block shrink-0 object-contain align-[-0.15em] ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
    />
  );
}
