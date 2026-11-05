"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Check } from "lucide-react";
import { LangSwitch, Wordmark } from "@/components/ui";
import { LegalModal } from "@/components/LegalModal";
import { checkPassword, PasswordField } from "@/components/PasswordField";
import { clearDraft, loadDraft, saveDraft } from "@/lib/onbDraft";
import { useI18n } from "@/i18n/provider";
import { DAYS, EQUIPMENT, EXPERIENCE, GOALS, INJURIES, PARQ, type Answers, type Assignment } from "@/lib/anamnese";
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

function MultiOptions({ values, current, onToggle, prefix }: { values: readonly string[]; current: string[]; onToggle: (v: string) => void; prefix: string }) {
  const { t } = useI18n();
  return (
    <div className="mt-8 flex flex-col gap-2.5">
      {values.map((v) => {
        const on = current.includes(v);
        return (
          <button key={v} type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(v)} className={`card flex items-center justify-between gap-4 px-5 py-4 text-left transition-colors ${on ? "!border-fg bg-surface2" : "hover:bg-surface2"}`}>
            <span>{t(`${prefix}.${v}`)}</span>
            <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[0.5px] transition-colors ${on ? "border-fg bg-fg text-bg" : "border-line"}`}>{on && <Check size={14} strokeWidth={2.4} />}</span>
          </button>
        );
      })}
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${on ? "bg-[#2f7a4a]" : "bg-[#c9c4bb]"}`}>
      <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-[2px]"}`} />
    </button>
  );
}

/** Idade em anos completos a partir de AAAA-MM-DD; null se a data for inválida ou futura. */
function ageFrom(iso: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (y < 1900 || dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || dt > now) return null;
  let age = now.getFullYear() - y;
  if (now.getMonth() < mo - 1 || (now.getMonth() === mo - 1 && now.getDate() < d)) age--;
  return age;
}

/** Silhueta minimalista que responde à altura e ao peso. */
function Silhouette({ height, weight }: { height?: number; weight?: number }) {
  const h = height ?? 170;
  const w = weight ?? 68;
  const bmi = w / Math.pow(h / 100, 2);
  const wf = Math.max(0.82, Math.min(1.3, 0.82 + (bmi - 18) / 18));
  const sy = Math.max(0.78, Math.min(1.12, h / 170));
  const on = height !== undefined || weight !== undefined;
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 0.9, opacity: on ? 0.9 : 0.35 } as const;
  return (
    <svg viewBox="0 0 160 250" className="mx-auto h-[210px] text-fg" aria-hidden="true">
      <line x1="10" y1="236" x2="150" y2="236" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
      <g style={{ transform: `scaleY(${sy})`, transformOrigin: "80px 236px", transition: "transform .35s ease" }}>
        <circle cx="80" cy="34" r="15" {...stroke} />
        <g style={{ transform: `scaleX(${wf})`, transformOrigin: "80px 120px", transition: "transform .35s ease" }}>
          <rect x="58" y="54" width="44" height="86" rx="22" {...stroke} />
          <rect x="40" y="58" width="14" height="76" rx="7" {...stroke} />
          <rect x="106" y="58" width="14" height="76" rx="7" {...stroke} />
          <rect x="59" y="138" width="20" height="98" rx="10" {...stroke} />
          <rect x="81" y="138" width="20" height="98" rx="10" {...stroke} />
        </g>
      </g>
    </svg>
  );
}

function Metric({ label, value, unit, min, max, init, onChange, hint }: { label: string; value?: number; unit: string; min: number; max: number; init: number; onChange: (v: number) => void; hint: string }) {
  return (
    <div className="rounded-[22px] border-[0.5px] border-line bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="font-display text-5xl leading-none tabular-nums">{value ?? "—"}<span className="ml-1 font-sans text-[14px] text-muted">{unit}</span></span>
      </div>
      <input type="range" className="tfs-range mt-5" min={min} max={max} value={value ?? init} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} onPointerDown={() => value === undefined && onChange(init)} />
      {value === undefined && <p className="mt-2 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export default function Onboarding() {
  const hydrated = useHydrated();
  const isUser = useStore((s) => s.mode === "user");
  if (!hydrated) return <div className="theme-light min-h-dvh" />;
  // quem já tem conta (cadastro feito, anamnese pendente) pula direto para as perguntas
  return <Flow isUser={isUser} />;
}

function Flow({ isUser }: { isUser: boolean }) {
  const { t, href, lang } = useI18n();
  const { answers, setAnswers, setParq, setProfile, finishAnamnese, applyServer } = useStore();
  const minStep = isUser ? 2 : 0; // depois do cadastro criado não se volta para os dados da conta
  const draft = useMemo(() => loadDraft(), []);
  const [i, setI] = useState(() => {
    if (!draft) return minStep;
    const idx = STEPS.indexOf(draft.step as Step);
    if (idx < 0) return minStep;
    // a senha nunca é guardada: antes do cadastro recomeça pela 1ª tela, com os campos já preenchidos
    return isUser ? Math.max(2, Math.min(idx, STEPS.indexOf("coaching"))) : 0;
  });
  const step: Step = STEPS[i];

  const [name, setName] = useState(draft?.name ?? "");
  const [email, setEmail] = useState(draft?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState(draft?.terms ?? false);
  const [health, setHealth] = useState(draft?.health ?? false);
  const [adult, setAdult] = useState(draft?.adult ?? false);
  const [marketing, setMarketing] = useState(draft?.marketing ?? false);
  const [birth, setBirth] = useState(draft?.birth ?? "");
  const [modal, setModal] = useState<"terms" | "health" | null>(null);
  const [result, setResult] = useState<Assignment | null>(null);
  const restored = useRef(false);
  const draftNote = !!draft && !isUser && (draft.name !== "" || draft.email !== "");

  useEffect(() => {
    // devolve ao app as respostas do rascunho (conta real não guarda a anamnese no navegador)
    if (draft && !restored.current) {
      restored.current = true;
      if (draft.answers) useStore.getState().setAnswers(draft.answers);
    }
  }, [draft]);

  const isDemo = useStore((s) => s.isDemo);
  const eraseAll = useStore((s) => s.eraseAll);
  useEffect(() => {
    // Quem vem do modo demonstração começa uma anamnese limpa (sem herdar plano nem progresso do demo).
    if (isDemo) eraseAll();
  }, [isDemo, eraseAll]);

  useEffect(() => {
    if (step !== "analyzing") return;
    const id = setTimeout(() => {
      clearDraft();
      setResult(finishAnamnese());
      setI((n) => n + 1);
    }, 2200);
    return () => clearTimeout(id);
  }, [step, finishAnamnese]);

  useEffect(() => {
    if (step === "analyzing" || step === "result") return;
    saveDraft({ step, name, email, terms, health, adult, marketing, birth, answers: answers as Answers });
  }, [step, name, email, terms, health, adult, marketing, birth, answers]);

  const age = ageFrom(birth);
  const underage = age !== null && age < 18;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const parqDone = PARQ.every((q) => answers.parq[q] !== undefined);

  const canNext: Record<Step, boolean> = {
    welcome: name.trim().length > 1 && emailOk && checkPassword(password).ok && password.toLowerCase() !== email.trim().toLowerCase() && age !== null && age >= 18,
    consent: terms && health && adult,
    goal: answers.goals.length > 0,
    experience: !!answers.experience,
    days: !!answers.days,
    body: true,
    injuries: true,
    parq: parqDone,
    equipment: answers.equipment.length > 0,
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
            consents: { terms, health, adult, marketing },
            birth,
            ref: readRef(),
          }),
        );
        setAnswers({ birth, age: age ?? undefined }); // o estado do servidor ainda não tem a anamnese
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

  const toggleIn = (key: "goals" | "equipment", v: string, exclusive?: string) => {
    const cur = answers[key];
    if (v === exclusive) return setAnswers({ [key]: cur.includes(v) ? [] : [v] });
    const base = cur.filter((x) => x !== exclusive);
    setAnswers({ [key]: base.includes(v) ? base.filter((x) => x !== v) : [...base, v] });
  };
  const toggleInjury = (k: string) => {
    if (k === "none") return setAnswers({ injuries: [] });
    const has = answers.injuries.includes(k);
    setAnswers({ injuries: has ? answers.injuries.filter((x) => x !== k) : [...answers.injuries, k] });
  };

  const progress = Math.min(1, i / (STEPS.length - 2));

  return (
    <div className="theme-light flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        {i > minStep && step !== "analyzing" && step !== "result" ? (
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
                  <PasswordField value={password} onChange={setPassword} placeholder={t("onb.password")} />
                  {password.length === 0 && <p className="text-[12px] text-muted">{t("onb2.pw.need")}</p>}
                  <div className="rounded-[14px] border-[0.5px] border-line bg-surface px-[18px] py-3">
                    <label htmlFor="birth" className="text-[12px] text-muted">{t("onb2.body.birth")}</label>
                    <div className="flex items-center justify-between gap-3">
                      <input id="birth" type="date" className="tfs-date" value={birth} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} onChange={(e) => { setBirth(e.target.value); const a2 = ageFrom(e.target.value); setAnswers({ birth: e.target.value, age: a2 ?? undefined }); }} />
                      {age !== null && !underage && <span className="whitespace-nowrap text-[14px] text-muted tabular-nums">{t("onb2.body.age", { n: age })}</span>}
                    </div>
                  </div>
                  {birth !== "" && age === null && <p role="alert" className="text-[12px] text-ember">{t("onb2.body.invalid")}</p>}
                  {underage && <p role="alert" className="text-[13px] text-ember">{t("onb2.body.minor")}</p>}
                  {birth === "" && <p className="text-[12px] text-muted">{t("onb2.birthHint")}</p>}
                  {draftNote && <p className="rounded-xl bg-surface2 px-4 py-3 text-[12px] text-muted" role="status">{t("onb2.draft")}</p>}
                </div>
              </>
            )}

            {step === "consent" && (
              <>
                <Title sub={t("onb.consentText")}>{t("onb.consentTitle")}</Title>
                <div className="mt-8 divide-y divide-line overflow-hidden rounded-[22px] border-[0.5px] border-line bg-surface">
                  {([["terms", terms, "onb2.consent.termsRow"], ["health", health, "onb2.consent.healthRow"]] as const).map(([k, v, label]) => (
                    <div key={k} className="flex items-center justify-between gap-3 px-5 py-4">
                      <span className="flex min-w-0 items-center gap-3 text-[15px]">
                        <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[0.5px] ${v ? "border-[#2f7a4a] bg-[#2f7a4a] text-white" : "border-line"}`}>{v && <Check size={14} strokeWidth={2.4} />}</span>
                        <span className="whitespace-nowrap">{t(label)}<span className="text-ember"> *</span></span>
                      </span>
                      <button type="button" onClick={() => setModal(k)} className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] ${v ? "text-muted underline underline-offset-4" : "bg-fg text-bg"}`}>{v ? t("onb2.consent.reread") : t("onb2.consent.read")}</button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 px-5 py-4">
                    <span className="whitespace-nowrap text-[15px]">{t("onb2.consent.adult")}<span className="text-ember"> *</span></span>
                    <Switch on={adult} onChange={setAdult} label={t("onb2.consent.adult")} />
                  </div>
                  <div className="flex items-center justify-between gap-3 px-5 py-4">
                    <span className="whitespace-nowrap text-[15px]">{t("onb2.consent.marketing")}<span className="ml-1.5 text-[12px] text-muted">{t("common.optional")}</span></span>
                    <Switch on={marketing} onChange={setMarketing} label={t("onb2.consent.marketing")} />
                  </div>
                </div>
                {!(terms && health) && <p className="mt-4 text-[12px] text-muted">{t("onb2.consent.mustRead")}</p>}
                <p className="mt-3 text-[12px] text-muted">{t("onb.consentFoot")}</p>
                <LegalModal open={modal === "terms"} slugs={[{ slug: "terms", labelKey: "onb2.modal.docTerms" }, { slug: "privacy", labelKey: "onb2.modal.docPrivacy" }]} titleKey="onb2.modal.titleTerms" acceptKey="onb2.modal.acceptTerms" onClose={() => setModal(null)} onAccept={() => { setTerms(true); setModal(null); }} />
                <LegalModal open={modal === "health"} slugs={[{ slug: "consent_health", labelKey: "onb2.modal.titleHealth" }]} titleKey="onb2.modal.titleHealth" acceptKey="onb2.modal.acceptHealth" onClose={() => setModal(null)} onAccept={() => { setHealth(true); setModal(null); }} />
              </>
            )}

            {step === "goal" && (<><Title sub={t("onb2.multi")}>{t("onb.goalTitle")}</Title><MultiOptions values={GOALS} current={answers.goals} onToggle={(v) => toggleIn("goals", v)} prefix="onb.goal" /></>)}
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
                <Title sub={t("onb2.body.text")}>{t("onb2.body.title")}</Title>
                <div className="mt-6"><Silhouette height={answers.height} weight={answers.weight} /></div>
                <div className="mt-6 flex flex-col gap-3">
                  <Metric label={t("onb2.body.height")} unit="cm" min={120} max={220} init={170} value={answers.height} onChange={(v) => setAnswers({ height: v })} hint={t("onb2.body.unset")} />
                  <Metric label={t("onb2.body.weight")} unit="kg" min={35} max={200} init={68} value={answers.weight} onChange={(v) => setAnswers({ weight: v })} hint={t("onb2.body.unset")} />
                </div>
              </>
            )}

            {step === "injuries" && (
              <>
                <Title sub={`${t("onb.injText")} ${t("onb2.multi")}`}>{t("onb.injTitle")}</Title>
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

            {step === "equipment" && (<><Title sub={t("onb2.multi")}>{t("onb.eqTitle")}</Title><MultiOptions values={EQUIPMENT} current={answers.equipment} onToggle={(v) => toggleIn("equipment", v, "none")} prefix="onb.eq" /></>)}

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
                <div className="flex gap-3">
                  {i > minStep && (
                    <button type="button" className="btn btn-ghost shrink-0 !px-6" onClick={() => setI((n) => Math.max(minStep, n - 1))}>{t("onb2.back")}</button>
                  )}
                  <button type="button" className="btn btn-primary flex-1 disabled:opacity-35" disabled={!canNext[step] || busy} onClick={next}>
                    {busy ? t("common.loading") : step === "coaching" ? t("onb.finish") : t("common.continue")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
