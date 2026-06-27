"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { ensureAuth } from "../utils/ensureAuth";
import DynamicStarfield from "./DynamicStarfield";
import SpaceshipSlot from "./SpaceshipSlot";
import ConfirmModal from "./ConfirmModal";
import {
  getShipWithSlots,
  unassignSlot,
  upgradeShipLevel,
  type ShipWithSlots,
} from "../api";

interface SpaceshipPanelProps {
  onAlienUnassigned?: () => void;
  onRoiChange?: () => void; // Call this BEFORE API call to freeze display
}

export default function SpaceshipPanel({
  onAlienUnassigned,
  onRoiChange,
}: SpaceshipPanelProps) {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const [ship, setShip] = useState<ShipWithSlots | null>(null);
  const [loading, setLoading] = useState(true);
  const [unassigning, setUnassigning] = useState(false);

  const [errorOpen, setErrorOpen] = useState(false);
  const [errorTitle, setErrorTitle] = useState("Action blocked");
  const [errorMessage, setErrorMessage] = useState<string>("");

  function showThemedError(title: string, message: string) {
    setErrorTitle(title);
    setErrorMessage(message);
    setErrorOpen(true);
  }

  function extractApiErrorMessage(err: any): string {
    const raw = String(err?.message || err || "");
    const m = raw.match(/API Error:\s*\d+\s*-\s*(.*)$/s);
    const payload = (m?.[1] || raw).trim();
    try {
      const j = JSON.parse(payload);
      if (j?.error) return String(j.error);
      return payload;
    } catch {
      return payload;
    }
  }

  const loadShipData = async () => {
    if (!publicKey) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const shipData = await getShipWithSlots(publicKey.toString());
      setShip(shipData);
    } catch (err) {
      console.error("Failed to fetch ship data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShipData();
  }, [publicKey]);

  useEffect(() => {
    const onShipChanged = () => {
      loadShipData();
    };
    window.addEventListener("zeruva_ship_changed", onShipChanged);
    return () => {
      window.removeEventListener("zeruva_ship_changed", onShipChanged);
    };
  }, [publicKey]);

  const slotCount = ship?.maxSlots ?? 2;
  const slots = ship?.slots ?? [];

  const handleUnassignAlien = async (alienDbId: number) => {
    if (!publicKey || unassigning) return;

    setUnassigning(true);
    try {
      // CRITICAL: Freeze display BEFORE API call to prevent ghost earnings
      // This stops the animation loop and freezes ROI before backend processes the change
      if (onRoiChange) {
        onRoiChange();
      }

      await unassignSlot(publicKey.toString(), alienDbId);
      await loadShipData();
      if (onAlienUnassigned) {
        onAlienUnassigned();
      }
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      if (/Cannot change assignments during expedition/i.test(msg) || /expedition/i.test(msg)) {
        // Expected rejection from backend while expedition is active — don't spam console.
        showThemedError(
          "Expedition active",
          "You can’t assign/unassign aliens while an expedition is active. Wait until it ends.",
        );
        // Keep expedition UI in sync
        window.dispatchEvent(new Event("zeruva_expedition_refresh"));
      } else {
        console.error("Failed to unassign alien:", err);
        showThemedError("Unassign failed", msg || "Failed to unassign alien. Please try again.");
      }
    } finally {
      setUnassigning(false);
    }
  };

  const [expedition, setExpedition] = useState<any>(null);
  const [expeditionWorking, setExpeditionWorking] = useState(false);
  const [expeditionTick, setExpeditionTick] = useState(0);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  const loadExpedition = async () => {
    try {
      const { getExpeditionStatus } = await import("../api");
      const st: any = await getExpeditionStatus();
      setExpedition(st);

      // If backend sends its current time, use it to compensate for client clock skew (common on phones).
      if (st?.server_ts) {
        const serverNow = new Date(st.server_ts).getTime();
        if (Number.isFinite(serverNow)) {
          setServerOffsetMs(serverNow - Date.now());
        }
      }
    } catch (e: any) {
      const msg = String(e?.message || "");

      // If we can't fetch status (often because the JWT is missing/expired on mobile),
      // try to re-auth once (Phantom signMessage) and retry.
      if (/API Error:\s*(401|403)\b|Missing Bearer token|Unauthorized|Forbidden/i.test(msg)) {
        try {
          await ensureAuth(wallet as any);
          const { getExpeditionStatus } = await import("../api");
          const st2: any = await getExpeditionStatus();
          setExpedition(st2);
          if (st2?.server_ts) {
            const serverNow = new Date(st2.server_ts).getTime();
            if (Number.isFinite(serverNow)) {
              setServerOffsetMs(serverNow - Date.now());
            }
          }
          return;
        } catch {
          // fall through to clearing state
        }

        // Don't leave the UI stuck showing "Expedition: 00:00:00" forever.
        setExpedition({
          ok: false,
          expedition_active: false,
          expedition_started_at: null,
          expedition_ends_at: null,
          expedition_planet: null,
        });
        setServerOffsetMs(0);
      }
    }
  };

  // Allow other components (assign/unassign) to request an expedition status refresh.
  useEffect(() => {
    const handler = () => {
      loadExpedition();
    };
    window.addEventListener("zeruva_expedition_refresh", handler);
    return () => window.removeEventListener("zeruva_expedition_refresh", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  useEffect(() => {
    if (publicKey) loadExpedition();
  }, [publicKey]);

  const expeditionSecondsLeft = useMemo(() => {
    if (!expedition?.expedition_active || !expedition?.expedition_ends_at) return 0;
    const endsAt = new Date(expedition.expedition_ends_at).getTime();
    const now = Date.now() + (serverOffsetMs || 0);
    const ms = endsAt - now;
    return Math.max(0, Math.ceil(ms / 1000));
  }, [expedition?.expedition_active, expedition?.expedition_ends_at, expeditionTick, serverOffsetMs]);

  const expeditionTimerLabel = useMemo(() => {
    const s = expeditionSecondsLeft;
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  }, [expeditionSecondsLeft]);

  useEffect(() => {
    if (!expedition?.expedition_active) return;

    const id = window.setInterval(() => {
      setExpeditionTick((t) => t + 1);
    }, 1000);

    // Also poll status occasionally to prevent UI desync (e.g., after rejected assign/unassign attempts)
    const poll = window.setInterval(() => {
      loadExpedition();
    }, 15_000);

    return () => {
      window.clearInterval(id);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedition?.expedition_active]);

  // When timer hits zero, pull fresh status and refresh rewards so ROI flips back to 0.
  useEffect(() => {
    if (!expedition?.expedition_active) return;
    if (expeditionSecondsLeft !== 0) return;

    // Avoid spamming: only run on transition to 0
    loadExpedition();
    if (onRoiChange) onRoiChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expeditionSecondsLeft, expedition?.expedition_active]);

  const [planets, setPlanets] = useState<any[]>([]);
  const [selectedPlanet, setSelectedPlanet] = useState<string>("planet-1");

  const loadPlanets = async () => {
    try {
      const { getPlanets } = await import("../api");
      const r: any = await getPlanets();
      setPlanets(r?.planets || []);
      if (r?.planets?.[0] && !r.planets.find((p: any) => p.key === selectedPlanet)) {
        setSelectedPlanet(r.planets[0].key);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadPlanets();
  }, [publicKey]);

  const handleStartExpedition = async () => {
    if (!publicKey || expeditionWorking) return;

    // Freeze + refresh rewards baseline before changing ROI state
    if (onRoiChange) onRoiChange();

    setExpeditionWorking(true);
    try {
      const { startExpedition } = await import("../api");
      const st = await startExpedition(selectedPlanet || "planet-1");
      setExpedition(st);

      // Force a rewards refresh so ROI switches from 0 -> assigned ROI immediately
      if (onRoiChange) onRoiChange();
    } catch (e: any) {
      const msg = extractApiErrorMessage(e);
      showThemedError("Failed to start expedition", msg || "Please try again.");
    } finally {
      setExpeditionWorking(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="w-full relative overflow-hidden rounded-xl border border-gray-800 bg-black/60 backdrop-blur-sm h-auto lg:h-full">
        <div className="absolute inset-0 opacity-30">
          <DynamicStarfield />
        </div>
        <div className="relative z-10 h-full flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-5xl mb-4">🔒</div>
            <p className="text-gray-400">
              Connect wallet to view your spaceship
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ConfirmModal
        open={errorOpen}
        title={errorTitle}
        subtitle={errorMessage}
        primaryText="OK"
        onPrimary={() => setErrorOpen(false)}
        onSecondary={() => setErrorOpen(false)}
        secondaryText={null}
      />

      <div className="w-full relative overflow-hidden rounded-xl border border-cyan-500/30 bg-black/60 backdrop-blur-sm h-auto lg:h-full flex flex-col min-h-0">
      <div className="absolute inset-0 opacity-30">
        <DynamicStarfield />
      </div>

      <div className="relative z-10 p-5 lg:p-6 space-y-4 lg:space-y-5 flex-1 flex flex-col">
        <div className="text-center">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            Spaceship Level {ship?.level ?? 1}
          </h2>
          <p className="text-gray-400 text-lg mt-1">{slotCount} Alien Slots</p>
        </div>

        <div className="relative flex-1 min-h-0 flex items-center justify-center">
          <motion.div
            animate={{
              y: [0, -10, 0],
            }}
            transition={{
              duration: 4,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
            className="relative w-full max-w-[420px] lg:max-w-[460px]"
          >
            <div className="relative w-full aspect-square">
              <img
                src="/images/spaceship-new.png"
                alt="Spaceship"
                className="w-full h-full object-contain drop-shadow-[0_0_40px_rgba(34,211,238,0.8)]"
              />

              <div
                className={`
                absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                grid gap-2 sm:gap-3 lg:gap-4
                ${slotCount === 2 ? "grid-cols-2" : slotCount === 4 ? "grid-cols-2" : "grid-cols-3"}
              `}
              >
                {Array.from({ length: slotCount }).map((_, index) => {
                  const slot = slots.find((s) => s.slot_index === index);
                  const alien = slot?.alien ?? null;

                  return (
                    <SpaceshipSlot
                      key={index}
                      slotIndex={index}
                      alien={alien}
                      onUnassign={handleUnassignAlien}
                      disabled={unassigning}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>

        <div className="mt-2 space-y-3">
          {!expedition?.expedition_active && planets?.length ? (
            <div className="bg-black/30 border border-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-300 font-semibold mb-2">Select Planet</div>
              <select
                value={selectedPlanet}
                onChange={(e) => setSelectedPlanet(e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-md px-3 py-2 text-gray-100"
              >
                {planets.map((p: any) => (
                  <option key={p.key} value={p.key}>
                    {p.name || p.key} (x{p.roiMult || 1})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <motion.button
            whileHover={{ scale: expedition?.expedition_active ? 1 : 1.02 }}
            whileTap={{ scale: expedition?.expedition_active ? 1 : 0.98 }}
            onClick={handleStartExpedition}
            disabled={expeditionWorking || expedition?.expedition_active}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-semibold
                     shadow-[0_0_20px_rgba(34,211,238,0.35)] hover:shadow-[0_0_30px_rgba(34,211,238,0.55)]
                     transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {expeditionWorking
              ? "Starting Expedition…"
              : expedition?.expedition_active
                ? `Expedition: ${expeditionTimerLabel}`
                : "Start Expedition (6h)"}
          </motion.button>

          <div className="text-xs text-gray-400 text-center">
            Earnings happen only during expeditions (assigned aliens only).
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
