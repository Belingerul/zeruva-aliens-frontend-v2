"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ensureAuth } from "../utils/ensureAuth";
import ConfirmModal from "./ConfirmModal";
import { geEnter, geGetCurrentRound, geGetMe } from "../api";

const SHIPS = 25;

export default function GreatExpeditionPanel() {
  const wallet = useWallet();
  const [round, setRound] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [my, setMy] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedShip, setSelectedShip] = useState<number>(0);
  const [qty, setQty] = useState<number>(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("Great Expedition");
  const [modalMsg, setModalMsg] = useState<string>("");

  async function refresh() {
    if (!wallet.publicKey) return;
    setLoading(true);
    try {
      await ensureAuth(wallet as any);
      const r: any = await geGetCurrentRound();
      setRound(r?.round || null);
      setStats(r?.stats || null);
      const me: any = await geGetMe();
      setMy(me?.my || []);
    } catch (e: any) {
      setModalTitle("Great Expedition");
      setModalMsg(String(e?.message || e));
      setModalOpen(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.publicKey?.toString()]);

  // Poll lightly so it feels live
  useEffect(() => {
    if (!wallet.publicKey) return;
    const id = window.setInterval(() => {
      refresh();
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.publicKey?.toString()]);

  const perShip = stats?.perShip || Array.from({ length: SHIPS }).map((_, i) => ({ ship_index: i, qty: 0 }));
  const filledCount = perShip.filter((s: any) => Number(s.qty) >= 1).length;

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
    if (!endsAtMs) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [endsAtMs]);

  const countdown = useMemo(() => {
    if (!endsAtMs) return null;
    const s = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  }, [endsAtMs, tick]);

  const myTotal = my.reduce((a, r: any) => a + Number(r.qty || 0), 0);

  async function board() {
    if (!wallet.publicKey) return;
    setLoading(true);
    try {
      await ensureAuth(wallet as any);
      await geEnter(selectedShip, qty);
      await refresh();
    } catch (e: any) {
      setModalTitle("Board failed");
      setModalMsg(String(e?.message || e));
      setModalOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const shipCellClass = (i: number) => {
    const q = Number(perShip?.[i]?.qty || 0);
    const filled = q >= 1;
    const selected = i === selectedShip;
    return [
      "rounded-lg border p-2 text-center cursor-pointer select-none",
      filled ? "border-cyan-500/40 bg-black/40" : "border-gray-800 bg-black/20",
      selected ? "ring-2 ring-cyan-400" : "",
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

      <div className="rounded-xl border border-purple-500/30 bg-black/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-extrabold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              The Great Expedition
            </div>
            <div className="text-xs text-gray-400">Pure luck • winner ship splits the pot</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Status</div>
            <div className="text-sm font-semibold text-gray-200">{statusLabel}</div>
            {round?.status === "running" && countdown ? (
              <div className="text-xs text-cyan-300">Ends in {countdown}</div>
            ) : null}
          </div>
        </div>

        {!wallet.publicKey ? (
          <div className="text-sm text-gray-400 mt-3">Connect wallet to board a ship.</div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {Array.from({ length: SHIPS }).map((_, idx) => (
                <div
                  key={idx}
                  className={shipCellClass(idx)}
                  onClick={() => setSelectedShip(idx)}
                >
                  <div className="text-xs text-gray-400">Ship {idx + 1}</div>
                  <div className="text-lg font-bold text-white">{Number(perShip?.[idx]?.qty || 0)}</div>
                  <div className="text-[10px] text-gray-500">entries</div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="text-sm text-gray-300">Selected: <span className="text-cyan-300 font-semibold">Ship {selectedShip + 1}</span></div>
              <div className="ml-auto flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value || 1))))}
                  className="w-20 bg-black/40 border border-gray-700 rounded-md px-2 py-1 text-gray-100"
                />
                <button
                  onClick={board}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-semibold disabled:opacity-60"
                >
                  {loading ? "…" : "Board"}
                </button>
              </div>
            </div>

            <div className="mt-2 text-xs text-gray-400">
              Your total entries this round: <span className="text-gray-200 font-semibold">{myTotal}</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
