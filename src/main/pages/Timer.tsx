import { useEffect } from 'react';
import {
  useTimerStore,
  PRESET_LABELS,
  PRESET_DESCRIPTIONS,
  type TimerPreset,
} from '@shared/store/timerStore';
import { useLevelStore } from '@shared/store/levelStore';
import { useInventoryStore } from '@shared/store/inventoryStore';
import { coinBalance, coinsEarned, SEC_PER_COIN } from '@shared/items';

const PRESET_ORDER: TimerPreset[] = ['pomodoro', 'short', 'long', 'custom'];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0) return `${m}분 ${r}초`;
  return `${r}초`;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export default function Timer() {
  const status = useTimerStore((s) => s.status);
  const remainingSec = useTimerStore((s) => s.remainingSec);
  const preset = useTimerStore((s) => s.preset);
  const customFocusMin = useTimerStore((s) => s.customFocusMin);
  const customRestMin = useTimerStore((s) => s.customRestMin);
  const start = useTimerStore((s) => s.start);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const stop = useTimerStore((s) => s.stop);
  const tick = useTimerStore((s) => s.tick);
  const setPreset = useTimerStore((s) => s.setPreset);
  const setCustomDurations = useTimerStore((s) => s.setCustomDurations);
  const totalFocusSec = useLevelStore((s) => s.totalFocusSec);
  const coinsSpent = useInventoryStore((s) => s.coinsSpent);
  const balance = coinBalance(totalFocusSec, coinsSpent);
  // Seconds of focus needed to round out the next coin. coinsEarned() returns
  // the same value whether or not coins have been spent — so progress is
  // tracked on the lifetime accrual, not the spendable balance.
  const earned = coinsEarned(totalFocusSec);
  const secToNextCoin = SEC_PER_COIN - (totalFocusSec - earned * SEC_PER_COIN);

  useEffect(() => {
    if (status !== 'running') return;
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [status, tick]);

  const lockedToCurrent = status !== 'idle';

  return (
    <div className="max-w-md mx-auto space-y-6 py-4">
      <h1 className="text-2xl font-bold text-center">타이머</h1>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {PRESET_ORDER.map((p) => {
            const isActive = preset === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                disabled={lockedToCurrent}
                className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                  isActive
                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-300'
                    : 'bg-white hover:bg-gray-50 border-gray-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="font-semibold text-sm">{PRESET_LABELS[p]}</div>
                <div className="text-xs text-gray-600">{PRESET_DESCRIPTIONS[p]}</div>
              </button>
            );
          })}
        </div>

        {preset === 'custom' && (
          <div className="flex gap-4 justify-center items-center text-sm">
            <label className="flex items-center gap-1">
              집중
              <input
                type="number"
                min={1}
                max={180}
                value={customFocusMin}
                onChange={(e) =>
                  setCustomDurations(
                    clampInt(Number(e.target.value), 1, 180),
                    customRestMin,
                  )
                }
                disabled={lockedToCurrent}
                className="w-16 px-2 py-1 border rounded disabled:opacity-50"
              />
              분
            </label>
            <label className="flex items-center gap-1">
              휴식
              <input
                type="number"
                min={1}
                max={60}
                value={customRestMin}
                onChange={(e) =>
                  setCustomDurations(
                    customFocusMin,
                    clampInt(Number(e.target.value), 1, 60),
                  )
                }
                disabled={lockedToCurrent}
                className="w-16 px-2 py-1 border rounded disabled:opacity-50"
              />
              분
            </label>
          </div>
        )}
      </div>

      <div className="text-7xl font-mono text-center tabular-nums">
        {formatTime(remainingSec)}
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">💰</span>
          <span className="font-medium">{balance.toLocaleString()} 코인</span>
        </div>
        <span className="text-xs text-amber-700">
          다음 코인까지 {formatCountdown(secToNextCoin)}
        </span>
      </div>

      <div className="flex gap-2 justify-center">
        {status === 'idle' && (
          <button
            onClick={() => start()}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
          >
            시작
          </button>
        )}
        {status === 'running' && (
          <button
            onClick={pause}
            className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded"
          >
            일시정지
          </button>
        )}
        {status === 'paused' && (
          <button
            onClick={resume}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
          >
            재개
          </button>
        )}
        {status !== 'idle' && (
          <button
            onClick={stop}
            className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded"
          >
            정지
          </button>
        )}
      </div>
    </div>
  );
}
