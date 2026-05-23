import { usePetStore } from '@shared/store/petStore';
import type { PetSpecies } from '@shared/types';

const speciesOptions: { value: PetSpecies; label: string }[] = [
  { value: 'fennec', label: '페넥' },
  { value: 'winter_fox', label: '윈터 폭스' },
  { value: 'otter', label: '수달' },
];

export default function Settings() {
  const species = usePetStore((s) => s.species);
  const name = usePetStore((s) => s.name);
  const setSpecies = usePetStore((s) => s.setSpecies);
  const setName = usePetStore((s) => s.setName);

  return (
    <div className="max-w-md space-y-8">
      <h1 className="text-2xl font-bold">설정</h1>

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
