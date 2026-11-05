"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { LangSwitch, Wordmark } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { api, ApiError, type ServerState } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function Login() {
  const { t, href } = useI18n();
  const router = useRouter();
  const applyServer = useStore((s) => s.applyServer);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      applyServer(await api<ServerState>("POST", "/auth/login", { email: email.trim(), password }));
      router.push(href("/app"));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "generic";
      setError(t(`auth.errors.${["invalid_credentials", "rate_limited", "network", "not_installed"].includes(code) ? code : "generic"}`));
      setBusy(false);
    }
  }

  return (
    <div className="theme-light flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <Link href={href("/")} aria-label={t("common.back")} className="flex h-10 w-10 items-center justify-center rounded-full border-[0.5px] border-line"><ArrowLeft size={18} /></Link>
        <Wordmark size="sm" />
        <LangSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10 pt-12">
        <h1 className="font-display text-5xl leading-[1.05]">{t("auth.title")}</h1>
        <p className="mt-3 text-muted">{t("auth.text")}</p>
        <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("onb.email")} aria-label={t("onb.email")} />
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.password")} aria-label={t("auth.password")} />
          {error && <p role="alert" className="text-[14px] text-ember">{error}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary mt-2 w-full disabled:opacity-50">{busy ? t("common.loading") : t("auth.submit")}</button>
        </form>
        <p className="mt-8 text-center text-[14px] text-muted">
          {t("auth.noAccount")} <Link href={href("/onboarding")} className="text-fg underline underline-offset-4">{t("auth.create")}</Link>
        </p>
      </main>
    </div>
  );
}
