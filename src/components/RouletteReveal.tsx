"use client";

import { useEffect, useMemo } from "react";
import { motion, useAnimation } from "framer-motion";

export default function RouletteReveal({
  alienIds,
  winnerIndex,
}: {
  alienIds: number[];
  winnerIndex: number;
}) {
  const controls = useAnimation();

  const CELL = typeof window !== "undefined" && window.innerWidth < 420 ? 84 : 96;
  const GAP = 8; // px, must match flex gap below
  const STRIDE = CELL + GAP;

  const strip = useMemo(() => {
    // runway of repeated aliens so it feels like a real v1 roulette
    return [...alienIds, ...alienIds, ...alienIds, ...alienIds];
  }, [alienIds]);

  const winnerAlien = alienIds?.[winnerIndex];

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // land in the 3rd repetition so we have runway
      const landingIndex = alienIds.length * 2 + winnerIndex;

      await controls.start({ x: 0, transition: { duration: 0 } });

      // IMPORTANT: keep the landing exact so the center line always matches the true winner.
      // (Random offsets can visually land on a neighbor, which looks like the wrong winner.)
      // The strip uses flex gap spacing; each item center is at landingIndex*STRIDE + CELL/2.
      // motion.div's left edge starts at the center line (left-1/2), so we shift negative by that center.
      const finalX = -(landingIndex * STRIDE + CELL / 2);

      // spin duration similar to v1
      const duration = 3.1;
      const ease: any = [0.22, 1, 0.36, 1];

      if (cancelled) return;
      await controls.start({ x: finalX, transition: { duration, ease } });
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [alienIds, winnerIndex, CELL, STRIDE, controls]);

  return (
    <div className="rounded-2xl border border-gray-800 bg-black/70 p-4">
      <div className="text-sm font-semibold text-gray-200">Roulette</div>
      <div className="text-xs text-gray-400">Final reveal</div>

      <div className="mt-3 relative h-28 overflow-hidden rounded-xl border border-gray-800 bg-black">
        {/* fades */}
        <div className="absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-yellow-300/80 z-20" />

        <motion.div
          animate={controls}
          initial={{ x: 0 }}
          className="absolute left-1/2 top-1/2 -translate-y-1/2 flex gap-2"
          style={{ willChange: "transform" }}
        >
          {strip.map((id, i) => (
            <div
              key={`${id}-${i}`}
              className="flex flex-col items-center justify-center border border-gray-800 bg-black/40 rounded-xl"
              style={{ width: `${CELL}px`, height: `${CELL}px` }}
            >
              <img
                src={`/api/static/${id}.png`}
                className="block w-[70%] h-[70%] rounded-xl object-cover shrink-0"
                alt=""
                aria-hidden="true"
              />
            </div>
          ))}
        </motion.div>
      </div>

      <div className="mt-3 text-xs text-gray-400">
        Winning alien: <span className="text-gray-200 font-semibold">{winnerAlien ?? "?"}</span>
      </div>
    </div>
  );
}
