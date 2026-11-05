"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { LangSwitch, Wordmark } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";

export default function Forgot() {
  const { t, href, lang } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("POST", "/auth/forgot", { email: email.trim(), locale: lang });
      setSent(true);
    } catch (err) {
      setError(t(err instanceof ApiError && err.code === "rate_limited" ? "acct.errors.rate_limited" : "acct.errors.generic"));
    }
    setBusy(false);
  }

  return (
    <div className="theme-light flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <Link href={href("/entrar")} aria-label={t("common.back")} className="flex h-10 w-10 items-center justify-center rounded-full border-[0.5px] border-line"><ArrowLeft size={18} /></Link>
        <Wordmark size="sm" />
        <LangSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10 pt-12">
        <h1 className="font-display text-5xl leading-[1.05]">{t("forgot.title")}</h1>
        <p className="mt-3 text-muted">{t("forgot.text")}</p>
        {sent ? (
          <div className="mt-8">
            <p role="status" className="rounded-2xl border-[0.5px] border-line bg-surface p-5 text-[15px] leading-relaxed">{t("forgot.sent")}</p>
            <Link href={href("/entrar")} className="btn btn-ghost mt-6 w-full">{t("forgot.back")}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("onb.email")} aria-label={t("onb.email")} />
            {error && <p role="alert" className="text-[14px] text-ember">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary mt-2 w-full disabled:opacity-50">{t("forgot.send")}</button>
          </form>
        )}
      </main>
    </div>
  );
}
