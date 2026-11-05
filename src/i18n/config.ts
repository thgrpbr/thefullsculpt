export const locales = ["pt", "en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pt";

export const localeMeta: Record<Locale, { label: string; html: string }> = {
  pt: { label: "PT", html: "pt-BR" },
  en: { label: "EN", html: "en" },
  es: { label: "ES", html: "es" },
};

export const hasLocale = (value: string): value is Locale =>
  (locales as readonly string[]).includes(value);
