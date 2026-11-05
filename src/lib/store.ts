"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { classify, emptyAnswers, type Answers, type Assignment } from "./anamnese";
import { LESSONS_PER_PHASE, lessonId, phaseById } from "./phases";

export interface LogEntry {
  date: string; // YYYY-MM-DD (dia local)
  lessonId: string;
  sec: number;
  rpe: number;
  xp: number;
}

export interface Consents {
  health: boolean;
  terms: boolean;
  marketing: boolean;
  at: string;
}

export type Sub = "free" | "active";

interface State {
  profile: { name: string; email: string } | null;
  consents: Consents | null;
  answers: Answers;
  assignment: Assignment | null;
  sub: Sub;
  xp: number;
  streak: number;
  bestStreak: number;
  lastDay: string | null;
  completed: Record<string, LogEntry>;
  log: LogEntry[];
  isDemo: boolean;
  muted: boolean;

  setProfile: (p: { name: string; email: string }, c: Consents) => void;
  setAnswers: (a: Partial<Answers>) => void;
  setParq: (q: string, value: boolean) => void;
  finishAnamnese: () => Assignment;
  subscribe: () => void;
  advancePhase: () => void;
  toggleMute: () => void;
  completeLesson: (id: string, sec: number, rpe: number, steps: number) => { xp: number; streak: number; newBadges: string[] };
  loadDemo: () => void;
  eraseAll: () => void;
}

export const dayKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const daysBetween = (a: string, b: string) =>
  Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);

export const offsetDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return dayKey(d);
};

/* ---------- Gamificação ---------- */

export const XP_PER_LEVEL = 400;
export const levelOf = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1;
export const levelProgress = (xp: number) => (xp % XP_PER_LEVEL) / XP_PER_LEVEL;

export const BADGES = [
  { id: "first", icon: "Flame", test: (s: Snap) => s.log.length >= 1 },
  { id: "streak3", icon: "Zap", test: (s: Snap) => s.bestStreak >= 3 },
  { id: "streak7", icon: "CalendarCheck", test: (s: Snap) => s.bestStreak >= 7 },
  { id: "streak14", icon: "Crown", test: (s: Snap) => s.bestStreak >= 14 },
  { id: "lessons5", icon: "Dumbbell", test: (s: Snap) => s.log.length >= 5 },
  { id: "lessons15", icon: "Medal", test: (s: Snap) => s.log.length >= 15 },
] as const;

type Snap = Pick<State, "log" | "bestStreak">;
const earned = (s: Snap) => BADGES.filter((b) => b.test(s)).map((b) => b.id as string);

/* ---------- Store ---------- */

const initial = {
  profile: null,
  consents: null,
  answers: emptyAnswers(),
  assignment: null,
  sub: "free" as Sub,
  xp: 0,
  streak: 0,
  bestStreak: 0,
  lastDay: null,
  completed: {} as Record<string, LogEntry>,
  log: [] as LogEntry[],
  isDemo: false,
  muted: false,
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial,

      setProfile: (profile, consents) => set({ profile, consents }),
      setAnswers: (a) => set((s) => ({ answers: { ...s.answers, ...a } })),
      setParq: (q, value) => set((s) => ({ answers: { ...s.answers, parq: { ...s.answers.parq, [q]: value } } })),
      finishAnamnese: () => {
        const assignment = classify(get().answers);
        set({ assignment });
        return assignment;
      },
      subscribe: () => set({ sub: "active" }),
      advancePhase: () =>
        set((s) => {
          if (!s.assignment || s.assignment.phase >= 9) return {};
          const phase = s.assignment.phase + 1;
          const p = phaseById(phase);
          return { assignment: { ...s.assignment, phase, level: p.level, intensity: p.intensity } };
        }),
      toggleMute: () => set((s) => ({ muted: !s.muted })),

      completeLesson: (id, sec, rpe, steps) => {
        const s = get();
        const today = dayKey();
        const xp = 50 + steps * 10;
        let streak = s.streak;
        if (s.lastDay !== today) {
          streak = s.lastDay && daysBetween(s.lastDay, today) <= 2 ? s.streak + 1 : 1;
        }
        const entry: LogEntry = { date: today, lessonId: id, sec, rpe, xp };
        const log = [...s.log, entry];
        const bestStreak = Math.max(s.bestStreak, streak);
        const before = earned(s);
        const after = earned({ log, bestStreak });
        set({
          xp: s.xp + xp,
          streak,
          bestStreak,
          lastDay: today,
          log,
          completed: { ...s.completed, [id]: entry },
        });
        return { xp, streak, newBadges: after.filter((b) => !before.includes(b)) };
      },

      loadDemo: () => {
        const offsets = [1, 2, 4, 5, 7, 8, 9, 11, 12, 14, 15, 16, 18, 19];
        const log: LogEntry[] = offsets.map((o, i) => ({
          date: offsetDay(o),
          lessonId: lessonId(i < 8 ? 3 : 4, (i % LESSONS_PER_PHASE) + 1),
          sec: 540 + ((i * 53) % 300),
          rpe: 5 + (i % 4),
          xp: 110,
        }));
        const completed: Record<string, LogEntry> = {};
        for (const n of [1, 2, 3]) {
          completed[lessonId(4, n)] = { date: offsetDay(n), lessonId: lessonId(4, n), sec: 640, rpe: 6, xp: 110 };
        }
        set({
          profile: { name: "Marina Duarte", email: "marina@exemplo.com" },
          consents: { health: true, terms: true, marketing: false, at: new Date().toISOString() },
          answers: { ...emptyAnswers(), goal: "sculpt", experience: "y1to3", days: 4, coaching: true },
          assignment: { phase: 4, level: "intermediate", intensity: "light", medicalClearance: false, restrictions: [] },
          sub: "active",
          xp: 1840,
          streak: 5,
          bestStreak: 9,
          lastDay: offsetDay(1),
          completed,
          log,
          isDemo: true,
        });
      },

      eraseAll: () => set({ ...initial, answers: emptyAnswers() }),
    }),
    {
      name: "tfs-v1",
      partialize: (s) => ({
        profile: s.profile,
        consents: s.consents,
        answers: s.answers,
        assignment: s.assignment,
        sub: s.sub,
        xp: s.xp,
        streak: s.streak,
        bestStreak: s.bestStreak,
        lastDay: s.lastDay,
        completed: s.completed,
        log: s.log,
        isDemo: s.isDemo,
        muted: s.muted,
      }),
    },
  ),
);

/** Evita divergência SSR/cliente: só devolve true após a montagem. */
const noopSubscribe = () => () => {};
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
