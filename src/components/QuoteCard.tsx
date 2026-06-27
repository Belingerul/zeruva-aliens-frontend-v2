"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api";
import SolanaLogo from "./SolanaLogo";

type PriceResp = { ok: true; solUsd: number; source: string; ts: number };

export default function QuoteCard(_props: {
  // kept for backwards-compat with callers; no longer rendered
  nextUpgradeUsd?: number;
  nextClaimAt?: Date | null;
}) {
  const [price, setPrice] = useState<PriceResp | null>(null);
  const [spark, setSpark] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Live SOL/USD poll (backend, authoritative for in-app pricing).
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      try {
        const data = await apiRequest<PriceResp>("/price/sol-usd");
        if (!cancelled) setPrice(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load price");
      }
    }
    run();
    const id = setInterval(run, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // 24h sparkline from CoinGecko (decorative; fails silently if unavailable).
  useEffect(() => {
    let cancelled = false;
    fetch(
      "https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=1",
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("spark"))))
      .then((d) => {
        if (cancelled || !Array.isArray(d?.prices)) return;
        const pts: number[] = d.prices.map((p: number[]) => p[1]);
        const step = Math.max(1, Math.floor(pts.length / 40));
        setSpark(pts.filter((_, i) => i % step === 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const changePct = useMemo(() => {
    if (spark.length < 2) return null;
    const a = spark[0];
    const b = spark[spark.length - 1];
    return a ? ((b - a) / a) * 100 : null;
  }, [spark]);

  const sparkPath = useMemo(() => {
    if (spark.length < 2) return "";
    const w = 100;
    const h = 28;
    const min = Math.min(...spark);
    const max = Math.max(...spark);
    const range = max - min || 1;
    return spark
      .map((v, i) => {
        const x = (i / (spark.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [spark]);

  const up = (changePct ?? 0) >= 0;
  const lineColor = up ? "#34d399" : "#f43f5e";

  return (
    <div className="zv-card p-4 shrink-0">
      <div className="flex items-center justify-between">
        <div className="zv-label zv-label--cyan">Treasury</div>
        <div className="text-[10px] text-gray-500 whitespace-nowrap">
          {price?.ts ? new Date(price.ts).toLocaleTimeString() : ""}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <SolanaLogo size={36} className="shrink-0" />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="zv-value text-3xl leading-none">
              ${price ? Number(price.solUsd).toFixed(2) : "…"}
            </span>
            {changePct != null && (
              <span
                className={`text-xs font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}
              >
                {up ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-400 tracking-wide">
            SOL / USD · 24h
          </div>
        </div>
      </div>

      {sparkPath && (
        <svg
          viewBox="0 0 100 28"
          preserveAspectRatio="none"
          className="mt-3 w-full h-8"
        >
          <defs>
            <linearGradient id="zv-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${sparkPath} L100,28 L0,28 Z`} fill="url(#zv-spark)" />
          <path
            d={sparkPath}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}

      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
    </div>
  );
}
