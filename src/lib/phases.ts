export type Level = "basic" | "intermediate" | "advanced";
export type Intensity = "light" | "moderate" | "intense";

export const LEVELS: Level[] = ["basic", "intermediate", "advanced"];
export const INTENSITIES: Intensity[] = ["light", "moderate", "intense"];

export interface Phase {
  id: number; // 1..9
  level: Level;
  intensity: Intensity;
}

export const PHASES: Phase[] = LEVELS.flatMap((level, li) =>
  INTENSITIES.map((intensity, ii) => ({ id: li * 3 + ii + 1, level, intensity })),
);

export const LESSONS_PER_PHASE = 6;

export const phaseById = (id: number): Phase => PHASES[Math.min(Math.max(id, 1), 9) - 1];
export const nextPhase = (id: number): Phase | null => (id >= 9 ? null : PHASES[id]);

export const lessonId = (phase: number, n: number) => `f${phase}-${n}`;

export function parseLessonId(id: string): { phase: number; n: number } | null {
  const m = /^f([1-9])-([1-9][0-9]?)$/.exec(id);
  if (!m) return null;
  const phase = Number(m[1]);
  const n = Number(m[2]);
  if (n < 1 || n > LESSONS_PER_PHASE) return null;
  return { phase, n };
}
