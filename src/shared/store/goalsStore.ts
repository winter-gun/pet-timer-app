import { create } from 'zustand';
import { saveGoals } from '../firestore';
import { useAuthStore } from './authStore';

interface GoalsState {
  dailyGoalMin: number;
  weeklyGoalMin: number;
  setDailyGoal: (min: number) => void;
  setWeeklyGoal: (min: number) => void;
}

export const DEFAULT_DAILY_GOAL_MIN = 120; // 2 hours
export const DEFAULT_WEEKLY_GOAL_MIN = 840; // 14 hours

export const useGoalsStore = create<GoalsState>((set) => ({
  dailyGoalMin: DEFAULT_DAILY_GOAL_MIN,
  weeklyGoalMin: DEFAULT_WEEKLY_GOAL_MIN,

  setDailyGoal: (min) => {
    const clamped = Math.max(0, Math.floor(min));
    set({ dailyGoalMin: clamped });
    const user = useAuthStore.getState().user;
    if (user) {
      void saveGoals(user.uid, { dailyGoalMin: clamped });
    }
  },

  setWeeklyGoal: (min) => {
    const clamped = Math.max(0, Math.floor(min));
    set({ weeklyGoalMin: clamped });
    const user = useAuthStore.getState().user;
    if (user) {
      void saveGoals(user.uid, { weeklyGoalMin: clamped });
    }
  },
}));
