import { useLevelStore } from '@shared/store/levelStore';
import { computeLevel } from '@shared/level';

function formatRemaining(sec: number): string {
  const totalMin = Math.ceil(Math.max(0, sec) / 60);
  if (totalMin < 60) return `${totalMin}분`;
  return `${Math.ceil(totalMin / 60)}시간`;
}

function formatTotal(sec: number): string {
  const totalMin = Math.floor(Math.max(0, sec) / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

export default function LevelProgress() {
  const totalFocusSec = useLevelStore((s) => s.totalFocusSec);
  const info = computeLevel(totalFocusSec);
  const percent = Math.round(info.progress * 100);

  return (
    <section className="space-y-2 p-4 bg-white border rounded-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-white text-xs font-bold">
            Lv.{info.level}
          </span>
          <span className="text-xs text-gray-500">
            총 {formatTotal(totalFocusSec)} 집중
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {info.nextLevel
            ? `Lv${info.nextLevel}까지 ${formatRemaining(info.remainingToNextSec)} 남음`
            : '최대 레벨 달성!'}
        </span>
      </div>
      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}
