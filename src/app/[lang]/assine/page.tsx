"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { Wordmark } from "@/components/ui";
import { LegalFooter } from "@/components/LegalBits";
import { useI18n } from "@/i18n/provider";
import { formatBrl, PLAN } from "@/lib/config";
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

  const [error, setError] = useState("");

  async function pay() {
    setBusy(true);
    setError("");
    try {
      // Placeholder: aqui entra o Stripe Checkout (sessão criada no servidor).
      await subscribe();
      router.push(href("/app"));
    } catch {
      setError(t("paywall.error"));
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
          <p className="eyebrow">{t("pricing.name")}</p>
          <p className="font-display mt-3 text-6xl">{formatBrl(PLAN.priceBrl, lang)}<span className="text-xl text-muted"> {t("pricing.per")}</span></p>
          <ul className="mt-6 flex flex-col gap-3 text-[15px]">
            {["p1", "p2", "p3", "p4"].map((k) => (
              <li key={k} className="flex items-start gap-3"><Check size={17} className="mt-0.5 shrink-0 text-bronze" aria-hidden="true" />{t(`pricing.${k}`)}</li>
            ))}
          </ul>
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
