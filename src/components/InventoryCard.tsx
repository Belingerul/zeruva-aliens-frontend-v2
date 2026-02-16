"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getInventory, upgradeShipWithItems } from "../api";
import ConfirmModal from "./ConfirmModal";

export default function InventoryCard() {
  const wallet = useWallet();
  const [items, setItems] = useState<{ item_key: string; qty: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("Inventory");
  const [modalMsg, setModalMsg] = useState<string>("");

  async function refresh() {
    if (!wallet.publicKey) return;
    try {
      setLoading(true);
      const r: any = await getInventory();
      setItems(r?.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.publicKey?.toString()]);

  async function doUpgrade() {
    try {
      setLoading(true);
      const r: any = await upgradeShipWithItems();
      setModalTitle("Ship upgraded");
      setModalMsg(`Upgraded to level ${r?.level}.`);
      setModalOpen(true);
      window.dispatchEvent(new Event("zeruva_ship_changed"));
      await refresh();
    } catch (e: any) {
      const raw = String(e?.message || e);
      setModalTitle("Upgrade failed");
      setModalMsg(raw);
      setModalOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const qty = (k: string) => items.find((i) => i.item_key === k)?.qty || 0;

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

      <div className="rounded-xl border border-gray-800 bg-black/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-white">Inventory</div>
            <div className="text-xs text-gray-400">Expedition loot materials</div>
          </div>
          <button
            onClick={refresh}
            disabled={!wallet.publicKey || loading}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-700 text-gray-200 hover:bg-white/5 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {!wallet.publicKey ? (
          <div className="text-sm text-gray-400 mt-3">Connect wallet to see inventory.</div>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-black/40 border border-gray-800 py-2">
              <div className="text-xs text-gray-400">Common</div>
              <div className="text-lg font-bold text-white">{qty("mat_common")}</div>
            </div>
            <div className="rounded-lg bg-black/40 border border-gray-800 py-2">
              <div className="text-xs text-gray-400">Rare</div>
              <div className="text-lg font-bold text-white">{qty("mat_rare")}</div>
            </div>
            <div className="rounded-lg bg-black/40 border border-gray-800 py-2">
              <div className="text-xs text-gray-400">Epic</div>
              <div className="text-lg font-bold text-white">{qty("mat_epic")}</div>
            </div>
          </div>
        )}

        <button
          onClick={doUpgrade}
          disabled={!wallet.publicKey || loading}
          className="mt-3 w-full py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-black font-semibold disabled:opacity-50"
        >
          Upgrade Ship (with materials)
        </button>
      </div>
    </>
  );
}
