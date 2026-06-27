"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useRewards } from "../hooks/useRewards";
import { useState, useEffect, useImperativeHandle, forwardRef, useRef, useMemo } from "react";
import ConfirmModal from "./ConfirmModal";
import { apiRequest } from "../api";

interface RewardsCardProps {
  onRefreshReady?: (refreshFn: () => Promise<void>) => void;
  onRoiChangeReady?: (onRoiChangeFn: () => void) => void;
  onNextClaimAtChange?: (nextClaimAt: Date | null) => void;
}

const RewardsCard = forwardRef<
  { refresh: () => Promise<void> } | undefined,
  RewardsCardProps
>(({ onRefreshReady, onRoiChangeReady, onNextClaimAtChange }, ref) => {
  const wallet = useWallet();
  const walletAddress = wallet.publicKey?.toBase58() ?? null;

  const {
    isLoading,
    error,
    livePoints,
    totalRoiPerDay,
    nextClaimAt,
    getCalculatedValue,
    refresh,
    resetAfterClaim,
    onRoiChange,
  } = useRewards(walletAddress);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const [claimOpen, setClaimOpen] = useState(false);
  const [claimQuote, setClaimQuote] = useState<any>(null);
  const [claimWorking, setClaimWorking] = useState(false);
  const [claimSig, setClaimSig] = useState<string | null>(null);
  const onRefreshReadyRef = useRef(onRefreshReady);
  const lastRegisteredRefreshRef = useRef<(() => Promise<void>) | null>(null);

  // Keep callback ref updated
  useEffect(() => {
    onRefreshReadyRef.current = onRefreshReady;
  }, [onRefreshReady]);

  // Expose refresh function to parent via callback
  // Only register when refresh function reference actually changes (prevents infinite loops)
  useEffect(() => {
    if (
      refresh &&
      refresh !== lastRegisteredRefreshRef.current &&
      onRefreshReadyRef.current
    ) {
      lastRegisteredRefreshRef.current = refresh;
      onRefreshReadyRef.current(refresh);
    }
  }, [refresh]);

  // Expose onRoiChange function to parent
  useEffect(() => {
    if (onRoiChange && onRoiChangeReady) {
      onRoiChangeReady(onRoiChange);
    }
  }, [onRoiChange, onRoiChangeReady]);

  useEffect(() => {
    onNextClaimAtChange?.(nextClaimAt ?? null);
  }, [nextClaimAt, onNextClaimAtChange]);

  useImperativeHandle(ref, () => ({
    refresh,
  }));

  const perSecond = totalRoiPerDay > 0 ? totalRoiPerDay / 86400 : 0; // $/sec from $/day

  const claimCooldownActive = !!nextClaimAt && nextClaimAt.getTime() > Date.now();

  const [cooldownTick, setCooldownTick] = useState(0);
  useEffect(() => {
    if (!claimCooldownActive) return;
    const id = window.setInterval(() => setCooldownTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [claimCooldownActive]);

  const cooldownLabel = useMemo(() => {
    if (!nextClaimAt) return null;
    const ms = nextClaimAt.getTime() - Date.now();
    const s = Math.max(0, Math.ceil(ms / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  }, [nextClaimAt, cooldownTick]);

  async function handleClaim() {
    if (!walletAddress) {
      setClaimError("Connect wallet to claim.");
      return;
    }

    setIsClaiming(true);
    setClaimError(null);
    setClaimSig(null);

    try {
      const expectedUsd = getCalculatedValue();
      const quote = await apiRequest("/claim-sol-intent", {
        method: "POST",
        body: JSON.stringify({ expected_earnings: expectedUsd }),
      });

      setClaimQuote(quote);
      setClaimOpen(true);
    } catch (e: any) {
      setClaimError(e?.message || "Failed to prepare claim");
      await refresh();
    } finally {
      setIsClaiming(false);
    }
  }

  return (
    <div className="w-full rounded-xl p-5 bg-black/60 border border-gray-800 flex flex-col gap-3">
      <div className="flex items-center gap-4">
        {/* Circle with live earnings */}
        <div className="w-36 h-36 rounded-full border border-cyan-500/60 flex flex-col items-center justify-center bg-black/60 shrink-0">          <div className="text-xl text-gray-200 font-semibold relative -top-1">
            Earnings
          </div>
          <div className="text-[28px] leading-none font-bold text-white">
            ${(livePoints ?? 0).toFixed(4)}
          </div>
          <div className="text-xs text-gray-400 mt-1">Live</div>
        </div>

        <div className="flex flex-col text-gray-300 gap-1 min-w-0">
          <div className="text-2xl font-bold text-gray-100 leading-none">
            Passive Income
          </div>
          <div className="text-xl">
            <span className="text-gray-400">ROI:</span>{" "}
            <span className="text-cyan-300 font-semibold">
              {(totalRoiPerDay ?? 0).toFixed(2)} $ / day
            </span>
          </div>
          {isLoading && (
            <div className="text-xs text-gray-500">Updating...</div>
          )}
          {error && <div className="text-xs text-red-400">{error}</div>}
          {claimError && (
            <div className="text-xs text-red-400">{claimError}</div>
          )}
        </div>
      </div>

      {/* Claim Button – keep style consistent with rest of app */}
      <button
        onClick={handleClaim}
        disabled={!walletAddress || isClaiming || claimCooldownActive}
        className="mt-1 w-full py-3.5 rounded-lg bg-cyan-600 text-white text-base font-semibold hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-700"
      >
        {isClaiming
          ? "Preparing..."
          : !walletAddress
            ? "Connect Wallet to Claim"
            : claimCooldownActive
              ? `Next claim in ${cooldownLabel || "…"}`
              : "Claim Earnings"}
      </button>

      <ConfirmModal
        open={claimOpen}
        title="Confirm Claim Rewards"
        subtitle="This will send SOL from the dev treasury to your wallet (quote is locked briefly)."
        primaryText={claimSig ? "Paid" : claimWorking ? "Paying…" : "Confirm Claim"}
        primaryDisabled={!claimQuote?.intentId || claimWorking || !!claimSig}
        onPrimary={async () => {
          if (!claimQuote?.intentId) {
            setClaimOpen(false);
            return;
          }
          setClaimWorking(true);
          setClaimError(null);
          try {
            const paid: any = await apiRequest("/confirm-claim-sol", {
              method: "POST",
              body: JSON.stringify({ intentId: claimQuote.intentId }),
            });
            setClaimSig(paid?.signature || null);
            await refresh();
          } catch (e: any) {
            setClaimError(e?.message || "Claim failed");
            await refresh();
          } finally {
            setClaimWorking(false);
          }
        }}
        onSecondary={() => {
          setClaimOpen(false);
          setClaimSig(null);
        }}
      >
        {claimQuote?.intentId === null ? (
          <div className="text-sm text-gray-300">Nothing to claim right now.</div>
        ) : (
          <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-400">You receive</div>
                <div className="text-xl font-bold">
                  {Number(claimQuote?.amountSol ?? 0).toFixed(6)} SOL
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-400">Earnings</div>
                <div className="text-xl font-bold">
                  ${Number(claimQuote?.earningsUsd ?? 0).toFixed(4)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-400">
              Rate: {Number(claimQuote?.solUsd ?? 0).toFixed(2)} USD/SOL ({claimQuote?.solUsdSource || ""})
            </div>
            {claimSig && (
              <div className="mt-3 text-sm text-green-300 break-all">
                Paid tx: {claimSig}
              </div>
            )}
          </div>
        )}
      </ConfirmModal>
    </div>
  );
});

RewardsCard.displayName = "RewardsCard";

export default RewardsCard;
