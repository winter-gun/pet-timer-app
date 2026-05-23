// Generates the completion chime via Web Audio API so no audio asset has to
// ship with the bundle. Three sine notes (C5 → E5 → G5) form a major triad —
// pleasant enough for a timer-done alert without crossing into alarm territory.

let cachedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (cachedCtx) return cachedCtx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    cachedCtx = new Ctor();
    return cachedCtx;
  } catch {
    return null;
  }
}

interface Note {
  freq: number;
  startOffset: number;
  duration: number;
}

const CHIME: readonly Note[] = [
  { freq: 523.25, startOffset: 0,    duration: 0.4 }, // C5
  { freq: 659.25, startOffset: 0.15, duration: 0.4 }, // E5
  { freq: 783.99, startOffset: 0.3,  duration: 0.55 }, // G5
];

export function playCompletionSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Electron's AudioContext can boot in 'suspended' state when no user
  // gesture has hit this renderer yet. Resume is fire-and-forget — the
  // very first chime may be silent, but every subsequent one will play.
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const now = ctx.currentTime;
  for (const note of CHIME) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = note.freq;

    const start = now + note.startOffset;
    const end = start + note.duration;
    // Attack 20ms, then exponential decay to near-silence by `end`.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, end);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }
}
