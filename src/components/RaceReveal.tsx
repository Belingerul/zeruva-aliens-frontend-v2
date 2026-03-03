"use client";

import { useEffect, useMemo, useState } from "react";
import { apiStaticUrl } from "../api";

function hash01(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export default function RaceReveal({
  roundId,
  alienIds,
  winnerIndex,
}: {
  roundId: number;
  alienIds: number[];
  winnerIndex: number;
}) {
  const [go, setGo] = useState(false);

  useEffect(() => {
    setGo(false);
    const t = setTimeout(() => setGo(true), 30);
    return () => clearTimeout(t);
  }, [roundId, winnerIndex]);

  const lanes = useMemo(() => {
    return alienIds.map((id, i) => {
      const r = hash01(`${roundId}:${i}:${id}`);
      // everyone moves, winner reaches finish
      const base = 30 + r * 40; // 30-70
      const pct = i === winnerIndex ? 92 : Math.min(86, base);
      return { id, i, pct };
    });
  }, [alienIds, roundId, winnerIndex]);

  const winnerAlien = alienIds?.[winnerIndex];

  return (
    <div className="rounded-2xl border border-gray-800 bg-black/70 p-4">
      <div className="text-sm font-semibold text-gray-200">Alien Race</div>
      <div className="text-xs text-gray-400">Neck-and-neck… then the winner breaks away at the end.</div>

      <div className="mt-3 rounded-xl border border-gray-800 bg-black/40 p-3 max-h-[60vh] overflow-auto">
        <div className="space-y-2">
          {lanes.map((l) => (
            <div key={l.i} className="relative h-9 rounded-lg bg-white/5 overflow-hidden">
              <div className="absolute inset-y-0 right-2 flex items-center text-[10px] text-gray-500">FINISH</div>
              <div
                className="absolute top-1/2"
                style={{
                  left: go ? `${l.pct}%` : "0%",
                  transform: "translate(-50%, -50%)",
                  transition: "left 5200ms cubic-bezier(0.12, 0.9, 0.2, 1)",
                  willChange: "left",
                }}
              >
                <img
                  src={apiStaticUrl(`static/${l.id}.png`)}
                  className="w-7 h-7 rounded-lg object-cover"
                  alt=""
                  aria-hidden="true"
                />
              </div>
              <div className="absolute left-2 bottom-1 text-[9px] text-gray-400">Alien {l.id}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-400">
        Winning alien: <span className="text-gray-200 font-semibold">{winnerAlien ?? "?"}</span>
      </div>
    </div>
  );
}
