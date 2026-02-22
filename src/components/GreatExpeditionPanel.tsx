"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
//
import { ensureAuth } from "../utils/ensureAuth";
import ConfirmModal from "./ConfirmModal";
import RouletteReveal from "./RouletteReveal";
import RaceReveal from "./RaceReveal";
import WinnerModal from "./WinnerModal";
import { geEnter, geBuyEntry, geConfirmEntry, geGetCurrentRound, geGetMe, geGetSettledSummary, geGetSettledPayouts, setDevWallet, getDevWallet, getAuthToken } from "../api";

const SHIPS = 15;

export default function GreatExpeditionPanel() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [crew, setCrew] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCrew(localStorage.getItem("zeruva_crew"));
  }, []);
  const [round, setRound] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [my, setMy] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [boarding, setBoarding] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [guestWallet, setGuestWallet] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    // read guest wallet after mount to avoid SSR hydration mismatch
    setGuestWallet(getDevWallet());
  }, []);

  const [selectedShip, setSelectedShip] = useState<number>(0);

  // UI uses SOL amount; backend uses qty entries.
  const [solAmount, setSolAmount] = useState<number>(0.2);

  const GAME_MODE = (round as any)?.game_mode || "roulette";
  const GAME_LABEL = GAME_MODE === "race" ? "Alien Race" : GAME_MODE === "elimination" ? "Alien Gauntlet" : "Alien Roulette";

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("Great Expedition");
  const [modalMsg, setModalMsg] = useState<string>("");

  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [rouletteWinner, setRouletteWinner] = useState<number | null>(null);
  const [raceOpen, setRaceOpen] = useState(false);
  const [raceWinner, setRaceWinner] = useState<number | null>(null);

  // Freeze reveal inputs so polling/refresh can't swap the round mid-animation.
  const [revealRoundId, setRevealRoundId] = useState<number | null>(null);
  const [revealAlienIds, setRevealAlienIds] = useState<number[] | null>(null);

  const [winnerOpen, setWinnerOpen] = useState(false);
  const [winnerSummary, setWinnerSummary] = useState<any>(null);
  const [winnerPayouts, setWinnerPayouts] = useState<any[]>([]);

  async function refresh() {
    setRefreshing(true);
    try {
      const r: any = await geGetCurrentRound();
      setRound(r?.round || null);
      setStats(r?.stats || null);
      setConfig(r?.config || null);

      // Avoid 401 "Missing Bearer token" spam:
      // - If wallet is connected but user hasn't completed auth yet (no JWT), don't call /me.
      // - /me will be available after ensureAuth() (triggered on first action like Board).
      const hasJwt = typeof window !== "undefined" ? !!getAuthToken() : false;

      if (guestWallet || (wallet.publicKey && hasJwt)) {
        const me: any = await geGetMe();
        setMy(me?.my || []);
      } else {
        setMy([]);
      }
    } catch (e: any) {
      setModalTitle("Great Expedition");
      setModalMsg(String(e?.message || e));
      setModalOpen(true);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.publicKey?.toString(), guestWallet]);

  // Poll lightly so it feels live.
  // IMPORTANT: pause polling during reveal animations so the round can't change mid-reveal.
  // Cost-efficiency: adaptive polling intervals.
  useEffect(() => {
    let t: any = null;
    let stopped = false;

    const getIntervalMs = () => {
      // When modal/reveals are open, don't poll.
      if (rouletteOpen || raceOpen || winnerOpen) return 60_000;

      const status = String(round?.status || "");
      if (status === "running") {
        // Speed up only near the end.
        const endsAt = round?.ends_at ? new Date(round.ends_at).getTime() : null;
        if (endsAt) {
          const remainingMs = endsAt - Date.now();
          if (remainingMs <= 10_000) return 2_000;
        }
        return 10_000;
      }

      // filling / settled / unknown
      return 45_000;
    };

    const loop = async () => {
      if (stopped) return;
      try {
        if (!(rouletteOpen || raceOpen || winnerOpen)) {
          await refresh();
        }
      } finally {
        const ms = getIntervalMs();
        t = window.setTimeout(loop, ms);
      }
    };

    // kick off
    t = window.setTimeout(loop, 3_000);

    return () => {
      stopped = true;
      if (t) window.clearTimeout(t);
    };
  }, [wallet.publicKey?.toString(), guestWallet, rouletteOpen, raceOpen, winnerOpen, round?.status, round?.ends_at]);

  const perShip = stats?.perShip || Array.from({ length: SHIPS }).map((_, i) => ({ ship_index: i, qty: 0 }));
  const filledCount = perShip.filter((s: any) => Number(s.qty) >= 1).length;

  const [visibleShips, setVisibleShips] = useState<number[]>(() => Array.from({ length: SHIPS }).map((_, i) => i));
  const [winnerShip, setWinnerShip] = useState<number | null>(null);

  const statusLabel = useMemo(() => {
    if (!round) return "No round";
    if (round.status === "filling") return `FILLING (${filledCount}/${SHIPS})`;
    if (round.status === "running") return "RUNNING";
    if (round.status === "settled") return "SETTLED";
    return String(round.status || "?");
  }, [round, filledCount]);

  const endsAtMs = round?.ends_at ? new Date(round.ends_at).getTime() : null;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!mounted || !endsAtMs) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [mounted, endsAtMs]);

  const countdown = useMemo(() => {
    if (!mounted || !endsAtMs) return null;
    const s = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  }, [endsAtMs, tick]);

  const myTotal = my.reduce((a, r: any) => a + Number(r.qty || 0), 0);

  // Reset ship visibility whenever a new round starts / changes.
  const [removingShips, setRemovingShips] = useState<Record<number, true>>({});

  useEffect(() => {
    if (!round?.id) return;
    setVisibleShips(Array.from({ length: SHIPS }).map((_, i) => i));
    setRemovingShips({});
    setWinnerShip(null);
    setRevealAlienIds(null);
    setRevealRoundId(null);
  }, [round?.id]);

  // When a round settles, animate elimination of non-winning ships.
  // IMPORTANT: cancel animations when a new round starts to avoid "carry-over" fades.
  const settleTimeoutRef = useRef<number | null>(null);
  const settleIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (settleTimeoutRef.current) window.clearTimeout(settleTimeoutRef.current);
    if (settleIntervalRef.current) window.clearInterval(settleIntervalRef.current);
    settleTimeoutRef.current = null;
    settleIntervalRef.current = null;
  }, [round?.id]);

  useEffect(() => {
    if (!mounted) return;
    if (round?.status !== "settled") return;
    if (typeof round?.winning_ship_index !== "number") return;

    const win = Number(round.winning_ship_index);

    // Freeze reveal inputs so UI always matches the settled round.
    try {
      const ids = (round as any)?.alien_ids;
      if (Array.isArray(ids)) {
        setRevealAlienIds(ids.slice());
        setRevealRoundId(Number(round?.id || 0));
      }
    } catch {
      // ignore
    }

    // suspense: don't reveal highlight immediately
    setWinnerShip(null);

    // Build elimination order: all non-winning ships (optionally prioritize empty ones first)
    const order = Array.from({ length: SHIPS }).map((_, i) => i).filter((i) => i !== win);
    order.sort((a, b) => Number(perShip?.[a]?.qty || 0) - Number(perShip?.[b]?.qty || 0));

    let idx = 0;
    const revealDelayMs = 900; // suspense before roulette starts

    settleTimeoutRef.current = window.setTimeout(() => {
      // roulette reveal (fast)
      const mode = (round as any)?.game_mode || "roulette";

      async function showWinnerAndAdvance() {
        let s: any = null;
        try {
          s = await geGetSettledSummary(revealRoundId || round?.id);
        } catch {
          // fallback summary from current state
          const potSol = Number(stats?.totalEntries || 0) * Number(config?.entry_price_sol || 0.1);
          s = {
            round: {
              id: round?.id,
              game_mode: (round as any)?.game_mode || "?",
              winning_index: win,
              winner_alien: Array.isArray((round as any)?.alien_ids) ? (round as any).alien_ids[win] : null,
            },
            pot_sol: potSol,
            distributed_total: potSol,
            winner_pot: (potSol * 0.7),
            participation_pot: (potSol * 0.25),
            treasury_cut: (potSol * 0.05),
            participants: 0,
          };
        }

        try {
          const p: any = await geGetSettledPayouts(20, revealRoundId || round?.id);
          setWinnerPayouts(p?.payouts || []);
        } catch {
          setWinnerPayouts([]);
        }

        setWinnerSummary(s);
        setWinnerOpen(true);
        // manual close: user closes, then we refresh
      }

      if (mode === "roulette") {
        setRouletteWinner(win);
        setRouletteOpen(true);
        window.setTimeout(() => {
          setRouletteOpen(false);
          showWinnerAndAdvance();
        }, 2900);
      } else if (mode === "race") {
        setRaceWinner(win);
        setRaceOpen(true);
        window.setTimeout(() => {
          setRaceOpen(false);
          showWinnerAndAdvance();
        }, 2900);
      } else {
        // elimination (gauntlet)
        const fastMs = 170;
        const slowMs = 520;

        const tick = () => {
          const shipToRemove = order[idx++];
          if (shipToRemove === undefined) {
            setWinnerShip(win);
            showWinnerAndAdvance();
            return;
          }

          setRemovingShips((m) => ({ ...m, [shipToRemove]: true }));

          // Smooth curve: fast at start, gradually slows toward the end.
          const progress = idx / Math.max(1, order.length); // 0..1
          const ease = progress * progress; // smooth
          const ms = fastMs + (slowMs - fastMs) * ease;
          settleIntervalRef.current = window.setTimeout(tick, ms) as unknown as number;
        };

        tick();
      }
    }, revealDelayMs);

    return () => {
      if (settleTimeoutRef.current) window.clearTimeout(settleTimeoutRef.current);
      if (settleIntervalRef.current) window.clearTimeout(settleIntervalRef.current);
      settleTimeoutRef.current = null;
      settleIntervalRef.current = null;
      setRouletteOpen(false);
      setRaceOpen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, round?.status, round?.winning_ship_index]);

  async function board() {
    if (!wallet.publicKey && !guestWallet) {
      setModalTitle("Connect or Guest");
      setModalMsg("Connect wallet (real SOL) or enable Guest mode (testing) to board a ship.");
      setModalOpen(true);
      return;
    }

    const entryPrice = Number(config?.entry_price_sol || 0.1);
    const qty = Math.max(1, Math.round(Number(solAmount || 0) / entryPrice));

    setBoarding(true);
    try {
      if (wallet.publicKey) {
        // Real flow (Bearer + real SOL transfer)
        await ensureAuth(wallet as any);

        if (!wallet.sendTransaction) {
          throw new Error("Wallet does not support sendTransaction");
        }

        const buy: any = await geBuyEntry(selectedShip, qty);
        const txB64 = buy?.serialized;
        const intentId = buy?.intentId;
        if (!txB64 || !intentId) throw new Error("Failed to build payment transaction");

        const { Transaction } = await import("@solana/web3.js");
        const tx = Transaction.from(Buffer.from(txB64, "base64"));

        const sig = await wallet.sendTransaction(tx, connection, {
          skipPreflight: false,
          preflightCommitment: "processed",
        } as any);

        // Wait a bit for confirmation (devnet)
        await connection.confirmTransaction(sig, "processed");

        await geConfirmEntry(intentId, sig);
      } else {
        // Guest flow (testing)
        await geEnter(selectedShip, qty);
      }

      await refresh();
    } catch (e: any) {
      setModalTitle("Board failed");
      setModalMsg(String(e?.message || e));
      setModalOpen(true);
    } finally {
      setBoarding(false);
    }
  }

  const shipCellClass = (i: number) => {
    const q = Number(perShip?.[i]?.qty || 0);
    const filled = q >= 1;
    const selected = i === selectedShip;
    return [
      "rounded-xl border p-2 text-center cursor-pointer select-none",
      "bg-gradient-to-b from-[#0b0f1a] to-black",
      filled ? "border-cyan-500/40 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]" : "border-gray-800 opacity-90",
      selected ? "ring-2 ring-cyan-400" : "",
      winnerShip === i ? "shadow-[0_0_24px_rgba(250,204,21,0.18)]" : "",
    ].join(" ");
  };

  return (
    <>
      <ConfirmModal
        open={modalOpen}
        title={modalTitle}
        subtitle={modalMsg}
        primaryText="OK"
        onPrimary={() => setModalOpen(false)}
        onSecondary={() => setModalOpen(false)}
        secondaryText={null}
      />

      <WinnerModal
        open={winnerOpen}
        onClose={() => {
          setWinnerOpen(false);
          refresh();
        }}
        summary={winnerSummary}
        payouts={winnerPayouts}
      />

      {rouletteOpen && Array.isArray(revealAlienIds) && rouletteWinner !== null ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-xl">
            <RouletteReveal alienIds={revealAlienIds} winnerIndex={rouletteWinner} />
          </div>
        </div>
      ) : null}

      {raceOpen && Array.isArray(revealAlienIds) && raceWinner !== null ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-xl">
            <RaceReveal roundId={Number(revealRoundId || 0)} alienIds={revealAlienIds} winnerIndex={raceWinner} />
          </div>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-xl border border-purple-500/30 bg-black/50 p-4">
        {/* subtle flying spaceship background */}
        <img
          src="/images/spaceship-new.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute left-1/2 top-[58%] w-[620px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.12]"
          style={{
            filter: "blur(0.2px)",
            animation: "zeruva-fly 12s ease-in-out infinite",
          }}
        />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-extrabold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              The Great Expedition
            </div>
            <div className="text-xs text-gray-400">Mode: <span className="text-gray-200 font-semibold">{GAME_LABEL}</span> • 70% winner / 25% all / 5% treasury</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Status</div>
            <div className="text-sm font-semibold text-gray-200">{statusLabel}</div>
            {mounted && round?.status === "running" && countdown ? (
              <div className="text-xs text-cyan-300">Ends in {countdown}</div>
            ) : null}
          </div>
        </div>

        {/* ore.supply-style header cards */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-yellow-500/40 bg-black/40 p-3 overflow-hidden">
            <div className="text-xl sm:text-2xl font-bold text-gray-100 tabular-nums truncate">
              {(Number(stats?.totalEntries || 0) * Number(config?.entry_price_sol || 0.1)).toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">Expedition Pool (SOL)</div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-black/30 p-3 overflow-hidden">
            <div className="text-xl sm:text-2xl font-bold text-gray-100 tabular-nums truncate">
              {mounted && countdown ? countdown : "--:--:--"}
            </div>
            <div className="text-xs text-gray-400">Time remaining</div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-gray-800 bg-black/20 p-3 overflow-hidden">
            <div className="text-base sm:text-lg font-semibold text-gray-100 tabular-nums truncate">
              {(Number(stats?.totalEntries || 0) * Number(config?.entry_price_sol || 0.1)).toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">Total deployed</div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-black/20 p-3 overflow-hidden">
            <div className="text-base sm:text-lg font-semibold text-gray-100 tabular-nums truncate">
              {(Number(myTotal || 0) * Number(config?.entry_price_sol || 0.1)).toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">You deployed</div>
          </div>
        </div>

        {!wallet.publicKey && !guestWallet ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-400">Connect wallet to board a ship — or use Guest mode for testing.</div>
            <button
              onClick={() => {
                const id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
                  ? `guest-${crypto.randomUUID()}`
                  : `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                setDevWallet(id);
                setGuestWallet(id);
              }}
              className="px-3 py-2 rounded-lg border border-gray-700 text-gray-200 hover:bg-black/30"
            >
              Play as Guest
            </button>
          </div>
        ) : (
          <>
            {wallet.publicKey && !guestWallet && !getAuthToken() ? (
              <div className="mt-3 text-xs text-yellow-300/90 border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-2">
                Wallet connected but not authenticated yet. Tap <span className="font-semibold">Board</span> once to sign/login (Bearer token), or use Guest mode.
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-5 gap-2">
              {Array.from({ length: SHIPS }).map((_, idx) => (
                <div
                  key={idx}
                  className={[shipCellClass(idx), winnerShip === idx ? "ring-2 ring-yellow-400" : ""].join(" ")}
                  onClick={() => setSelectedShip(idx)}
                  style={{
                    transition: "opacity 300ms ease, transform 300ms ease",
                    opacity: removingShips[idx] ? 0 : 1,
                    transform: removingShips[idx] ? "scale(0.96)" : "scale(1)",
                  }}
                >
                  <div className="text-[10px] text-gray-400 font-semibold tracking-wide">
                    {(() => {
                      const ids = (round as any)?.alien_ids as number[] | null;
                      const id = Array.isArray(ids) ? ids[idx] : null;
                      return id ? `ALIEN ${id}` : `SHIP ${idx + 1}`;
                    })()}
                  </div>

                  {(() => {
                    const ids = (round as any)?.alien_ids as number[] | null;
                    const id = Array.isArray(ids) ? ids[idx] : null;
                    if (!id) return null;
                    return (
                      <div className="mt-2 flex items-center justify-center">
                        <img
                          src={`/api/static/${id}.png`}
                          alt=""
                          aria-hidden="true"
                          className="w-[44px] h-[44px] sm:w-[56px] sm:h-[56px] rounded-xl opacity-95"
                        />
                      </div>
                    );
                  })()}

                  <div className="mt-2 text-base sm:text-lg font-bold text-white tabular-nums truncate">
                    {(() => {
                      const base = Number(perShip?.[idx]?.qty || 0) * Number(config?.entry_price_sol || 0.1);
                      // Visual-only "natural" cents: deterministic jitter while keeping 2 decimals.
                      // Does NOT affect pot / payouts.
                      const seedStr = `${round?.id || 0}:${idx}:${Number(perShip?.[idx]?.qty || 0)}`;
                      let h = 2166136261;
                      for (let i = 0; i < seedStr.length; i++) {
                        h ^= seedStr.charCodeAt(i);
                        h = Math.imul(h, 16777619);
                      }
                      const jitter = (((h >>> 0) % 1000) / 1000 - 0.5) * 0.08; // [-0.04..+0.04]
                      const entryPrice = Number(config?.entry_price_sol || 0.1);
                      const minShown = base > 0 ? Math.max(entryPrice, base + jitter) : 0;
                      return minShown.toFixed(2);
                    })()}
                  </div>

                  <div className="text-[10px] text-gray-500">SOL deployed</div>

                  <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500/70 to-cyan-400/70"
                      style={{
                        width: `${Math.min(100, (Number(perShip?.[idx]?.qty || 0) / Math.max(1, Number(stats?.totalEntries || 1))) * 2600)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="text-sm text-gray-300">Selected: <span className="text-cyan-300 font-semibold">Ship {selectedShip + 1}</span></div>
              <div className="text-xs text-gray-400 ml-2">
                Pot: <span className="text-gray-200 font-semibold">{(Number(stats?.totalEntries || 0) * Number(config?.entry_price_sol || 0.1)).toFixed(2)}</span> SOL
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1">
                  {[0.1, 0.2, 0.5, 1].map((v) => (
                    <button
                      key={v}
                      onClick={() => setSolAmount(v)}
                      className={[
                        "px-2 py-1 rounded-md border text-xs",
                        Math.abs(solAmount - v) < 1e-9 ? "border-cyan-400 text-cyan-200" : "border-gray-700 text-gray-300",
                      ].join(" ")}
                    >
                      {v} SOL
                    </button>
                  ))}
                </div>

                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={solAmount}
                  onChange={(e) => setSolAmount(Math.max(0.1, Number(e.target.value || 0.1)))}
                  className="w-24 bg-black/40 border border-gray-700 rounded-md px-2 py-1 text-gray-100"
                />

                <button
                  onClick={board}
                  disabled={boarding}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-semibold disabled:opacity-60"
                >
                  {boarding ? "…" : "Board"}
                </button>
              </div>
            </div>

            <div className="mt-2 text-xs text-gray-400">
              You deployed: <span className="text-gray-200 font-semibold">{(myTotal * Number(config?.entry_price_sol || 0.1)).toFixed(2)}</span> SOL
            </div>

            {/* Crew (engagement layer / future utility) */}
            <div className="mt-4 rounded-xl border border-gray-800 bg-black/30 p-3">
              <div className="text-sm font-semibold text-gray-200">Crew</div>
              <div className="text-xs text-gray-400">Pick a crew loadout. (UI now; effects can be enforced later on-chain.)</div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {[{
                  name: "Navigator",
                  perk: "+1 free crossing per round",
                }, {
                  name: "Engineer",
                  perk: "-10% crossing fee",
                }, {
                  name: "Gunner",
                  perk: "+5% winner bucket boost (cosmetic for now)",
                }].map((c) => (
                  <button
                    key={c.name}
                    onClick={() => {
                      setCrew(c.name);
                      if (typeof window !== "undefined") localStorage.setItem("zeruva_crew", c.name);
                    }}
                    className={[
                      "rounded-xl border p-2 text-left",
                      crew === c.name ? "border-cyan-500/60 bg-cyan-500/10" : "border-gray-800 bg-black/20 hover:bg-white/5",
                    ].join(" ")}
                  >
                    <div className="text-xs font-semibold text-gray-200">{c.name}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{c.perk}</div>
                    {crew === c.name ? <div className="text-[10px] text-cyan-300 mt-1">Selected</div> : null}
                  </button>
                ))}
              </div>
            </div>


          </>
        )}
      </div>
    </>
  );
}
