"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";

const KEY = "tfs.notice.v1";
export interface Company { legal_name: string; trade_name: string; cnpj: string; address: string; support_email: string; dpo_name: string; dpo_email: string }

/** Aviso de cookies/armazenamento: só usamos o estritamente necessário, então é informativo (sem rastreadores a bloquear). */
export function CookieNotice() {
  const { t, href } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    // lê o armazenamento só no navegador (depois da hidratação)
    const id = setTimeout(() => {
      try {
        setShow(localStorage.getItem(KEY) !== "1");
      } catch {
        setShow(true);
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setShow(false);
  };
  return (
    <div role="region" aria-label={t("legalui.cookieTitle")} className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-2xl border-[0.5px] border-line bg-[var(--bg,#fff)] p-4 text-[13px] shadow-[0_8px_40px_rgba(0,0,0,.12)] sm:p-5">
      <p className="font-medium">{t("legalui.cookieTitle")}</p>
      <p className="mt-1 leading-relaxed text-muted">{t("legalui.cookieText")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button type="button" onClick={close} className="btn btn-primary !h-9 !px-5 !text-[13px]">{t("legalui.cookieOk")}</button>
        <Link href={href("/legal?doc=cookies")} className="text-bronze underline underline-offset-4">{t("legalui.cookieMore")}</Link>
      </div>
    </div>
  );
}

/** Dados da empresa (controlador) cadastrados no Admin > Jurídico — LGPD arts. 9º e 41. */
export function useCompany(): Company | null {
  const [c, setC] = useState<Company | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ company: Company }>("GET", "/legal")
      .then((r) => alive && setC(r.company))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return c;
}

/** Rodapé legal: documentos, direitos do titular, encarregado e identificação da empresa. */
export function LegalFooter({ compact = false }: { compact?: boolean }) {
  const { t, href } = useI18n();
  const c = useCompany();
  const links: [string, string][] = [["privacy", t("legalui.privacy")], ["terms", t("legalui.terms")], ["health", "Aviso de saúde"], ["cookies", "Cookies"], ["refund", t("legalui.refund")], ["dpo", t("legalui.rights")]];
  const id = [c?.legal_name || c?.trade_name, c?.cnpj ? `${t("legalui.cnpj")} ${c.cnpj}` : "", c?.address].filter(Boolean).join(" · ");
  return (
    <div className={`text-center text-[12px] text-muted ${compact ? "mt-8" : ""}`}>
      <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 gap-y-1">
        {links.map(([slug, label]) => <Link key={slug} href={href(`/legal?doc=${slug}`)} className="hover:text-fg">{label}</Link>)}
      </nav>
      {id && <p className="mt-3">{id}</p>}
      {(c?.dpo_email || c?.support_email) && (
        <p className="mt-1">
          {c.dpo_email && <>{t("legalui.dpo")}: {c.dpo_name ? `${c.dpo_name} · ` : ""}<a className="underline underline-offset-4" href={`mailto:${c.dpo_email}`}>{c.dpo_email}</a></>}
          {c.dpo_email && c.support_email && " · "}
          {c.support_email && <>{t("legalui.contact")}: <a className="underline underline-offset-4" href={`mailto:${c.support_email}`}>{c.support_email}</a></>}
        </p>
      )}
    </div>
  );
}
