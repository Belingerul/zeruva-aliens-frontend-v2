// Synthesized sound effects via WebAudio — no audio assets needed.
// Every call is safe to make before user interaction (it just no-ops until
// the AudioContext is allowed to start).

let ctx: AudioContext | null = null;
const MUTE_KEY = "zeruva_muted";

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(m: boolean) {
  localStorage.setItem(MUTE_KEY, m ? "1" : "0");
}

function tone(
  freq: number,
  dur: number,
  {
    type = "sine" as OscillatorType,
    gain = 0.12,
    slideTo,
    delay = 0,
  }: { type?: OscillatorType; gain?: number; slideTo?: number; delay?: number } = {},
) {
  if (isMuted()) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.1, delay = 0) {
  if (isMuted()) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  // Softer, warmer UI clicks (the old square wave read as "cheap arcade").
  click: () => tone(660, 0.05, { type: "sine", gain: 0.05, slideTo: 760 }),
  hover: () => tone(900, 0.03, { type: "sine", gain: 0.02 }),
  tab: () => {
    tone(520, 0.06, { type: "sine", gain: 0.05, slideTo: 740 });
    tone(1040, 0.05, { type: "sine", gain: 0.022, delay: 0.02 });
  },
  eat: () => tone(560 + Math.random() * 320, 0.07, { type: "triangle", gain: 0.05, slideTo: 940 }),
  kill: () => {
    tone(200, 0.34, { type: "sawtooth", gain: 0.16, slideTo: 52 });
    noise(0.22, 0.1);
    tone(900, 0.12, { type: "triangle", gain: 0.09, delay: 0.05 });
  },
  death: () => {
    tone(300, 0.7, { type: "sawtooth", gain: 0.15, slideTo: 55 });
    noise(0.5, 0.09, 0.08);
  },
  // Ascending triad — feels like powering up rather than a single blip.
  join: () => [330, 494, 660].forEach((f, i) => tone(f, 0.22, { type: "triangle", gain: 0.1, delay: i * 0.06 })),
  // Cinematic "drop into the arena" whoosh for the ENTER button.
  enter: () => {
    noise(0.3, 0.06);
    tone(170, 0.5, { type: "sawtooth", gain: 0.12, slideTo: 720 });
    tone(340, 0.5, { type: "triangle", gain: 0.06, slideTo: 1080, delay: 0.02 });
  },
  channelTick: () => tone(920, 0.06, { type: "sine", gain: 0.06 }),
  cashoutDone: () =>
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, { type: "triangle", gain: 0.11, delay: i * 0.08 })),
  deposit: () => {
    tone(660, 0.12, { type: "triangle", gain: 0.09 });
    tone(990, 0.2, { type: "triangle", gain: 0.09, delay: 0.1 });
  },
  error: () => tone(170, 0.25, { type: "square", gain: 0.07, slideTo: 110 }),
};
