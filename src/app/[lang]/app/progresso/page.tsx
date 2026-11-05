"use client";

import { Crown, CalendarCheck, Dumbbell, Flame, Medal, Zap, Lock, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { BADGES, dayKey, offsetDay, useStore } from "@/lib/store";

const ICONS: Record<string, LucideIcon> = { Flame, Zap, CalendarCheck, Crown, Dumbbell, Medal };

export default function Progress() {
  const { t, lang } = useI18n();
  const log = useStore((s) => s.log);
  const bestStreak = useStore((s) => s.bestStreak);
  const xp = useStore((s) => s.xp);

  const minutes = Math.round(log.reduce((a, l) => a + l.sec, 0) / 60);
  const avgRpe = log.length ? (log.reduce((a, l) => a + l.rpe, 0) / log.length).toFixed(1) : "–";

  // Últimas 8 semanas (minutos por semana)
  const weeks = Array.from({ length: 8 }, (_, w) => {
    const from = 7 * (7 - w) + 6;
    const days = Array.from({ length: 7 }, (_, d) => offsetDay(from - d));
    const mins = Math.round(log.filter((l) => days.includes(l.date)).reduce((a, l) => a + l.sec, 0) / 60);
    return { mins, sessions: log.filter((l) => days.includes(l.date)).length };
  });
  const maxMins = Math.max(30, ...weeks.map((w) => w.mins));

  // Calendário de 5 semanas
  const cal = Array.from({ length: 35 }, (_, i) => {
    const key = offsetDay(34 - i);
    return { key, n: log.filter((l) => l.date === key).length };
  });

  const earned = new Set(BADGES.filter((b) => b.test({ log, bestStreak })).map((b) => b.id as string));
  const fmt = new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : lang, { day: "2-digit", month: "short" });

  const stats = [
    { k: "progress.sessions", v: log.length },
    { k: "progress.minutes", v: minutes },
    { k: "progress.best", v: bestStreak },
    { k: "progress.rpe", v: avgRpe },
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 pt-8 md:px-10 md:pt-12">
      <p className="eyebrow">{t("progress.eyebrow")}</p>
      <h1 className="font-display mt-2 text-5xl md:text-6xl">{t("progress.title")}</h1>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="card p-5">
            <p className="eyebrow">{t(s.k)}</p>
            <p className="font-display mt-2 text-5xl">{s.v}</p>
          </div>
        ))}
      </div>

      <section className="card mt-4 p-6" aria-label={t("progress.weekly")}>
        <p className="eyebrow">{t("progress.weekly")}</p>
        <div className="mt-6 flex h-40 items-end gap-3" role="img" aria-label={t("progress.weekly")}>
          {weeks.map((w, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-[11px] text-muted">{w.mins || ""}</span>
              <div className="relative w-full flex-1">
                <div className="absolute inset-x-0 bottom-0 rounded-t-lg" style={{ height: `${Math.max(3, (w.mins / maxMins) * 100)}%`, background: i === 7 ? "var(--ember)" : "var(--bronze)", opacity: w.mins ? 1 : 0.25 }} />
              </div>
              <span className="text-[10px] text-muted">{i === 7 ? t("progress.now") : `-${7 - i}s`}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] text-muted">{t("progress.minLabel")}</p>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card p-6" aria-label={t("progress.calendar")}>
          <p className="eyebrow">{t("progress.calendar")}</p>
          <div className="mt-5 grid grid-cols-7 gap-2">
            {cal.map((c) => (
              <div
                key={c.key}
                title={c.key}
                className={`aspect-square rounded-lg border-[0.5px] ${c.key === dayKey() ? "border-fg" : "border-line"}`}
                style={{ background: c.n ? `color-mix(in srgb, var(--ember) ${Math.min(100, 45 + c.n * 30)}%, transparent)` : "transparent" }}
              />
            ))}
          </div>
        </section>

        <section className="card p-6" aria-label={t("progress.badges")}>
          <p className="eyebrow">{t("progress.badges")} · {earned.size}/{BADGES.length}</p>
          <ul className="mt-5 grid grid-cols-3 gap-3">
            {BADGES.map((b) => {
              const Icon = ICONS[b.icon];
              const on = earned.has(b.id);
              return (
                <li key={b.id} className={`flex flex-col items-center gap-2 rounded-2xl border-[0.5px] border-line p-3 text-center ${on ? "" : "opacity-40"}`}>
                  {on ? <Icon size={24} strokeWidth={1.4} className="text-bronze" aria-hidden="true" /> : <Lock size={22} strokeWidth={1.4} aria-hidden="true" />}
                  <span className="text-[11px] leading-tight">{t(`badge.${b.id}`)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="card mt-4 p-6" aria-label={t("progress.history")}>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">{t("progress.history")}</p>
          <p className="text-[12px] text-muted">{xp} XP</p>
        </div>
        {log.length === 0 ? (
          <p className="mt-4 text-muted">{t("progress.empty")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {[...log].reverse().slice(0, 8).map((l, i) => {
              const [y, m, d] = l.date.split("-").map(Number);
              return (
                <li key={i} className="flex items-center justify-between py-3 text-[14px]">
                  <span>{fmt.format(new Date(y, m - 1, d))} · {t("lesson.title", { n: Number(l.lessonId.split("-")[1]) })}</span>
                  <span className="text-muted">{Math.round(l.sec / 60)} min · RPE {l.rpe} · +{l.xp}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
