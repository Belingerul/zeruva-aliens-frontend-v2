"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  twinklePhase: number;
  twinkleSpeed: number;
  hue: number | null; // null = default blue-white; otherwise a colored giant
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 -> 0
}

export default function DynamicStarfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId = 0;
    let visible = true;
    const reduced =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const stars: Star[] = [];
    const shooting: ShootingStar[] = [];
    const NUM_STARS = 140;
    let width = 0;
    let height = 0;
    let nextShootingAt = performance.now() + 1500 + Math.random() * 3000;

    // Pre-rendered glow sprites for colored giants. Drawing these is ~free;
    // per-star ctx.shadowBlur forces a GPU blur on every star every frame.
    const glowSprites = new Map<number, HTMLCanvasElement>();
    const glowSprite = (hue: number) => {
      let s = glowSprites.get(hue);
      if (!s) {
        s = document.createElement("canvas");
        s.width = s.height = 32;
        const sc = s.getContext("2d")!;
        const g = sc.createRadialGradient(16, 16, 0, 16, 16, 16);
        g.addColorStop(0, `hsla(${hue}, 90%, 75%, 1)`);
        g.addColorStop(0.35, `hsla(${hue}, 90%, 65%, 0.55)`);
        g.addColorStop(1, `hsla(${hue}, 90%, 60%, 0)`);
        sc.fillStyle = g;
        sc.fillRect(0, 0, 32, 32);
        glowSprites.set(hue, s);
      }
      return s;
    };

    const resizeCanvas = () => {
      // 1.5 DPR cap: visually identical at these sizes, much cheaper to fill.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const initStars = () => {
      stars.length = 0;
      for (let i = 0; i < NUM_STARS; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z: Math.random() * 3,
          size: Math.random() * 2 + 0.5,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.5 + Math.random() * 1.5,
          // ~7% of stars are colored giants (violet / gold / cyan)
          hue: Math.random() < 0.07 ? [265, 45, 190][Math.floor(Math.random() * 3)] : null,
        });
      }
    };

    const spawnShootingStar = () => {
      const fromTop = Math.random() < 0.6;
      const speed = 6 + Math.random() * 5;
      const angle = Math.PI * (0.65 + Math.random() * 0.2); // down-left diagonal
      shooting.push({
        x: fromTop ? Math.random() * width : width + 20,
        y: fromTop ? -20 : Math.random() * height * 0.4,
        vx: Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        life: 1,
      });
    };

    const animate = (now: number) => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      ctx.fillRect(0, 0, width, height);

      const t = now / 1000;

      for (const star of stars) {
        const speed = (star.z + 1) * 0.3;
        star.x -= speed * 0.5;
        star.y += speed * 0.5;

        if (star.x < 0) star.x = width;
        if (star.y > height) star.y = 0;

        const twinkle = 0.75 + 0.25 * Math.sin(t * star.twinkleSpeed + star.twinklePhase);
        const opacity = (0.3 + star.z * 0.3) * twinkle;

        if (star.hue !== null) {
          const size = star.size * 7;
          ctx.globalAlpha = opacity;
          ctx.drawImage(glowSprite(star.hue), star.x - size / 2, star.y - size / 2, size, size);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = `rgba(${100 + star.z * 50}, ${150 + star.z * 35}, 255, ${opacity})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Shooting stars
      if (now > nextShootingAt) {
        spawnShootingStar();
        nextShootingAt = now + 2500 + Math.random() * 5000;
      }
      for (let i = shooting.length - 1; i >= 0; i--) {
        const s = shooting[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.012;
        if (s.life <= 0 || s.x < -60 || s.y > height + 60) {
          shooting.splice(i, 1);
          continue;
        }
        const tailX = s.x - s.vx * 7;
        const tailY = s.y - s.vy * 7;
        const grad = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255, 255, 255, ${0.9 * s.life})`);
        grad.addColorStop(1, "rgba(139, 92, 246, 0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }

      animationId = visible ? requestAnimationFrame(animate) : 0;
    };

    // Single static frame for users who prefer reduced motion (and a cheap
    // redraw target on resize) — no rAF loop, no twinkle, no shooting stars.
    const drawStatic = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      for (const star of stars) {
        const opacity = 0.35 + star.z * 0.3;
        if (star.hue !== null) {
          const size = star.size * 7;
          ctx.globalAlpha = opacity;
          ctx.drawImage(glowSprite(star.hue), star.x - size / 2, star.y - size / 2, size, size);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = `rgba(${100 + star.z * 50}, ${150 + star.z * 35}, 255, ${opacity})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const start = () => {
      if (reduced || animationId) return;
      animationId = requestAnimationFrame(animate);
    };
    const stop = () => {
      if (animationId) cancelAnimationFrame(animationId);
      animationId = 0;
    };

    const onResize = () => {
      resizeCanvas();
      initStars();
      if (reduced) drawStatic();
    };

    resizeCanvas();
    initStars();
    if (reduced) drawStatic();
    else start();

    window.addEventListener("resize", onResize);

    // Stop burning frames when the canvas isn't on screen (tall pages, or
    // when another realm's view is layered over it).
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (reduced) return;
        if (visible) start();
        else stop();
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
