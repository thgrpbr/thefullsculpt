// Gera public/api/lib/default_catalog.php a partir dos dicionários e de exercises.ts (fonte única).
// Uso: node scripts/gen-catalog.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const load = async (p) => (await import(pathToFileURL(resolve(root, p)).href)).default;
const dict = { pt: await load("src/i18n/dictionaries/pt.ts"), en: await load("src/i18n/dictionaries/en.ts"), es: await load("src/i18n/dictionaries/es.ts") };
// exercises.ts importa módulos sem extensão (válido no bundler, não no Node): extraímos só o literal EXERCISES.
const src = readFileSync(resolve(root, "src/lib/exercises.ts"), "utf8");
const body = src.slice(src.indexOf("export const EXERCISES"), src.indexOf("export function muscleRole"));
const EXERCISES = new Function(`return (${body.slice(body.indexOf("= {") + 2).trim().replace(/;\s*$/, "")})`)();

const out = Object.values(EXERCISES).map((e) => {
  const i18n = {};
  for (const lang of ["pt", "en", "es"]) {
    const d = dict[lang].ex[e.id];
    i18n[lang] = { name: d.name, bio: d.bio, cues: Array.from({ length: e.cueCount }, (_, i) => d[`cue${i}`]) };
  }
  return { slug: e.id, motion: e.motion.type, depth: e.motion.depth, primary: e.primary, secondary: e.secondary, stabilizers: e.stabilizers, i18n };
});

const php = `<?php\n// GERADO por scripts/gen-catalog.mjs — não editar à mão.\nreturn ${toPhp(out)};\n`;
function toPhp(v, ind = 0) {
  const pad = "  ".repeat(ind + 1);
  const end = "  ".repeat(ind);
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad + toPhp(x, ind + 1)).join(",\n")},\n${end}]` : "[]";
  if (v && typeof v === "object") return `[\n${Object.entries(v).map(([k, x]) => `${pad}${JSON.stringify(k)} => ${toPhp(x, ind + 1)}`).join(",\n")},\n${end}]`;
  if (typeof v === "string") return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  return String(v);
}
writeFileSync(resolve(root, "public/api/lib/default_catalog.php"), php);
console.log(`catálogo: ${out.length} exercícios`);
