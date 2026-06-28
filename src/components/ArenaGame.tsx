"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { io, type Socket } from "socket.io-client";
import TopBar from "./TopBar";
import SolanaLogo from "./SolanaLogo";
import { ensureAuth } from "../utils/ensureAuth";
import { sfx, isMuted, setMuted } from "../utils/sfx";
import { getConnection } from "../utils/solanaConnection";
import {
  apiStaticUrl,
  arenaConfirmDeposit,
  arenaDeposit,
  arenaDevTopup,
  arenaLeaderboard,
  arenaStats,
  arenaWithdraw,
  geGetBalance,
  getAuthToken,
  getDevWallet,
  getSolUsd,
  setDevWallet,
} from "../api";

const ARENA_URL = process.env.NEXT_PUBLIC_ARENA_URL || "http://localhost:3002";
const SNAPSHOT_MS = 50; // must match the server snapshot interval (arena/engine.js)
const CHANNEL_MS = 3000;

type SnapPlayer = { id: string; x: number; y: number; m: number; b: number; n: string; a: number; k: number; d: number; c: number };
type SnapDrone = { id: string; x: number; y: number; m: number; a: number };
type Snapshot = { t: number; players: SnapPlayer[]; drones: SnapDrone[]; food: [number, number][]; top: { n: string; b: number; k: number }[] };
type Feed = { id: number; text: string; gold: boolean };
type Popup = { text: string; bornAt: number; color: string };

const radiusOf = (m: number) => 4 * Math.sqrt(m);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const STAKE_USD = [1, 5, 10, 25];
const DEPOSIT_USD = [10, 25, 50];

export default function ArenaGame() {
  const wallet = useWallet();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const curRef = useRef<{ snap: Snapshot; at: number } | null>(null);
  const prevRef = useRef<{ snap: Snapshot; at: number } | null>(null);
  const meIdRef = useRef<string | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const camRef = useRef({ x: 1200, y: 1200 });
  const imgCache = useRef<Map<number, HTMLImageElement>>(new Map());
  const popupsRef = useRef<Popup[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; bornAt: number; color: string }[]>([]);
  const shakeRef = useRef({ until: 0, mag: 0 });
  const lastMassRef = useRef(0);
  const lastTickSecRef = useRef(-1);
  const myNameRef = useRef("");
  const feedIdRef = useRef(0);

  const [phase, setPhase] = useState<"lobby" | "playing" | "dead" | "cashed">("lobby");
  const [stakeUsd, setStakeUsd] = useState(10);
  const [solUsd, setSolUsd] = useState(100);
  const [balance, setBalance] = useState<number | null>(null);
  const [stats, setStats] = useState<{ players: number; total_bounty_sol: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [deathInfo, setDeathInfo] = useState<{ by: string; bountyLost: number } | null>(null);
  const [cashInfo, setCashInfo] = useState<{ credited: number; fee: number } | null>(null);
  const [myBounty, setMyBounty] = useState(0);
  const [channelLeft, setChannelLeft] = useState(0); // ms remaining, 0 = not channeling
  const [feed, setFeed] = useState<Feed[]>([]);
  const [guest, setGuest] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [muted, setMutedState] = useState(true);
  const [flash, setFlash] = useState(false);
  const [tab, setTab] = useState<"play" | "wallet" | "board" | "guide">("play");
  const [board, setBoard] = useState<{ name: string; bounty: number; kills: number; alienId: number | null }[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [withdrawAmt, setWithdrawAmt] = useState(""); // SOL string for partial withdraw
  const [depositAmt, setDepositAmt] = useState("");   // USD string for partial deposit
  const [walletMode, setWalletMode] = useState<"deposit" | "withdraw">("deposit");

  useEffect(() => {
    setMounted(true);
    setGuest(getDevWallet());
    setMutedState(isMuted());
  }, []);

  const stakeSol = Math.min(5, Math.max(0.01, stakeUsd / solUsd));

  const refreshLobby = useCallback(async () => {
    try { setStats(await arenaStats()); } catch { /* backend down */ }
    try { const p = await getSolUsd(); if (p?.solUsd > 0) setSolUsd(p.solUsd); } catch { /* keep fallback */ }
    if (wallet.publicKey || getDevWallet()) {
      try { setBalance((await geGetBalance()).balance); } catch { setBalance(null); }
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    refreshLobby();
    const id = setInterval(() => { if (phase !== "playing") refreshLobby(); }, 8000);
    return () => clearInterval(id);
  }, [refreshLobby, phase]);

  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
    try { setBoard(await arenaLeaderboard()); } catch { setBoard([]); }
    finally { setBoardLoading(false); }
  }, []);

  useEffect(() => {
    if (phase === "playing" || tab !== "board") return;
    loadBoard();
    const id = setInterval(loadBoard, 5000);
    return () => clearInterval(id);
  }, [phase, tab, loadBoard]);

  function pushFeed(text: string, gold = false) {
    const id = ++feedIdRef.current;
    setFeed((f) => [...f.slice(-4), { id, text, gold }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 6000);
  }

  // ── Join ──
  async function join() {
    setErr(null);
    setWorking("join");
    sfx.click();
    try {
      if (wallet.publicKey) await ensureAuth(wallet as any);
      const token = getAuthToken();
      const devWallet = !token ? getDevWallet() : null;
      if (!token && !devWallet) throw new Error("Connect a wallet or play as guest first.");

      const name = wallet.publicKey?.toBase58().slice(0, 6) || devWallet!.slice(6, 14);
      myNameRef.current = name;

      const socket = io(ARENA_URL, {
        path: "/arena-io",
        transports: ["websocket"],
        auth: { token: token || undefined, devWallet: devWallet || undefined },
      });
      socketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        const fail = (e: any) => reject(new Error(e?.message || "connection failed"));
        socket.on("connect_error", fail);
        socket.on("connect", () => {
          socket.off("connect_error", fail);
          const avatarId = Number(localStorage.getItem("zeruva_avatar")) || undefined;
          socket.emit("join", { stake: stakeSol, name, alienId: avatarId }, (resp: any) => {
            if (resp?.ok) {
              meIdRef.current = socket.id ?? null;
              resolve();
            } else reject(new Error(resp?.error || "join rejected"));
          });
        });
      });

      socket.on("snapshot", (s: Snapshot) => {
        prevRef.current = curRef.current;
        curRef.current = { snap: s, at: performance.now() };
        const me = s.players.find((p) => p.id === meIdRef.current);
        if (me) {
          setMyBounty(me.b);
          setChannelLeft(me.c);
          // eat sound + particle burst when mass grows from food
          if (lastMassRef.current && me.m > lastMassRef.current) {
            sfx.eat();
            for (let i = 0; i < 6; i++) {
              const ang = Math.random() * Math.PI * 2;
              const sp = 40 + Math.random() * 90;
              particlesRef.current.push({
                x: me.x, y: me.y,
                vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
                bornAt: performance.now(),
                color: `hsl(${Math.random() * 360}, 90%, 65%)`,
              });
            }
          }
          lastMassRef.current = me.m;
          // channel ticking
          if (me.c > 0) {
            const sec = Math.ceil(me.c / 1000);
            if (sec !== lastTickSecRef.current) { sfx.channelTick(); lastTickSecRef.current = sec; }
          } else lastTickSecRef.current = -1;
        }
      });
      socket.on("kill", (k: { killer: string; victim: string; bounty: number; duringCashout: boolean }) => {
        const mine = k.killer === myNameRef.current;
        if (mine) {
          sfx.kill();
          popupsRef.current.push({ text: `+◎${k.bounty.toFixed(3)}`, bornAt: performance.now(), color: "#fcd34d" });
          shakeRef.current = { until: performance.now() + 350, mag: 9 };
        }
        pushFeed(
          `${k.killer} devoured ${k.victim}${k.duringCashout ? " mid-cashout!" : ""} (◎${k.bounty.toFixed(3)})`,
          mine,
        );
      });
      socket.on("dead", (d: { by: string; bountyLost: number }) => {
        sfx.death();
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
        setDeathInfo(d);
        setPhase("dead");
        cleanupSocket();
        refreshLobby();
      });
      socket.on("cashed_out", (c: { credited: number; fee: number }) => {
        sfx.cashoutDone();
        setCashInfo(c);
        setPhase("cashed");
        cleanupSocket();
        refreshLobby();
      });
      socket.on("disconnect", () => {
        setPhase((p) => (p === "playing" ? "lobby" : p));
      });

      sfx.join();
      lastMassRef.current = 0;
      popupsRef.current = [];
      setChannelLeft(0);
      setPhase("playing");
    } catch (e: any) {
      sfx.error();
      setErr(e?.message || "Failed to join");
      cleanupSocket();
    } finally {
      setWorking(null);
    }
  }

  function cleanupSocket() {
    const s = socketRef.current;
    socketRef.current = null;
    curRef.current = null;
    prevRef.current = null;
    if (s) { s.removeAllListeners(); s.disconnect(); }
  }

  function startCashout() {
    sfx.click();
    socketRef.current?.emit("cashout", () => {});
  }
  function cancelCashout() {
    sfx.click();
    socketRef.current?.emit("cancel_cashout", () => {});
    setChannelLeft(0);
  }

  // ── Deposit / withdraw ──
  async function deposit(usd: number) {
    setErr(null);
    setWorking(`dep${usd}`);
    sfx.click();
    try {
      await ensureAuth(wallet as any);
      const sol = Number((usd / solUsd).toFixed(4));
      const quote = await arenaDeposit(sol);
      if (quote.devSkip) {
        await arenaConfirmDeposit(quote.intentId, null);
      } else {
        const { Transaction } = await import("@solana/web3.js");
        const connection = getConnection("confirmed");
        const tx = Transaction.from(Buffer.from(quote.serialized!, "base64"));
        const signed = await wallet.signTransaction!(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, "confirmed");
        await arenaConfirmDeposit(quote.intentId, sig);
      }
      sfx.deposit();
      await refreshLobby();
    } catch (e: any) {
      sfx.error();
      setErr(e?.message || "Deposit failed");
    } finally {
      setWorking(null);
    }
  }

  // Withdraw a specific SOL amount (capped at the 5 SOL/withdraw server limit
  // and the current balance). `withdrawAmt` drives the input; presets fill it.
  async function withdraw(sol: number) {
    const cap = Math.min(5, Math.floor((balance ?? 0) * 1000) / 1000);
    const amount = Math.min(cap, Math.floor(sol * 1000) / 1000);
    if (!Number.isFinite(amount) || amount < 0.01) {
      setErr("Enter an amount to withdraw (min ◎0.01).");
      return;
    }
    setErr(null);
    setWorking("withdraw");
    sfx.click();
    try {
      await ensureAuth(wallet as any);
      await arenaWithdraw(amount);
      setWithdrawAmt("");
      sfx.deposit();
      await refreshLobby();
    } catch (e: any) {
      sfx.error();
      setErr(e?.message || "Withdraw failed");
    } finally {
      setWorking(null);
    }
  }

  async function devTopup() {
    setErr(null);
    sfx.click();
    try {
      const r = await arenaDevTopup();
      setBalance(r.balance);
      sfx.deposit();
    } catch (e: any) {
      sfx.error();
      setErr(e?.message || "Top-up failed");
    }
  }

  // ── Input ──
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      const canvas = canvasRef.current;
      const socket = socketRef.current;
      if (!canvas || !socket) return;
      if (channelLeft > 0) return; // frozen while channeling
      const dx = mouseRef.current.x - canvas.clientWidth / 2;
      const dy = mouseRef.current.y - canvas.clientHeight / 2;
      const dead = Math.hypot(dx, dy) < 14;
      socket.emit("input", dead ? { dx: 0, dy: 0 } : { dx, dy });
    }, 50);
    return () => clearInterval(id);
  }, [phase, channelLeft]);

  // ── Render loop (interpolated for smoothness) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // Cached full-screen gradients. createRadialGradient + addColorStop on
    // every frame is pure waste — these only change when the viewport resizes.
    let gw = -1;
    let gh = -1;
    let bgGrad: CanvasGradient | null = null;
    let vigGrad: CanvasGradient | null = null;
    const ensureGradients = (w: number, h: number) => {
      if (w === gw && h === gh) return;
      gw = w;
      gh = h;
      bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      bgGrad.addColorStop(0, "#0a0614");
      bgGrad.addColorStop(1, "#03040a");
      vigGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, "rgba(0,0,0,0.55)");
    };

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      // Steer with the finger AND stop the page/viewport from scrolling while
      // dragging. Requires passive:false so preventDefault() is honored on iOS.
      if (e.cancelable) e.preventDefault();
      const r = canvas.getBoundingClientRect();
      mouseRef.current = { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("touchmove", onTouch, { passive: false });

    const alienImg = (id: number) => {
      let img = imgCache.current.get(id);
      if (!img) {
        img = new Image();
        img.src = apiStaticUrl(`static/${id}.png`);
        imgCache.current.set(id, img);
      }
      return img.complete && img.naturalWidth > 0 ? img : null;
    };

    // Lobby ambience: slow local drift of glowing orbs
    const ambient = Array.from({ length: 26 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.012, vy: (Math.random() - 0.5) * 0.012,
      hue: Math.random() * 360, r: 2 + Math.random() * 3,
    }));

    // Parallax starfield behind the arena (world-anchored, drifts slower than play)
    const stars = Array.from({ length: 90 }, () => ({
      x: Math.random() * 3200, y: Math.random() * 3200, s: 0.6 + Math.random() * 1.6,
    }));

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high"; // crisper alien art when cells are downscaled

      // Background (cached gradient; rebuilt only on resize)
      ensureGradients(w, h);
      ctx.fillStyle = bgGrad!;
      ctx.fillRect(0, 0, w, h);

      const cur = curRef.current;
      const prev = prevRef.current;

      if (!cur) {
        // Lobby ambience
        for (const o of ambient) {
          o.x = (o.x + o.vx / 60 + 1) % 1;
          o.y = (o.y + o.vy / 60 + 1) % 1;
          ctx.fillStyle = `hsla(${o.hue}, 85%, 65%, 0.5)`;
          ctx.beginPath();
          ctx.arc(o.x * w, o.y * h, o.r, 0, Math.PI * 2);
          ctx.fill();
        }
        raf = requestAnimationFrame(draw);
        return;
      }

      // Interpolation factor between the two latest snapshots
      const now = performance.now();
      const t = prev ? Math.min(1.2, (now - cur.at) / SNAPSHOT_MS) : 1;
      const prevById = new Map(prev ? prev.snap.players.map((p) => [p.id, p]) : []);
      const ipos = (p: SnapPlayer) => {
        const q = prevById.get(p.id);
        return q ? { x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t) } : { x: p.x, y: p.y };
      };

      const me = cur.snap.players.find((p) => p.id === meIdRef.current);
      const meP = me ? ipos(me) : null;
      // Smooth camera
      if (meP) {
        camRef.current.x = lerp(camRef.current.x, meP.x, 0.12);
        camRef.current.y = lerp(camRef.current.y, meP.y, 0.12);
      }
      // Screen shake on kills
      let shakeX = 0, shakeY = 0;
      if (now < shakeRef.current.until) {
        const m = shakeRef.current.mag * ((shakeRef.current.until - now) / 350);
        shakeX = (Math.random() - 0.5) * m;
        shakeY = (Math.random() - 0.5) * m;
      }
      const camX = camRef.current.x + shakeX;
      const camY = camRef.current.y + shakeY;
      const toScreen = (x: number, y: number) => [x - camX + w / 2, y - camY + h / 2] as const;

      // Parallax stars (move at 35% of camera speed)
      ctx.fillStyle = "rgba(180,200,255,0.35)";
      for (const st of stars) {
        const sx = ((st.x - camX * 0.35) % 3200 + 3200) % 3200 - 400;
        const sy = ((st.y - camY * 0.35) % 3200 + 3200) % 3200 - 400;
        if (sx < 0 || sy < 0 || sx > w || sy > h) continue;
        ctx.fillRect(sx, sy, st.s, st.s);
      }

      // Grid
      ctx.strokeStyle = "rgba(148,163,184,0.06)";
      ctx.lineWidth = 1;
      const grid = 120;
      const ox = ((-camX % grid) + grid) % grid;
      const oy = ((-camY % grid) + grid) % grid;
      ctx.beginPath();
      for (let x = ox; x < w; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = oy; y < h; y += grid) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      // World border
      const [bx, by] = toScreen(0, 0);
      ctx.strokeStyle = "rgba(239,68,68,0.55)";
      ctx.lineWidth = 3;
      ctx.strokeRect(bx, by, 2400, 2400);

      // Food orbs (gentle pulse)
      const pulse = 1 + 0.18 * Math.sin(now / 300);
      for (const [fx, fy] of cur.snap.food) {
        const [sx, sy] = toScreen(fx, fy);
        if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue;
        ctx.fillStyle = `hsl(${(fx * 7 + fy * 13) % 360}, 90%, 65%)`;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }

      // Drones
      for (const d of cur.snap.drones) {
        const [sx, sy] = toScreen(d.x, d.y);
        const r = radiusOf(d.m);
        if (sx < -r || sy < -r || sx > w + r || sy > h + r) continue;
        drawCell(ctx, sx, sy, r, alienImg(d.a), "rgba(100,116,139,0.55)");
      }

      // Players, smallest first
      const sorted = [...cur.snap.players].sort((a, b) => a.m - b.m);
      for (const p of sorted) {
        const pos = ipos(p);
        const [sx, sy] = toScreen(pos.x, pos.y);
        const r = radiusOf(p.m);
        if (sx < -r - 50 || sy < -r - 50 || sx > w + r + 50 || sy > h + r + 50) continue;
        const isMe = p.id === meIdRef.current;
        const danger = me && !isMe && p.m > me.m * 1.15;
        drawCell(ctx, sx, sy, r, alienImg(p.a), isMe ? "#22d3ee" : danger ? "#ef4444" : p.d ? "rgba(148,163,184,0.6)" : "#f59e0b");

        // Cashout channel ring
        if (p.c > 0) {
          const prog = 1 - p.c / CHANNEL_MS;
          ctx.beginPath();
          ctx.arc(sx, sy, r + 8, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
          ctx.strokeStyle = "#34d399";
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.fillStyle = "#34d399";
          ctx.font = "bold 11px ui-sans-serif, system-ui";
          ctx.textAlign = "center";
          ctx.fillText("CASHING OUT", sx, sy + r + 22);
        }

        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(p.n, sx, sy - r - 16);
        ctx.fillStyle = "#fcd34d";
        ctx.fillText(`◎ ${p.b.toFixed(3)}`, sx, sy - r - 3);
      }

      // Eat particles (world-space burst, 600ms life)
      particlesRef.current = particlesRef.current.filter((pt) => now - pt.bornAt < 600);
      for (const pt of particlesRef.current) {
        const age = (now - pt.bornAt) / 600;
        const [sx, sy] = toScreen(pt.x + pt.vx * age, pt.y + pt.vy * age);
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = pt.color;
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;

      // Vignette (cached gradient; rebuilt only on resize)
      ctx.fillStyle = vigGrad!;
      ctx.fillRect(0, 0, w, h);

      // Floating bounty popups
      popupsRef.current = popupsRef.current.filter((pp) => now - pp.bornAt < 1400);
      for (const pp of popupsRef.current) {
        const age = (now - pp.bornAt) / 1400;
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = pp.color;
        ctx.font = `bold ${22 - age * 6}px ui-sans-serif, system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(pp.text, w / 2, h / 2 - 60 - age * 70);
        ctx.globalAlpha = 1;
      }

      // Minimap
      const MM = 130, pad = 12;
      ctx.fillStyle = "rgba(2,4,10,0.75)";
      ctx.fillRect(pad, h - MM - pad, MM, MM);
      ctx.strokeStyle = "rgba(148,163,184,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(pad, h - MM - pad, MM, MM);
      for (const p of cur.snap.players) {
        const mx = pad + (p.x / 2400) * MM;
        const my = h - MM - pad + (p.y / 2400) * MM;
        ctx.fillStyle = p.id === meIdRef.current ? "#22d3ee" : "#ef4444";
        ctx.beginPath();
        ctx.arc(mx, my, p.id === meIdRef.current ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("touchmove", onTouch);
    };
  }, [phase]);

  useEffect(() => () => cleanupSocket(), []);

  const top = curRef.current?.snap.top || [];
  const usdOf = (sol: number) => (sol * solUsd).toFixed(2);
  const channelSec = Math.ceil(channelLeft / 1000);

  return (
    // True fullscreen: the viewport is everything below the top bar.
    <div className="h-dvh flex flex-col overflow-hidden bg-black">
      <TopBar backHref="/" title="The Void Arena" />

      <div className="flex-1 w-full flex flex-col min-h-0">
        {/* Game viewport */}
        <div ref={wrapRef} className="relative flex-1 min-h-0 overflow-hidden bg-[#04060e]">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ cursor: phase === "playing" ? "crosshair" : "default", touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }} />

          {err && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-2.5 text-sm text-red-300 arena-rise">
              {err}
              <button className="ml-3 text-red-500 hover:text-red-300" onClick={() => setErr(null)}><img src="/icons/ui-close.png" alt="close" className="w-3.5 h-3.5 object-contain inline-block align-middle" /></button>
            </div>
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={() => {
              sfx.click();
              const el = wrapRef.current;
              if (!el) return;
              if (document.fullscreenElement) document.exitFullscreen();
              else el.requestFullscreen().catch(() => {});
            }}
            className="absolute top-3 right-3 z-20 w-9 h-9 rounded-lg border border-white/10 bg-black/60 backdrop-blur text-sm hover:bg-white/10"
            style={phase === "playing" ? { top: "auto", bottom: 16, right: "auto", left: 208 } : undefined}
            title="Fullscreen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/ui-fullscreen.png" alt="Fullscreen" className="w-5 h-5 object-contain mx-auto" />
          </button>

          {/* Death flash */}
          {flash && <div className="absolute inset-0 pointer-events-none arena-flash" />}

          {/* In-game HUD */}
          {phase === "playing" && (
            <>
              {/* Bounty chip */}
              <div className="absolute top-3 left-3 rounded-xl border border-amber-400/30 bg-black/70 backdrop-blur px-4 py-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Your bounty</div>
                <div key={myBounty} className="flex items-center gap-1.5 text-xl font-extrabold text-amber-300 tabular-nums arena-pop">
                  <SolanaLogo size={17} />{myBounty.toFixed(3)} <span className="text-xs text-gray-500 font-semibold">${usdOf(myBounty)}</span>
                </div>
              </div>

              {/* Kill feed */}
              <div className="absolute top-20 left-3 flex flex-col gap-1 pointer-events-none">
                {feed.map((f) => (
                  <div key={f.id} className={`arena-feed-item text-xs px-3 py-1.5 rounded-lg backdrop-blur border ${f.gold ? "bg-amber-500/15 border-amber-400/40 text-amber-200" : "bg-black/60 border-white/10 text-gray-300"}`}>
                    {f.text}
                  </div>
                ))}
              </div>

              {/* Leaderboard */}
              {top.length > 0 && (
                <div className="absolute top-3 right-3 rounded-xl border border-white/10 bg-black/70 backdrop-blur px-3 py-2 text-xs text-gray-200 min-w-[160px]">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Top bounties</div>
                  {top.map((t, i) => (
                    <div key={i} className="flex justify-between gap-3 tabular-nums">
                      <span className={`truncate ${t.n === myNameRef.current ? "text-cyan-300" : ""}`}>{i + 1}. {t.n}</span>
                      <span className="text-amber-300">◎{t.b.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Cashout / channel */}
              {channelLeft > 0 ? (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                  <div className="rounded-xl border border-emerald-400/50 bg-black/80 backdrop-blur px-5 py-2.5 text-center arena-rise">
                    <div className="flex items-center justify-center gap-1.5 text-emerald-300 font-extrabold text-base tabular-nums">
                      CASHING OUT <SolanaLogo size={15} />{(myBounty * 0.9).toFixed(3)} in {channelSec}s
                    </div>
                    <div className="text-[11px] text-red-300/90 font-semibold">You are FROZEN — don&apos;t get eaten!</div>
                  </div>
                  <button onClick={cancelCashout} className="px-4 py-1.5 rounded-lg border border-gray-600 bg-black/70 text-gray-300 text-xs font-bold hover:bg-white/10">
                    CANCEL
                  </button>
                </div>
              ) : (
                <button
                  onClick={startCashout}
                  className="absolute bottom-4 right-4 flex items-center gap-1.5 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-extrabold text-sm shadow-[0_0_24px_rgba(16,185,129,0.35)] hover:scale-105 transition-transform"
                >
                  CASH OUT <SolanaLogo size={15} />{(myBounty * 0.9).toFixed(3)}
                </button>
              )}

              {/* Mute */}
              <button
                onClick={() => { const m = !muted; setMuted(m); setMutedState(m); if (!m) sfx.click(); }}
                className="absolute bottom-4 left-4 ml-[150px] w-9 h-9 rounded-lg border border-white/10 bg-black/60 backdrop-blur text-sm hover:bg-white/10"
                title={muted ? "Unmute" : "Mute"}
              >
                {muted
                  ? <img src="/icons/ui-mute.png" alt="Unmute" className="w-5 h-5 object-contain inline-block" />
                  : <img src="/icons/ui-unmute.png" alt="Mute" className="w-5 h-5 object-contain inline-block" />}
              </button>
            </>
          )}

          {/* Lobby / death / cashed — premium tabbed panel */}
          {phase !== "playing" && (
            <div className="absolute inset-0 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-gradient-to-b from-black/70 via-[#0a0613]/75 to-black/85 backdrop-blur-[3px] overflow-y-auto">
              <div className="w-full max-w-7xl flex items-center justify-center gap-5 my-3 sm:my-4">

                {/* LEFT side panel — arena intel + quick rules (desktop only) */}
                <aside className="hidden lg:flex flex-col gap-4 w-72 shrink-0 self-center">
                  <div className="relative overflow-hidden rounded-2xl border border-rose-500/25 bg-gradient-to-b from-rose-500/[0.12] via-rose-500/[0.03] to-transparent p-5">
                    <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-rose-500/15 blur-3xl" />
                    <h3 className="relative text-xl font-black tracking-tight bg-gradient-to-r from-rose-300 to-fuchsia-200 bg-clip-text text-transparent mb-4">Arena Intel</h3>
                    <div className="relative space-y-3">
                      <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <div className="text-[11px] text-gray-400 uppercase tracking-wider">Hunters live</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60 animate-ping" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-400" />
                          </span>
                          <span className="text-3xl font-black text-rose-100 tabular-nums leading-none">{stats?.players ?? 0}</span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <div className="text-[11px] text-gray-400 uppercase tracking-wider">Total bounty</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <SolanaLogo size={22} />
                          <span className="text-3xl font-black text-amber-300 tabular-nums leading-none">{(stats?.total_bounty_sol ?? 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-5 flex flex-col gap-3.5">
                    <h3 className="text-sm font-black uppercase tracking-[0.16em] text-gray-300">How it works</h3>
                    {([
                      ["🎯", "Stake = bounty", "Your stake becomes your cell's bounty."],
                      ["⚔️", "Devour", "Eat smaller players to take 100% of theirs."],
                      ["💰", "Cash out", "Hold 3s while frozen to bank it (10% fee)."],
                    ] as const).map(([icon, t, b]) => (
                      <div key={t} className="flex gap-3">
                        <span className="text-lg shrink-0 leading-none mt-0.5">{icon}</span>
                        <div>
                          <div className="text-sm font-bold text-gray-100">{t}</div>
                          <div className="text-[12px] text-gray-500 leading-snug mt-0.5">{b}</div>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => { setTab("guide"); sfx.tab(); }} className="text-xs font-semibold text-rose-300/80 hover:text-rose-200 text-left">Full guide →</button>
                  </div>
                </aside>

                {/* CENTER */}
                <div className="arena-panel w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0b0712]/95 p-6 sm:p-8">

                {/* Result banners */}
                {phase === "dead" && deathInfo && (
                  <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-center arena-pop">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/arena-death.png" alt="" className="w-16 h-16 object-contain mx-auto mb-1" />
                    <div className="text-lg font-extrabold text-red-300">Devoured by {deathInfo.by}</div>
                    <div className="flex items-center justify-center gap-1 text-sm text-gray-400 mt-0.5">Bounty lost: <span className="inline-flex items-center gap-1 text-red-300 font-bold"><SolanaLogo size={13} />{deathInfo.bountyLost.toFixed(3)}</span></div>
                  </div>
                )}
                {phase === "cashed" && cashInfo && (
                  <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-center arena-pop">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/arena-cashout.png" alt="" className="w-16 h-16 object-contain mx-auto mb-1" />
                    <div className="flex items-center justify-center gap-1.5 text-lg font-extrabold text-emerald-300">Cashed out <SolanaLogo size={16} />{cashInfo.credited.toFixed(3)}</div>
                    <div className="text-xs text-gray-500 mt-0.5">${usdOf(cashInfo.credited)} · dev fee ◎{cashInfo.fee.toFixed(4)}</div>
                  </div>
                )}

                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="arena-wordmark text-4xl sm:text-5xl font-black tracking-tight leading-none">THE VOID ARENA</div>
                    <div className="text-xs sm:text-sm text-gray-400 mt-2">
                      Eat or be eaten — your stake is your bounty, winner takes <span className="text-amber-300 font-semibold">everything</span>.
                    </div>
                  </div>
                  <span className="hub-live-pill shrink-0" style={{ borderColor: "rgba(244,63,94,0.4)", background: "rgba(40,8,16,0.6)", color: "#fda4af" }}>
                    <span className="dot" style={{ background: "#f43f5e" }} />{stats?.players ?? 0} LIVE
                  </span>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-1 mb-5 rounded-2xl border border-white/10 bg-black/40">
                  {([
                    ["play", "/icons/tab-play.png", "Play"],
                    ["wallet", "/icons/tab-wallet.png", "Wallet"],
                    ["board", "/icons/tab-ranks.png", "Ranks"],
                    ["guide", "/icons/guide.png", "Guide"],
                  ] as const).map(([k, icon, label]) => (
                    <button
                      key={k}
                      onClick={() => { setTab(k); sfx.tab(); }}
                      className={`arena-tab flex-1 px-2 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 ${
                        tab === k ? "arena-tab--active bg-white/5 text-white" : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {icon.startsWith("/")
                        ? <img src={icon} alt="" className="w-5 h-5 object-contain shrink-0" />
                        : <span>{icon}</span>}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {err && (
                  <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/50 px-4 py-2.5 text-sm text-red-300 flex items-center justify-between">
                    <span>{err}</span>
                    <button className="text-red-500 hover:text-red-300" onClick={() => setErr(null)}><img src="/icons/ui-close.png" alt="close" className="w-3.5 h-3.5 object-contain inline-block align-middle" /></button>
                  </div>
                )}

                {/* ── PLAY ── */}
                {tab === "play" && (
                  <div className="arena-rise">
                    <div className="text-[11px] text-gray-400 mb-2 uppercase tracking-wider font-semibold">Choose your stake</div>
                    <div className="grid grid-cols-4 gap-2 mb-5">
                      {STAKE_USD.map((usd) => (
                        <button
                          key={usd}
                          onClick={() => { setStakeUsd(usd); sfx.click(); }}
                          className={`py-4 rounded-2xl border text-center transition-all ${
                            stakeUsd === usd
                              ? "border-rose-400/70 bg-gradient-to-b from-rose-500/20 to-fuchsia-500/10 scale-105 shadow-[0_0_20px_-4px_rgba(244,63,94,0.5)]"
                              : "border-white/10 bg-black/30 hover:border-white/25 active:scale-95"
                          }`}
                        >
                          <div className={`text-xl font-extrabold ${stakeUsd === usd ? "text-rose-200" : "text-gray-200"}`}>${usd}</div>
                          <div className="flex items-center justify-center gap-1 text-[12px] text-gray-500 tabular-nums mt-1"><SolanaLogo size={11} />{(usd / solUsd).toFixed(3)}</div>
                        </button>
                      ))}
                    </div>

                    {!mounted ? null : !wallet.publicKey && !guest ? (
                      <div className="text-sm text-gray-300 text-center py-4 rounded-2xl border border-white/10 bg-black/30">
                        Connect your Phantom wallet (top bar) to enter — real devnet SOL.
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => { sfx.enter(); join(); }}
                          disabled={working !== null || (balance !== null && balance < stakeSol)}
                          className="arena-grad-btn w-full py-5 rounded-2xl text-white font-black text-xl tracking-wide hover:scale-[1.02] active:scale-[0.99] transition-transform disabled:opacity-40 disabled:hover:scale-100"
                        >
                          {working === "join" ? "ENTERING…" : `ENTER ARENA · $${stakeUsd}`}
                        </button>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-gray-400">
                          <span className="inline-flex items-center gap-1">Balance <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold tabular-nums">{balance === null ? "—" : <><SolanaLogo size={12} />{balance.toFixed(3)}</>}</span></span>
                          <span className="text-gray-700">·</span>
                          <span className="inline-flex items-center gap-1">Need <span className="inline-flex items-center gap-1 text-amber-300 font-semibold tabular-nums"><SolanaLogo size={12} />{stakeSol.toFixed(3)}</span></span>
                          {balance !== null && balance < stakeSol && (
                            <button onClick={() => { setTab("wallet"); sfx.tab(); }} className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200">Deposit →</button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── WALLET / WITHDRAW ── */}
                {tab === "wallet" && (
                  <div className="arena-rise">
                    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.12] via-emerald-500/[0.03] to-transparent p-6 text-center mb-5">
                      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />
                      <div className="relative text-[11px] text-gray-400 uppercase tracking-[0.18em] mb-2">Arena balance</div>
                      <div className="relative flex items-center justify-center gap-2.5">
                        <SolanaLogo size={32} />
                        <span className="text-5xl font-black text-emerald-300 tabular-nums leading-none">{balance === null ? "—" : balance.toFixed(3)}</span>
                      </div>
                      <div className="relative text-sm text-gray-500 mt-2">{balance === null ? "" : `≈ $${usdOf(balance)}`}</div>
                    </div>

                    {!mounted ? null : !wallet.publicKey && !guest ? (
                      <div className="text-sm text-gray-300 text-center py-4 rounded-2xl border border-white/10 bg-black/30">
                        Connect your wallet to deposit and withdraw.
                      </div>
                    ) : wallet.publicKey ? (
                      <>
                        {/* Deposit / Withdraw toggle — two states */}
                        <div className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-2xl border border-white/10 bg-black/40">
                          <button
                            onClick={() => { setWalletMode("deposit"); sfx.tab(); }}
                            className={`py-3.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${walletMode === "deposit" ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40" : "text-gray-400 hover:text-gray-200"}`}
                          >
                            Deposit
                          </button>
                          <button
                            onClick={() => { setWalletMode("withdraw"); sfx.tab(); }}
                            className={`py-3.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${walletMode === "withdraw" ? "bg-amber-500/20 text-amber-200 border border-amber-500/40" : "text-gray-400 hover:text-gray-200"}`}
                          >
                            Withdraw
                          </button>
                        </div>

                        {walletMode === "deposit" ? (() => {
                          const dUsd = parseFloat(depositAmt.replace(",", "."));
                          const dValid = Number.isFinite(dUsd) && dUsd >= 1;
                          return (
                            <>
                              <div className="relative mb-3">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-black text-emerald-400">$</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={depositAmt}
                                  onChange={(e) => setDepositAmt(e.target.value.replace(/[^0-9.,]/g, ""))}
                                  placeholder="10"
                                  className="w-full rounded-2xl bg-black/60 border border-white/15 text-white pl-11 pr-4 py-4 text-2xl font-bold tabular-nums focus:outline-none focus:border-emerald-500/60"
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-2 mb-4">
                                {DEPOSIT_USD.map((usd) => (
                                  <button
                                    key={usd}
                                    onClick={() => { setDepositAmt(String(usd)); sfx.click(); }}
                                    className="py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 text-base font-extrabold hover:bg-emerald-500/15 active:scale-95 transition-all"
                                  >
                                    +${usd}
                                  </button>
                                ))}
                              </div>
                              <button
                                onClick={() => deposit(dUsd)}
                                disabled={working !== null || !dValid}
                                className="w-full py-5 rounded-2xl border border-emerald-500/50 bg-emerald-500/20 text-emerald-100 text-lg font-black hover:bg-emerald-500/30 active:scale-[0.98] transition-all disabled:opacity-40"
                              >
                                {working !== null && working.startsWith("dep")
                                  ? "Depositing…"
                                  : dValid
                                  ? <span className="inline-flex items-center gap-1.5">Deposit ${dUsd} · <SolanaLogo size={16} />{(dUsd / solUsd).toFixed(3)}</span>
                                  : "Enter an amount"}
                              </button>
                              <div className="text-[11px] text-gray-600 mt-2 text-center">Pays real devnet SOL at ${solUsd.toFixed(0)}/◎ into your arena balance.</div>
                            </>
                          );
                        })() : (() => {
                          const wCap = Math.min(5, Math.floor((balance ?? 0) * 1000) / 1000);
                          const typed = parseFloat(withdrawAmt.replace(",", "."));
                          const valid = Number.isFinite(typed) && typed >= 0.01;
                          return (
                            <>
                              <div className="relative mb-3">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2"><SolanaLogo size={24} /></span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={withdrawAmt}
                                  onChange={(e) => setWithdrawAmt(e.target.value.replace(/[^0-9.,]/g, ""))}
                                  placeholder="0.000"
                                  className="w-full rounded-2xl bg-black/60 border border-white/15 text-white pl-12 pr-4 py-4 text-2xl font-bold tabular-nums focus:outline-none focus:border-amber-500/60"
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-2 mb-4">
                                {([["25%", 0.25], ["50%", 0.5], ["Max", 1]] as const).map(([label, frac]) => (
                                  <button
                                    key={label}
                                    onClick={() => { setWithdrawAmt((wCap * frac).toFixed(3)); sfx.click(); }}
                                    disabled={wCap < 0.01}
                                    className="py-3 rounded-xl border border-white/10 bg-white/5 text-gray-200 text-base font-bold hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40"
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                              <button
                                onClick={() => withdraw(typed)}
                                disabled={working !== null || !valid || wCap < 0.01}
                                className="w-full py-5 rounded-2xl border border-amber-500/50 bg-amber-500/20 text-amber-100 text-lg font-black hover:bg-amber-500/30 active:scale-[0.98] transition-all disabled:opacity-40"
                              >
                                {working === "withdraw"
                                  ? "Withdrawing…"
                                  : valid
                                  ? <span className="inline-flex items-center gap-1.5">Withdraw <SolanaLogo size={16} />{Math.min(typed, wCap).toFixed(3)} → wallet</span>
                                  : wCap < 0.01 ? "Nothing to withdraw" : "Enter an amount"}
                              </button>
                              <div className="text-[11px] text-gray-600 mt-2 text-center leading-relaxed">
                                Available <span className="inline-flex items-center gap-0.5"><SolanaLogo size={10} />{wCap.toFixed(3)}</span> · max ◎5 per withdraw.
                              </div>
                            </>
                          );
                        })()}
                      </>
                    ) : (
                      <button onClick={devTopup} className="w-full py-3 rounded-2xl border border-white/15 text-gray-200 text-sm font-bold hover:bg-white/5">
                        +1 TEST SOL (guest)
                      </button>
                    )}
                  </div>
                )}

                {/* ── LEADERBOARD ── */}
                {tab === "board" && (
                  <div className="arena-rise">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-bold text-gray-200">Live hunters</div>
                      <button onClick={() => { loadBoard(); sfx.click(); }} className="text-[11px] text-gray-400 hover:text-gray-200">↻ Refresh</button>
                    </div>
                    {board.length === 0 ? (
                      <div className="text-center text-gray-500 py-10 rounded-2xl border border-white/10 bg-black/30">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/icons/empty-cube.png" alt="" className="w-14 h-14 object-contain mx-auto mb-2" />
                        <div className="text-sm">{boardLoading ? "Loading…" : "No hunters in the arena right now — be the first."}</div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {board.map((r, i) => (
                          <div key={i} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${i === 0 ? "border-amber-400/40 bg-amber-500/5" : "border-white/10 bg-black/30"}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <div className={`w-6 flex items-center justify-center font-black tabular-nums ${i === 0 ? "text-amber-300" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-gray-600"}`}>{i === 0 ? <img src="/icons/tier-legendary.png" alt="1" className="w-5 h-5 object-contain" /> : i + 1}</div>
                            {r.alienId ? (
                              <img src={apiStaticUrl(`static/${r.alienId}.png`)} alt="" className="w-8 h-8 rounded-lg object-cover border border-white/10" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10" />
                            )}
                            <div className="flex-1 min-w-0 truncate text-sm text-gray-200 font-semibold">{r.name}</div>
                            <div className="text-[11px] text-gray-500 tabular-nums">{r.kills} k</div>
                            <div className="text-sm font-bold text-amber-300 tabular-nums">◎{r.bounty.toFixed(3)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── GUIDE ── */}
                {tab === "guide" && (
                  <div className="arena-rise flex flex-col gap-2.5">
                    {([
                      ["🌌", "Stake = bounty", "Pick a stake; it becomes your cell's bounty. Bigger bounty, bigger target."],
                      ["🍬", "Grow", "Eat glowing orbs and cosmetic drones to gain mass and widen your view."],
                      ["⚔️", "Devour", "Ram a smaller player to eat them and absorb 100% of their bounty."],
                      ["💰", "Cash out", "Hold to cash out — you freeze for 3s and stay killable. Survive it to bank your bounty (10% dev fee)."],
                      ["🔌", "No rage-quit", "Disconnecting leaves your cell killable for 10s before it auto-cashes."],
                    ] as const).map(([icon, title, body]) => (
                      <div key={title} className="flex gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
                        <div className="text-xl shrink-0">{icon}</div>
                        <div>
                          <div className="font-semibold text-gray-100 text-sm">{title}</div>
                          <div className="text-[12px] text-gray-400 mt-0.5">{body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-5 flex items-center justify-between text-[10px] text-gray-600">
                  <span>Real devnet SOL · server-authoritative</span>
                  <button
                    onClick={() => { const m = !muted; setMuted(m); setMutedState(m); if (!m) sfx.click(); }}
                    className="text-base hover:opacity-80"
                    title={muted ? "Unmute" : "Mute"}
                  >
                    {muted
                  ? <img src="/icons/ui-mute.png" alt="Unmute" className="w-5 h-5 object-contain inline-block" />
                  : <img src="/icons/ui-unmute.png" alt="Mute" className="w-5 h-5 object-contain inline-block" />}
                  </button>
                </div>
              </div>

                {/* RIGHT side panel — live top hunters (desktop only) */}
                <aside className="hidden lg:flex flex-col gap-3 w-72 shrink-0 self-center">
                  <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.10] via-amber-500/[0.02] to-transparent p-5 flex flex-col gap-3 max-h-[74vh]">
                    <div className="pointer-events-none absolute -top-12 -left-12 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl" />
                    <div className="relative flex items-center justify-between">
                      <h3 className="text-xl font-black tracking-tight bg-gradient-to-r from-amber-300 to-yellow-200 bg-clip-text text-transparent">Top Hunters</h3>
                      <button onClick={() => { loadBoard(); sfx.click(); }} className="text-base text-gray-500 hover:text-gray-300" title="Refresh">↻</button>
                    </div>
                    {board.length === 0 ? (
                      <div className="relative text-sm text-gray-500 py-8 text-center">{boardLoading ? "Loading…" : "No hunters yet — be the first."}</div>
                    ) : (
                      <div className="relative flex flex-col gap-2 overflow-y-auto">
                        {board.slice(0, 8).map((r, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${
                              i === 0 ? "border-amber-400/50 bg-amber-500/10"
                              : i === 1 ? "border-slate-300/30 bg-white/5"
                              : i === 2 ? "border-orange-400/30 bg-orange-500/5"
                              : "border-white/10 bg-black/30"
                            }`}
                          >
                            <div className={`w-5 text-center text-sm font-black tabular-nums ${
                              i === 0 ? "text-amber-300" : i === 1 ? "text-slate-200" : i === 2 ? "text-orange-300" : "text-gray-600"
                            }`}>{i + 1}</div>
                            {r.alienId ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={apiStaticUrl(`static/${r.alienId}.png`)} alt="" className="w-9 h-9 rounded-lg object-cover border border-white/10" />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-sm text-gray-100 font-bold">{r.name}</div>
                              <div className="text-[11px] text-gray-500">{r.kills} kills</div>
                            </div>
                            <div className="flex items-center gap-1 text-sm font-black text-amber-300 tabular-nums">
                              <SolanaLogo size={13} />{r.bounty.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </aside>

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  img: HTMLImageElement | null,
  ringColor: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}
