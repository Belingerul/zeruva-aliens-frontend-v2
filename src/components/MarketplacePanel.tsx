"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction } from "@solana/web3.js";
import TopBar from "./TopBar";
import {
  getMarketplaceListings,
  getListingsBySeller,
  getAliens,
  getSolUsd,
  listAlienForSale,
  confirmListing,
  unlistAlien,
  buyListing,
  confirmBuyListing,
  AUTH_CHANGED_EVENT,
  type MarketplaceListing,
  type AlienWithStats,
} from "../api";
import { ensureAuth } from "../utils/ensureAuth";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

const TIER_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  Legendary: { border: "border-orange-400/60", bg: "bg-orange-400/10", text: "text-orange-300" },
  Epic:       { border: "border-purple-400/60", bg: "bg-purple-400/10", text: "text-purple-300" },
  Rare:       { border: "border-blue-400/60",   bg: "bg-blue-400/10",   text: "text-blue-300"   },
  Common:     { border: "border-gray-500/60",   bg: "bg-gray-500/10",   text: "text-gray-400"   },
  Nothing:    { border: "border-gray-700/40",   bg: "bg-gray-700/10",   text: "text-gray-600"   },
};

const TIER_ICON: Record<string, string> = {
  Common: "/icons/tier-common.png",
  Rare: "/icons/tier-rare.png",
  Epic: "/icons/tier-epic.png",
  Legendary: "/icons/tier-legendary.png",
};

function tierStyle(tier: string) {
  return TIER_COLORS[tier] ?? TIER_COLORS.Common;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function AlienCard({
  image,
  alienId,
  tier,
  roi,
  priceSol,
  sellerAddr,
  action,
}: {
  image: string;
  alienId: number;
  tier: string;
  roi: number;
  priceSol?: number;
  sellerAddr?: string;
  action?: React.ReactNode;
}) {
  const ts = tierStyle(tier);
  return (
    <div
      className={`rounded-xl border ${ts.border} ${ts.bg} bg-black/40 flex flex-col overflow-hidden`}
    >
      <div className="relative">
        <img
          src={image}
          alt={`Alien #${alienId}`}
          className="w-full aspect-square object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
        />
      </div>
      <div className="flex flex-col gap-1 p-2.5 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-gray-200 truncate">Alien #{alienId}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {TIER_ICON[tier] && (
            <img src={`${TIER_ICON[tier]}?v=2`} alt="" className="w-4 h-4 object-contain shrink-0" />
          )}
          <span className={`text-[10px] font-bold uppercase tracking-wide ${ts.text}`}>{tier}</span>
        </div>
        <div className="text-[11px] text-gray-400">${roi}/day ROI</div>
        {priceSol !== undefined && (
          <div className="text-sm font-bold text-emerald-300 mt-0.5">{priceSol} SOL</div>
        )}
        {sellerAddr && (
          <div className="text-[10px] text-gray-500">{shortAddr(sellerAddr)}</div>
        )}
        {action && <div className="mt-auto pt-2">{action}</div>}
      </div>
    </div>
  );
}

export default function MarketplacePanel() {
  const wallet = useWallet();
  const [tab, setTab] = useState<"browse" | "myaliens" | "mylistings">("browse");

  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [myListingsAuthed, setMyListingsAuthed] = useState<MarketplaceListing[]>([]);
  const [myAliens, setMyAliens] = useState<AlienWithStats[]>([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // List modal
  const [listTarget, setListTarget] = useState<AlienWithStats | null>(null);
  const [listPrice, setListPrice] = useState("");
  const [listWorking, setListWorking] = useState(false);

  // Buy modal
  const [buyTarget, setBuyTarget] = useState<MarketplaceListing | null>(null);
  const [buyWorking, setBuyWorking] = useState(false);
  const [buyDone, setBuyDone] = useState(false);

  const walletAddr = wallet.publicKey?.toBase58() ?? null;

  const [solUsd, setSolUsd] = useState(100);
  useEffect(() => {
    getSolUsd().then((p) => { if (p?.solUsd > 0) setSolUsd(p.solUsd); }).catch(() => {});
  }, []);

  const loadListings = useCallback(async () => {
    try {
      const data = await getMarketplaceListings();
      setListings(data);
    } catch { /* silent */ }
  }, []);

  const loadMyData = useCallback(async () => {
    if (!walletAddr) return;
    // Aliens come from a public endpoint — must never be blocked by auth state.
    try {
      setMyAliens(await getAliens(walletAddr));
    } catch { /* backend unreachable */ }
    // My-listings needs a JWT. If we aren't authed yet, show none rather than
    // failing the whole load; ensureAuth() during list/buy will refresh this.
    try {
      setMyListingsAuthed(await getListingsBySeller(walletAddr));
    } catch {
      setMyListingsAuthed([]);
    }
  }, [walletAddr]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadListings(), walletAddr ? loadMyData() : Promise.resolve()])
      .finally(() => setLoading(false));
  }, [walletAddr, loadListings, loadMyData]);

  // Reload owned data after silent re-auth / wallet switches.
  useEffect(() => {
    const handler = () => { loadMyData(); };
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, handler);
  }, [loadMyData]);

  // Poll listings every 15s
  useEffect(() => {
    const id = setInterval(loadListings, 15000);
    return () => clearInterval(id);
  }, [loadListings]);

  // After a restart the JWT may not be re-established yet, so the authed
  // my-listings call can come back empty. The public Browse list already carries
  // our active listings (seller_wallet is public), so merge them in as a fallback
  // — keyed by id, with the authed rows (which include `status`) taking
  // precedence so the "Finalizing escrow…" badge still works.
  const myListings = useMemo(() => {
    const byId = new Map<number, MarketplaceListing>();
    if (walletAddr) {
      for (const l of listings) {
        if (l.seller_wallet === walletAddr) byId.set(l.id, l);
      }
    }
    for (const l of myListingsAuthed) byId.set(l.id, l);
    return Array.from(byId.values());
  }, [listings, myListingsAuthed, walletAddr]);

  const listedAlienIds = new Set(myListings.map((l) => l.alien_db_id));

  // ── List For Sale ──
  async function handleList() {
    if (!listTarget || !listPrice) return;
    // Price is typed in DOLLARS, converted to SOL at the live rate.
    const usd = parseFloat(listPrice.replace(",", "."));
    if (isNaN(usd) || usd <= 0) { setErr("Enter a valid price."); return; }
    const price = Number((usd / solUsd).toFixed(6));
    setListWorking(true);
    setErr(null);
    try {
      await ensureAuth(wallet);
      const resp = await listAlienForSale(listTarget.id, price);
      // On-chain escrow: sign the NFT transfer into escrow, then activate.
      if (resp.escrow && resp.serialized) {
        const connection = new Connection(RPC_URL, "confirmed");
        const tx = Transaction.from(Buffer.from(resp.serialized, "base64"));
        const signed = await wallet.signTransaction!(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, "confirmed");
        await confirmListing(resp.listingId);
      }
      setListTarget(null);
      setListPrice("");
      await loadMyData();
      await loadListings();
    } catch (e: any) {
      setErr(e?.message || "Failed to list");
    } finally {
      setListWorking(false);
    }
  }

  // ── Unlist ──
  async function handleUnlist(listingId: number) {
    setErr(null);
    try {
      await ensureAuth(wallet);
      await unlistAlien(listingId);
      await loadMyData();
      await loadListings();
    } catch (e: any) {
      setErr(e?.message || "Failed to unlist");
    }
  }

  // ── Buy ──
  async function handleBuy() {
    if (!buyTarget) return;
    setBuyWorking(true);
    setBuyDone(false);
    setErr(null);
    try {
      await ensureAuth(wallet);
      const quote = await buyListing(buyTarget.id);

      if (quote.devSkip) {
        await confirmBuyListing(buyTarget.id, quote.intentId, null);
      } else {
        const connection = new Connection(RPC_URL, "confirmed");
        const tx = Transaction.from(Buffer.from(quote.serialized!, "base64"));
        const signed = await wallet.signTransaction!(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, "confirmed");
        await confirmBuyListing(buyTarget.id, quote.intentId, sig);
      }

      setBuyDone(true);
      await loadListings();
      await loadMyData();
      setTimeout(() => { setBuyTarget(null); setBuyDone(false); }, 1800);
    } catch (e: any) {
      setErr(e?.message || "Purchase failed");
    } finally {
      setBuyWorking(false);
    }
  }

  const tabClass = (t: typeof tab) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
      tab === t
        ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
        : "text-gray-400 hover:text-gray-200"
    }`;

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-br from-gray-950 via-gray-900 to-black">
      <TopBar backHref="/" title="The Marketplace" />

      <div className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-5">

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active Listings", value: listings.length },
            { label: "My Aliens",       value: myAliens.length },
            { label: "My Listings",     value: myListings.length },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-emerald-500/20 bg-black/40 p-3 text-center">
              <div className="text-xl font-bold text-emerald-300">{value}</div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button className={tabClass("browse")}    onClick={() => setTab("browse")}>Browse</button>
          <button className={tabClass("myaliens")}  onClick={() => setTab("myaliens")}>My Aliens</button>
          <button className={tabClass("mylistings")} onClick={() => setTab("mylistings")}>My Listings</button>
        </div>

        {err && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            {err}
            <button className="ml-3 text-red-500 hover:text-red-300" onClick={() => setErr(null)}><img src="/icons/ui-close.png" alt="close" className="w-3.5 h-3.5 object-contain inline-block align-middle" /></button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 text-gray-500 text-sm py-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/spinner.png" alt="" className="w-10 h-10 object-contain animate-spin" style={{ animationDuration: "2.6s" }} />
            Loading…
          </div>
        )}

        {/* ── BROWSE ── */}
        {!loading && tab === "browse" && (
          <>
            {listings.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500 py-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/empty-no-aliens.png" alt="" className="w-16 h-16 object-contain mx-auto mb-3" />
                  <div className="text-sm">No aliens listed yet. Be the first!</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {listings.map((l) => (
                  <AlienCard
                    key={l.id}
                    image={l.image}
                    alienId={l.alien_id}
                    tier={l.tier}
                    roi={l.roi}
                    priceSol={Number(l.price_sol)}
                    sellerAddr={l.seller_wallet}
                    action={
                      l.seller_wallet === walletAddr ? (
                        <div className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/5 text-emerald-300/90 text-[10px] font-semibold uppercase tracking-[0.18em]">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          </span>
                          Your Listing
                        </div>
                      ) : (
                        <button
                          onClick={() => { setBuyTarget(l); setBuyDone(false); setErr(null); }}
                          className="w-full py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 transition-colors"
                        >
                          Buy
                        </button>
                      )
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── MY ALIENS ── */}
        {!loading && tab === "myaliens" && (
          <>
            {!walletAddr ? (
              <div className="text-center text-gray-500 py-20 text-sm">Connect your wallet to see your aliens.</div>
            ) : myAliens.length === 0 ? (
              <div className="text-center text-gray-500 py-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/empty-no-aliens.png" alt="" className="w-16 h-16 object-contain mx-auto mb-3" />
                <div className="text-sm">No aliens yet. Hatch some in The Colony!</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {myAliens.map((a) => {
                  const alreadyListed = listedAlienIds.has(a.id);
                  return (
                    <AlienCard
                      key={a.id}
                      image={a.image}
                      alienId={a.alien_id ?? a.id}
                      tier={a.tier}
                      roi={a.roi}
                      action={
                        alreadyListed ? (
                          <span className="text-[11px] text-emerald-500/70 italic">Listed ✓</span>
                        ) : (
                          <button
                            onClick={() => { setListTarget(a); setListPrice(""); setErr(null); }}
                            className="w-full py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 transition-colors"
                          >
                            List for Sale
                          </button>
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── MY LISTINGS ── */}
        {!loading && tab === "mylistings" && (
          <>
            {!walletAddr ? (
              <div className="text-center text-gray-500 py-20 text-sm">Connect your wallet.</div>
            ) : myListings.length === 0 ? (
              <div className="text-center text-gray-500 py-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/empty-no-items.png" alt="" className="w-16 h-16 object-contain mx-auto mb-3" />
                <div className="text-sm">No active listings. Go to My Aliens to list one.</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {myListings.map((l) => (
                  <AlienCard
                    key={l.id}
                    image={l.image}
                    alienId={l.alien_id}
                    tier={l.tier}
                    roi={l.roi}
                    priceSol={Number(l.price_sol)}
                    action={
                      <div className="flex flex-col gap-1.5">
                        {l.status === "pending_escrow" && (
                          <span className="text-[10px] text-amber-400/90 text-center">⏳ Finalizing escrow…</span>
                        )}
                        <button
                          onClick={() => handleUnlist(l.id)}
                          className="w-full py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                        >
                          {l.status === "pending_escrow" ? "Cancel" : "Unlist"}
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── LIST MODAL ── */}
      {listTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !listWorking && setListTarget(null)} />
          <div className="relative w-full max-w-md rounded-3xl border border-emerald-500/30 bg-gray-950 p-8 shadow-2xl">
            <h3 className="text-2xl font-extrabold text-white mb-1">List for Sale</h3>
            <p className="text-sm text-gray-400 mb-5">
              Alien #{listTarget.alien_id ?? listTarget.id} · {listTarget.tier} · ${listTarget.roi}/day
            </p>

            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider font-semibold">Price (USD)</label>
            <div className="relative mb-2">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-extrabold text-emerald-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
                placeholder="25"
                className="w-full rounded-xl bg-black/60 border border-gray-700 text-white pl-10 pr-4 py-4 text-2xl font-bold tabular-nums focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <div className="text-sm text-gray-500 mb-5 tabular-nums">
              ≈ ◎{(() => { const u = parseFloat(listPrice.replace(",", ".")); return isNaN(u) || u <= 0 ? "0.000" : (u / solUsd).toFixed(4); })()} SOL
              <span className="text-gray-600"> · 1 SOL = ${solUsd.toFixed(0)}</span>
            </div>

            <div className="text-[11px] text-amber-300/80 mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 leading-relaxed">
              You&apos;ll sign a transfer of this alien&apos;s NFT into escrow (the marketplace holds it until it sells).
              That costs only a tiny network fee + ~0.002 SOL account rent — <span className="font-semibold">not</span> your
              listing price. On devnet it can take a few seconds.
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setListTarget(null)}
                disabled={listWorking}
                className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleList}
                disabled={listWorking || !listPrice}
                className="flex-1 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
              >
                {listWorking ? "Listing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BUY MODAL ── */}
      {buyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !buyWorking && setBuyTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-gray-950 p-6 shadow-2xl">
            {buyDone ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">✅</div>
                <div className="text-lg font-bold text-white">Purchase complete!</div>
                <div className="text-sm text-gray-400 mt-1">Alien #{buyTarget.alien_id} is now yours.</div>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white mb-1">Buy Alien</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Alien #{buyTarget.alien_id} · {buyTarget.tier} · ${buyTarget.roi}/day
                </p>

                <div className="rounded-xl border border-emerald-500/20 bg-black/40 p-4 mb-4 text-center">
                  <img
                    src={buyTarget.image}
                    alt=""
                    className="w-24 h-24 object-cover rounded-lg mx-auto mb-2"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                  />
                  <div className="text-2xl font-bold text-emerald-300">{Number(buyTarget.price_sol)} SOL</div>
                  <div className="text-xs text-gray-500 mt-0.5">from {shortAddr(buyTarget.seller_wallet)}</div>
                </div>

                {err && (
                  <div className="text-xs text-red-400 mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    {err}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => { setBuyTarget(null); setErr(null); }}
                    disabled={buyWorking}
                    className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 text-sm font-semibold hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBuy}
                    disabled={buyWorking}
                    className="flex-1 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                  >
                    {buyWorking ? "Buying…" : "Confirm Buy"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
