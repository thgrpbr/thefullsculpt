"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, MailWarning } from "lucide-react";
import { LangSwitch, Wordmark } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function Page() {
  return (
    <Suspense fallback={<div className="theme-light min-h-dvh" />}>
      <Verify />
    </Suspense>
  );
}

/** Destino do link do e-mail de confirmação do cadastro. */
function Verify() {
  const { t, href } = useI18n();
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"loading" | "ok" | "bad">(token ? "loading" : "bad");
  const mode = useStore((s) => s.mode);
  const refresh = useStore((s) => s.refresh);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api("POST", "/auth/verify-email", { token })
      .then(() => {
        if (!alive) return;
        setState("ok");
        if (useStore.getState().mode === "user") void refresh();
      })
      .catch(() => alive && setState("bad"));
    return () => {
      alive = false;
    };
  }, [token, refresh]);

  return (
    <div className="theme-light min-h-dvh">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <Link href={href("/")}><Wordmark size="sm" /></Link>
        <LangSwitch />
      </header>
      <main className="mx-auto max-w-md px-5 pt-16 text-center">
        {state === "loading" && <p className="text-muted" role="status">{t("verify.checking")}</p>}
        {state === "ok" && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#2f7a4a] text-white"><Check size={26} aria-hidden="true" /></span>
            <h1 className="font-display mt-8 text-5xl leading-tight">{t("verify.okTitle")}</h1>
            <p className="mt-3 text-muted">{t("verify.okText")}</p>
            <Link href={href(mode === "user" ? "/app" : "/entrar")} className="btn btn-primary mt-8">{mode === "user" ? t("verify.toApp") : t("verify.toLogin")}</Link>
          </>
        )}
        {state === "bad" && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-[0.5px] border-ember text-ember"><MailWarning size={26} aria-hidden="true" /></span>
            <h1 className="font-display mt-8 text-5xl leading-tight">{t("verify.badTitle")}</h1>
            <p className="mt-3 text-muted">{t("verify.badText")}</p>
            <Link href={href("/entrar")} className="btn btn-primary mt-8">{t("verify.toLogin")}</Link>
          </>
        )}
      </main>
    </div>
  );
}
