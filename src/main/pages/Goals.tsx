import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@shared/store/authStore';
import { useGoalsStore } from '@shared/store/goalsStore';
import { useTimerStore } from '@shared/store/timerStore';
import { subscribeToRecentDailies, type DailyAggregate } from '@shared/firestore';

const WEEK_DAYS = 7;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatHM(sec: number): string {
  const totalMinutes = Math.floor(Math.max(0, sec) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

export default function Goals() {
  const user = useAuthStore((s) => s.user);
  const todayTotal = useTimerStore((s) => s.todayTotal);
  const dailyGoalMin = useGoalsStore((s) => s.dailyGoalMin);
  const weeklyGoalMin = useGoalsStore((s) => s.weeklyGoalMin);
  const setDailyGoal = useGoalsStore((s) => s.setDailyGoal);
  const setWeeklyGoal = useGoalsStore((s) => s.setWeeklyGoal);

  const [rows, setRows] = useState<DailyAggregate[]>([]);
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToRecentDailies(user.uid, WEEK_DAYS, setRows);
    return () => unsub();
  }, [user]);

  // Weekly progress = sum of the last 7 days' focus seconds (today comes
  // from local store so in-progress time counts).
  const todayKey = isoDate(new Date());
  const weekSec = useMemo(() => {
    const total = rows.reduce((sum, r) => {
      if (r.date === todayKey) return sum;
      return sum + r.totalFocusSec;
    }, 0);
    return total + todayTotal;
  }, [rows, todayTotal, todayKey]);

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">목표</h1>

      {!user && (
        <p className="text-sm text-gray-500">
          목표를 다른 기기와 동기화하려면 로그인하세요. (현재는 메모리에만 저장됩니다)
        </p>
      )}

      <GoalCard
        title="하루 목표"
        goalMin={dailyGoalMin}
        currentSec={todayTotal}
        onSetGoal={setDailyGoal}
      />

      <GoalCard
        title="주간 목표 (7일)"
        goalMin={weeklyGoalMin}
        currentSec={weekSec}
        onSetGoal={setWeeklyGoal}
      />
    </div>
  );
}

function GoalCard({
  title,
  goalMin,
  currentSec,
  onSetGoal,
}: {
  title: string;
  goalMin: number;
  currentSec: number;
  onSetGoal: (min: number) => void;
}) {
  const goalH = Math.floor(goalMin / 60);
  const goalM = goalMin % 60;
  const goalSec = goalMin * 60;
  const percent = goalSec > 0 ? Math.min(100, (currentSec / goalSec) * 100) : 0;
  const achieved = goalSec > 0 && currentSec >= goalSec;

  return (
    <section className="rounded-lg border p-4 bg-white space-y-3">
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex items-center gap-1 text-sm">
          <input
            type="number"
            min={0}
            max={99}
            value={goalH}
            onChange={(e) =>
              onSetGoal(clampInt(Number(e.target.value), 0, 99) * 60 + goalM)
            }
            className="w-14 px-2 py-1 border rounded tabular-nums"
            aria-label={`${title} 시간`}
          />
          <span>시간</span>
          <input
            type="number"
            min={0}
            max={59}
            value={goalM}
            onChange={(e) =>
              onSetGoal(goalH * 60 + clampInt(Number(e.target.value), 0, 59))
            }
            className="w-14 px-2 py-1 border rounded tabular-nums ml-1"
            aria-label={`${title} 분`}
          />
          <span>분</span>
        </div>
      </header>

      <div className="space-y-1">
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              achieved ? 'bg-emerald-500' : 'bg-blue-500'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-600 tabular-nums">
          <span>
            {formatHM(currentSec)} / {formatHM(goalSec)}
          </span>
          <span className={achieved ? 'text-emerald-600 font-medium' : ''}>
            {achieved ? '달성!' : `${Math.floor(percent)}%`}
          </span>
        </div>
      </div>
    </section>
  );
}
