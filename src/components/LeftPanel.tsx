"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { getShipWithSlots, type ShipWithSlots } from "../api";
import RewardsCard from "./RewardsCard";
import QuoteCard from "./QuoteCard";import ConfirmModal from "./ConfirmModal";
import { useEffect, useMemo, useState } from "react";

interface LeftPanelProps {
  onOpenSpin: () => void;
  onRefreshRewardsReady?: (refreshFn: () => Promise<void>) => void;
  onRoiChangeReady?: (onRoiChangeFn: () => void) => void;
}

export default function LeftPanel({
  onOpenSpin,
  onRefreshRewardsReady,
  onRoiChangeReady,
}: LeftPanelProps) {
  const wallet = useWallet();
  const walletAddress = wallet.publicKey?.toBase58() ?? null;

  const [ship, setShip] = useState<ShipWithSlots | null>(null);
  const [shipLoading, setShipLoading] = useState(false);
  const [shipError, setShipError] = useState<string | null>(null);

  const [shipBuyOpen, setShipBuyOpen] = useState(false);
  const [shipBuyQuote, setShipBuyQuote] = useState<any>(null);
  const [shipBuyWorking, setShipBuyWorking] = useState(false);
  const [shipBuySig, setShipBuySig] = useState<string | null>(null);

  const [nextClaimAt, setNextClaimAt] = useState<Date | null>(null);

  async function refreshShip() {
    if (!walletAddress) {
      setShip(null);
      return;
    }
    setShipLoading(true);
    setShipError(null);
    try {
      const data = await getShipWithSlots(walletAddress);
      setShip(data);
    } catch (e: any) {
      console.error("Failed to load ship:", e);
      setShipError(e?.message || "Failed to load ship");
      setShip(null);
    } finally {
      setShipLoading(false);
    }
  }

  useEffect(() => {
    refreshShip();
    // refresh when ship changes elsewhere
    const onChanged = () => refreshShip();
    window.addEventListener("zeruva_ship_changed", onChanged);
    return () => window.removeEventListener("zeruva_ship_changed", onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const { currentLevel, nextLevel, nextPriceUsd } = useMemo(() => {
    const level = ship?.level ?? 1;
    const maxLevel = 3;
    const next = Math.min(maxLevel, level + 1);
    const prices: Record<number, number> = { 1: 30, 2: 60, 3: 120 };
    return {
      currentLevel: level,
      nextLevel: next,
      nextPriceUsd: prices[next] ?? 0,
    };
  }, [ship]);

  const canUpgrade = wallet.connected && currentLevel < 3;

  async function handleUpgradeSpaceship() {
    if (!wallet.connected || !wallet.publicKey) return;
    setShipBuySig(null);
    setShipBuyQuote(null);
    setShipBuyWorking(false);
    setShipBuyOpen(true);

    try {
      const { buySpaceship } = await import("../api");
      const quote = await buySpaceship(walletAddress!, nextLevel);
      setShipBuyQuote(quote);
    } catch (e: any) {
      setShipError(e?.message || "Failed to prepare upgrade");
      setShipBuyOpen(false);
    }
  }

  const isDisabled = !wallet.connected;

  return (
    <div className="w-full lg:w-96 xl:w-[26rem] rounded-xl p-5 lg:p-4 bg-black/60 backdrop-blur-sm border border-gray-800 h-auto lg:h-full lg:self-stretch flex flex-col gap-3 overflow-hidden">
      {/* Spin Section */}
      <div>
        <h3 className="font-extrabold mb-2 text-gray-100 text-xl tracking-tight">
          Spin an Egg
        </h3>
        <button
          onClick={onOpenSpin}
          disabled={isDisabled}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-700 disabled:to-gray-700"
        >
          {isDisabled ? "Connect Wallet First" : "🎰 Open Spin Modal"}
        </button>
      </div>

      {/* Spaceship Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-extrabold text-gray-100 text-xl tracking-tight">Spaceship</h3>
          <div className="text-xs text-gray-400">
            {shipLoading ? "Loading…" : shipError ? "" : `Lv ${currentLevel}`}
          </div>
        </div>

        {shipError && (
          <div className="text-[11px] text-red-400 mb-2">{shipError}</div>
        )}

        <button
          onClick={handleUpgradeSpaceship}
          disabled={!canUpgrade || shipLoading}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-semibold hover:from-purple-700 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-700 disabled:to-gray-700"
        >
          {isDisabled
            ? "Connect Wallet to Upgrade"
            : currentLevel >= 3
              ? "Max Level Reached"
              : `Upgrade to Lv${nextLevel} ($${nextPriceUsd})`}
        </button>

        <ConfirmModal
          open={shipBuyOpen}
          title="Confirm Spaceship Upgrade"
          subtitle="Review the quote and sign the transaction."
          primaryText={shipBuySig ? "Confirmed" : shipBuyWorking ? "Confirming…" : "Confirm & Sign"}
          primaryDisabled={!shipBuyQuote?.serialized || shipBuyWorking || !!shipBuySig}
          onPrimary={async () => {
            if (!shipBuyQuote?.serialized) return;
            if (!wallet.signTransaction) {
              setShipError("Wallet doesn't support transaction signing");
              return;
            }

            setShipBuyWorking(true);
            setShipError(null);

            try {
              const { Transaction, Connection } = await import("@solana/web3.js");
              const { confirmBuySpaceship } = await import("../api");
              const connection = new Connection(
                process.env.VITE_RPC_URL || "https://api.devnet.solana.com",
                "confirmed",
              );

              const tx = Transaction.from(
                Buffer.from(shipBuyQuote.serialized, "base64"),
              );

              const signed = await wallet.signTransaction(tx);
              const signature = await connection.sendRawTransaction(
                signed.serialize(),
              );
              await connection.confirmTransaction(signature, "confirmed");

              await confirmBuySpaceship(
                shipBuyQuote.level,
                signature,
                shipBuyQuote.intentId,
              );

              setShipBuySig(signature);
              window.dispatchEvent(new Event("zeruva_ship_changed"));
              await refreshShip();
            } catch (e: any) {
              setShipError(e?.message || "Upgrade failed");
            } finally {
              setShipBuyWorking(false);
            }
          }}
          onSecondary={() => {
            setShipBuyOpen(false);
            setShipBuySig(null);
          }}
        >
          <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-400">Upgrade to</div>
                <div className="text-xl font-bold">Lv {shipBuyQuote?.level ?? nextLevel}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-400">Price</div>
                <div className="text-xl font-bold">${Number(shipBuyQuote?.priceUsd ?? nextPriceUsd).toFixed(2)}</div>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-400">
              ≈ {Number(shipBuyQuote?.amountSol ?? 0).toFixed(6)} SOL · Rate {Number(shipBuyQuote?.solUsd ?? 0).toFixed(2)} USD/SOL ({shipBuyQuote?.solUsdSource || ""})
            </div>
            {shipBuySig && (
              <div className="mt-3 text-sm text-green-300 break-all">
                Tx: {shipBuySig}
              </div>
            )}
          </div>
        </ConfirmModal>

        <div className="mt-2 text-[11px] text-gray-400 leading-snug">
          {currentLevel >= 3
            ? "Your ship is at max level."
            : "Upgrades increase your available alien slots."}
        </div>
      </div>

      {/* Quote / Treasury */}
      <QuoteCard nextUpgradeUsd={nextPriceUsd} />

      {/* Passive Income / Rewards Card */}
      <RewardsCard
        onRefreshReady={onRefreshRewardsReady}
        onRoiChangeReady={onRoiChangeReady}
        onNextClaimAtChange={setNextClaimAt}
      />

      {wallet.connected && wallet.publicKey && (
        <div className="mt-auto text-xs text-cyan-200 bg-black/40 rounded-xl p-2.5 border border-gray-700">
          <div className="font-semibold mb-2">Connected</div>
          <div className="flex items-center gap-2">
            <div className="font-mono text-lg flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {wallet.publicKey.toBase58()}
            </div>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(wallet.publicKey!.toBase58());
                } catch {
                  // ignore
                }
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-600 text-gray-200 text-xs hover:bg-white/5"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
