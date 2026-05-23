import { useAuthStore } from '@shared/store/authStore';
import LevelProgress from '../components/LevelProgress';

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const authError = useAuthStore((s) => s.authError);
  const signInAnonymous = useAuthStore((s) => s.signInAnonymous);
  const signInGoogle = useAuthStore((s) => s.signInGoogle);
  const linkGoogle = useAuthStore((s) => s.linkGoogle);
  const signOut = useAuthStore((s) => s.signOut);
  const clearAuthError = useAuthStore((s) => s.clearAuthError);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">홈</h1>

      {authError && (
        <div className="px-3 py-2 bg-red-50 border border-red-300 text-red-700 rounded text-sm flex items-start justify-between gap-3">
          <span className="break-all">{authError}</span>
          <button
            type="button"
            onClick={clearAuthError}
            className="text-red-500 hover:text-red-700"
          >
            닫기
          </button>
        </div>
      )}

      {!user && (
        <section className="space-y-3">
          <p className="text-gray-600">시작하려면 로그인하세요.</p>
          <div className="flex gap-2">
            <button
              onClick={signInAnonymous}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            >
              익명으로 시작
            </button>
            <button
              onClick={signInGoogle}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              Google로 시작
            </button>
          </div>
        </section>
      )}

      {user && <LevelProgress />}

      {user && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            {user.photoURL && (
              <img
                src={user.photoURL}
                referrerPolicy="no-referrer"
                alt=""
                className="w-12 h-12 rounded-full object-cover"
              />
            )}
            <div className="text-sm text-gray-600 space-y-1">
              <p className="font-medium text-gray-900">
                {user.displayName ?? (isAnonymous ? '익명 사용자' : user.email)}
              </p>
              <p>UID: <span className="font-mono text-xs">{user.uid}</span></p>
              <p>계정 종류: {isAnonymous ? '익명' : (user.email ?? 'Google')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {isAnonymous && (
              <button
                onClick={linkGoogle}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Google 계정 연결
              </button>
            )}
            <button
              onClick={signOut}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            >
              로그아웃
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
