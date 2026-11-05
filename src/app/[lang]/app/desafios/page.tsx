"use client";

import { useState } from "react";
import { Flame, Heart, Users } from "lucide-react";
import { Bar } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { offsetDay, useStore } from "@/lib/store";

const CREW = [
  { name: "Camila R.", days: 6, streak: 21 },
  { name: "Rafael T.", days: 5, streak: 12 },
  { name: "Bianca S.", days: 5, streak: 8 },
  { name: "Lucas M.", days: 3, streak: 4 },
  { name: "Paula A.", days: 2, streak: 2 },
];

const FEED = [
  { who: "Camila R.", key: "feed.a", ago: "12 min" },
  { who: "Rafael T.", key: "feed.b", ago: "1 h" },
  { who: "Bianca S.", key: "feed.c", ago: "3 h" },
];

export default function Challenges() {
  const { t } = useI18n();
  const log = useStore((s) => s.log);
  const profile = useStore((s) => s.profile);
  const streak = useStore((s) => s.streak);
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState(false);

  const week = Array.from({ length: 7 }, (_, i) => offsetDay(i));
  const myDays = new Set(log.filter((l) => week.includes(l.date)).map((l) => l.date)).size;

  const board = [...CREW, { name: `${profile?.name.split(" ")[0] ?? "Você"} (${t("challenges.you")})`, days: myDays, streak, me: true }]
    .sort((a, b) => b.days - a.days || b.streak - a.streak);

  const dayOfChallenge = 11;
  const total = 30;

  return (
    <div className="mx-auto max-w-5xl px-5 pt-8 md:px-10 md:pt-12">
      <p className="eyebrow">{t("challenges.eyebrow")}</p>
      <h1 className="font-display mt-2 text-5xl md:text-6xl">{t("challenges.title")}</h1>

      <section className="card mt-8 p-6 md:p-8" aria-label={t("challenges.current")}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{t("challenges.current")}</p>
            <h2 className="font-display mt-2 text-4xl md:text-5xl">{t("challenges.name")}</h2>
            <p className="mt-2 flex items-center gap-2 text-[13px] text-muted"><Users size={14} aria-hidden="true" />{t("challenges.by")} · {board.length} {t("challenges.members")}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-5xl">{dayOfChallenge}<span className="text-2xl text-muted">/{total}</span></p>
            <p className="eyebrow">{t("challenges.day")}</p>
          </div>
        </div>
        <div className="mt-6"><Bar value={dayOfChallenge / total} color="var(--ember)" /></div>
        <p className="mt-4 text-[13px] text-muted">{t("challenges.rule")}</p>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <section className="card p-6" aria-label={t("challenges.ranking")}>
          <p className="eyebrow">{t("challenges.ranking")}</p>
          <ol className="mt-4 divide-y divide-line">
            {board.map((m, i) => (
              <li key={m.name} className={`flex items-center gap-4 py-3.5 ${"me" in m ? "text-bronze" : ""}`}>
                <span className="font-display w-6 text-2xl text-muted">{i + 1}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-[0.5px] border-line text-[12px]">{m.name[0]}</span>
                <span className="flex-1 truncate">{m.name}</span>
                <span className="flex items-center gap-1 text-[12px] text-muted"><Flame size={13} className="text-ember" aria-hidden="true" />{m.streak}</span>
                <span className="w-16 text-right text-[13px]">{m.days} {t("challenges.days")}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-muted">{t("challenges.fair")}</p>
        </section>

        <div className="flex flex-col gap-4">
          <section className="card p-6" aria-label={t("challenges.feed")}>
            <p className="eyebrow">{t("challenges.feed")}</p>
            <ul className="mt-4 flex flex-col gap-4">
              {FEED.map((f, i) => (
                <li key={f.key} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[0.5px] border-line text-[12px]">{f.who[0]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px]"><b className="font-normal">{f.who}</b> {t(f.key)}</p>
                    <p className="text-[11px] text-muted">{f.ago}</p>
                  </div>
                  <button type="button" aria-pressed={!!liked[i]} aria-label={t("challenges.react")} onClick={() => setLiked((l) => ({ ...l, [i]: !l[i] }))} className="p-1">
                    <Heart size={18} strokeWidth={1.5} className={liked[i] ? "fill-ember text-ember" : "text-muted"} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-6" aria-label={t("challenges.join")}>
            <p className="eyebrow">{t("challenges.join")}</p>
            {joined ? (
              <p className="mt-3 text-bronze">{t("challenges.joined")}</p>
            ) : (
              <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) setJoined(true); }}>
                <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SCULPT-0000" aria-label={t("challenges.code")} />
                <button type="submit" className="btn btn-primary !px-5">{t("common.join")}</button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
