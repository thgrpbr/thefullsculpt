"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Captions, CaptionsOff, Pause, Play, SkipForward, Volume2, VolumeX, Plus, Flame, Trophy } from "lucide-react";
import { buildLesson, EXERCISES } from "@/lib/exercises";
import { REP_SECONDS } from "@/lib/pose";
import { beep, fmtClock, vibrate } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { phaseById } from "@/lib/phases";
import { useI18n } from "@/i18n/provider";
import AnatomyPanel from "./AnatomyPanel";
import { Bar, Ring } from "./ui";

type Stage = "intro" | "work" | "rest" | "rate" | "done";

export default function Player({ lessonId, free }: { lessonId: string; free: boolean }) {
  const { t, href } = useI18n();
  const lesson = useMemo(() => buildLesson(lessonId), [lessonId]);
  const muted = useStore((s) => s.muted);
  const toggleMute = useStore((s) => s.toggleMute);
  const completeLesson = useStore((s) => s.completeLesson);
  const sub = useStore((s) => s.sub);

  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<Stage>("intro");
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cc, setCc] = useState(true);
  const [rpe, setRpe] = useState(6);
  const [result, setResult] = useState<{ xp: number; streak: number; newBadges: string[] } | null>(null);
  const [runKey, setRunKey] = useState(0);

  const endRef = useRef(0);
  const lastBeep = useRef(-1);
  const startedAt = useRef(0);
  const lessonStart = useRef(0);

  const workMs = (lesson?.workSec ?? 30) * 1000;
  const restMs = (lesson?.restSec ?? 30) * 1000;
  const total = lesson?.steps.length ?? 0;
  const step = lesson?.steps[Math.min(idx, total - 1)];
  const nextStep = lesson && idx + 1 < total ? lesson.steps[idx + 1] : null;

  const begin = useCallback((s: "work" | "rest", ms: number) => {
    endRef.current = Date.now() + ms;
    lastBeep.current = -1;
    setRemaining(ms);
    setStage(s);
    setPaused(false);
    setRunKey((k) => k + 1);
  }, []);

  const advance = useCallback(() => {
    if (!lesson) return;
    if (stage === "work") {
      if (idx >= total - 1) {
        beep(660, 300, muted);
        vibrate([120, 60, 120], muted);
        setStage("rate");
      } else {
        beep(520, 160, muted);
        vibrate(80, muted);
        begin("rest", restMs);
      }
    } else if (stage === "rest") {
      beep(980, 220, muted);
      vibrate(160, muted);
      setIdx((i) => i + 1);
      begin("work", workMs);
    }
  }, [lesson, stage, idx, total, muted, begin, restMs, workMs]);

  useEffect(() => {
    if (paused || (stage !== "work" && stage !== "rest")) return;
    const id = setInterval(() => {
      const r = Math.max(0, endRef.current - Date.now());
      setRemaining(r);
      const sec = Math.ceil(r / 1000);
      if (sec <= 3 && sec > 0 && sec !== lastBeep.current) {
        lastBeep.current = sec;
        beep(740, 90, muted);
      }
      if (r <= 0) advance();
    }, 100);
    return () => clearInterval(id);
  }, [paused, stage, advance, muted]);

  function start() {
    lessonStart.current = Date.now();
    startedAt.current = Date.now();
    beep(980, 220, muted);
    begin("work", workMs);
  }

  function togglePause() {
    if (paused) {
      endRef.current = Date.now() + remaining;
      setPaused(false);
    } else {
      setRemaining(Math.max(0, endRef.current - Date.now()));
      setPaused(true);
    }
  }

  function addRest() {
    endRef.current += 15000;
    setRemaining((r) => r + 15000);
  }

  function finish() {
    if (!lesson) return;
    const sec = Math.round((Date.now() - lessonStart.current) / 1000) || lesson.totalSec;
    setResult(completeLesson(lesson.id, sec, rpe, lesson.steps.length));
    setStage("done");
  }

  if (!lesson || !step) {
    return (
      <div className="p-8 text-center">
        <p className="font-display text-3xl">{t("player.notFound")}</p>
        <Link href={href("/app/metodo")} className="btn btn-primary mt-6">{t("common.back")}</Link>
      </div>
    );
  }

  const ex = EXERCISES[step.exerciseId];
  const phase = phaseById(lesson.phase);
  const nextEx = nextStep ? EXERCISES[nextStep.exerciseId] : null;

  /* ---------- Introdução ---------- */
  if (stage === "intro") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-12 text-center">
        <p className="eyebrow">{t("phase.label", { n: phase.id })} · {t(`level.${phase.level}`)} · {t(`intensity.${phase.intensity}`)}</p>
        <h1 className="font-display mt-4 text-5xl leading-[1.05] md:text-6xl">{t(`lesson.focus.${lesson.focus}`)}</h1>
        <p className="mt-4 text-muted">{t("lesson.title", { n: lesson.n })} · {Math.round(lesson.totalSec / 60)} min · {total} {t("player.exercises")}</p>
        {free && <p className="mt-5 rounded-full border-[0.5px] border-line px-4 py-1.5 text-[12px] tracking-wider text-bronze">{t("player.freeBadge")}</p>}
        <ul className="mt-10 w-full divide-y divide-line overflow-hidden rounded-2xl border-[0.5px] border-line bg-surface text-left">
          {lesson.steps.slice(0, 5).map((s, i) => (
            <li key={i} className="flex items-center justify-between px-5 py-3.5">
              <span>{t(`ex.${s.exerciseId}.name`)}</span>
              <span className="text-[12px] text-muted">{lesson.workSec}s</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-muted">{t("player.rounds", { n: lesson.steps.length / 5 })} · {t("player.restLine", { s: lesson.restSec })}</p>
        <p className="mt-6 max-w-xs text-center text-[11px] leading-relaxed text-muted">{t("legalui.healthNote")}</p>
        <button type="button" onClick={start} className="btn btn-ember mt-6 w-full max-w-xs">
          <Play size={16} aria-hidden="true" /> {t("player.start")}
        </button>
      </div>
    );
  }

  /* ---------- Avaliação ---------- */
  if (stage === "rate") {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
        <p className="eyebrow">{t("player.done")}</p>
        <h1 className="font-display mt-4 text-5xl">{t("player.rpeTitle")}</h1>
        <p className="mt-3 text-muted">{t("player.rpeText")}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-2" role="group" aria-label={t("player.rpeTitle")}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className="chip !h-12 !w-12 justify-center !p-0" aria-pressed={rpe === n} onClick={() => setRpe(n)}>{n}</button>
          ))}
        </div>
        <p className="mt-4 text-sm text-bronze">{t(rpe <= 3 ? "player.rpeLow" : rpe <= 7 ? "player.rpeMid" : "player.rpeHigh")}</p>
        <button type="button" className="btn btn-primary mt-10 w-full max-w-xs" onClick={finish}>{t("player.finish")}</button>
      </div>
    );
  }

  /* ---------- Resultado ---------- */
  if (stage === "done" && result) {
    const needsPay = free && sub !== "active";
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
        <Trophy size={36} className="text-bronze" aria-hidden="true" />
        <h1 className="font-display mt-5 text-5xl">{t("player.congrats")}</h1>
        <div className="mt-10 grid w-full grid-cols-2 gap-3">
          <div className="card p-5"><p className="eyebrow">XP</p><p className="font-display mt-2 text-4xl">+{result.xp}</p></div>
          <div className="card p-5"><p className="eyebrow">{t("home.streak")}</p><p className="font-display mt-2 flex items-center justify-center gap-2 text-4xl"><Flame size={24} className="text-ember" aria-hidden="true" />{result.streak}</p></div>
        </div>
        {result.newBadges.length > 0 && <p className="mt-6 text-bronze">{t("player.newBadges", { n: result.newBadges.length })}</p>}
        {needsPay ? (
          <div className="card mt-10 w-full p-6 text-left">
            <h2 className="font-display text-3xl">{t("player.paywallTitle")}</h2>
            <p className="mt-2 text-muted">{t("player.paywallText")}</p>
            <Link href={href("/assine")} className="btn btn-primary mt-6 w-full">{t("player.paywallCta")}</Link>
          </div>
        ) : (
          <Link href={href("/app")} className="btn btn-primary mt-10 w-full max-w-xs">{t("player.backHome")}</Link>
        )}
      </div>
    );
  }

  /* ---------- Treino ---------- */
  const working = stage === "work";
  const duration = working ? workMs : restMs;
  const elapsed = duration - remaining;
  const rep = Math.min(Math.floor(elapsed / (REP_SECONDS * 1000)) + 1, Math.ceil(workMs / (REP_SECONDS * 1000)));
  const cueIdx = Math.min(ex.cueCount - 1, Math.floor((elapsed / workMs) * ex.cueCount));
  const showEx = working ? ex : (nextEx ?? ex);
  const totalProgress = (idx + (working ? elapsed / workMs : 1)) / total;
  const urgent = remaining <= 3000 && !paused;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[1.15fr_1fr] lg:py-8">
      <div className="lg:col-span-2">
        <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
          <span>{t("player.step", { n: idx + 1, total })} · {t("player.round", { n: step.round })}</span>
          <span>{fmtClock(Math.max(0, lesson.totalSec * 1000 * (1 - totalProgress)))}</span>
        </div>
        <Bar value={totalProgress} />
      </div>

      {/* Vídeo (placeholder até as gravações) + legendas */}
      <div className="flex flex-col gap-5">
        <div className="relative aspect-video overflow-hidden rounded-[28px] border-[0.5px] border-line bg-surface">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-[0.5px] border-line"><Play size={22} className="text-muted" aria-hidden="true" /></div>
            <p className="eyebrow">{t("player.videoSoon")}</p>
            <p className="font-display px-6 text-3xl md:text-4xl">{t(`ex.${showEx.id}.name`)}</p>
          </div>
          {working && cc && (
            <p aria-live="polite" className="absolute inset-x-4 bottom-4 mx-auto w-fit max-w-[90%] rounded-xl bg-black/70 px-4 py-2 text-center text-[15px] text-white backdrop-blur">
              {t(`ex.${ex.id}.cue${cueIdx}`)}
            </p>
          )}
          <div className="absolute right-3 top-3 flex gap-2">
            <button type="button" aria-pressed={cc} aria-label={t("player.captions")} onClick={() => setCc((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
              {cc ? <Captions size={16} /> : <CaptionsOff size={16} />}
            </button>
            <button type="button" aria-pressed={!muted} aria-label={t("player.sound")} onClick={toggleMute} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
        </div>

        {/* Cronômetro */}
        <div className="card flex items-center gap-6 p-5">
          <Ring progress={duration ? elapsed / duration : 0} size={132} stroke={5} color={working ? "var(--ember)" : "var(--bronze)"}>
            <span className={`font-display text-5xl tabular-nums leading-none ${urgent ? "pulse-ember text-ember" : ""}`} aria-live="off">{fmtClock(remaining)}</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{working ? t("player.work") : t("player.rest")}</p>
            {working ? (
              <p className="font-display mt-1 text-3xl">{t("player.rep", { n: rep })}</p>
            ) : (
              <p className="mt-1 text-[15px]">{t("player.upNext")}: <span className="font-display text-2xl">{nextEx ? t(`ex.${nextEx.id}.name`) : ""}</span></p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={togglePause} className="btn btn-primary !h-11 !px-5" aria-label={paused ? t("player.resume") : t("player.pause")}>
                {paused ? <Play size={16} /> : <Pause size={16} />} {paused ? t("player.resume") : t("player.pause")}
              </button>
              {!working && (
                <button type="button" onClick={addRest} className="btn btn-ghost !h-11 !px-4"><Plus size={14} aria-hidden="true" />15s</button>
              )}
              <button type="button" onClick={advance} className="btn btn-ghost !h-11 !px-4" aria-label={t("player.skip")}><SkipForward size={16} /></button>
            </div>
          </div>
        </div>
      </div>

      {/* 3D */}
      <div className="flex flex-col gap-3">
        <AnatomyPanel
          exerciseId={showEx.id}
          playing={working && !paused}
          resetKey={`${runKey}-${showEx.id}`}
          className="h-[480px] lg:h-full lg:min-h-[620px]"
        />
        <div className="card p-5">
          <p className="eyebrow">{t("player.biomechanics")}</p>
          <p className="mt-2 text-[15px] leading-relaxed">{t(`ex.${showEx.id}.bio`)}</p>
        </div>
      </div>
    </div>
  );
}
