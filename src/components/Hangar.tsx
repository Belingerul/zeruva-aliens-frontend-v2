"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getUserAliens, type Alien } from "../api";

const AVATAR_KEY = "zeruva_avatar";

const tierBorder: Record<string, string> = {
  Legendary: "border-yellow-500/70",
  Epic: "border-purple-500/70",
  Rare: "border-blue-500/70",
  Common: "border-slate-400/60",
  Nothing: "border-gray-700",
};

const tierText: Record<string, string> = {
  Legendary: "text-yellow-400",
  Epic: "text-purple-400",
  Rare: "text-blue-400",
  Common: "text-slate-300",
};

export default function Hangar({
  onSelect,
}: {
  onSelect?: (alien: Alien) => void;
}) {
  const wallet = useWallet();
  const [aliens, setAliens] = useState<Alien[]>([]);
  const [loading, setLoading] = useState(false);
  const [avatar, setAvatar] = useState<number | null>(null);

  useEffect(() => {
    const a = localStorage.getItem(AVATAR_KEY);
    if (a) setAvatar(Number(a));
  }, []);

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      setLoading(true);
      getUserAliens(wallet.publicKey.toString())
        .then(setAliens)
        .catch((err) => console.error("Failed to load aliens:", err))
        .finally(() => setLoading(false));
    } else {
      setAliens([]);
    }
  }, [wallet.connected, wallet.publicKey]);

  if (!wallet.connected) {
    return <div className="text-gray-400 text-center py-24">Connect your wallet to see your aliens.</div>;
  }
  if (loading) {
    return <div className="text-white text-center py-24">Loading your aliens...</div>;
  }
  if (aliens.length === 0) {
    return (
      <div className="text-gray-400 text-center py-24">
        <div className="text-5xl mb-3">🛸</div>
        No aliens in hangar yet. Hatch eggs in The Colony to get your first alien!
      </div>
    );
  }

  const totalRoi = aliens.reduce((a, x) => a + Number(x.roi || 0), 0);
  const byTier = (t: string) => aliens.filter((a) => a.tier === t).length;

  const pickAvatar = (a: Alien) => {
    const id = a.alien_id || a.id;
    localStorage.setItem(AVATAR_KEY, String(id));
    setAvatar(id);
    onSelect?.(a);
  };

  return (
    <div className="w-full">
      {/* Fleet stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Crew size", value: aliens.length, color: "text-cyan-300" },
          { label: "Earning power", value: `$${totalRoi}/day`, color: "text-emerald-300" },
          { label: "Epic+", value: byTier("Epic") + byTier("Legendary"), color: "text-purple-300" },
          { label: "Legendary", value: byTier("Legendary"), color: "text-yellow-300" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-800 bg-black/40 p-3.5 text-center">
            <div className={`text-2xl font-extrabold tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-400 mb-3">
        Click an alien to make it your <span className="text-red-300 font-semibold">Void Arena avatar</span> —
        you&apos;ll fight as that alien in Realm IV.
      </div>

      {/* Full-width gallery */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {aliens.map((alien) => {
          const id = alien.alien_id || alien.id;
          const isAvatar = avatar === id;
          return (
            <div
              key={alien.id}
              onClick={() => pickAvatar(alien)}
              className={`relative bg-gray-900/80 border-2 ${tierBorder[alien.tier || "Common"]} rounded-2xl p-3 cursor-pointer hover:scale-[1.04] hover:shadow-[0_0_24px_rgba(34,211,238,0.15)] transition-all ${
                isAvatar ? "ring-2 ring-red-400 shadow-[0_0_24px_rgba(239,68,68,0.3)]" : ""
              }`}
            >
              {isAvatar && (
                <span className="absolute -top-2 -right-2 text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">
                  ⚔️ AVATAR
                </span>
              )}
              <img
                src={alien.image || "/placeholder.svg"}
                className="w-full aspect-square object-cover rounded-xl mb-2"
                alt={`Alien ${id}`}
              />
              <div className="text-white text-sm font-semibold">Alien #{id}</div>
              <div className={`text-xs font-bold ${tierText[alien.tier || "Common"] || "text-slate-300"}`}>
                {alien.tier || "Common"}
              </div>
              {alien.roi !== undefined && (
                <div className="text-cyan-300 text-xs">${Number(alien.roi)}/day</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
