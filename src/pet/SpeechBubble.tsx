import { useEffect, useRef, useState } from 'react';
import { useTimerStore } from '@shared/store/timerStore';

const MESSAGES = [
  '잘하고 있어요',
  '조금만 더 힘내요',
  '집중력이 대단해요',
  '오늘도 멋져요',
  '쉬어가도 괜찮아요',
  '한 발씩 가요',
  '꾸준함이 답이에요',
  '이미 충분히 잘하고 있어요',
  '응원할게요',
  '거의 다 왔어요',
] as const;

const MIN_GAP_MS = 3 * 60 * 1000;
const MAX_GAP_MS = 7 * 60 * 1000;
const SHOW_MS = 4_500;
const FADE_MS = 350;

function randMs(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

function pickNext(prev: string | null): string {
  // Avoid immediate repeats.
  if (MESSAGES.length < 2) return MESSAGES[0];
  let next = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  while (next === prev) {
    next = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  }
  return next;
}

export default function SpeechBubble() {
  const status = useTimerStore((s) => s.status);
  const mode = useTimerStore((s) => s.mode);
  const active = status === 'running' && mode === 'focus';

  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const lastMessageRef = useRef<string | null>(null);
  const timersRef = useRef<Set<number>>(new Set());

  const setTimer = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  };

  const clearAllTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.clear();
  };

  useEffect(() => {
    clearAllTimers();
    setVisible(false);

    if (!active) return;

    // Recursive setTimeout pattern for a random-interval cycle.
    const scheduleNext = () => {
      const gap = randMs(MIN_GAP_MS, MAX_GAP_MS);
      setTimer(() => {
        const next = pickNext(lastMessageRef.current);
        lastMessageRef.current = next;
        setMessage(next);
        setVisible(true);
        setTimer(() => {
          setVisible(false);
          scheduleNext();
        }, SHOW_MS);
      }, gap);
    };
    scheduleNext();

    return clearAllTimers;
  }, [active]);

  // Unmount safety
  useEffect(() => clearAllTimers, []);

  if (!message) return null;

  return (
    <div
      // pointer-events-none so the bubble never blocks clicks/drag on the
      // pet underneath even while it's visible.
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1 select-none"
      style={{
        opacity: visible ? 1 : 0,
        transform: `translate(-50%, ${visible ? '0' : '-4px'})`,
        transition: `opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out`,
      }}
    >
      <div className="relative bg-white/95 rounded-2xl px-3 py-1.5 shadow-md max-w-[180px]">
        <span className="text-[11px] text-gray-800 whitespace-nowrap">
          {message}
        </span>
        {/* Tail pointing down toward the pet. Two stacked triangles fake
            a border + fill in one element. */}
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: -6,
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(255,255,255,0.95)',
          }}
        />
      </div>
    </div>
  );
}
