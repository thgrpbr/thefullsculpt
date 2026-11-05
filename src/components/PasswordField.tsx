"use client";

import { useId, useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/i18n/provider";

export type PwLevel = "weak" | "fair" | "good" | "strong";

export function checkPassword(pw: string) {
  const rules = {
    len: pw.length >= 10,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    num: /\d/.test(pw),
    sym: /[^A-Za-z0-9]/.test(pw),
  };
  const classes = [rules.lower, rules.upper, rules.num, rules.sym].filter(Boolean).length;
  const level: PwLevel = !rules.len || classes < 3 ? "weak" : classes === 4 && pw.length >= 14 ? "strong" : classes === 4 ? "good" : "fair";
  return { rules, classes, level, ok: rules.len && classes >= 3 };
}

const BAR: Record<PwLevel, { n: number; color: string }> = {
  weak: { n: 1, color: "#b4452c" },
  fair: { n: 2, color: "#c08a2e" },
  good: { n: 3, color: "#5f8a4f" },
  strong: { n: 4, color: "#2f7a4a" },
};

/** Campo de senha com botão de mostrar/ocultar, medidor de segurança e lista de requisitos. */
export function PasswordField({ value, onChange, placeholder, autoComplete = "new-password", meter = true }: { value: string; onChange: (v: string) => void; placeholder: string; autoComplete?: string; meter?: boolean }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const id = useId();
  const c = checkPassword(value);
  const rules = ["len", "lower", "upper", "num", "sym"] as const;
  return (
    <div>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} aria-describedby={meter ? `${id}-m` : undefined} className="!pr-12" />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t("onb2.pw.hide") : t("onb2.pw.show")} aria-pressed={show} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-fg">
          {show ? <EyeOff size={18} strokeWidth={1.5} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.5} aria-hidden="true" />}
        </button>
      </div>
      {meter && value.length > 0 && (
        <div id={`${id}-m`} className="mt-3" aria-live="polite">
          <div className="flex items-center gap-3">
            <div className="flex flex-1 gap-1.5" aria-hidden="true">
              {[1, 2, 3, 4].map((i) => <span key={i} className="h-[3px] flex-1 rounded-full bg-line transition-colors" style={i <= BAR[c.level].n ? { background: BAR[c.level].color } : undefined} />)}
            </div>
            <span className="min-w-[64px] text-right text-[12px]" style={{ color: BAR[c.level].color }}><span className="sr-only">{t("onb2.pw.strength")}: </span>{t(`onb2.pw.level.${c.level}`)}</span>
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
            {rules.map((r) => (
              <li key={r} className={`flex items-center gap-1.5 ${c.rules[r] ? "text-fg" : "text-muted"}`}>
                <Check size={13} strokeWidth={2} className={c.rules[r] ? "text-[#2f7a4a]" : "opacity-25"} aria-hidden="true" />
                {t(`onb2.pw.rules.${r}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
