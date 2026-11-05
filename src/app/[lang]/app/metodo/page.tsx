"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Lock, Play } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { buildLesson } from "@/lib/exercises";
import { INTENSITIES, LESSONS_PER_PHASE, LEVELS, lessonId, phaseById } from "@/lib/phases";
import { useStore } from "@/lib/store";

export default function Method() {
  const { t, href } = useI18n();
  const a = useStore((s) => s.assignment)!;
  const completed = useStore((s) => s.completed);
  const sub = useStore((s) => s.sub);
  const [sel, setSel] = useState(a.phase);
  const selPhase = phaseById(sel);
  const reached = sel <= a.phase;
  const freeId = lessonId(a.phase, 1);

  return (
    <div className="mx-auto max-w-5xl px-5 pt-8 md:px-10 md:pt-12">
      <p className="eyebrow">{t("method.eyebrow")}</p>
      <h1 className="font-display mt-2 text-5xl md:text-6xl">{t("method.title")}</h1>
      <p className="mt-3 max-w-xl text-muted">{t("method.text")}</p>

      <div className="mt-10 overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-[110px_repeat(3,1fr)] gap-2" role="group" aria-label={t("method.title")}>
          <div />
          {INTENSITIES.map((i) => <div key={i} className="eyebrow pb-1 text-center">{t(`intensity.${i}`)}</div>)}
          {LEVELS.map((lv, li) => (
            <div key={lv} className="contents">
              <div className="flex items-center text-[13px]">{t(`level.${lv}`)}</div>
              {INTENSITIES.map((_, ii) => {
                const id = li * 3 + ii + 1;
                const state = id < a.phase ? "done" : id === a.phase ? "current" : id === a.phase + 1 ? "next" : "locked";
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={sel === id}
                    aria-label={`${t("phase.label", { n: id })} — ${t(`phase.state.${state}`)}`}
                    onClick={() => setSel(id)}
                    className={`relative flex aspect-[4/3] flex-col items-start justify-between rounded-2xl border-[0.5px] p-4 text-left transition-colors ${
                      state === "current" ? "border-bronze bg-surface" : state === "next" ? "border-dashed border-muted bg-transparent" : "border-line bg-surface/60"
                    } ${sel === id ? "ring-1 ring-fg" : ""} ${state === "locked" ? "opacity-50" : ""}`}
                  >
                    <span className="font-display text-3xl">{id}</span>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted">{t(`phase.state.${state}`)}</span>
                    {state === "done" && <Check size={14} className="absolute right-3 top-3 text-bronze" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <section className="mt-10" aria-label={t("phase.label", { n: sel })}>
        <h2 className="font-display text-3xl">
          {t("phase.label", { n: selPhase.id })} · {t(`level.${selPhase.level}`)} <em className="text-bronze">{t(`intensity.${selPhase.intensity}`)}</em>
        </h2>
        {!reached && <p className="mt-2 text-sm text-muted">{t("method.locked")}</p>}
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border-[0.5px] border-line bg-surface">
          {Array.from({ length: LESSONS_PER_PHASE }, (_, i) => i + 1).map((n) => {
            const id = lessonId(sel, n);
            const lesson = buildLesson(id)!;
            const done = !!completed[id];
            const paywalled = sub !== "active" && id !== freeId;
            const disabled = !reached;
            const inner = (
              <>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-[0.5px] border-line text-[13px]">
                  {done ? <Check size={15} className="text-bronze" aria-hidden="true" /> : n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{t(`lesson.focus.${lesson.focus}`)}</span>
                  <span className="block text-[12px] text-muted">{Math.round(lesson.totalSec / 60)} min</span>
                </span>
                {disabled || paywalled ? <Lock size={15} className="text-muted" aria-label={t("common.locked")} /> : <Play size={15} className="text-muted" aria-hidden="true" />}
              </>
            );
            return (
              <li key={id}>
                {disabled ? (
                  <div className="flex items-center gap-4 px-5 py-4 opacity-50">{inner}</div>
                ) : (
                  <Link href={href(paywalled ? "/assine" : `/app/aula/${id}`)} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface2">{inner}</Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
