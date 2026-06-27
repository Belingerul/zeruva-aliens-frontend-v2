"use client";

import Link from "next/link";
import DynamicStarfield from "../src/components/DynamicStarfield";

type Realm = {
  href: string;
  label: string;
  title: string;
  icon: string;
  accent: string;      // base accent color
  accentText: string;  // lighter accent for text
  description: React.ReactNode;
  tags: string[];
  cta: string;
};

const REALMS: Realm[] = [
  {
    href: "/colony",
    label: "Realm I",
    title: "The Colony",
    icon: "/icons/realm-colony.png",
    accent: "#8b5cf6",
    accentText: "#c4b5fd",
    description: (
      <>
        Hatch eggs, crew your ship, and earn{" "}
        <strong style={{ color: "#c4b5fd" }}>passive SOL</strong> every day.
      </>
    ),
    tags: ["Egg Hatching", "Passive ROI", "3 Planets", "Ship Upgrades"],
    cta: "Enter Colony",
  },
  {
    href: "/expedition",
    label: "Realm II",
    title: "The Great Expedition",
    icon: "/icons/realm-expedition.png",
    accent: "#eab308",
    accentText: "#fde68a",
    description: (
      <>
        Board ships in 10-minute rounds and win the{" "}
        <strong style={{ color: "#fde68a" }}>SOL prize pool</strong>.
      </>
    ),
    tags: ["10-Min Rounds", "Big Pots", "0.1 SOL Entry", "3 Game Modes"],
    cta: "Board Now",
  },
  {
    href: "/marketplace",
    label: "Realm III",
    title: "The Marketplace",
    icon: "/icons/realm-market.png",
    accent: "#10b981",
    accentText: "#6ee7b7",
    description: (
      <>
        Buy &amp; sell aliens with other players for{" "}
        <strong style={{ color: "#6ee7b7" }}>SOL</strong>, peer-to-peer.
      </>
    ),
    tags: ["Peer-to-Peer", "SOL Payments", "All Tiers", "Live Listings"],
    cta: "Open Market",
  },
  {
    href: "/arena",
    label: "Realm IV",
    title: "The Void Arena",
    icon: "/icons/realm-arena.png",
    accent: "#ef4444",
    accentText: "#fca5a5",
    description: (
      <>
        Devour rivals and steal{" "}
        <strong style={{ color: "#fca5a5" }}>80% of their stake</strong> — cash out alive.
      </>
    ),
    tags: ["Live PvP", "Steal Stakes", "Exit Anytime", "Skill-Based"],
    cta: "Enter the Void",
  },
];

const TILT_MAX_DEG = 7;

// rAF-batched pointer tilt. mousemove fires 100+×/s; doing a layout read
// (getBoundingClientRect) plus writing CSS vars that drive a radial-gradient
// repaint on every event thrashes layout/paint. Coalesce to one write/frame.
// Only one card is hovered at a time, so a single shared record is enough.
const tilt: { el: HTMLElement | null; x: number; y: number; raf: number } = {
  el: null,
  x: 0,
  y: 0,
  raf: 0,
};

function applyTilt() {
  tilt.raf = 0;
  const el = tilt.el;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const px = (tilt.x - r.left) / r.width;
  const py = (tilt.y - r.top) / r.height;
  el.style.setProperty("--rx", `${((0.5 - py) * TILT_MAX_DEG).toFixed(2)}deg`);
  el.style.setProperty("--ry", `${((px - 0.5) * TILT_MAX_DEG * 1.3).toFixed(2)}deg`);
  el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
  el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
}

function handleTilt(e: React.MouseEvent<HTMLAnchorElement>) {
  tilt.el = e.currentTarget;
  tilt.x = e.clientX;
  tilt.y = e.clientY;
  if (!tilt.raf) tilt.raf = requestAnimationFrame(applyTilt);
}

function resetTilt(e: React.MouseEvent<HTMLAnchorElement>) {
  const el = e.currentTarget;
  if (tilt.el === el) tilt.el = null;
  el.style.setProperty("--rx", "0deg");
  el.style.setProperty("--ry", "0deg");
  el.style.setProperty("--mx", "50%");
  el.style.setProperty("--my", "50%");
}

function RealmCard({ realm, index }: { realm: Realm; index: number }) {
  return (
    <Link
      href={realm.href}
      className="realm-card hub-rise"
      style={
        {
          textDecoration: "none",
          animationDelay: `${0.22 + index * 0.08}s`,
          "--accent": realm.accent,
          "--accent-text": realm.accentText,
        } as React.CSSProperties
      }
      onMouseMove={handleTilt}
      onMouseLeave={resetTilt}
    >
      <div className="corner-glow" />

      <div className="realm-icon" style={{ animationDelay: `${index * 0.7}s` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={realm.icon} alt="" className="realm-icon-img" />
      </div>

      <div className="realm-label">{realm.label}</div>
      <h2 className="realm-title">{realm.title}</h2>

      <p className="realm-desc">{realm.description}</p>

      <div className="realm-tags">
        {realm.tags.map((tag) => (
          <span key={tag} className="realm-tag">
            {tag}
          </span>
        ))}
      </div>

      <div className="realm-cta">
        {realm.cta} <span className="arrow">→</span>
      </div>
    </Link>
  );
}

export default function HubPage() {
  return (
    <div className="hub-root">
      <div className="hub-bg" aria-hidden="true">
        <DynamicStarfield />

      {/* Drifting aurora blobs */}
      <div
        className="hub-aurora"
        style={{
          top: "2%",
          left: "8%",
          width: 460,
          height: 460,
          background: "radial-gradient(circle, rgba(139,92,246,0.16) 0%, transparent 70%)",
        }}
      />
      <div
        className="hub-aurora"
        style={{
          bottom: "4%",
          right: "4%",
          width: 540,
          height: 540,
          background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)",
          animationDelay: "-6s",
        }}
      />
      <div
        className="hub-aurora"
        style={{
          top: "38%",
          left: "44%",
          width: 420,
          height: 420,
          background: "radial-gradient(circle, rgba(240,171,252,0.10) 0%, transparent 70%)",
          animationDelay: "-12s",
        }}
      />

        {/* Synthwave grid floor */}
        <div className="hub-grid-floor" />
      </div>

      <main className="hub-inner">
        {/* Brand header — wordmark, tagline, live pill, logo, beam */}
        <header className="hub-header">
          <div className="hub-rise">
            <div className="zeruva-wordmark hub-title">ZERUVA</div>
          </div>

          <p className="hub-tagline hub-rise" style={{ animationDelay: "0.06s" }}>
            Four Realms · One Wallet · Infinite Aliens
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/aeruva-logo.png"
            alt="Zeruva"
            className="hub-logo hub-rise"
            style={{ animationDelay: "0.14s" }}
          />

          <div className="hub-beam hub-rise" style={{ animationDelay: "0.2s" }} />
        </header>

        {/* Realm cards — 2×2 on phone, one row of four on desktop */}
        <div className="hub-realm-grid">
          {REALMS.map((realm, i) => (
            <RealmCard key={realm.href} realm={realm} index={i} />
          ))}
        </div>

        {/* Fact chip */}
        <div className="hub-facts hub-rise" style={{ animationDelay: "0.6s" }}>
          <span className="hub-fact-chip">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/glyph-alien.png" alt="" className="hub-fact-glyph" />
            <span className="hub-fact-num">198</span>&nbsp;unique aliens
          </span>
        </div>
      </main>
    </div>
  );
}
