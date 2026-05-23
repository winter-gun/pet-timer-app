import { useState } from 'react';
import { useAuthStore } from '@shared/store/authStore';
import { useRoomStore } from '@shared/store/roomStore';
import type { RoomMember } from '@shared/firestore';

const STATUS_LABEL: Record<RoomMember['status'], string> = {
  idle: '대기중',
  running: '집중중',
  paused: '일시정지',
};

const STATUS_DOT: Record<RoomMember['status'], string> = {
  idle: 'bg-gray-400',
  running: 'bg-green-500',
  paused: 'bg-yellow-500',
};

function formatToday(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Avatar({ photoURL, fallback }: { photoURL: string | null; fallback: string }) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt=""
        referrerPolicy="no-referrer"
        className="w-9 h-9 rounded-full object-cover bg-gray-200 flex-shrink-0"
      />
    );
  }
  const initial = fallback.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 text-white flex items-center justify-center font-medium flex-shrink-0">
      {initial}
    </div>
  );
}

function MemberRow({ member, isMe }: { member: RoomMember; isMe: boolean }) {
  const modeLabel =
    member.status === 'running'
      ? member.mode === 'focus' ? '집중' : '휴식'
      : member.status === 'paused' ? '일시정지' : null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 border rounded-lg bg-white">
      <Avatar photoURL={member.photoURL} fallback={member.displayName} />
      <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[member.status]}`} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {member.displayName}
          {isMe && <span className="ml-1.5 text-xs text-blue-600">(나)</span>}
        </div>
        <div className="text-xs text-gray-500">
          {modeLabel ?? STATUS_LABEL[member.status]} · 오늘 {formatToday(member.todayMin)}
        </div>
      </div>
    </div>
  );
}

function LobbyView() {
  const create = useRoomStore((s) => s.create);
  const join = useRoomStore((s) => s.join);
  const attaching = useRoomStore((s) => s.attaching);
  const error = useRoomStore((s) => s.error);
  const clearError = useRoomStore((s) => s.clearError);
  const [codeInput, setCodeInput] = useState('');

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-medium">새 공부방 만들기</h2>
        <button
          type="button"
          onClick={() => {
            clearError();
            void create();
          }}
          disabled={attaching}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
        >
          {attaching ? '생성 중…' : '방 만들기'}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">초대 코드로 참여</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="6자 코드"
            className="flex-1 px-3 py-2 border rounded font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={async () => {
              clearError();
              const ok = await join(codeInput);
              if (ok) setCodeInput('');
            }}
            disabled={attaching || codeInput.trim().length !== 6}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded disabled:opacity-50"
          >
            참여
          </button>
        </div>
      </section>

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-300 text-red-700 rounded text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

function RoomView() {
  const roomId = useRoomStore((s) => s.roomId)!;
  const members = useRoomStore((s) => s.members);
  const leave = useRoomStore((s) => s.leave);
  const userUid = useAuthStore((s) => s.user?.uid);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be denied in some Electron configs — silently ignore.
    }
  };

  const sorted = [...members].sort((a, b) => {
    if (a.uid === userUid) return -1;
    if (b.uid === userUid) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="space-y-0.5">
          <div className="text-xs text-blue-700">초대 코드</div>
          <div className="font-mono text-2xl tracking-widest text-blue-900">{roomId}</div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-1.5 text-sm bg-white border border-blue-300 rounded hover:bg-blue-100"
        >
          {copied ? '복사됨' : '코드 복사'}
        </button>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">멤버 ({members.length})</h2>
        </div>
        <div className="space-y-2">
          {sorted.length === 0 && (
            <div className="text-sm text-gray-500 px-3 py-4 text-center border rounded-lg">
              아직 멤버가 없습니다.
            </div>
          )}
          {sorted.map((m) => (
            <MemberRow key={m.uid} member={m} isMe={m.uid === userUid} />
          ))}
        </div>
      </section>

      <section className="pt-2">
        <button
          type="button"
          onClick={() => void leave()}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
        >
          방 나가기
        </button>
      </section>
    </div>
  );
}

export default function Room() {
  const roomId = useRoomStore((s) => s.roomId);
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-8 text-gray-500">
        공동 공부방을 사용하려면 먼저 로그인하세요.
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h1 className="text-2xl font-bold">공동 공부방</h1>
      {roomId ? <RoomView /> : <LobbyView />}
    </div>
  );
}
