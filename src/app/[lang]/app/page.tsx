"use client";

import Link from "next/link";
import { Check, ChevronRight, Flame, Lock, Play } from "lucide-react";
import { Bar } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { buildLesson } from "@/lib/exercises";
import { LESSONS_PER_PHASE, lessonId, nextPhase, phaseById } from "@/lib/phases";
import { dayKey, levelOf, levelProgress, offsetDay, useStore, XP_PER_LEVEL } from "@/lib/store";

export default function Home() {
  const { t, href, lang } = useI18n();
  const s = useStore();
  const a = s.assignment!;
  const phase = phaseById(a.phase);
  const next = nextPhase(a.phase);

  const done = Array.from({ length: LESSONS_PER_PHASE }, (_, i) => lessonId(a.phase, i + 1)).filter((id) => s.completed[id]).length;
  const nextN = Array.from({ length: LESSONS_PER_PHASE }, (_, i) => i + 1).find((n) => !s.completed[lessonId(a.phase, n)]);
  const ready = nextN === undefined;
  const todayId = lessonId(a.phase, nextN ?? 1);
  const lesson = buildLesson(todayId)!;
  const freeId = lessonId(a.phase, 1);
  const locked = s.sub !== "active" && todayId !== freeId;

  // semana (seg → dom)
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = offsetDay(dow - i);
    return { key, done: s.log.some((l) => l.date === key), today: key === dayKey(), future: i > dow };
  });
  const weekCount = week.filter((d) => d.done).length;
  const goal = s.answers.days ?? 3;
  const weekdays = new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : lang, { weekday: "narrow" });
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);

  const lvl = levelOf(s.xp);
  const name = s.profile?.name.split(" ")[0] ?? "";

  return (
    <div className="mx-auto max-w-5xl px-5 pt-6 md:px-10 md:pt-12">
      <p className="eyebrow">{new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : lang, { weekday: "long", day: "numeric", month: "long" }).format(now)}</p>
      <h1 className="font-display mt-2 text-5xl md:text-6xl">{t("home.hello", { name })}</h1>

      <div className="mt-8 grid gap-4 md:grid-cols-[1.5fr_1fr]">
        {/* Fase atual → próxima */}
        <section className="card p-6 md:p-8" aria-label={t("home.phase")}>
          <p className="eyebrow">{t("home.phase")} {phase.id}/9</p>
          <h2 className="font-display mt-3 text-4xl leading-tight md:text-5xl">
            {t(`level.${phase.level}`)} <em className="text-bronze">· {t(`intensity.${phase.intensity}`)}</em>
          </h2>
          <div className="mt-6 flex items-center justify-between text-[13px] text-muted">
            <span>{t("home.lessonsDone", { done, total: LESSONS_PER_PHASE })}</span>
            <span>{Math.round((done / LESSONS_PER_PHASE) * 100)}%</span>
          </div>
          <div className="mt-2"><Bar value={done / LESSONS_PER_PHASE} /></div>
          {next ? (
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-surface2 px-4 py-3 text-[13px]">
              <ChevronRight size={16} className="text-bronze" aria-hidden="true" />
              <span className="text-muted">{t("home.next")}</span>
              <span>{t(`level.${next.level}`)} · {t(`intensity.${next.intensity}`)}</span>
            </div>
          ) : (
            <p className="mt-6 text-bronze">{t("home.final")}</p>
          )}
          {ready && next && (
            <button type="button" className="btn btn-primary mt-5 w-full" onClick={s.advancePhase}>{t("home.advance")}</button>
          )}
        </section>

        {/* Streak */}
        <section className="card p-6 md:p-8" aria-label={t("home.streak")}>
          <p className="eyebrow">{t("home.streak")}</p>
          <p className="font-display mt-3 flex items-center gap-3 text-6xl">
            <Flame size={38} className="text-ember" strokeWidth={1.5} aria-hidden="true" />
            {s.streak}
          </p>
          <p className="mt-1 text-[13px] text-muted">{t("home.streakBest", { n: s.bestStreak })}</p>
          <div className="mt-6 flex justify-between" role="list" aria-label={t("home.week")}>
            {week.map((d, i) => {
              const day = new Date(monday);
              day.setDate(monday.getDate() + i);
              return (
                <div key={d.key} role="listitem" className="flex flex-col items-center gap-2">
                  <span className="text-[10px] uppercase text-muted">{weekdays.format(day)}</span>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] ${d.done ? "border-ember bg-ember text-white" : d.today ? "border-fg" : "border-line"} ${d.future ? "opacity-40" : ""}`}>
                    {d.done && <Check size={14} aria-label="ok" />}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-[13px] text-muted">{t("home.weekGoal", { n: weekCount, goal })}</p>
        </section>
      </div>

      {/* Aula de hoje */}
      <section className="card mt-4 flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8" aria-label={t("home.today")}>
        <div>
          <p className="eyebrow">{ready ? t("home.review") : t("home.today")}</p>
          <h2 className="font-display mt-2 text-4xl md:text-5xl">{t(`lesson.focus.${lesson.focus}`)}</h2>
          <p className="mt-2 text-muted">{t("lesson.title", { n: lesson.n })} · {Math.round(lesson.totalSec / 60)} min</p>
          {todayId === freeId && s.sub !== "active" && <p className="mt-3 text-[12px] tracking-wider text-bronze">{t("player.freeBadge")}</p>}
        </div>
        <Link href={href(locked ? "/assine" : `/app/aula/${todayId}`)} className={`btn ${locked ? "btn-ghost" : "btn-ember"} md:min-w-[200px]`}>
          {locked ? <Lock size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {locked ? t("home.unlock") : t("home.start")}
        </Link>
      </section>

      {/* XP */}
      <section className="card mt-4 p-6" aria-label="XP">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">{t("home.level")} {lvl}</p>
          <p className="text-[13px] text-muted">{s.xp} XP · {XP_PER_LEVEL - (s.xp % XP_PER_LEVEL)} {t("home.toNext")}</p>
        </div>
        <div className="mt-3"><Bar value={levelProgress(s.xp)} color="var(--ember)" /></div>
      </section>
    </div>
  );
}
