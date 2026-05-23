import { useAuthStore } from '@shared/store/authStore';
import { useRoomStore } from '@shared/store/roomStore';
import { getPetImage } from '@shared/petAssets';
import type { RoomMember } from '@shared/firestore';

const MAX_VISIBLE = 5;
const ICON_PX = 32;

function statusEmoji(member: RoomMember): string | null {
  if (member.status !== 'running') return null;
  return member.mode === 'focus' ? '🔥' : '😴';
}

function FriendIcon({ member }: { member: RoomMember }) {
  const overlay = statusEmoji(member);
  return (
    <div
      className="pet-no-drag relative flex-shrink-0"
      style={{ width: ICON_PX, height: ICON_PX }}
      title={member.displayName}
    >
      <img
        src={getPetImage(member.petSpecies, 'idle')}
        alt={member.displayName}
        draggable={false}
        className="w-full h-full rounded-full object-cover bg-white/70 ring-1 ring-white/80 shadow-sm"
      />
      {overlay && (
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-white/90 shadow"
          style={{ width: 16, height: 16, fontSize: 10, lineHeight: 1 }}
        >
          {overlay}
        </span>
      )}
    </div>
  );
}

export default function FriendsStrip() {
  const roomId = useRoomStore((s) => s.roomId);
  const members = useRoomStore((s) => s.members);
  const myUid = useAuthStore((s) => s.user?.uid);

  if (!roomId) return null;

  const friends = members.filter((m) => m.uid !== myUid);
  if (friends.length === 0) return null;

  const visible = friends.slice(0, MAX_VISIBLE);
  const overflow = friends.length - visible.length;

  return (
    <div
      className="pet-no-drag flex items-center justify-center gap-1.5 w-full px-1 pb-1"
      style={{ minHeight: ICON_PX }}
    >
      {visible.map((m) => (
        <FriendIcon key={m.uid} member={m} />
      ))}
      {overflow > 0 && (
        <div
          className="pet-no-drag flex-shrink-0 rounded-full bg-black/55 text-white text-xs font-medium flex items-center justify-center ring-1 ring-white/60 shadow-sm"
          style={{ width: ICON_PX, height: ICON_PX }}
          title={`외 ${overflow}명`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
