import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@shared/store/authStore';
import { useTimerStore } from '@shared/store/timerStore';
import { subscribeToRecentDailies, type DailyAggregate } from '@shared/firestore';

const WEEK_DAYS = 7;
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildLastNDays(n: number): { date: string; label: string; weekday: string }[] {
  const today = new Date();
  const out: { date: string; label: string; weekday: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({
      date: isoDate(d),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      weekday: DAY_LABELS[d.getDay()],
    });
  }
  return out;
}

function formatHM(sec: number): string {
  const totalMinutes = Math.floor(Math.max(0, sec) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

export default function Stats() {
  const user = useAuthStore((s) => s.user);
  const localTodayTotal = useTimerStore((s) => s.todayTotal);
  const [rows, setRows] = useState<DailyAggregate[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToRecentDailies(user.uid, WEEK_DAYS, setRows);
    return () => unsub();
  }, [user]);

  const days = useMemo(() => buildLastNDays(WEEK_DAYS), []);
  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.date, r.totalFocusSec);
    return map;
  }, [rows]);

  // Merge: if today isn't yet persisted (mid-session), fall back to local
  // todayTotal so the chart shows in-progress time too.
  const todayKey = days[days.length - 1].date;
  const remoteToday = byDate.get(todayKey) ?? 0;
  const todayFocusSec = Math.max(remoteToday, localTodayTotal);

  const series = days.map((d) => ({
    ...d,
    seconds: d.date === todayKey ? todayFocusSec : byDate.get(d.date) ?? 0,
  }));

  const weekTotalSec = series.reduce((sum, d) => sum + d.seconds, 0);
  const maxSec = Math.max(60, ...series.map((d) => d.seconds));

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">통계</h1>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="오늘" value={formatHM(todayFocusSec)} />
        <Stat label="이번 주 (7일)" value={formatHM(weekTotalSec)} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">최근 7일</h2>
        {!user && (
          <p className="text-sm text-gray-500">
            지난 기록을 보려면 로그인하세요. (로컬 오늘 시간은 그대로 표시됩니다)
          </p>
        )}
        <Chart series={series} maxSec={maxSec} todayKey={todayKey} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4 bg-white">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

interface ChartDay {
  date: string;
  label: string;
  weekday: string;
  seconds: number;
}

function Chart({
  series,
  maxSec,
  todayKey,
}: {
  series: ChartDay[];
  maxSec: number;
  todayKey: string;
}) {
  const W = 420;
  const H = 180;
  const PAD_L = 8;
  const PAD_R = 8;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const bandW = innerW / series.length;
  const barW = Math.min(36, bandW * 0.6);

  return (
    <div className="rounded-lg border p-3 bg-white overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
        {series.map((d, i) => {
          const cx = PAD_L + bandW * i + bandW / 2;
          const h = (d.seconds / maxSec) * innerH;
          const y = PAD_TOP + innerH - h;
          const isToday = d.date === todayKey;
          const fill = isToday ? '#3b82f6' : '#cbd5e1';
          return (
            <g key={d.date}>
              <rect
                x={cx - barW / 2}
                y={y}
                width={barW}
                height={Math.max(2, h)}
                rx={3}
                fill={fill}
              />
              <text
                x={cx}
                y={H - 16}
                textAnchor="middle"
                fontSize={11}
                fill={isToday ? '#1e40af' : '#475569'}
              >
                {d.weekday}
              </text>
              <text
                x={cx}
                y={H - 4}
                textAnchor="middle"
                fontSize={9}
                fill="#94a3b8"
              >
                {d.label}
              </text>
              {d.seconds > 0 && (
                <text
                  x={cx}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#475569"
                  className="tabular-nums"
                >
                  {Math.floor(d.seconds / 60)}분
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
