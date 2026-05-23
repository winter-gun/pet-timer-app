import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@shared/store/authStore';
import { useTimerStore } from '@shared/store/timerStore';
import { usePetStore } from '@shared/store/petStore';
import { useGoalsStore } from '@shared/store/goalsStore';
import { useRoomStore } from '@shared/store/roomStore';
import { useLevelStore } from '@shared/store/levelStore';
import { useInventoryStore } from '@shared/store/inventoryStore';
import {
  saveUserLevel,
  subscribeToGoals,
  subscribeToInventory,
  subscribeToPetSettings,
  subscribeToUserProgress,
} from '@shared/firestore';
import { computeLevel } from '@shared/level';
import Nav from './components/Nav';
import Home from './pages/Home';
import Timer from './pages/Timer';
import Room from './pages/Room';
import Goals from './pages/Goals';
import Stats from './pages/Stats';
import Settings from './pages/Settings';

export default function App() {
  const init = useAuthStore((s) => s.init);
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const unsub = init();
    return () => unsub();
  }, [init]);

  // Tray/context-menu "시작|일시정지|재개" → toggle timer in this window
  // (tray status label is kept in sync via store:sync in timerStore.ts)
  useEffect(() => {
    return window.electronAPI?.onTimerToggle(() => {
      const { status, start, pause, resume } = useTimerStore.getState();
      if (status === 'idle') start();
      else if (status === 'running') pause();
      else resume();
    });
  }, []);

  // Pull pet settings + goals from Firestore once signed in. The snapshot also
  // delivers changes from other devices in near real time.
  useEffect(() => {
    if (!user) return;
    const unsubPet = subscribeToPetSettings(user.uid, (settings) => {
      const updates: Partial<{ species: typeof settings.species; name: string }> = {};
      if (settings.species) updates.species = settings.species;
      if (typeof settings.name === 'string') updates.name = settings.name;
      if (Object.keys(updates).length > 0) {
        usePetStore.setState(updates);
      }
    });
    const unsubGoals = subscribeToGoals(user.uid, (goals) => {
      const updates: Partial<{ dailyGoalMin: number; weeklyGoalMin: number }> = {};
      if (typeof goals.dailyGoalMin === 'number') updates.dailyGoalMin = goals.dailyGoalMin;
      if (typeof goals.weeklyGoalMin === 'number') updates.weeklyGoalMin = goals.weeklyGoalMin;
      if (Object.keys(updates).length > 0) {
        useGoalsStore.setState(updates);
      }
    });
    return () => {
      unsubPet();
      unsubGoals();
    };
  }, [user]);

  // Lifetime focus + level. Detect upward level transitions inside this
  // session (server-snapshot baseline is suppressed on first fire) so we can
  // celebrate them, and keep the stored level in Firestore caught up to the
  // value derived from totalFocusSec.
  useEffect(() => {
    if (!user) return;
    let initialized = false;
    let prevTotal = 0;
    let clearTimer: number | null = null;
    const { applyServerUpdate, markLevelUp, clearLevelUp } = useLevelStore.getState();

    const unsub = subscribeToUserProgress(user.uid, ({ totalFocusSec, level }) => {
      const computed = computeLevel(totalFocusSec).level;
      const effective = Math.max(level, computed);

      if (initialized) {
        const priorComputed = computeLevel(prevTotal).level;
        if (computed > priorComputed) {
          markLevelUp(computed);
          if (clearTimer != null) window.clearTimeout(clearTimer);
          // Matches PetDisplay's CELEBRATE_MS (10s) — give the bubble + pose
          // a little headroom before reverting.
          clearTimer = window.setTimeout(() => {
            clearLevelUp();
            clearTimer = null;
          }, 6000);
        }
      } else {
        initialized = true;
      }

      prevTotal = totalFocusSec;
      applyServerUpdate(totalFocusSec, effective);

      // If we crossed a threshold but Firestore hasn't been told yet, persist
      // the new level so a fresh login on another device won't re-fire it.
      if (computed > level) {
        void saveUserLevel(user.uid, computed);
      }
    });

    return () => {
      if (clearTimer != null) window.clearTimeout(clearTimer);
      unsub();
    };
  }, [user]);

  // Inventory mirror. Same user doc as goals/level/pet settings — Firestore
  // collapses overlapping listeners onto one network subscription, so adding
  // another onSnapshot here is cheap.
  useEffect(() => {
    if (!user) return;
    const apply = useInventoryStore.getState().applyServerUpdate;
    const unsub = subscribeToInventory(user.uid, apply);
    return unsub;
  }, [user]);

  // Attach the room listener whenever the user is signed in AND has a saved
  // room. Detach on sign-out so we don't leak Firestore listeners.
  const roomId = useRoomStore((s) => s.roomId);
  useEffect(() => {
    if (!user || !roomId) {
      useRoomStore.getState().detach();
      return;
    }
    useRoomStore.getState().attach();
    return () => useRoomStore.getState().detach();
  }, [user, roomId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Nav />
      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/timer" element={<Timer />} />
          <Route path="/room" element={<Room />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
