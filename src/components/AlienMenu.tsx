"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import ConfirmModal from "./ConfirmModal";
import {
  getUserAliens,
  assignSlot,
  getShipWithSlots,
  type AlienWithStats,
  type ShipWithSlots,
} from "../api";

const tierColors: Record<string, string> = {
  Common: "border-green-500 text-green-400",
  Rare: "border-blue-500 text-blue-400",
  Epic: "border-purple-500 text-purple-400",
  Legendary: "border-yellow-500 text-yellow-400",
};

interface AlienMenuProps {
  onAlienAssigned?: () => void;
  onRoiChange?: () => void; // Call this BEFORE API call to freeze display
}

export default function AlienMenu({
  onAlienAssigned,
  onRoiChange,
}: AlienMenuProps) {
  const wallet = useWallet();
  const [aliens, setAliens] = useState<AlienWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [ship, setShip] = useState<ShipWithSlots | null>(null);

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
    // Matches our apiRequest() error format: "API Error: 400 - {..json..}" or "API Error: 400 - text"
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

  const loadData = useCallback(async () => {
    if (wallet.connected && wallet.publicKey) {
      setLoading(true);
      try {
        const [aliensData, shipData] = await Promise.all([
          getUserAliens(wallet.publicKey.toString()),
          getShipWithSlots(wallet.publicKey.toString()),
        ]);
        setAliens(aliensData);
        setShip(shipData);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    }
  }, [wallet.connected, wallet.publicKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const assignedAlienIds = new Set(
    (ship?.slots ?? [])
      .filter((slot) => slot.alien !== null)
      .map((slot) => slot.alien!.id),
  );

  const handleAssignToShip = async (alien: AlienWithStats) => {
    if (!wallet.publicKey) {
      showThemedError("Wallet not connected", "Please connect your wallet first.");
      return;
    }

    if (!ship) {
      showThemedError("Ship not loaded", "Unable to load ship data. Please refresh and try again.");
      return;
    }

    const slotCount = ship.maxSlots;
    const slots = ship.slots;

    let firstFreeIndex: number | null = null;
    for (let i = 0; i < slotCount; i++) {
      const existing = slots.find((s) => s.slot_index === i);
      if (!existing || existing.alien === null) {
        firstFreeIndex = i;
        break;
      }
    }

    if (firstFreeIndex === null) {
      showThemedError(
        "No free slots",
        "All ship slots are full. Unassign an alien or upgrade your ship.",
      );
      return;
    }

    setAssigning(true);
    try {
      // CRITICAL: Freeze display BEFORE API call to prevent ghost earnings
      // This stops the animation loop and freezes ROI before backend processes the change
      if (onRoiChange) {
        onRoiChange();
      }

      await assignSlot(wallet.publicKey.toString(), firstFreeIndex, alien.id);
      await loadData();
      if (onAlienAssigned) {
        onAlienAssigned();
      }
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      if (/Cannot change assignments during expedition/i.test(msg) || /expedition/i.test(msg)) {
        // Expected rejection from backend while expedition is active — don't spam console.
        showThemedError(
          "Expedition active",
          "You can’t assign/unassign aliens while an expedition is active. Wait until it ends.",
        );
        window.dispatchEvent(new Event("zeruva_expedition_refresh"));
      } else {
        console.error("Failed to assign alien:", err);
        showThemedError("Assign failed", msg || "Failed to assign alien. Please try again.");
      }
    } finally {
      setAssigning(false);
    }
  };

  if (!wallet.connected) {
    return (
      <div className="flex-1 rounded-xl p-6 bg-black/60 backdrop-blur-sm border border-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <p className="text-gray-400 text-lg">
            Connect your wallet to view your aliens
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 rounded-xl p-6 bg-black/60 backdrop-blur-sm border border-gray-800 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p>Loading your aliens...</p>
        </div>
      </div>
    );
  }

  const visibleAliens = aliens.slice(0, 20);

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

      <div className="flex-[1.25] rounded-xl p-4 bg-black/60 backdrop-blur-sm border border-gray-800 flex flex-col h-auto lg:h-full min-h-0">
        <div className="mb-3">
          <h2 className="text-xl font-bold text-white mb-0.5">My Aliens</h2>
          <p className="text-xs text-gray-400">
            Showing {visibleAliens.length}/{aliens.length} (top 20) — sized to fit laptop screen
          </p>
        </div>

        {/*
          Dany requirement (laptop): no internal scroll, and cards smaller so everything fits.
          If you want scrolling back later, we can re-enable lg:overflow-y-auto.
        */}
        <div className="pr-1 min-h-0">
          {visibleAliens.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              <div className="text-4xl mb-3">👽</div>
              <p>No aliens in hangar yet.</p>
              <p className="text-xs mt-1">Spin an egg to get your first alien!</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-5 gap-2">
              {visibleAliens.map((alien) => {
              const isAssigned = assignedAlienIds.has(alien.id);

              return (
                <div
                  key={alien.id}
                  className={`bg-gradient-to-br from-gray-900 to-black border ${tierColors[alien.tier] || tierColors.Common} rounded-lg p-2 transition-shadow duration-150 ease-out hover:shadow-md ${
                    isAssigned ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex justify-center mb-1">
                    <img
                      src={alien.image || "/placeholder.svg"}
                      alt={`Alien ${alien.alien_id || alien.id}`}
                      loading="lazy"
                      decoding="async"
                      className="w-10 h-10 md:w-12 md:h-12 object-contain"
                    />
                  </div>

                  <div className="text-center space-y-0.5 mb-1">
                    <div className="text-white text-[11px] md:text-xs font-semibold leading-tight">
                      #{alien.alien_id || alien.id}
                    </div>
                    <div
                      className={`text-[11px] md:text-xs font-bold leading-tight ${tierColors[alien.tier]?.split(" ")[1] || "text-green-400"}`}
                    >
                      {alien.tier || "Common"}
                    </div>
                    <div className="text-cyan-300 text-[11px] md:text-xs leading-tight">
                      {(alien.roi || 0).toFixed(1)}/day
                    </div>
                  </div>

                  <button
                    onClick={() => handleAssignToShip(alien)}
                    disabled={assigning || isAssigned}
                    className={`w-full py-1 rounded-md text-white text-[11px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      isAssigned
                        ? "bg-gray-700 border border-gray-600"
                        : "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                    }`}
                  >
                    {isAssigned ? "Assigned" : assigning ? "..." : "Assign"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
