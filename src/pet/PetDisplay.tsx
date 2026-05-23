import { useEffect, useRef, useState } from 'react';
import { usePetStore } from '@shared/store/petStore';
import { useTimerStore } from '@shared/store/timerStore';
import { useLevelStore } from '@shared/store/levelStore';
import { useInventoryStore } from '@shared/store/inventoryStore';
import { ITEM_BY_ID } from '@shared/items';
import { getPetImage } from '@shared/petAssets';
import type { PetPose, TimerStatus } from '@shared/types';

const ALL_POSES: PetPose[] = [
  'idle',
  'focus',
  'study',
  'rest',
  'sleep',
  'celebrate',
  'talk',
];

type Mood = 'idle' | 'focus' | 'rest' | 'sleep' | 'celebrate';

const SLEEP_AFTER_MS = 5 * 60 * 1000;
const CELEBRATE_MS = 10_000;
const TALK_BLINK_MS = 400;
const TALK_FADE_MS = 200;
const STUDY_FADE_MS = 300;

function randMs(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

const moodToBasePose: Record<Mood, PetPose> = {
  idle: 'idle',
  focus: 'focus',
  rest: 'rest',
  sleep: 'sleep',
  celebrate: 'celebrate',
};

interface Props {
  className?: string;
}

export default function PetDisplay({ className = '' }: Props) {
  const species = usePetStore((s) => s.species);
  const timerStatus = useTimerStore((s) => s.status);
  const timerMode = useTimerStore((s) => s.mode);
  const equippedHatId = useInventoryStore((s) => s.equippedHat);
  const equippedAccessoryId = useInventoryStore((s) => s.equippedAccessory);
  const hat = equippedHatId ? ITEM_BY_ID[equippedHatId] : null;
  const accessory = equippedAccessoryId ? ITEM_BY_ID[equippedAccessoryId] : null;

  const reducedMotion = useReducedMotion();

  const [mood, setMood] = useState<Mood>(() => {
    if (timerStatus === 'running') return timerMode === 'rest' ? 'rest' : 'focus';
    return 'idle';
  });

  // Crossfaded overlay above the base pose. Kept in state so the
  // fade-out can finish visually after we hide it.
  const [overlayPose, setOverlayPose] = useState<PetPose | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);

  // All scheduled setTimeouts owned by the current effect run.
  const timersRef = useRef<Set<number>>(new Set());

  const addTimer = (cb: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      cb();
    }, ms);
    timersRef.current.add(id);
  };

  const clearAllTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.clear();
  };

  // Preload every pose for the active species so the first crossfade
  // doesn't flash a half-loaded image.
  useEffect(() => {
    ALL_POSES.forEach((pose) => {
      const img = new Image();
      img.src = getPetImage(species, pose);
    });
  }, [species]);

  // Derive mood from timer transitions. Natural completion
  // (running → idle with remainingSec === 0) triggers celebrate;
  // manual stop resets remainingSec to durationSec, so it won't.
  const prevStatusRef = useRef<TimerStatus>(timerStatus);
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = timerStatus;

    if (timerStatus === 'running') {
      setMood(timerMode === 'rest' ? 'rest' : 'focus');
      return;
    }
    if (timerStatus === 'paused') {
      setMood('idle');
      return;
    }
    if (prevStatus === 'running') {
      const { remainingSec } = useTimerStore.getState();
      if (remainingSec === 0) {
        setMood('celebrate');
        return;
      }
    }
    setMood('idle');
  }, [timerStatus, timerMode]);

  // Level-up takes priority over the timer-derived mood — drop into celebrate
  // as soon as a new level is announced. The mood effect below will arm the
  // 10s return-to-idle timer just like a natural completion.
  const justLeveledUpTo = useLevelStore((s) => s.justLeveledUpTo);
  useEffect(() => {
    if (justLeveledUpTo == null) return;
    setMood('celebrate');
  }, [justLeveledUpTo]);

  // Per-mood scheduling. Effect cleanup tears down every timer the
  // previous mood scheduled before the new mood arms its own.
  useEffect(() => {
    clearAllTimers();
    setOverlayVisible(false);

    // Mood state machine runs even with reduced motion so celebrate
    // and sleep don't get stuck.
    if (mood === 'idle') {
      addTimer(() => setMood('sleep'), SLEEP_AFTER_MS);
    } else if (mood === 'celebrate') {
      addTimer(() => setMood('idle'), CELEBRATE_MS);
    }

    if (!reducedMotion) {
      if (mood === 'idle') {
        const scheduleBlink = () => {
          addTimer(() => {
            setOverlayPose('talk');
            setOverlayVisible(true);
            addTimer(() => {
              setOverlayVisible(false);
              scheduleBlink();
            }, TALK_BLINK_MS);
          }, randMs(45_000, 75_000));
        };
        scheduleBlink();
      } else if (mood === 'focus') {
        const scheduleStudy = () => {
          addTimer(() => {
            setOverlayPose('study');
            setOverlayVisible(true);
            addTimer(() => {
              setOverlayVisible(false);
              scheduleStudy();
            }, randMs(3_000, 5_000));
          }, randMs(6_000, 10_000));
        };
        scheduleStudy();
      }
    }

    return clearAllTimers;
  }, [mood, reducedMotion]);

  // Final safety net — if the component unmounts while a timer is
  // pending, drop it.
  useEffect(() => clearAllTimers, []);

  const basePose = moodToBasePose[mood];
  const baseSrc = getPetImage(species, basePose);
  const overlaySrc = overlayPose ? getPetImage(species, overlayPose) : '';
  const overlayFadeMs = overlayPose === 'study' ? STUDY_FADE_MS : TALK_FADE_MS;
  const animationClass = reducedMotion ? '' : `pet-anim-${mood}`;

  return (
    <>
      <style>{`
        /* Organic curves: --soft is a gentle sine-like ease, --spring overshoots
           slightly for the celebrate bounce. Anchors use ratios that aren't 50/50
           so motion never feels metronome-mechanical. */
        @keyframes pet-breathe-idle {
          0%   { transform: translate(0, 0) scale(1); }
          45%  { transform: translate(0.8px, -4px) scale(1.012); }
          55%  { transform: translate(0.8px, -4px) scale(1.012); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes pet-breathe-focus {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(-0.4px, -2px) scale(1.006); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes pet-breathe-rest {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          50%  { transform: translate(1px, -6px) scale(1.02); opacity: 0.92; }
          100% { transform: translate(0, 0) scale(1); opacity: 1; }
        }
        @keyframes pet-sleep {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          50%  { transform: translate(0, -6px) scale(1.015); opacity: 0.85; }
          100% { transform: translate(0, 0) scale(1); opacity: 1; }
        }
        @keyframes pet-celebrate {
          0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
          25%      { transform: translate(-2px, -10px) scale(1.08) rotate(-3deg); }
          50%      { transform: translate(0, -2px) scale(0.98) rotate(0deg); }
          75%      { transform: translate(2px, -10px) scale(1.08) rotate(3deg); }
        }
        /* cubic-bezier(.45,.05,.55,.95) ≈ smoothed sine — feels like a breath
           cycle rather than a flat triangle. */
        .pet-anim-idle      { animation: pet-breathe-idle  3.4s cubic-bezier(.45,.05,.55,.95) infinite; }
        .pet-anim-focus     { animation: pet-breathe-focus 4.2s cubic-bezier(.45,.05,.55,.95) infinite; }
        .pet-anim-rest      { animation: pet-breathe-rest  3.6s cubic-bezier(.45,.05,.55,.95) infinite; }
        .pet-anim-sleep     { animation: pet-sleep         4.0s cubic-bezier(.4,.0,.6,1) infinite; }
        /* Spring-back overshoot for the celebration jump. */
        .pet-anim-celebrate { animation: pet-celebrate     0.8s cubic-bezier(.34,1.56,.64,1) infinite; }
      `}</style>
      <div
        className={`relative w-full h-full ${animationClass} ${className}`}
        // `containerType: inline-size` makes the cqw units on the equipped-item
        // emojis below scale relative to *this* wrapper's width, so they
        // grow/shrink with the pet window's size preset.
        style={{ willChange: 'transform, opacity', containerType: 'inline-size' }}
      >
        <img
          src={baseSrc}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
        {overlaySrc && (
          <img
            src={overlaySrc}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{
              opacity: overlayVisible ? 1 : 0,
              transition: `opacity ${overlayFadeMs}ms ease-in-out`,
            }}
          />
        )}
        {hat && (
          <div
            aria-hidden
            className="absolute pointer-events-none select-none"
            style={{
              top: '-2%',
              left: '50%',
              transform: 'translateX(-50%) rotate(-8deg)',
              fontSize: '34cqw',
              lineHeight: 1,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
            }}
          >
            {hat.emoji}
          </div>
        )}
        {accessory && (
          <div
            aria-hidden
            className="absolute pointer-events-none select-none"
            style={{
              top: '15%',
              right: '4%',
              fontSize: '20cqw',
              lineHeight: 1,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
            }}
          >
            {accessory.emoji}
          </div>
        )}
      </div>
    </>
  );
}
