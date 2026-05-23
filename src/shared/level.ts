// Level thresholds keyed to lifetime focus hours.
// Lv1: 0~5h, Lv2: 5~15h, Lv3: 15~30h, Lv4: 30~50h, Lv5: 50h+
const LEVEL_FLOOR_HOURS = [0, 5, 15, 30, 50] as const;
const SEC_PER_HOUR = 3600;

export const MAX_LEVEL = LEVEL_FLOOR_HOURS.length;

export interface LevelInfo {
  level: number;
  /** Floor (in seconds) of the current level. */
  prevThresholdSec: number;
  /** Floor (in seconds) of the next level. Equal to prevThresholdSec at max. */
  nextThresholdSec: number;
  /** 0..1 progress within the current level. */
  progress: number;
  /** Seconds until the next level. 0 at max level. */
  remainingToNextSec: number;
  /** Next level number, or null at max. */
  nextLevel: number | null;
}

export function computeLevel(totalFocusSec: number): LevelInfo {
  const sec = Math.max(0, totalFocusSec);
  let level = 1;
  for (let i = 0; i < LEVEL_FLOOR_HOURS.length; i++) {
    if (sec >= LEVEL_FLOOR_HOURS[i] * SEC_PER_HOUR) level = i + 1;
  }

  const prevThresholdSec = LEVEL_FLOOR_HOURS[level - 1] * SEC_PER_HOUR;
  if (level >= MAX_LEVEL) {
    return {
      level,
      prevThresholdSec,
      nextThresholdSec: prevThresholdSec,
      progress: 1,
      remainingToNextSec: 0,
      nextLevel: null,
    };
  }

  const nextThresholdSec = LEVEL_FLOOR_HOURS[level] * SEC_PER_HOUR;
  const span = nextThresholdSec - prevThresholdSec;
  const within = sec - prevThresholdSec;
  return {
    level,
    prevThresholdSec,
    nextThresholdSec,
    progress: Math.min(1, Math.max(0, within / span)),
    remainingToNextSec: Math.max(0, nextThresholdSec - sec),
    nextLevel: level + 1,
  };
}
