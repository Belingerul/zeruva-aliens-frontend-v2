"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { getShipWithSlots, type ShipWithSlots } from "../api";
import RewardsCard from "./RewardsCard";
import QuoteCard from "./QuoteCard";import ConfirmModal from "./ConfirmModal";
import { useEffect, useMemo, useState } from "react";
import { getConnection } from "../utils/solanaConnection";

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

  const { currentLevel, nextLevel, nextPriceUsd, currentSlots, nextSlots } = useMemo(() => {
    const level = ship?.level ?? 1;
    const maxLevel = 3;
    const next = Math.min(maxLevel, level + 1);
    const prices: Record<number, number> = { 1: 30, 2: 60, 3: 120 };
    return {
      currentLevel: level,
      nextLevel: next,
      nextPriceUsd: prices[next] ?? 0,
      currentSlots: level * 2,
      nextSlots: next * 2,
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
    <div className="w-full lg:w-96 xl:w-[26rem] rounded-xl p-5 lg:p-5 bg-black/60 backdrop-blur-sm border border-gray-800 h-auto lg:h-full lg:self-stretch flex flex-col gap-4 lg:gap-3 lg:justify-evenly overflow-hidden">
      {/* Spin Section */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.08] via-cyan-500/[0.02] to-transparent p-4">
        <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="relative flex items-center justify-between gap-3 mb-2">
          <h3 className="text-2xl font-black tracking-tight bg-gradient-to-r from-cyan-300 via-cyan-200 to-blue-400 bg-clip-text text-transparent">
            Hatchery
          </h3>
          <button
            onClick={onOpenSpin}
            disabled={isDisabled}
            title="Open the egg spinner"
            className="shrink-0 px-4 py-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 text-cyan-100 text-xs font-bold uppercase tracking-[0.18em] hover:bg-cyan-500/25 hover:border-cyan-300/70 active:scale-95 transition-all shadow-[0_0_18px_-7px_rgba(34,211,238,0.9)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Hatch
          </button>
        </div>
        <p className="relative text-xs leading-snug text-cyan-50/90">
          Hatch a{" "}
          <span className="font-bold text-cyan-300">random alien</span> —{" "}
          <span className="font-bold text-amber-300">rarer eggs</span> roll{" "}
          <span className="font-bold text-emerald-300">better odds</span>.
        </p>
      </div>

      {/* Spaceship Section */}
      <div className="relative overflow-hidden rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-500/[0.08] via-purple-500/[0.02] to-transparent p-4">
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-purple-500/10 blur-2xl" />
        <div className="relative flex items-center justify-between gap-3 mb-2">
          <h3 className="text-2xl font-black tracking-tight bg-gradient-to-r from-purple-300 via-fuchsia-200 to-cyan-300 bg-clip-text text-transparent">Spaceship</h3>
          <button
            onClick={handleUpgradeSpaceship}
            disabled={!canUpgrade || shipLoading}
            title="Upgrade your spaceship"
            className="shrink-0 px-4 py-1.5 rounded-lg border-2 border-purple-400/50 bg-purple-500/15 text-purple-100 text-xs font-bold uppercase tracking-[0.16em] hover:bg-purple-500/25 hover:border-purple-300/80 active:scale-95 transition-all shadow-[0_0_18px_-7px_rgba(168,85,247,0.9)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {currentLevel >= 3 ? "Maxed" : "Upgrade"}
          </button>
        </div>

        {shipError && (
          <div className="relative text-xs text-red-400 mb-2">{shipError}</div>
        )}

        {/* Concrete upgrade benefit — replaces the old "increases slots" note */}
        <div className="relative flex items-center justify-center gap-2.5 mb-3 text-sm">
          {currentLevel >= 3 ? (
            <span className="font-semibold text-purple-200/80">
              Fully upgraded · {currentSlots} alien slots
            </span>
          ) : (
            <>
              <span className="font-semibold text-gray-300">{currentSlots} slots</span>
              <span className="text-purple-300/80">→</span>
              <span className="font-bold text-cyan-300">{nextSlots} slots</span>
              <span className="text-gray-600">·</span>
              <span className="font-semibold text-purple-200/80">${nextPriceUsd}</span>
            </>
          )}
        </div>

        <ConfirmModal
          open={shipBuyOpen}
          title="Confirm Spaceship Upgrade"
          subtitle="Review the quote and sign the transaction."
          primaryText={shipBuySig ? "Confirmed" : shipBuyWorking ? "Confirming…" : "Confirm & Sign"}
          primaryDisabled={(!shipBuyQuote?.serialized && !shipBuyQuote?.devSkip) || shipBuyWorking || !!shipBuySig}
          onPrimary={async () => {
            if (!shipBuyQuote) return;
            setShipBuyWorking(true);
            setShipError(null);

            // Dev skip: no wallet signing needed
            if (shipBuyQuote.devSkip) {
              try {
                const { confirmBuySpaceship } = await import("../api");
                const devSig = `dev-skip-${Date.now()}`;
                await confirmBuySpaceship(shipBuyQuote.level, devSig, shipBuyQuote.intentId);
                setShipBuySig(devSig);
                window.dispatchEvent(new Event("zeruva_ship_changed"));
                await refreshShip();
              } catch (e: any) {
                setShipError(e?.message || "Upgrade failed");
              } finally {
                setShipBuyWorking(false);
              }
              return;
            }

            if (!shipBuyQuote.serialized) return;
            if (!wallet.signTransaction) {
              setShipError("Wallet doesn't support transaction signing");
              setShipBuyWorking(false);
              return;
            }

            try {
              const { Transaction } = await import("@solana/web3.js");
              const { confirmBuySpaceship } = await import("../api");
              const connection = getConnection("confirmed");

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
      </div>

      {/* Quote / Treasury */}
      <QuoteCard nextUpgradeUsd={nextPriceUsd} />

      {/* Passive Income / Rewards Card */}
      <RewardsCard
        onRefreshReady={onRefreshRewardsReady}
        onRoiChangeReady={onRoiChangeReady}
        onNextClaimAtChange={setNextClaimAt}
      />
    </div>
  );
}
