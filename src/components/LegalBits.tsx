"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";

const KEY = "tfs.notice.v1";
export interface Company { legal_name: string; trade_name: string; cnpj: string; address: string; support_email: string; dpo_name: string; dpo_email: string }

/**
 * Aviso de cookies/armazenamento (só usamos o estritamente necessário, então é informativo).
 * Faixa fina na base da página, que EMPURRA o conteúdo (reserva o próprio espaço) em vez de cobri-lo,
 * e não aparece dentro do app/admin, onde há barras fixas de navegação.
 */
export function CookieNotice() {
  const { t, href } = useI18n();
  const path = usePathname() ?? "";
  const [show, setShow] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const inside = /\/(app|admin|professor)(\/|$)/.test(path);

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

  const visible = show && !inside;
  useEffect(() => {
    // reserva no fim da página a altura da faixa, para que nada fique escondido atrás dela
    const el = bar.current;
    if (!visible || !el) return;
    const apply = () => { document.body.style.paddingBottom = `${el.offsetHeight}px`; };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, [visible]);

  if (!visible) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setShow(false);
  };
  return (
    <div ref={bar} role="region" aria-label={t("legalui.cookieTitle")} className="fixed inset-x-0 bottom-0 z-[60] border-t-[0.5px] border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[12px] leading-snug sm:px-6">
        <p className="min-w-0 flex-1 text-muted">
          {t("legalui.cookieText")}{" "}
          <Link href={href("/legal?doc=cookies")} className="whitespace-nowrap text-fg underline underline-offset-4">{t("legalui.cookieMore")}</Link>
        </p>
        <button type="button" onClick={close} className="shrink-0 rounded-full bg-fg px-4 py-1.5 text-[12px] text-bg">{t("legalui.cookieOk")}</button>
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
