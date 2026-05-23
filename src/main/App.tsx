import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@shared/store/authStore';
import { useTimerStore } from '@shared/store/timerStore';
import { usePetStore } from '@shared/store/petStore';
import { useGoalsStore } from '@shared/store/goalsStore';
import { subscribeToGoals, subscribeToPetSettings } from '@shared/firestore';
import Nav from './components/Nav';
import Home from './pages/Home';
import Timer from './pages/Timer';
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
          <Route path="/goals" element={<Goals />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
