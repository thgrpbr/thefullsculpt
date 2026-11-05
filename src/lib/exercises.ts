import { LESSONS_PER_PHASE, parseLessonId, phaseById, type Intensity } from "./phases";

export type MuscleId =
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "abs"
  | "erector"
  | "lats"
  | "pecs"
  | "traps"
  | "deltoids"
  | "biceps"
  | "triceps";

export type MotionType = "squat" | "hinge" | "press" | "raise";
export type MuscleRole = "primary" | "secondary" | "stabilizer";

export interface Exercise {
  id: string;
  motion: { type: MotionType; depth: number };
  primary: MuscleId[];
  secondary: MuscleId[];
  stabilizers: MuscleId[];
  cueCount: number;
}

export const EXERCISES: Record<string, Exercise> = {
  halfSquat: {
    id: "halfSquat",
    motion: { type: "squat", depth: 0.5 },
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "calves"],
    stabilizers: ["abs", "erector"],
    cueCount: 4,
  },
  squat: {
    id: "squat",
    motion: { type: "squat", depth: 1 },
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "calves"],
    stabilizers: ["abs", "erector"],
    cueCount: 4,
  },
  hinge: {
    id: "hinge",
    motion: { type: "hinge", depth: 1 },
    primary: ["hamstrings", "glutes"],
    secondary: ["erector", "lats"],
    stabilizers: ["abs", "traps"],
    cueCount: 4,
  },
  press: {
    id: "press",
    motion: { type: "press", depth: 1 },
    primary: ["deltoids"],
    secondary: ["triceps", "traps", "pecs"],
    stabilizers: ["abs", "erector"],
    cueCount: 4,
  },
  frontRaise: {
    id: "frontRaise",
    motion: { type: "raise", depth: 1 },
    primary: ["deltoids"],
    secondary: ["pecs", "biceps"],
    stabilizers: ["abs", "traps"],
    cueCount: 4,
  },
};

export function muscleRole(ex: Exercise, muscle: MuscleId): MuscleRole | null {
  if (ex.primary.includes(muscle)) return "primary";
  if (ex.secondary.includes(muscle)) return "secondary";
  if (ex.stabilizers.includes(muscle)) return "stabilizer";
  return null;
}

/* ---------- Aulas ---------- */

const FOCUS = ["legs", "upper", "posterior", "full", "balance"] as const;
export type Focus = (typeof FOCUS)[number];

const SEQUENCES: Record<Focus, string[]> = {
  legs: ["squat", "halfSquat", "hinge", "squat", "halfSquat"],
  upper: ["press", "frontRaise", "press", "frontRaise", "hinge"],
  posterior: ["hinge", "squat", "hinge", "frontRaise", "halfSquat"],
  full: ["squat", "press", "hinge", "frontRaise", "squat"],
  balance: ["halfSquat", "frontRaise", "hinge", "press", "halfSquat"],
};

const TIMING: Record<Intensity, { work: number; rest: number; rounds: number }> = {
  light: { work: 30, rest: 30, rounds: 2 },
  moderate: { work: 40, rest: 25, rounds: 2 },
  intense: { work: 45, rest: 20, rounds: 3 },
};

export interface LessonStep {
  exerciseId: string;
  round: number;
}

export interface Lesson {
  id: string;
  phase: number;
  n: number;
  focus: Focus;
  workSec: number;
  restSec: number;
  steps: LessonStep[];
  totalSec: number;
}

export function buildLesson(id: string): Lesson | null {
  const parsed = parseLessonId(id);
  if (!parsed || parsed.n > LESSONS_PER_PHASE) return null;
  const phase = phaseById(parsed.phase);
  const focus = FOCUS[(parsed.n - 1) % FOCUS.length];
  const timing = TIMING[phase.intensity];
  const base = SEQUENCES[focus].map((e) =>
    phase.intensity === "light" && e === "squat" ? "halfSquat" : e,
  );
  const steps: LessonStep[] = [];
  for (let r = 1; r <= timing.rounds; r++) {
    for (const exerciseId of base) steps.push({ exerciseId, round: r });
  }
  const totalSec = steps.length * timing.work + (steps.length - 1) * timing.rest;
  return { id, phase: parsed.phase, n: parsed.n, focus, workSec: timing.work, restSec: timing.rest, steps, totalSec };
}
