import { usePetStore } from '@shared/store/petStore';
import { useTimerStore } from '@shared/store/timerStore';
import PetDisplay from './PetDisplay';
import SpeechBubble from './SpeechBubble';

function formatToday(sec: number): string {
  const totalMinutes = Math.floor(Math.max(0, sec) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `오늘 ${h}시간 ${m}분`;
  return `오늘 ${m}분`;
}

const TEXT_SHADOW = '0 1px 4px rgba(0,0,0,0.6)';

export default function PetWindow() {
  const name = usePetStore((s) => s.name);
  const species = usePetStore((s) => s.species);
  const todayTotal = useTimerStore((s) => s.todayTotal);

  const handleClick = () => {
    window.electronAPI?.showMain();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    window.electronAPI?.showContextMenu();
  };

  // Wrapper carries the drag region; click targets opt out with pet-no-drag.
  // No background-color hack — `-webkit-app-region: drag` reports the region
  // to the OS via WM_NCHITTEST, so dragging works on transparent pixels
  // once the window itself composites transparently.
  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-end p-3 select-none pet-drag"
      onContextMenu={handleContextMenu}
    >
      <SpeechBubble />
      <button
        type="button"
        onClick={handleClick}
        aria-label={name || species}
        title="클릭하여 메인 창 열기"
        className="pet-no-drag block aspect-square w-full bg-transparent border-0 p-0 cursor-pointer"
      >
        <PetDisplay />
      </button>

      <div
        className="pet-drag w-full h-16 flex items-center justify-center text-white text-base font-medium tracking-wide"
        style={{ textShadow: TEXT_SHADOW }}
      >
        {formatToday(todayTotal)}
      </div>

      {name && (
        <div className="pet-drag text-xs px-2 py-0.5 bg-white/85 rounded-full shadow">
          {name}
        </div>
      )}
    </div>
  );
}
