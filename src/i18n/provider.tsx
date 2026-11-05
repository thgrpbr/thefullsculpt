"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./config";

type Dict = { [key: string]: string | Dict };

interface Ctx {
  lang: Locale;
  dict: Dict;
}

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ lang, dict, children }: { lang: Locale; dict: Dict; children: ReactNode }) {
  const value = useMemo(() => ({ lang, dict }), [lang, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function lookup(dict: Dict, path: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  const { lang, dict } = ctx;

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = lookup(dict, key) ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
      }
      return text;
    },
    [dict],
  );

  const href = useCallback((path: string) => `/${lang}${path === "/" ? "" : path}`, [lang]);

  return { lang, t, href };
}
