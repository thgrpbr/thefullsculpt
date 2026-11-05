"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { locales, localeMeta, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";

export function Wordmark({ size = "md", stacked = false }: { size?: "sm" | "md" | "lg"; stacked?: boolean }) {
  const { t } = useI18n();
  const main = { sm: "text-[13px]", md: "text-[17px]", lg: "text-[28px] md:text-[34px]" }[size];
  const small = { sm: "text-[8px]", md: "text-[9px]", lg: "text-[12px]" }[size];
  return (
    <span className={`inline-flex ${stacked ? "flex-col items-center gap-2" : "items-baseline gap-2"}`} aria-label="THE FULL SCULPT">
      <span className={`${small} eyebrow !tracking-[0.42em]`}>{t("common.the")}</span>
      <span className={`${main} wordmark uppercase`}>Full Sculpt</span>
    </span>
  );
}

export function LangSwitch({ vertical = false }: { vertical?: boolean }) {
  const { lang } = useI18n();
  const pathname = usePathname() ?? `/${lang}`;
  const rest = pathname.replace(/^\/(pt|en|es)(?=\/|$)/, "");
  return (
    <nav aria-label="Language" className={`flex items-center gap-1 text-[12px] tracking-widest ${vertical ? "flex-col" : ""}`}>
      {locales.map((l: Locale) => (
        <Link
          key={l}
          href={`/${l}${rest}`}
          aria-current={l === lang ? "true" : undefined}
          className={`rounded-full px-2.5 py-1 transition-colors ${l === lang ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
        >
          {localeMeta[l].label}
        </Link>
      ))}
    </nav>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-full border-[0.5px] border-line bg-surface/70 p-0.5 backdrop-blur">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${o.value === value ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Ring({
  progress,
  size = 220,
  stroke = 6,
  color = "var(--ember)",
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 0.25s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function Bar({ value, color = "var(--bronze)" }: { value: number; color?: string }) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
    </div>
  );
}
