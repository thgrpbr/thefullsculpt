import { INTENSITIES, LEVELS, type Intensity, type Level } from "./phases";

export const GOALS = ["sculpt", "lose", "strength", "mobility", "health"] as const;
export const EXPERIENCE = ["none", "lt1", "y1to3", "gt3"] as const;
export const DAYS = [2, 3, 4, 5] as const;
export const INJURIES = ["knee", "back", "shoulder", "hip", "ankle", "wrist"] as const;
export const PARQ = ["heart", "chestActive", "chestRest", "balance", "joints", "meds", "other"] as const;
export const EQUIPMENT = ["none", "bands", "dumbbells", "gym"] as const;

export interface Answers {
  goal?: (typeof GOALS)[number];
  experience?: (typeof EXPERIENCE)[number];
  days?: number;
  age?: number;
  height?: number;
  weight?: number;
  injuries: string[];
  parq: Record<string, boolean>;
  equipment?: (typeof EQUIPMENT)[number];
  coaching: boolean;
}

export const emptyAnswers = (): Answers => ({ injuries: [], parq: {}, coaching: false });

export interface Assignment {
  phase: number;
  level: Level;
  intensity: Intensity;
  medicalClearance: boolean;
  restrictions: string[];
}

/** Regra inicial de classificação. Será parametrizável pelo admin. */
export function classify(a: Answers): Assignment {
  let levelIdx = { none: 0, lt1: 0, y1to3: 1, gt3: 2 }[a.experience ?? "none"];
  let intensityIdx = 0;

  if ((a.days ?? 3) <= 2) levelIdx = Math.max(0, levelIdx - (levelIdx === 2 ? 1 : 0));
  if (levelIdx >= 1 && (a.days ?? 3) >= 4) intensityIdx = 1;
  if (levelIdx === 2 && (a.days ?? 3) >= 5) intensityIdx = 2;

  const medicalClearance = Object.values(a.parq).some(Boolean);
  const restrictions = a.injuries.filter((i) => i !== "none");

  if (medicalClearance) {
    levelIdx = 0;
    intensityIdx = 0;
  } else if (restrictions.length >= 2 || (a.age ?? 30) >= 60) {
    intensityIdx = Math.min(intensityIdx, 0);
  }

  return {
    phase: levelIdx * 3 + intensityIdx + 1,
    level: LEVELS[levelIdx],
    intensity: INTENSITIES[intensityIdx],
    medicalClearance,
    restrictions,
  };
}
