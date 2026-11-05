import type { Locale } from "./config";

const loaders = {
  pt: () => import("./dictionaries/pt").then((m) => m.default),
  en: () => import("./dictionaries/en").then((m) => m.default),
  es: () => import("./dictionaries/es").then((m) => m.default),
} as const;

export const getDictionary = (lang: Locale) => loaders[lang]();
