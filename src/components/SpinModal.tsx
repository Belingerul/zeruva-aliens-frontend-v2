"use client";

import { useState, useEffect } from "react";
import { motion, useAnimation } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  spin,
  getRandomAliens,
  API_BASE_URL,
  buyEgg,
  confirmBuyEgg,
} from "../api";
import ConfirmModal from "./ConfirmModal";

type Tier = "Nothing" | "Common" | "Rare" | "Epic" | "Legendary";

const tierGlow: Record<Tier, string> = {
  Nothing: "shadow-[0_0_20px_rgba(100,100,100,0.4)]",
  Common: "shadow-[0_0_30px_rgba(34,197,94,0.6)]",
  Rare: "shadow-[0_0_30px_rgba(59,130,246,0.6)]",
  Epic: "shadow-[0_0_40px_rgba(168,85,247,0.7)]",
  Legendary: "shadow-[0_0_50px_rgba(234,179,8,0.8)]",
};

const tierColor: Record<Tier, string> = {
  Nothing: "text-gray-500",
  Common: "text-green-500",
  Rare: "text-blue-500",
  Epic: "text-purple-500",
  Legendary: "text-yellow-500",
};

interface SpinModalProps {
  onClose: () => void;
  onSpinComplete?: () => void;
}

export default function SpinModal({ onClose, onSpinComplete }: SpinModalProps) {
  const wallet = useWallet();
  const [strip, setStrip] = useState<
    { id: number; image: string; tier?: string; roi?: number }[]
  >([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<{
    tier: Tier;
    roi: number;
    id: number | null;
    image: string;
    db_id: number | null;
  } | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [lastQuote, setLastQuote] = useState<{
    eggType: "basic" | "rare" | "ultra";
    priceUsd: number;
    amountSol: number;
    solUsd: number;
    solUsdSource: string;
  } | null>(null);

  const controls = useAnimation();

  const BASE_COUNT = 16;
  const RUNWAY_REPEAT = 4;

  // Make the spin track usable on phones (bigger viewport relative to cell).
  const CELL_WIDTH =
    typeof window !== "undefined" && window.innerWidth < 480 ? 120 : 160;

  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => {
        if (onSpinComplete) {
          onSpinComplete();
        }
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [result, onClose, onSpinComplete]);

  const ensureHttps = (url: string) => {
    if (!url) return url;
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:" &&
      url.startsWith("http://")
    ) {
      // Avoid mixed-content blocking when the frontend is opened via HTTPS tunnel.
      return url.replace("http://", "https://");
    }
    return url;
  };

  const preloadImages = (imageUrls: string[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      let loadedCount = 0;
      const totalImages = imageUrls.length;

      if (totalImages === 0) {
        resolve();
        return;
      }

      imageUrls.forEach((url) => {
        const img = new Image();
        img.onload = () => {
          loadedCount++;
          if (loadedCount === totalImages) {
            resolve();
          }
        };
        img.onerror = () => {
          loadedCount++;
          if (loadedCount === totalImages) {
            resolve();
          }
        };
        img.src = url;
      });
    });
  };

  const [buyOpen, setBuyOpen] = useState(false);
  const [buyEggType, setBuyEggType] = useState<"basic" | "rare" | "ultra" | null>(null);
  const [buyQuote, setBuyQuote] = useState<any>(null);
  const [buyWorking, setBuyWorking] = useState(false);

  async function buyAndSpin(eggType: "basic" | "rare" | "ultra") {
    if (isSpinning) return;

    if (!wallet.connected || !wallet.publicKey) {
      alert("Please connect wallet.");
      onClose();
      return;
    }

    try {
      const walletAddress = wallet.publicKey.toBase58();
      const quote = await buyEgg(eggType);
      const { intentId, amountSol, solUsd, solUsdSource, priceUsd } = quote;

      setLastQuote({ eggType, priceUsd, amountSol, solUsd, solUsdSource });

      // Dev mode: skip wallet signing entirely
      if ((quote as any).devSkip) {
        await confirmBuyEgg(eggType, `dev-skip-${Date.now()}`, intentId);
        await startSpin(eggType);
        return;
      }

      // Prepare quote and show in-app confirmation modal.
      setBuyEggType(eggType);
      setBuyQuote({ serialized: quote.serialized, intentId, amountSol, solUsd, solUsdSource, priceUsd, eggType });
      setBuyOpen(true);
      return;

      const { Transaction, Connection } = await import("@solana/web3.js");
      const connection = new Connection(
        process.env.VITE_RPC_URL || "https://api.devnet.solana.com",
        "confirmed",
      );

      const tx = Transaction.from(Buffer.from(serialized, "base64"));

      if (!wallet.signTransaction) {
        alert("Wallet doesn't support transaction signing");
        return;
      }

      // Make sure the user has devnet SOL for fees + payment
      const balance = await connection.getBalance(
        wallet.publicKey,
        "confirmed",
      );
      if (balance < 0.001 * 1e9) {
        alert(
          "You have 0 SOL (devnet). Get devnet SOL (airdrop) then try again.",
        );
        return;
      }

      // Prefer wallet-adapter sendTransaction when available
      let sig: string;
      if (wallet.sendTransaction) {
        sig = await wallet.sendTransaction(tx, connection);
      } else {
        const signed = await wallet.signTransaction(tx);
        sig = await connection.sendRawTransaction(signed.serialize());
      }

      await connection.confirmTransaction(sig, "confirmed");

      // Confirm with backend using the intentId (locks in the SOL/USD quote used to build the tx)
      await confirmBuyEgg(eggType, sig, intentId);

      // After crediting, run the normal spin flow
      await startSpin(eggType);
    } catch (e: any) {
      console.error("Buy egg failed", e);
      alert(`Buy egg failed: ${e.message || "Unknown error"}`);
    }
  }

  async function startSpin(eggType: "basic" | "rare" | "ultra") {
    if (isSpinning) return;

    if (!wallet.connected || !wallet.publicKey) {
      alert("Please connect wallet.");
      onClose();
      return;
    }

    setIsSpinning(true);
    setResult(null);
    setImagesLoaded(false);

    try {
      // wallet address no longer sent to backend (auth token identifies user)

      let baseStrip = await getRandomAliens(BASE_COUNT);

      while (baseStrip.length < BASE_COUNT) {
        baseStrip = [...baseStrip, ...baseStrip];
      }
      baseStrip = baseStrip.slice(0, BASE_COUNT);

      // Serve locally from Next public/ so it works the same on localhost + HTTPS tunnels.
      const nothingPngUrl = "/static/nothing.png";
      const allImages = [
        ...baseStrip.map((a) => ensureHttps(a.image)),
        nothingPngUrl,
      ];
      await preloadImages(allImages);
      setImagesLoaded(true);

      const decoratedStrip = baseStrip.map((a) => ({
        ...a,
        tier: "Common",
        roi: 2,
      }));

      // Inject permanent "Nothing" tile at random position (purely visual)
      const permanentNothingIndex = Math.floor(
        Math.random() * decoratedStrip.length,
      );
      decoratedStrip[permanentNothingIndex] = {
        id: -999,
        image: nothingPngUrl,
        tier: "Nothing",
        roi: 0,
      };

      const runway: {
        id: number;
        image: string;
        tier?: string;
        roi?: number;
      }[] = [];
      for (let i = 0; i < RUNWAY_REPEAT; i++) {
        runway.push(...decoratedStrip);
      }

      const spinResult = await spin(eggType);
      const winner = spinResult.alien;

      // Calculate where the permanent Nothing appears in the runway
      // It appears at: permanentNothingIndex, permanentNothingIndex + BASE_COUNT, permanentNothingIndex + 2*BASE_COUNT, etc.
      // We'll use the one in the middle section (around index BASE_COUNT * 2)
      const permanentNothingRunwayIndex =
        BASE_COUNT * 2 + permanentNothingIndex;

      let winnerSlotIndex: number;
      if (spinResult.tier === "Nothing") {
        // If result is "Nothing", land near the permanent Nothing tile (±1 or ±2 cells)
        const offset = Math.floor(Math.random() * 5) - 2; // -2, -1, 0, 1, or 2
        winnerSlotIndex = permanentNothingRunwayIndex + offset;
        // Ensure it's within bounds
        winnerSlotIndex = Math.max(
          0,
          Math.min(winnerSlotIndex, runway.length - 1),
        );
      } else {
        // If result is NOT "Nothing", use the normal center position
        // The permanent Nothing stays visible but won't be centered
        winnerSlotIndex = BASE_COUNT * 2 + Math.floor(BASE_COUNT / 2);
      }

      runway[winnerSlotIndex] = {
        id: winner.id ?? -1,
        image: ensureHttps(winner.image),
        tier: spinResult.tier,
        roi: spinResult.roi,
      };

      setStrip([]);

      await controls.start({
        x: 0,
        transition: { duration: 0 },
      });

      setStrip(runway);

      const randomOffset = (Math.random() - 0.5) * (CELL_WIDTH * 0.3);
      const finalX =
        -(winnerSlotIndex * CELL_WIDTH + CELL_WIDTH / 2) + randomOffset;

      const duration = 3 + Math.random() * 1.5;
      const easingOptions = [
        [0.22, 1, 0.36, 1],
        [0.33, 1, 0.68, 1],
        [0.25, 0.46, 0.45, 0.94],
      ];
      const ease =
        easingOptions[Math.floor(Math.random() * easingOptions.length)];

      await controls.start({
        x: finalX,
        transition: { duration, ease },
      });

      setResult({
        tier: spinResult.tier as Tier,
        roi: spinResult.roi,
        id: winner.id,
        image: ensureHttps(winner.image),
        db_id: spinResult.db_id,
      });
    } catch (err: any) {
      alert("Spin error: " + (err.message || "Unknown error"));
    } finally {
      setIsSpinning(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-4xl rounded-xl bg-gradient-to-br from-gray-900 to-black border border-gray-700 p-4 sm:p-6">
        <button
          className="absolute top-4 right-4 bg-gray-800 px-3 py-1 rounded-lg border border-gray-700 text-white disabled:opacity-50"
          onClick={() => !isSpinning && onClose()}
          disabled={isSpinning}
        >
          Close
        </button>

        <h2 className="text-xl sm:text-2xl text-white font-bold mb-4 sm:mb-6">
          Choose Your Egg
        </h2>

        <div className="flex flex-wrap gap-3 sm:gap-4 mb-3 sm:mb-4">
          <button
            disabled={isSpinning || !wallet.connected}
            onClick={() => buyAndSpin("basic")}
            className="px-6 py-3 bg-green-600 rounded-lg text-white font-semibold disabled:opacity-50"
          >
            Basic Egg ($20)
          </button>

          <button
            disabled={isSpinning || !wallet.connected}
            onClick={() => buyAndSpin("rare")}
            className="px-6 py-3 bg-blue-600 rounded-lg text-white font-semibold disabled:opacity-50"
          >
            Rare Egg ($40)
          </button>

          <button
            disabled={isSpinning || !wallet.connected}
            onClick={() => buyAndSpin("ultra")}
            className="px-6 py-3 bg-purple-600 rounded-lg text-white font-semibold disabled:opacity-50"
          >
            Ultra Egg ($60)
          </button>
        </div>

        {lastQuote && (
          <div className="mb-4 rounded-lg border border-gray-700 bg-black/40 px-4 py-3 text-sm text-gray-200">
            <div className="font-semibold text-white">Last price quote</div>
            <div>
              ${lastQuote.priceUsd} ≈ {lastQuote.amountSol.toFixed(4)} SOL
              <span className="text-gray-400"> (SOL/USD: {lastQuote.solUsd.toFixed(2)} via {lastQuote.solUsdSource})</span>
            </div>
          </div>
        )}

        {isSpinning && !imagesLoaded && (
          <div className="text-center text-cyan-400 mb-4">
            Loading images...
          </div>
        )}

        <div className="relative h-44 sm:h-48 md:h-60 overflow-hidden rounded-xl border-2 border-cyan-500/30 bg-black">
          {/* Left fade */}
          <div className="absolute inset-y-0 left-0 w-16 sm:w-24 md:w-32 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />

          {/* Right fade */}
          <div className="absolute inset-y-0 right-0 w-16 sm:w-24 md:w-32 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-cyan-400 z-20" />

          <motion.div
            animate={controls}
            initial={{ x: 0 }}
            className="absolute left-1/2 top-1/2 -translate-y-1/2 flex"
            style={{ willChange: "transform" }}
          >
            {strip.map((a, i) => {
              const tier = a.tier as Tier | undefined;
              const roi = a.roi;

              return (
                <div
                  key={`cell-${i}`}
                  className="flex flex-col items-center justify-center bg-gray-800 border border-gray-700 rounded-lg p-2"
                  style={{ width: `${CELL_WIDTH}px` }}
                >
                  <img
                    src={a.image || "/placeholder.svg"}
                    alt={`Alien ${a.id}`}
                    className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="w-full bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-600 rounded px-2 py-1 mt-2">
                    <div
                      className={`text-xs font-bold text-center ${tier ? tierColor[tier] : "text-gray-400"}`}
                    >
                      {tier || "Common"}
                    </div>
                    <div className="text-xs text-cyan-400 text-center font-semibold">
                      {roi !== undefined
                        ? `${roi.toFixed(1)} $ / day`
                        : "0.0 $ / day"}
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </div>

        {result && (
          <div
            className={`mt-6 p-6 rounded-xl border-2 ${tierGlow[result.tier]}`}
          >
            <div className="flex items-center gap-4">
              <img
                src={result.image || "/placeholder.svg"}
                className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg bg-gray-900 p-2"
                loading="lazy"
                decoding="async"
              />
              <div>
                <div className={`text-2xl font-bold ${tierColor[result.tier]}`}>
                  {result.tier}
                </div>
                {result.tier === "Nothing" ? (
                  <>
                    <div className="text-gray-400 text-sm mt-1">
                      You got nothing this time. Try another egg.
                    </div>
                    <div className="text-red-400 font-semibold text-sm mt-2">
                      {result.roi.toFixed(1)} $ / day
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-gray-300 text-lg">Alien #{result.id}</div>
                    <div className="text-cyan-400 font-semibold">
                      {result.roi.toFixed(1)} $ / day
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          open={buyOpen}
          title="Confirm Egg Purchase"
          subtitle="Review the quote and sign the transaction."
          primaryText={buyWorking ? "Confirming…" : "Confirm & Sign"}
          primaryDisabled={(!buyQuote?.serialized && !buyQuote?.devSkip) || buyWorking}
          onPrimary={async () => {
            if (!buyEggType) return;
            setBuyWorking(true);

            // Dev skip: no wallet signing needed
            if (buyQuote?.devSkip) {
              try {
                await confirmBuyEgg(buyEggType, `dev-skip-${Date.now()}`, buyQuote.intentId);
                setBuyOpen(false);
                setBuyWorking(false);
                await startSpin(buyEggType);
              } catch (e: any) {
                alert(`Buy egg failed: ${e.message || "Unknown error"}`);
                setBuyWorking(false);
              }
              return;
            }

            if (!buyQuote?.serialized) return;
            if (!wallet.signTransaction) {
              alert("Wallet doesn't support transaction signing");
              setBuyWorking(false);
              return;
            }

            try {
              const { Transaction, Connection } = await import("@solana/web3.js");
              const connection = new Connection(
                process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
                "confirmed",
              );

              const tx = Transaction.from(Buffer.from(buyQuote.serialized, "base64"));

              // Make sure the user has devnet SOL for fees + payment
              const balance = await connection.getBalance(wallet.publicKey!, "confirmed");
              if (balance < 0.001 * 1e9) {
                alert("You have 0 SOL (devnet). Get devnet SOL (airdrop) then try again.");
                return;
              }

              let sig: string;
              if (wallet.sendTransaction) {
                sig = await wallet.sendTransaction(tx, connection);
              } else {
                const signed = await wallet.signTransaction(tx);
                sig = await connection.sendRawTransaction(signed.serialize());
              }

              await connection.confirmTransaction(sig, "confirmed");

              await confirmBuyEgg(buyEggType, sig, buyQuote.intentId);

              setBuyOpen(false);
              setBuyWorking(false);

              await startSpin(buyEggType);
            } catch (e: any) {
              console.error("Buy egg failed", e);
              alert(`Buy egg failed: ${e.message || "Unknown error"}`);
            } finally {
              setBuyWorking(false);
            }
          }}
          onSecondary={() => {
            setBuyOpen(false);
            setBuyWorking(false);
          }}
        >
          <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-400">Egg</div>
                <div className="text-xl font-bold capitalize">{buyQuote?.eggType}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-400">Price</div>
                <div className="text-xl font-bold">${Number(buyQuote?.priceUsd ?? 0).toFixed(2)}</div>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-400">
              ≈ {Number(buyQuote?.amountSol ?? 0).toFixed(6)} SOL · Rate {Number(buyQuote?.solUsd ?? 0).toFixed(2)} USD/SOL ({buyQuote?.solUsdSource || ""})
            </div>
          </div>
        </ConfirmModal>
      </div>
    </div>
  );
}
