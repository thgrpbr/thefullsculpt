"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { LangSwitch, Wordmark } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { DAYS, EQUIPMENT, EXPERIENCE, GOALS, INJURIES, PARQ, type Assignment } from "@/lib/anamnese";
import { INTENSITIES, LEVELS, lessonId } from "@/lib/phases";
import { api, ApiError, type ServerState } from "@/lib/api";
import { useHydrated, useStore } from "@/lib/store";

const STEPS = ["welcome", "consent", "goal", "experience", "days", "body", "injuries", "parq", "equipment", "coaching", "analyzing", "result"] as const;
type Step = (typeof STEPS)[number];

/** Código de indicação de professor: ?ref= na URL ou guardado quando o visitante passou pela landing. */
function readRef(): string | undefined {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    const code = (fromUrl || localStorage.getItem("tfs-ref") || "").trim();
    return code || undefined;
  } catch {
    return undefined;
  }
}

function Title({ children, sub }: { children: string; sub?: string }) {
  return (
    <>
      <h1 className="font-display text-4xl leading-[1.08] md:text-5xl">{children}</h1>
      {sub && <p className="mt-3 text-muted">{sub}</p>}
    </>
  );
}

function Options({ values, current, onPick, prefix }: { values: readonly (string | number)[]; current?: string | number; onPick: (v: never) => void; prefix: string }) {
  const { t } = useI18n();
  return (
    <div className="mt-8 flex flex-col gap-2.5">
      {values.map((v) => (
        <button key={v} type="button" aria-pressed={current === v} onClick={() => onPick(v as never)} className={`card px-5 py-4 text-left transition-colors ${current === v ? "!border-fg bg-surface2" : "hover:bg-surface2"}`}>
          {t(`${prefix}.${v}`)}
        </button>
      ))}
    </div>
  );
}

export default function Onboarding() {
  const hydrated = useHydrated();
  const isUser = useStore((s) => s.mode === "user");
  if (!hydrated) return <div className="theme-light min-h-dvh" />;
  // quem já tem conta (cadastro feito, anamnese pendente) pula direto para as perguntas
  return <Flow startAt={isUser ? 2 : 0} />;
}

function Flow({ startAt }: { startAt: number }) {
  const { t, href, lang } = useI18n();
  const { answers, setAnswers, setParq, setProfile, finishAnamnese, applyServer } = useStore();
  const [i, setI] = useState(startAt);
  const step: Step = STEPS[i];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [health, setHealth] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [result, setResult] = useState<Assignment | null>(null);

  const isDemo = useStore((s) => s.isDemo);
  const eraseAll = useStore((s) => s.eraseAll);
  useEffect(() => {
    // Quem vem do modo demonstração começa uma anamnese limpa (sem herdar plano nem progresso do demo).
    if (isDemo) eraseAll();
  }, [isDemo, eraseAll]);

  useEffect(() => {
    if (step !== "analyzing") return;
    const id = setTimeout(() => {
      setResult(finishAnamnese());
      setI((n) => n + 1);
    }, 2200);
    return () => clearTimeout(id);
  }, [step, finishAnamnese]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const parqDone = PARQ.every((q) => answers.parq[q] !== undefined);

  const canNext: Record<Step, boolean> = {
    welcome: name.trim().length > 1 && emailOk && password.length >= 10,
    consent: terms && health,
    goal: !!answers.goal,
    experience: !!answers.experience,
    days: !!answers.days,
    body: true,
    injuries: true,
    parq: parqDone,
    equipment: !!answers.equipment,
    coaching: true,
    analyzing: false,
    result: true,
  };

  async function next() {
    if (step === "consent") {
      setBusy(true);
      setError("");
      try {
        applyServer(
          await api<ServerState>("POST", "/auth/register", {
            name: name.trim(),
            email: email.trim(),
            password,
            locale: lang,
            consents: { terms, health, marketing },
            ref: readRef(),
          }),
        );
      } catch (e) {
        const code = e instanceof ApiError ? e.code : "generic";
        if (code === "not_installed") {
          // API ainda não instalada neste ambiente: segue só neste navegador
          setProfile({ name: name.trim(), email: email.trim() }, { health, terms, marketing, at: new Date().toISOString() });
        } else {
          setError(t(`onb.errors.${["email_taken", "weak_password", "rate_limited", "network", "invalid_email"].includes(code) ? code : "generic"}`));
          setBusy(false);
          return;
        }
      }
      setBusy(false);
    }
    setI((n) => Math.min(STEPS.length - 1, n + 1));
  }

  const toggleInjury = (k: string) => {
    if (k === "none") return setAnswers({ injuries: [] });
    const has = answers.injuries.includes(k);
    setAnswers({ injuries: has ? answers.injuries.filter((x) => x !== k) : [...answers.injuries, k] });
  };

  const progress = Math.min(1, i / (STEPS.length - 2));

  return (
    <div className="theme-light flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        {i > 0 && step !== "analyzing" && step !== "result" ? (
          <button type="button" onClick={() => setI((n) => n - 1)} aria-label={t("common.back")} className="flex h-10 w-10 items-center justify-center rounded-full border-[0.5px] border-line"><ArrowLeft size={18} /></button>
        ) : (
          <Link href={href("/")}><Wordmark size="sm" /></Link>
        )}
        <LangSwitch />
      </header>
      <div className="mx-auto h-[2px] w-[calc(100%-40px)] max-w-xl overflow-hidden rounded-full bg-line md:w-full">
        <div className="h-full bg-fg transition-all duration-500" style={{ width: `${progress * 100}%` }} />
      </div>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-10 pt-10 md:pt-16">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28 }} className="flex flex-1 flex-col">
            {step === "welcome" && (
              <>
                <p className="eyebrow mb-4">{t("onb.freeLesson")}</p>
                <Title sub={t("onb.welcomeText")}>{t("onb.welcomeTitle")}</Title>
                <div className="mt-8 flex flex-col gap-3">
                  <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("onb.name")} aria-label={t("onb.name")} />
                  <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("onb.email")} aria-label={t("onb.email")} />
                  <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("onb.password")} aria-label={t("onb.password")} />
                  <p className="text-[12px] text-muted">{t("onb.passwordHint")}</p>
                </div>
              </>
            )}

            {step === "consent" && (
              <>
                <Title sub={t("onb.consentText")}>{t("onb.consentTitle")}</Title>
                <div className="mt-8 flex flex-col gap-3">
                  {[
                    { k: "terms", v: terms, set: setTerms, req: true },
                    { k: "health", v: health, set: setHealth, req: true },
                    { k: "marketing", v: marketing, set: setMarketing, req: false },
                  ].map((c) => (
                    <label key={c.k} className="card flex cursor-pointer items-start gap-4 p-5">
                      <input type="checkbox" checked={c.v} onChange={(e) => c.set(e.target.checked)} className="mt-1 h-5 w-5 accent-[#161514]" />
                      <span className="text-[14px] leading-relaxed">
                        {t(`onb.consent.${c.k}`)} {c.req ? <span className="text-ember">*</span> : <span className="text-muted">({t("common.optional")})</span>}
                        {c.k !== "marketing" && <> <a href={href(`/legal?doc=${c.k === "terms" ? "terms" : "consent_health"}`)} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-bronze underline underline-offset-2" onClick={(e) => e.stopPropagation()}>{c.k === "terms" ? "→ Termos" : "→ Termo"}</a></>}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-4 text-[12px] text-muted">{t("onb.consentFoot")}</p>
              </>
            )}

            {step === "goal" && (<><Title>{t("onb.goalTitle")}</Title><Options values={GOALS} current={answers.goal} onPick={(v) => setAnswers({ goal: v })} prefix="onb.goal" /></>)}
            {step === "experience" && (<><Title>{t("onb.expTitle")}</Title><Options values={EXPERIENCE} current={answers.experience} onPick={(v) => setAnswers({ experience: v })} prefix="onb.exp" /></>)}

            {step === "days" && (
              <>
                <Title sub={t("onb.daysText")}>{t("onb.daysTitle")}</Title>
                <div className="mt-8 grid grid-cols-4 gap-3">
                  {DAYS.map((d) => (
                    <button key={d} type="button" aria-pressed={answers.days === d} onClick={() => setAnswers({ days: d })} className={`card py-8 transition-colors ${answers.days === d ? "!border-fg bg-surface2" : "hover:bg-surface2"}`}>
                      <span className="font-display block text-5xl">{d}</span>
                      <span className="text-[11px] text-muted">{t("onb.perWeek")}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === "body" && (
              <>
                <Title sub={t("onb.bodyText")}>{t("onb.bodyTitle")}</Title>
                <div className="mt-8 grid gap-3">
                  {(["age", "height", "weight"] as const).map((f) => (
                    <label key={f} className="flex flex-col gap-1.5 text-[12px] text-muted">
                      {t(`onb.${f}`)}
                      <input type="number" inputMode="numeric" min={0} value={answers[f] ?? ""} onChange={(e) => setAnswers({ [f]: e.target.value ? Number(e.target.value) : undefined })} />
                    </label>
                  ))}
                </div>
              </>
            )}

            {step === "injuries" && (
              <>
                <Title sub={t("onb.injText")}>{t("onb.injTitle")}</Title>
                <div className="mt-8 flex flex-wrap gap-2.5">
                  <button type="button" className="chip" aria-pressed={answers.injuries.length === 0} onClick={() => toggleInjury("none")}>{t("onb.inj.none")}</button>
                  {INJURIES.map((k) => (
                    <button key={k} type="button" className="chip" aria-pressed={answers.injuries.includes(k)} onClick={() => toggleInjury(k)}>{t(`onb.inj.${k}`)}</button>
                  ))}
                </div>
              </>
            )}

            {step === "parq" && (
              <>
                <Title sub={t("onb.parqText")}>{t("onb.parqTitle")}</Title>
                <ul className="mt-8 flex flex-col gap-3">
                  {PARQ.map((q) => (
                    <li key={q} className="card flex items-center justify-between gap-4 p-4">
                      <span className="text-[14px] leading-snug">{t(`onb.parq.${q}`)}</span>
                      <div className="flex shrink-0 gap-1.5" role="group" aria-label={t(`onb.parq.${q}`)}>
                        {[true, false].map((val) => (
                          <button key={String(val)} type="button" className="chip !h-9 !px-4" aria-pressed={answers.parq[q] === val} onClick={() => setParq(q, val)}>
                            {val ? t("common.yes") : t("common.no")}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {step === "equipment" && (<><Title>{t("onb.eqTitle")}</Title><Options values={EQUIPMENT} current={answers.equipment} onPick={(v) => setAnswers({ equipment: v })} prefix="onb.eq" /></>)}

            {step === "coaching" && (
              <>
                <Title sub={t("onb.coachText")}>{t("onb.coachTitle")}</Title>
                <div className="mt-8 flex flex-col gap-2.5">
                  {[true, false].map((v) => (
                    <button key={String(v)} type="button" aria-pressed={answers.coaching === v} onClick={() => setAnswers({ coaching: v })} className={`card px-5 py-4 text-left transition-colors ${answers.coaching === v ? "!border-fg bg-surface2" : "hover:bg-surface2"}`}>
                      {t(v ? "onb.coachYes" : "onb.coachNo")}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === "analyzing" && (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div className="h-12 w-12 animate-spin rounded-full border-[1.5px] border-line border-t-fg" role="status" aria-label={t("common.loading")} />
                <p className="font-display mt-8 text-4xl">{t("onb.analyzing")}</p>
                <p className="mt-2 text-muted">{t("onb.analyzingText")}</p>
              </div>
            )}

            {step === "result" && result && (
              <>
                <p className="eyebrow mb-4">{t("onb.resultEyebrow")}</p>
                <h1 className="font-display text-5xl leading-[1.05] md:text-6xl">
                  {t("phase.label", { n: result.phase })}
                  <span className="block text-bronze"><em>{t(`level.${result.level}`)} · {t(`intensity.${result.intensity}`)}</em></span>
                </h1>
                <div className="mt-8 grid grid-cols-3 gap-1.5" aria-hidden="true">
                  {LEVELS.flatMap((_, li) => INTENSITIES.map((_, ii) => li * 3 + ii + 1)).map((id) => (
                    <div key={id} className={`flex aspect-[5/3] items-center justify-center rounded-xl border-[0.5px] font-display text-xl ${id === result.phase ? "border-fg bg-fg text-bg" : "border-line text-muted"}`}>{id}</div>
                  ))}
                </div>
                {result.medicalClearance && (
                  <div className="mt-6 flex gap-3 rounded-2xl border-[0.5px] border-ember p-4 text-[14px]" role="alert">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-ember" aria-hidden="true" />
                    <p>{t("onb.clearance")}</p>
                  </div>
                )}
                {result.restrictions.length > 0 && (
                  <p className="mt-4 text-[13px] text-muted">{t("onb.restrictions")}: {result.restrictions.map((r) => t(`onb.inj.${r}`)).join(", ")}</p>
                )}
                <p className="mt-6 text-muted">{t("onb.resultText")}</p>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {step !== "analyzing" && (
          <div className="mt-10">
            {step === "result" && result ? (
              <Link href={href(`/app/aula/${lessonId(result.phase, 1)}`)} className="btn btn-ember w-full">{t("onb.startFree")}</Link>
            ) : (
              <>
                {error && (
                  <p role="alert" className="mb-3 text-[14px] text-ember">
                    {error}{" "}
                    {error === t("onb.errors.email_taken") && <Link href={href("/entrar")} className="underline underline-offset-4">{t("auth.submit")}</Link>}
                  </p>
                )}
                <button type="button" className="btn btn-primary w-full disabled:opacity-35" disabled={!canNext[step] || busy} onClick={next}>
                  {busy ? t("common.loading") : step === "coaching" ? t("onb.finish") : t("common.continue")}
                </button>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
