"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Markdown from "@/components/Markdown";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";

interface Doc { slug: string; title: string; content: string; version: number }

/**
 * Modal de leitura obrigatória: o botão de aceite só é liberado depois de rolar até o final.
 * Carrega as versões PUBLICADAS dos documentos; se algum ainda não foi publicado, avisa (pré-lançamento).
 */
export function LegalModal({ open, slugs, titleKey, acceptKey, onAccept, onClose }: { open: boolean; slugs: { slug: string; labelKey: string }[]; titleKey: string; acceptKey: string; onAccept: () => void; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [docs, setDocs] = useState<(Doc | null)[] | null>(null);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all(slugs.map((s) => api<Doc>("GET", `/legal/${s.slug}?lang=${lang}`).catch(() => null))).then((r) => alive && setDocs(r));
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      alive = false;
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lang]);

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const p = max <= 4 ? 100 : Math.min(100, Math.round((el.scrollTop / max) * 100));
    setPct(p);
    if (p >= 99) setDone(true);
  }, []);
  useEffect(() => {
    if (open && docs) {
      const id = setTimeout(measure, 50);   // texto curto que já cabe na tela libera o aceite
      return () => clearTimeout(id);
    }
  }, [open, docs, measure]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={t(titleKey)} className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className="theme-light flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-bg shadow-2xl sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 px-6 pb-3 pt-5">
          <h2 className="font-display text-3xl leading-tight">{t(titleKey)}</h2>
          <button type="button" onClick={onClose} aria-label={t("onb2.modal.close")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[0.5px] border-line"><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="h-[2px] bg-line" aria-hidden="true"><div className="h-full bg-fg transition-[width] duration-150" style={{ width: `${pct}%` }} /></div>
        <div ref={box} onScroll={measure} tabIndex={0} className="flex-1 overflow-y-auto px-6 py-5 text-[14px]">
          {!docs ? <p className="py-16 text-center text-muted">{t("onb2.modal.loading")}</p> : docs.map((d, i) => (
            <section key={slugs[i].slug} className={i > 0 ? "mt-10 border-t-[0.5px] border-line pt-8" : ""}>
              <p className="eyebrow mb-3">{t(slugs[i].labelKey)}{d ? ` · v${d.version}` : ""}</p>
              {d ? <Markdown text={d.content} /> : <p className="rounded-xl bg-surface2 p-4 text-[13px] text-muted">{t("onb2.modal.unavailable")}</p>}
            </section>
          ))}
        </div>
        <div className="border-t-[0.5px] border-line px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
          <button type="button" disabled={!done} onClick={onAccept} className="btn btn-primary w-full disabled:opacity-35">{t(acceptKey)}</button>
          <p className="mt-2 text-center text-[11px] text-muted" aria-live="polite">{done ? "✓" : `${t("onb2.modal.scroll")} · ${t("onb2.modal.progress", { n: pct })}`}</p>
        </div>
      </div>
    </div>
  );
}
