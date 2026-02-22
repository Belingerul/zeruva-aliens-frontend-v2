"use client";

import ConfirmModal from "./ConfirmModal";

export default function WinnerModal({
  open,
  onClose,
  summary,
  payouts,
}: {
  open: boolean;
  onClose: () => void;
  summary: any;
  payouts?: { wallet: string; amount: number; entries: number }[];
}) {
  if (!open) return null;

  const winnerAlien = summary?.round?.winner_alien;

  return (
    <ConfirmModal
      open={open}
      title="Round result"
      subtitle={""}
      primaryText="OK"
      onPrimary={onClose}
      onSecondary={onClose}
      secondaryText={null}
    >
      <div className="flex items-center gap-3">
        {winnerAlien ? (
          <img
            src={`/api/static/${winnerAlien}.png`}
            className="w-16 h-16 rounded-2xl object-cover border border-gray-800"
            alt=""
            aria-hidden="true"
          />
        ) : null}
        <div>
          <div className="text-sm text-gray-300">Winner</div>
          <div className="text-lg font-bold text-gray-100">
            {winnerAlien ? `Alien ${winnerAlien}` : "Unknown"}
          </div>
          <div className="text-xs text-gray-400">
            Mode: <span className="text-gray-200">{String(summary?.round?.game_mode || "?")}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-gray-800 bg-black/30 p-2">
          <div className="text-gray-400">Pot</div>
          <div className="text-gray-100 font-semibold">{Number(summary?.pot_sol || 0).toFixed(2)} SOL</div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-black/30 p-2">
          <div className="text-gray-400">Distributed</div>
          <div className="text-gray-100 font-semibold">{Number(summary?.distributed_total || 0).toFixed(2)} SOL</div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-black/30 p-2">
          <div className="text-gray-400">Winner bucket</div>
          <div className="text-gray-100 font-semibold">{Number(summary?.winner_pot || 0).toFixed(2)} SOL</div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-black/30 p-2">
          <div className="text-gray-400">Participation</div>
          <div className="text-gray-100 font-semibold">{Number(summary?.participation_pot || 0).toFixed(2)} SOL</div>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-gray-400">
        Players: <span className="text-gray-200 font-semibold">{Number(summary?.participants || 0)}</span>
        {" • "}
        Treasury: <span className="text-gray-200 font-semibold">{Number(summary?.treasury_cut || 0).toFixed(2)} SOL</span>
      </div>

      {Array.isArray(payouts) && payouts.length ? (
        <div className="mt-4">
          <div className="text-sm font-semibold text-gray-200">Top payouts</div>
          <div className="mt-2 space-y-2 max-h-40 overflow-auto pr-1">
            {payouts.map((p, idx) => (
              <div key={`${p.wallet}-${idx}`} className="flex items-center justify-between rounded-xl border border-gray-800 bg-black/20 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="text-gray-200 truncate">{p.wallet}</div>
                  <div className="text-gray-500">entries: {p.entries}</div>
                </div>
                <div className="text-gray-100 font-semibold">{Number(p.amount).toFixed(3)} SOL</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </ConfirmModal>
  );
}
