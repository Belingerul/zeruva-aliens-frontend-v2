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
          <span className="inline-flex items-center gap-1 font-bold text-emerald-300">
            <SolanaLogo size={15} /> 0.1 SOL
          </span>{" "}
          entry.
        </>
      ),
    },
    { n: "2", body: <>A fresh round runs every <b className="text-white">10 minutes</b> with 15 ships.</> },
    { n: "3", body: <>If your ship is the chosen one, you <b className="text-white">take the pot</b>.</> },
    { n: "4", body: <>More entries on a ship = <b className="text-white">higher odds</b>.</> },
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/[0.10] via-emerald-500/[0.02] to-transparent p-5">
      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />
      <h3 className="relative text-xl font-black tracking-tight bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
        How to Play
      </h3>
      <ol className="relative mt-4 space-y-4">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3 items-start">
            <span className="shrink-0 grid place-items-center w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-sm font-black shadow-[0_0_16px_-4px_rgba(52,211,153,0.7)]">
              {s.n}
            </span>
            <span className="min-w-0 text-[15px] text-gray-200 leading-snug pt-1">{s.body}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PrizeSplitPanel() {
  const split = [
    { label: "Winners pool",     pct: 70, bar: "from-cyan-400 to-sky-300",       text: "text-cyan-300" },
    { label: "All participants", pct: 25, bar: "from-violet-400 to-fuchsia-300", text: "text-violet-300" },
    { label: "Treasury",         pct: 5,  bar: "from-emerald-400 to-teal-300",   text: "text-emerald-300" },
  ];
  const modes = [
    { name: "Roulette", desc: "Spin to a single winning ship" },
    { name: "Race", desc: "Ships sprint — first across wins" },
    { name: "Gauntlet", desc: "Elimination until one remains" },
  ];
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-b from-violet-500/[0.10] via-violet-500/[0.02] to-transparent p-5">
        <div className="pointer-events-none absolute -top-12 -left-12 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />
        <h3 className="relative text-xl font-black tracking-tight bg-gradient-to-r from-violet-300 to-fuchsia-200 bg-clip-text text-transparent">
          Prize Split
        </h3>
        <div className="relative mt-4 space-y-4">
          {split.map((s) => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-gray-300">{s.label}</span>
                <span className={`text-lg font-black tabular-nums ${s.text}`}>{s.pct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${s.bar}`} style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-b from-cyan-500/[0.08] via-cyan-500/[0.02] to-transparent p-5">
        <h3 className="relative text-xl font-black tracking-tight bg-gradient-to-r from-cyan-300 to-sky-200 bg-clip-text text-transparent">
          Game Modes
        </h3>
        <div className="relative mt-3 space-y-2.5">
          {modes.map((m) => (
            <div
              key={m.name}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 transition-colors hover:border-cyan-400/30 hover:bg-cyan-500/[0.04]"
            >
              <div className="text-[15px] font-bold text-white">{m.name}</div>
              <div className="text-[13px] text-gray-400 leading-snug mt-0.5">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
