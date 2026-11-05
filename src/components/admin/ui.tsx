"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Sparkline } from "./charts";

/* ---------- contexto do painel (filtro de dados demo + avisos) ---------- */

export type DemoMode = "all" | "real" | "only";
interface Ctx {
  demo: DemoMode;
  setDemo: (d: DemoMode) => void;
  range: number;
  setRange: (n: number) => void;
  toast: (msg: string, tone?: "ok" | "bad") => void;
  /** acrescenta ?demo= a um caminho de API */
  q: (path: string, extra?: Record<string, string | number | undefined>) => string;
}
export const AdminCtx = createContext<Ctx | null>(null);
export const useAdmin = () => {
  const c = useContext(AdminCtx);
  if (!c) throw new Error("useAdmin fora do AdminCtx");
  return c;
};

export function Toasts({ items }: { items: { id: number; msg: string; tone: "ok" | "bad" }[] }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`flex max-w-[360px] items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] shadow-lg ${t.tone === "bad" ? "bg-ember text-white" : "bg-fg text-bg"}`}><span aria-hidden="true" className="text-[14px]">{t.tone === "bad" ? "⚠" : "✓"}</span>{t.msg}</div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [items, setItems] = useState<{ id: number; msg: string; tone: "ok" | "bad" }[]>([]);
  const toast = useCallback((msg: string, tone: "ok" | "bad" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, msg, tone }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 3800);
  }, []);
  return { items, toast };
}

/* ---------- blocos ---------- */

export function Card({ title, sub, action, children, className = "", pad = true }: { title?: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card shadow-[0_1px_2px_rgba(22,21,20,0.03)] ${className}`} style={{ borderRadius: 18 }}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-[18px]">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-medium leading-snug">{title}</h2>}
            {sub && <p className="mt-1 text-[12px] leading-relaxed text-muted">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? "p-5 pt-4" : "pt-3"}>{children}</div>
    </section>
  );
}

export function Delta({ v, invert = false }: { v: number | null | undefined; invert?: boolean }) {
  if (v === null || v === undefined) return <span className="text-[11px] text-muted">–</span>;
  const good = invert ? v <= 0 : v >= 0;
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${good ? "bg-[#6f8a6b]/15 text-[#4f6a4b]" : "bg-ember/10 text-ember"}`}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(1).replace(".", ",")}%
    </span>
  );
}

export function Stat({ label, value, delta, sub, spark, sparkColor, invert, hint }: { label: string; value: ReactNode; delta?: number | null; sub?: ReactNode; spark?: number[]; sparkColor?: string; invert?: boolean; hint?: string }) {
  return (
    <div className="card flex flex-col justify-between p-4" style={{ borderRadius: 16 }} title={hint}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow !text-[10px]">{label}</p>
          {delta !== undefined && <Delta v={delta} invert={invert} />}
        </div>
        <p className="font-display mt-2 text-[34px] leading-none tracking-tight">{value}</p>
        {sub && <p className="mt-1.5 text-[11px] text-muted">{sub}</p>}
      </div>
      {spark && <div className="mt-3"><Sparkline values={spark} color={sparkColor} /></div>}
    </div>
  );
}

const TONES = {
  neutral: "bg-surface2 text-muted",
  ok: "bg-[#6f8a6b]/15 text-[#4f6a4b]",
  warn: "bg-[#a97c50]/15 text-[#8a6238]",
  bad: "bg-ember/10 text-ember",
  info: "bg-[#5f6f7e]/12 text-[#46525e]",
  dark: "bg-fg text-bg",
} as const;
export type Tone = keyof typeof TONES;
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-normal ${TONES[tone]}`}>{children}</span>;
}

export function Btn({ children, onClick, variant = "ghost", size = "sm", disabled, type = "button", title }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "danger" | "ember"; size?: "sm" | "md"; disabled?: boolean; type?: "button" | "submit"; title?: string }) {
  const v = { primary: "bg-fg text-bg hover:opacity-85", ghost: "border-[0.5px] border-line hover:bg-surface2", danger: "border-[0.5px] border-ember/40 text-ember hover:bg-ember/10", ember: "bg-ember text-white hover:opacity-90" }[variant];
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full transition-[opacity,background-color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${size === "sm" ? "h-8 px-3.5 text-[12px]" : "h-10 px-5 text-[13px]"} ${v}`}>
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-line border-t-fg" role="status" aria-label="Carregando" />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-[13px] text-muted">{children}</p>;
}

/* ---------- tabela ---------- */

export interface Col<T> {
  key: string;
  head: ReactNode;
  cell: (r: T) => ReactNode;
  align?: "right" | "center";
  sort?: string;
  w?: string;
}

export function DataTable<T extends { id?: number | string }>({
  cols, rows, onRow, sort, onSort, loading, empty = "Nada por aqui ainda.",
}: {
  cols: Col<T>[];
  rows: T[];
  onRow?: (r: T) => void;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  loading?: boolean;
  empty?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto" aria-busy={loading}>
      <table className="w-full min-w-[640px] text-[12px]">
        <thead>
          <tr className="border-b-[0.5px] border-line bg-surface2/40 text-left text-[10px] uppercase tracking-[0.14em] text-muted">
            {cols.map((c) => (
              <th key={c.key} style={{ width: c.w }} className={`px-4 py-2.5 font-normal ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}>
                {c.sort && onSort ? (
                  <button type="button" onClick={() => onSort(c.sort!)} className="uppercase tracking-[0.14em] hover:text-fg">
                    {c.head}{sort?.key === c.sort ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                ) : c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} onClick={onRow ? () => onRow(r) : undefined} className={`border-b-[0.5px] border-line last:border-0 ${onRow ? "cursor-pointer hover:bg-surface2/60" : ""}`}>
              {cols.map((c) => (
                <td key={c.key} className={`px-4 py-2.5 align-middle ${c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : ""}`}>{c.cell(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 && <Empty>{empty}</Empty>}
    </div>
  );
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between border-t-[0.5px] border-line px-4 py-2.5 text-[11px] text-muted">
      <span>{total === 0 ? "0 registros" : `${(page - 1) * size + 1}–${Math.min(page * size, total)} de ${total}`}</span>
      <span className="flex items-center gap-1">
        <Btn onClick={() => onPage(page - 1)} disabled={page <= 1}>‹</Btn>
        <span className="px-2">{page}/{pages}</span>
        <Btn onClick={() => onPage(page + 1)} disabled={page >= pages}>›</Btn>
      </span>
    </div>
  );
}

/* ---------- overlay ---------- */

export function Drawer({ open, onClose, title, children, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l-[0.5px] border-line bg-bg shadow-2xl" style={{ maxWidth: width }}>
        <header className="flex items-center justify-between gap-3 border-b-[0.5px] border-line px-5 py-4">
          <div className="min-w-0 text-[15px]">{title}</div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-line"><X size={15} /></button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border-[0.5px] border-line bg-bg p-6 shadow-2xl" style={{ maxWidth: width }}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-3xl leading-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[0.5px] border-line"><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- formulário ---------- */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-[12px] text-muted">
      {label}
      <div className="mt-1.5 text-[13px] text-fg">{children}</div>
      {hint && <span className="mt-1.5 block text-[11px] leading-snug">{hint}</span>}
    </label>
  );
}

export const inputCls = "h-10 w-full rounded-xl border-[0.5px] border-line bg-surface px-3 text-[13px] font-light text-fg outline-none transition-shadow focus:border-bronze focus:ring-2 focus:ring-bronze/15";

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b-[0.5px] border-line">
      {items.map((t) => (
        <button key={t.value} role="tab" aria-selected={t.value === value} type="button" onClick={() => onChange(t.value)} className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] transition-colors ${t.value === value ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-[10px] text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 px-4 py-3">{children}</div>;
}

export function PageHead({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-display mt-1.5 text-[38px] leading-[1.05]">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[12px]">
      <span className="text-muted">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
