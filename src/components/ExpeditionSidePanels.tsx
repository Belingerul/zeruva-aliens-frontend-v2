"use client";

import SolanaLogo from "./SolanaLogo";

// Side panels that flank the Great Expedition game on wide screens so the
// empty left/right gutters become useful, on-brand context.

export function HowToPlayPanel() {
  const steps = [
    {
      n: "1",
      body: (
        <>
          Board a ship —{" "}
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
            <SolanaLogo size={13} /> 0.1 SOL
          </span>{" "}
          entry.
        </>
      ),
    },
    { n: "2", body: <>A fresh round runs every <b className="text-white">10 minutes</b> with 15 ships.</> },
    { n: "3", body: <>If your ship is the chosen one, you take the pot.</> },
    { n: "4", body: <>More entries on a ship = <b className="text-white">higher odds</b>.</> },
  ];
  return (
    <div className="zv-card p-4">
      <div className="zv-label">How to Play</div>
      <ol className="mt-3 space-y-3">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-2.5 text-sm text-gray-300 leading-snug">
            <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold flex items-center justify-center">
              {s.n}
            </span>
            <span className="min-w-0">{s.body}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PrizeSplitPanel() {
  const split = [
    { label: "Winners pool", pct: 70, accent: "var(--zv-cyan)" },
    { label: "All participants", pct: 25, accent: "var(--zv-violet-2)" },
    { label: "Treasury", pct: 5, accent: "var(--zv-emerald)" },
  ];
  const modes = [
    { name: "Roulette", desc: "Spin to a single winning ship" },
    { name: "Race", desc: "Ships sprint — first across wins" },
    { name: "Gauntlet", desc: "Elimination until one remains" },
  ];
  return (
    <div className="space-y-4">
      <div className="zv-card p-4">
        <div className="zv-label zv-label--violet">Prize Split</div>
        <div className="mt-3 space-y-3">
          {split.map((s) => (
            <div key={s.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-300">{s.label}</span>
                <span className="font-bold text-white">{s.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${s.pct}%`, background: s.accent }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="zv-card p-4">
        <div className="zv-label zv-label--cyan">Game Modes</div>
        <div className="mt-3 space-y-2.5">
          {modes.map((m) => (
            <div key={m.name} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
              <div className="text-sm font-bold text-white">{m.name}</div>
              <div className="text-xs text-gray-400 leading-snug">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
