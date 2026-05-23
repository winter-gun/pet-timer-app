import { useState } from 'react';
import { usePetStore } from '@shared/store/petStore';
import { usePrefsStore } from '@shared/store/prefsStore';
import { useAuthStore } from '@shared/store/authStore';
import { playCompletionSound } from '@shared/sound';
import type { PetSpecies } from '@shared/types';
import LevelProgress from '../components/LevelProgress';
import CustomizePanel from '../components/CustomizePanel';

const speciesOptions: { value: PetSpecies; label: string }[] = [
  { value: 'fennec', label: '페넥' },
  { value: 'winter_fox', label: '윈터 폭스' },
  { value: 'otter', label: '수달' },
];

type Tab = 'basic' | 'customize';

function BasicTab() {
  const species = usePetStore((s) => s.species);
  const name = usePetStore((s) => s.name);
  const setSpecies = usePetStore((s) => s.setSpecies);
  const setName = usePetStore((s) => s.setName);
  const soundEnabled = usePrefsStore((s) => s.soundEnabled);
  const setSoundEnabled = usePrefsStore((s) => s.setSoundEnabled);
  const autoLaunch = usePrefsStore((s) => s.autoLaunch);
  const setAutoLaunch = usePrefsStore((s) => s.setAutoLaunch);

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <label className="block font-medium">펫 이름</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름을 입력하세요"
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </section>

      <section className="space-y-2">
        <label className="block font-medium">펫 종류</label>
        <div className="flex gap-2">
          {speciesOptions.map((s) => (
            <button
              key={s.value}
              onClick={() => setSpecies(s.value)}
              className={`px-4 py-2 rounded border ${
                species === s.value
                  ? 'bg-blue-100 border-blue-500'
                  : 'hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <label className="block font-medium">알림음</label>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">타이머 완료 시 소리 재생</span>
          </label>
          <button
            type="button"
            onClick={playCompletionSound}
            disabled={!soundEnabled}
            className="px-3 py-1 text-sm rounded border hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            미리 듣기
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <label className="block font-medium">시작 옵션</label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoLaunch}
            onChange={(e) => setAutoLaunch(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm">Windows 시작 시 자동 실행</span>
        </label>
        <p className="text-xs text-gray-500">
          켜두면 PC를 켤 때 펫이 트레이에 자동으로 나타납니다. 메인 창은 숨겨진 상태로 시작합니다.
        </p>
      </section>

      <section className="pt-4 border-t">
        <button
          onClick={() => window.electronAPI?.quit()}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded"
        >
          앱 종료
        </button>
      </section>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'customize', label: '꾸미기' },
];

export default function Settings() {
  const signedIn = useAuthStore((s) => Boolean(s.user));
  const [tab, setTab] = useState<Tab>('basic');

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-bold">설정</h1>

      {signedIn && <LevelProgress />}

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm -mb-px border-b-2 transition ${
              tab === t.id
                ? 'border-blue-500 text-blue-700 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'basic' ? <BasicTab /> : <CustomizePanel />}
    </div>
  );
}
