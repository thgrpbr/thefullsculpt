"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { Wordmark } from "@/components/ui";
import { LegalFooter } from "@/components/LegalBits";
import { useI18n } from "@/i18n/provider";
import { formatBrl } from "@/lib/config";
import { Price, usePlanText } from "@/components/PlanCards";
import { api, ApiError } from "@/lib/api";
import { usePlans, type Quote } from "@/lib/plans";
import { useHydrated, useStore } from "@/lib/store";

export default function Subscribe() {
  const { t, href, lang } = useI18n();
  const router = useRouter();
  const hydrated = useHydrated();
  const subscribe = useStore((s) => s.subscribe);
  const sub = useStore((s) => s.sub);
  const emailVerified = useStore((s) => s.emailVerified);
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const { plans } = usePlans();
  const x = usePlanText();
  const [planId, setPlanId] = useState<number | null>(null);
  const plan = plans.find((p) => p.id === planId) ?? plans.find((p) => p.featured) ?? plans[0];
  const [codeInput, setCodeInput] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [codeMsg, setCodeMsg] = useState("");

  // recalcula o preço quando troca o pacote (mantém o código aplicado)
  useEffect(() => {
    if (!plan || plan.id === 0) return;
    let alive = true;
    api<Quote>("POST", "/plans/quote", { plan_id: plan.id, code: quote?.code?.code ?? "" })
      .then((q) => alive && setQuote(q))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id]);

  async function applyCode() {
    setCodeMsg("");
    if (!plan || !codeInput.trim()) return;
    try {
      const q = await api<Quote>("POST", "/plans/quote", { plan_id: plan.id, code: codeInput.trim() });
      setQuote(q);
      setCodeMsg(q.code ? t("plans.codeApplied", { code: q.code.code }) : t(`plans.err.${q.code_error ?? "code_invalid"}`));
    } catch {
      setCodeMsg(t("plans.err.generic"));
    }
  }

  const [error, setError] = useState("");

  async function pay() {
    setBusy(true);
    setError("");
    try {
      // Placeholder: aqui entra o Stripe Checkout (sessão criada no servidor).
      await subscribe({ planId: plan?.id || undefined, code: quote?.code?.code });
      router.push(href("/app"));
    } catch (e) {
      const c = e instanceof ApiError ? e.code : "";
      setError(c.startsWith("code_") ? t(`plans.err.${c}`) : t("paywall.error"));
      setBusy(false);
    }
  }

  if (!hydrated) return <div className="theme-light min-h-dvh" />;

  return (
    <div className="theme-light min-h-dvh">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <Link href={href("/app")} aria-label={t("common.back")} className="flex h-10 w-10 items-center justify-center rounded-full border-[0.5px] border-line"><ArrowLeft size={18} /></Link>
        <Wordmark size="sm" />
        <span className="w-10" />
      </header>

      <main className="mx-auto max-w-lg px-5 pb-16 pt-6 text-center">
        <p className="eyebrow">{t("paywall.eyebrow")}</p>
        <h1 className="font-display mt-3 text-5xl leading-[1.05] md:text-6xl">{t("paywall.title")}</h1>
        <p className="mt-4 text-muted">{t("paywall.text")}</p>

        <div className="card mt-10 p-8 text-left">
          {plans.length > 1 && (
            <div role="radiogroup" aria-label={t("plans.choose")} className="mb-6 flex flex-col gap-2">
              {plans.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={p.id === plan?.id} onClick={() => { setPlanId(p.id); setCodeMsg(""); }} className={`flex items-center justify-between gap-3 rounded-2xl border-[0.5px] px-4 py-3 text-left transition-colors ${p.id === plan?.id ? "border-fg bg-surface2" : "border-line hover:bg-surface2"}`}>
                  <span className="text-[14px]">{x.name(p)}<span className="block text-[11px] text-muted">{x.per(p)}</span></span>
                  <span className="text-right text-[14px]">{formatBrl(p.final_cents / 100, lang)}{p.discount_cents > 0 && <span className="block text-[11px] text-muted line-through">{formatBrl(p.price_cents / 100, lang)}</span>}</span>
                </button>
              ))}
            </div>
          )}
          <p className="eyebrow">{plan ? x.name(plan) : ""}</p>
          <div className="mt-3">
            {quote && plan && quote.plan_id === plan.id && quote.code ? (
              <div>
                <p className="flex items-center gap-2 text-[14px] text-muted"><span className="line-through">{formatBrl(quote.base_cents / 100, lang)}</span><span className="rounded-full bg-ember px-2.5 py-0.5 text-[11px] text-white">{quote.code.code}</span></p>
                <p className="font-display mt-1 text-6xl">{formatBrl(quote.total_cents / 100, lang)}<span className="text-xl text-muted"> {x.per(plan)}</span></p>
              </div>
            ) : plan ? <Price plan={plan} /> : null}
          </div>
          {plan && x.description(plan) && <p className="mt-3 text-[14px] text-muted">{x.description(plan)}</p>}
          <ul className="mt-6 flex flex-col gap-3 text-[15px]">
            {plan && x.features(plan).map((f) => (
              <li key={f} className="flex items-start gap-3"><Check size={17} className="mt-0.5 shrink-0 text-bronze" aria-hidden="true" />{f}</li>
            ))}
          </ul>
          {plans[0].id !== 0 && (
            <div className="mt-6">
              <div className="flex gap-2">
                <input type="text" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} placeholder={t("plans.codePlaceholder")} aria-label={t("plans.codePlaceholder")} autoCapitalize="characters" className="!h-11 uppercase" />
                <button type="button" onClick={applyCode} className="btn btn-ghost shrink-0 !h-11 !px-5" disabled={!codeInput.trim()}>{t("plans.apply")}</button>
              </div>
              {codeMsg && <p role="status" className={`mt-2 text-[12px] ${quote?.code ? "text-[#2f7a4a]" : "text-ember"}`}>{codeMsg}</p>}
            </div>
          )}
          <div className="mt-6 space-y-3 rounded-2xl bg-surface2 p-4 text-[12px] leading-relaxed text-muted">
            <p>{t("legalui.renew")}</p>
            <p>{t("legalui.withdraw")}</p>
            <label className="flex cursor-pointer items-start gap-3 text-fg">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#161514]" />
              <span>{t("legalui.accept")} <Link href={href("/legal?doc=terms")} target="_blank" className="text-bronze underline underline-offset-2">{t("legalui.terms")}</Link> · <Link href={href("/legal?doc=refund")} target="_blank" className="text-bronze underline underline-offset-2">{t("legalui.refund")}</Link></span>
            </label>
          </div>
          <button type="button" onClick={pay} disabled={busy || sub === "active" || !agree || !emailVerified} className="btn btn-ember mt-6 w-full disabled:opacity-60">
            <Lock size={15} aria-hidden="true" />
            {sub === "active" ? t("paywall.already") : busy ? t("common.loading") : t("paywall.cta")}
          </button>
          {!emailVerified && <p role="alert" className="mt-3 text-center text-[13px] text-ember">{t("verify.needForPay")}</p>}
          {error && <p role="alert" className="mt-3 text-center text-[13px] text-ember">{error}</p>}
          <p className="mt-4 text-center text-[12px] text-muted">{t("paywall.secure")}</p>
        </div>

        <p className="mt-6 rounded-xl border-[0.5px] border-dashed border-line p-3 text-[12px] text-muted">{t("paywall.testNote")}</p>
        <p className="mt-6 text-[12px] text-muted">{t("paywall.mobile")}</p>
        <LegalFooter compact />
      </main>
    </div>
  );
}
