"use client";

import { LegalFooter } from "@/components/LegalBits";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Box, Check, Gauge, Trophy, UsersRound, Video } from "lucide-react";
import AnatomyPanel from "./AnatomyPanel";
import { LangSwitch, Wordmark } from "./ui";
import { useI18n } from "@/i18n/provider";
import { formatBrl, PLAN } from "@/lib/config";
import { INTENSITIES, LEVELS } from "@/lib/phases";

const FEATURES = [
  { k: "video", icon: Video },
  { k: "bio", icon: Box },
  { k: "timer", icon: Gauge },
  { k: "progress", icon: Activity },
  { k: "game", icon: Trophy },
  { k: "coach", icon: UsersRound },
] as const;

const DEMO_EXERCISES = ["squat", "hinge", "press"] as const;

export default function Landing() {
  const { t, href, lang } = useI18n();
  const [ex, setEx] = useState<(typeof DEMO_EXERCISES)[number]>("squat");

  useEffect(() => {
    // indicação de professor: ?ref=CODIGO (guardado para o cadastro)
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^[A-Za-z0-9]{3,24}$/.test(ref)) localStorage.setItem("tfs-ref", ref);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  return (
    <div className="theme-light">
      <header className="sticky top-0 z-40 border-b-[0.5px] border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <Wordmark size="sm" />
          <div className="flex items-center gap-3 md:gap-5">
            <LangSwitch />
            <Link href={href("/entrar")} className="hidden text-[13px] text-muted hover:text-fg md:block">{t("landing.login")}</Link>
            <Link href={href("/onboarding")} className="btn btn-primary !h-10 !px-5 text-[13px]">{t("landing.ctaShort")}</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto flex max-w-4xl flex-col items-center px-5 pb-16 pt-20 text-center md:pt-32">
          <p className="eyebrow">{t("landing.eyebrow")}</p>
          <h1 className="font-display mt-6 text-[clamp(3rem,9vw,6.5rem)] leading-[0.98] tracking-tight">
            {t("landing.title1")}<br /><em className="text-bronze">{t("landing.title2")}</em>
          </h1>
          <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-muted">{t("landing.subtitle")}</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href={href("/onboarding")} className="btn btn-primary">{t("landing.cta")}</Link>
            <a href="#metodo" className="btn btn-ghost">{t("landing.cta2")}</a>
          </div>
          <p className="mt-4 text-[12px] text-muted">{t("landing.note")}</p>
        </section>

        {/* Demo 3D */}
        <section className="mx-auto max-w-6xl px-5 pb-24 md:px-8" aria-label={t("landing.demoTitle")}>
          <div className="mb-8 flex flex-col items-center gap-5 text-center">
            <h2 className="font-display text-4xl md:text-6xl">{t("landing.demoTitle")}</h2>
            <p className="max-w-xl text-muted">{t("landing.demoText")}</p>
            <div className="flex gap-2" role="group" aria-label={t("landing.demoTitle")}>
              {DEMO_EXERCISES.map((e) => (
                <button key={e} type="button" className="chip" aria-pressed={ex === e} onClick={() => setEx(e)}>{t(`ex.${e}.name`)}</button>
              ))}
            </div>
          </div>
          <AnatomyPanel exerciseId={ex} playing resetKey={ex} className="h-[460px] md:h-[600px]" />
          <p className="mt-4 text-center text-[13px] text-muted">{t("ex." + ex + ".bio")}</p>
        </section>

        {/* Método */}
        <section id="metodo" className="bg-surface2/60 py-24">
          <div className="mx-auto max-w-5xl px-5 md:px-8">
            <p className="eyebrow text-center">{t("landing.methodEyebrow")}</p>
            <h2 className="font-display mt-3 text-center text-4xl md:text-6xl">{t("landing.methodTitle")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-muted">{t("landing.methodText")}</p>
            <div className="mt-12 overflow-x-auto">
              <div className="mx-auto grid min-w-[480px] max-w-3xl grid-cols-[110px_repeat(3,1fr)] gap-2">
                <div />
                {INTENSITIES.map((i) => <div key={i} className="eyebrow pb-1 text-center">{t(`intensity.${i}`)}</div>)}
                {LEVELS.map((lv, li) => (
                  <div key={lv} className="contents">
                    <div className="flex items-center text-[13px]">{t(`level.${lv}`)}</div>
                    {INTENSITIES.map((_, ii) => (
                      <div key={ii} className="card flex aspect-[4/3] items-center justify-center">
                        <span className="font-display text-4xl text-bronze">{li * 3 + ii + 1}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Recursos */}
        <section className="mx-auto max-w-6xl px-5 py-24 md:px-8">
          <h2 className="font-display text-center text-4xl md:text-6xl">{t("landing.featuresTitle")}</h2>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ k, icon: Icon }) => (
              <article key={k} className="card p-7">
                <Icon size={24} strokeWidth={1.3} className="text-bronze" aria-hidden="true" />
                <h3 className="font-display mt-6 text-3xl">{t(`landing.features.${k}.t`)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{t(`landing.features.${k}.d`)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Professores */}
        <section className="theme-dark py-24">
          <div className="mx-auto grid max-w-5xl items-center gap-10 px-5 md:grid-cols-2 md:px-8">
            <div>
              <p className="eyebrow">{t("landing.teachersEyebrow")}</p>
              <h2 className="font-display mt-3 text-4xl md:text-6xl">{t("landing.teachersTitle")}</h2>
              <p className="mt-5 leading-relaxed text-muted">{t("landing.teachersText")}</p>
              <a href="mailto:professores@thefullsculpt.com.br" className="btn btn-ghost mt-8">{t("landing.teachersCta")}</a>
            </div>
            <ul className="flex flex-col gap-3">
              {["t1", "t2", "t3"].map((k) => (
                <li key={k} className="card flex items-start gap-4 p-5"><Check size={18} className="mt-0.5 shrink-0 text-bronze" aria-hidden="true" /><span className="text-[15px]">{t(`landing.teachers.${k}`)}</span></li>
              ))}
            </ul>
          </div>
        </section>

        {/* Preço */}
        <section className="mx-auto max-w-lg px-5 py-24 text-center">
          <h2 className="font-display text-4xl md:text-6xl">{t("landing.pricingTitle")}</h2>
          <div className="card mt-10 p-8 text-left">
            <p className="eyebrow">{t("pricing.name")}</p>
            <p className="font-display mt-3 text-6xl">{formatBrl(PLAN.priceBrl, lang)}<span className="text-xl text-muted"> {t("pricing.per")}</span></p>
            <ul className="mt-6 flex flex-col gap-3 text-[15px]">
              {["p1", "p2", "p3", "p4"].map((k) => (
                <li key={k} className="flex items-start gap-3"><Check size={17} className="mt-0.5 shrink-0 text-bronze" aria-hidden="true" />{t(`pricing.${k}`)}</li>
              ))}
            </ul>
            <Link href={href("/onboarding")} className="btn btn-primary mt-8 w-full">{t("landing.cta")}</Link>
          </div>
        </section>
      </main>

      <footer className="border-t-[0.5px] border-line px-5 py-10 text-center text-[12px] text-muted">
        <Wordmark size="sm" />
        <div className="mt-4"><LegalFooter /></div>
        <p className="mt-4">{t("landing.footer")}</p>
        <p className="mt-1">© {new Date().getFullYear()} THE FULL SCULPT</p>
      </footer>
    </div>
  );
}
