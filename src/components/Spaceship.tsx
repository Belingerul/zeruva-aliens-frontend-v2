"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getShipWithSlots, assignSlot, type ShipSlot } from "../api";
import Hangar from "./Hangar";

const tierGlow: Record<string, string> = {
  Common: "shadow-[0_0_15px_rgba(34,197,94,0.5)]",
  Rare: "shadow-[0_0_15px_rgba(59,130,246,0.5)]",
  Epic: "shadow-[0_0_20px_rgba(168,85,247,0.6)]",
  Legendary: "shadow-[0_0_25px_rgba(234,179,8,0.7)]",
};

export default function Spaceship() {
  const wallet = useWallet();
  const [shipLevel, setShipLevel] = useState(1);
  const [slots, setSlots] = useState<ShipSlot[]>([]);
  const [chosenSlot, setChosenSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadShip = () => {
    if (wallet.connected && wallet.publicKey) {
      setLoading(true);
      getShipWithSlots(wallet.publicKey.toString())
        .then((data) => {
          setShipLevel(data.level);
          setSlots(data.slots);
        })
        .catch((err) => console.error("Failed to load ship:", err))
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    loadShip();
  }, [wallet.connected, wallet.publicKey]);

  async function handleAssign(alien: any) {
    if (chosenSlot === null || !wallet.publicKey) return;

    try {
      await assignSlot(wallet.publicKey.toString(), chosenSlot, alien.id);
      setChosenSlot(null);
      loadShip();
    } catch (err) {
      console.error("Failed to assign alien:", err);
      alert("Failed to assign alien to slot");
    }
  }

  if (!wallet.connected) {
    return (
      <div className="text-white text-center p-8 bg-gray-900/50 rounded-xl border border-gray-700">
        Connect your wallet to view spaceship
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-white text-center p-8">Loading spaceship...</div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-gray-900 to-black rounded-xl border border-gray-700">
      <h2 className="text-white text-2xl font-bold mb-6 text-center">
        Spaceship — Level {shipLevel}
      </h2>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {slots.map((slot) => (
          <div
            key={slot.slot_index}
            className={`bg-gray-800 border-2 ${slot.image && slot.tier ? tierGlow[slot.tier] : "border-gray-700"} rounded-xl p-4 cursor-pointer hover:border-cyan-400 transition-all`}
            onClick={() => setChosenSlot(slot.slot_index)}
          >
            <div className="text-gray-400 text-sm mb-2">
              Slot {slot.slot_index}
            </div>
            {slot.image ? (
              <>
                <img
                  src={slot.image || "/placeholder.svg"}
                  className="w-full h-20 object-contain mb-2"
                  alt={`Alien in slot ${slot.slot_index}`}
                />
                <div
                  className={`text-sm font-bold ${slot.tier === "Legendary" ? "text-yellow-400" : slot.tier === "Epic" ? "text-purple-400" : slot.tier === "Rare" ? "text-blue-400" : "text-slate-300"}`}
                >
                  {slot.tier}
                </div>
                {slot.roi !== undefined && (
                  <div className="text-cyan-300 text-xs">
                    {(slot.roi * 100).toFixed(1)}%/day
                  </div>
                )}
              </>
            ) : (
              <div className="text-gray-500 text-center py-8 border-2 border-dashed border-gray-700 rounded-lg">
                Empty Slot
                <div className="text-xs mt-2">Click to assign</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {chosenSlot !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-cyan-500 rounded-xl w-full max-w-2xl">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-white text-lg font-bold">
                Select Alien for Slot {chosenSlot}
              </h3>
              <button
                onClick={() => setChosenSlot(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <Hangar onSelect={handleAssign} />
          </div>
        </div>
      )}
    </div>
  );
}
