"use client";

/** Warm three-note chime (C5, E5, G5) made with the Web Audio API. */
let ctx: AudioContext | null = null;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a tap or click so the browser allows sound later. */
export function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  // A silent blip fully unlocks audio on iOS.
  const o = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0;
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.01);
}

export function playChime() {
  const c = getCtx();
  if (c) {
    const now = c.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const start = now + i * 0.16;
      const osc = c.createOscillator();
      const overtone = c.createOscillator();
      const gain = c.createGain();
      const overtoneGain = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      overtone.type = "triangle";
      overtone.frequency.setValueAtTime(freq * 2, start);
      overtoneGain.gain.setValueAtTime(0.06, start);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.85);
      osc.connect(gain);
      overtone.connect(overtoneGain).connect(gain);
      gain.connect(c.destination);
      osc.start(start);
      overtone.start(start);
      osc.stop(start + 0.9);
      overtone.stop(start + 0.9);
    });
  }
  // Android only. iPhones ignore vibration from websites.
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([200, 100, 200, 100, 300]);
}
