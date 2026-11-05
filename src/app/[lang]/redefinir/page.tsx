"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LangSwitch, Wordmark } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";

export default function Reset() {
  const { t, href } = useI18n();
  const [pw, setPw] = useState("");
  const [cf, setCf] = useState("");
  const [state, setState] = useState<"form" | "done">("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (pw.length < 10) return setError(t("reset.weak"));
    if (pw !== cf) return setError(t("reset.mismatch"));
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    setBusy(true);
    try {
      await api("POST", "/auth/reset", { token, password: pw });
      setState("done");
    } catch (err) {
      setError(err instanceof ApiError && err.code === "invalid_token" ? t("reset.invalid") : t("acct.errors.generic"));
    }
    setBusy(false);
  }

  return (
    <div className="theme-light flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <span className="w-10" />
        <Wordmark size="sm" />
        <LangSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10 pt-12">
        <h1 className="font-display text-5xl leading-[1.05]">{t("reset.title")}</h1>
        {state === "done" ? (
          <div className="mt-6">
            <p role="status" className="rounded-2xl border-[0.5px] border-line bg-surface p-5 text-[15px]">{t("reset.done")}</p>
            <Link href={href("/entrar")} className="btn btn-primary mt-6 w-full">{t("auth.submit")}</Link>
          </div>
        ) : (
          <>
            <p className="mt-3 text-muted">{t("reset.text")}</p>
            <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
              <input type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("acct.security.next")} aria-label={t("acct.security.next")} />
              <input type="password" autoComplete="new-password" required value={cf} onChange={(e) => setCf(e.target.value)} placeholder={t("acct.security.confirm")} aria-label={t("acct.security.confirm")} />
              {error && <p role="alert" className="text-[14px] text-ember">{error}</p>}
              <button type="submit" disabled={busy} className="btn btn-primary mt-2 w-full disabled:opacity-50">{t("reset.save")}</button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
