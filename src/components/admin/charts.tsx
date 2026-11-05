"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Largura real do contêiner (ResizeObserver) para desenhar SVG nítido sem distorcer texto. */
function useWidth(initial = 320) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};

export const C = {
  bronze: "var(--bronze)",
  ember: "var(--ember)",
  ink: "var(--fg)",
  stone: "var(--muted)",
  slate: "#5f6f7e",
  sage: "#6f8a6b",
  line: "var(--line)",
};

export function Sparkline({ values, color = C.bronze, height = 28 }: { values: number[]; color?: string; height?: number }) {
  const [ref, w] = useWidth(100);
  if (values.length < 2) return <div ref={ref} className="w-full min-w-0 overflow-x-clip" style={{ height }} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const x = (i: number) => (i / (values.length - 1)) * (w - 2) + 1;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <div ref={ref} className="w-full min-w-0 overflow-x-clip" style={{ height }} aria-hidden="true">
      <svg width={w} height={height}>
        <path d={`${d}L${x(values.length - 1)},${height}L${x(0)},${height}Z`} fill={color} opacity={0.1} />
        <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export interface Serie {
  name: string;
  values: number[];
  color: string;
  area?: boolean;
  dashed?: boolean;
}

export function LineChart({
  labels,
  series,
  height = 220,
  format = (n: number) => String(Math.round(n)),
  label = "Gráfico",
}: {
  labels: string[];
  series: Serie[];
  height?: number;
  format?: (n: number) => string;
  label?: string;
}) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 46;
  const padR = 10;
  const padT = 10;
  const padB = 24;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 1));
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const step = Math.ceil(n / Math.max(2, Math.floor((w - padL) / 56)));

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip" role="img" aria-label={label}>
      <svg
        width={w}
        height={height}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - padL) / (w - padL - padR)) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={C.line} strokeWidth={0.5} />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={C.stone}>{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % step === 0 ? <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10} fill={C.stone}>{l}</text> : null))}
        {series.map((s) => {
          const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
          return (
            <g key={s.name}>
              {s.area && <path d={`${d}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={s.color} opacity={0.1} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "4 3" : undefined} />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={height - padB} stroke={C.stone} strokeWidth={0.5} strokeDasharray="2 2" />
            {series.map((s) => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border-[0.5px] border-line bg-surface px-3 py-2 text-[11px] shadow-sm"
          style={{ left: Math.min(Math.max(x(hover) + 10, 0), w - 150) }}
        >
          <p className="mb-1 text-muted">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-2 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              {s.name}: <b className="font-medium">{format(s.values[hover])}</b>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function BarChart({
  labels,
  values,
  color = C.bronze,
  height = 160,
  format = (n: number) => String(Math.round(n)),
  highlight,
  label = "Gráfico de barras",
}: {
  labels: string[];
  values: number[];
  color?: string;
  height?: number;
  format?: (n: number) => string;
  highlight?: number;
  label?: string;
}) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const padB = 20;
  const padT = 16;
  const max = Math.max(...values, 1);
  const bw = Math.max(4, (w / values.length) * 0.62);
  const every = Math.max(1, Math.ceil(values.length / Math.max(4, Math.floor(w / 34))));
  const x = (i: number) => (i + 0.5) * (w / values.length);
  return (
    <div ref={ref} className="w-full min-w-0 overflow-x-clip" role="img" aria-label={label}>
      <svg width={w} height={height} onPointerLeave={() => setHover(null)}>
        {values.map((v, i) => {
          const h = (v / max) * (height - padT - padB);
          const active = hover === i;
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect x={x(i) - (w / values.length) / 2} y={0} width={w / values.length} height={height} fill="transparent" />
              <rect x={x(i) - bw / 2} y={height - padB - h} width={bw} height={Math.max(h, v > 0 ? 2 : 0)} rx={2} fill={highlight === i ? C.ember : color} opacity={hover === null || active ? 1 : 0.55} />
              {(active || (values.length <= 12 && v > 0)) && <text x={x(i)} y={height - padB - h - 4} textAnchor="middle" fontSize={10} fill={active ? C.ink : C.stone}>{format(v)}</text>}
              {i % every === 0 && <text x={x(i)} y={height - 5} textAnchor="middle" fontSize={10} fill={C.stone}>{labels[i]}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Donut({
  items,
  size = 120,
  center,
  format = (n: number) => String(n),
}: {
  items: { label: string; value: number; color: string }[];
  size?: number;
  center?: ReactNode;
  format?: (n: number) => string;
}) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const offsets = items.map((_, i) => (items.slice(0, i).reduce((a, b) => a + b.value, 0) / total) * c);
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Distribuição">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.line} strokeWidth={9} />
          {items.map((it, i) => {
            const len = (it.value / total) * c;
            return <circle key={it.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={it.color} strokeWidth={9} strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-offsets[i]} />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[12px]">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: it.color }} />
            <span className="truncate text-muted">{it.label}</span>
            <span className="ml-auto tabular-nums">{format(it.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Heatmap({ rows, cols }: { rows: { label: string; days: (number | null)[] }[]; cols: string[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.days.map((d) => d ?? 0)));
  return (
    <div role="img" aria-label="Mapa de calor de aulas concluídas por semana e dia">
      <div className="grid gap-1" style={{ gridTemplateColumns: `42px repeat(${cols.length}, minmax(0, 1fr))` }}>
        <span />
        {cols.map((c) => <span key={c} className="text-center text-[10px] text-muted">{c}</span>)}
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="self-center text-[10px] text-muted">{r.label}</span>
            {r.days.map((d, i) => (
              <span
                key={i}
                title={d === null ? "" : `${r.label} · ${cols[i]}: ${d} aulas`}
                className="aspect-[1.6] rounded-[4px] border-[0.5px] border-line"
                style={{ background: d ? `color-mix(in srgb, var(--ember) ${Math.round(12 + (d / max) * 78)}%, transparent)` : "transparent", opacity: d === null ? 0.3 : 1 }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted">
        menos
        {[0.1, 0.3, 0.55, 0.8].map((a) => <span key={a} className="h-2.5 w-5 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--ember) ${Math.round(a * 100)}%, transparent)` }} />)}
        mais
      </div>
    </div>
  );
}

export function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const top = Math.max(steps[0]?.n ?? 1, 1);
  return (
    <ol className="space-y-3" aria-label="Funil de conversão">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].n : s.n;
        return (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between text-[12px]">
              <span>{s.label}</span>
              <span className="tabular-nums"><b className="font-medium">{s.n}</b> <span className="text-muted">{i ? `· ${prev ? Math.round((s.n / prev) * 100) : 0}% do passo anterior` : "· 100%"}</span></span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface2">
              <div className="h-full rounded-full" style={{ width: `${(s.n / top) * 100}%`, background: i === steps.length - 1 ? C.ember : C.bronze, opacity: 1 - i * 0.12 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function HBars({ items, color = C.bronze, format = (n: number) => String(n) }: { items: { label: string; value: number; sub?: string }[]; color?: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[112px_1fr_44px] items-center gap-3 text-[12px]">
          <span className="truncate text-muted" title={it.label}>{it.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface2"><span className="block h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: color }} /></span>
          <span className="text-right tabular-nums">{format(it.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function CohortTable({ rows }: { rows: { cohort: string; size: number; retention: (number | null)[] }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-[11px]">
        <thead>
          <tr className="text-muted">
            <th className="text-left font-normal">Coorte</th>
            <th className="text-right font-normal">Alunos</th>
            {[0, 1, 2, 3, 4, 5].map((k) => <th key={k} className="font-normal">M{k}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cohort}>
              <td className="whitespace-nowrap pr-2">{r.cohort}</td>
              <td className="pr-2 text-right tabular-nums text-muted">{r.size}</td>
              {r.retention.map((v, i) => (
                <td key={i} className="rounded-md text-center tabular-nums" style={{ background: v === null ? "transparent" : `color-mix(in srgb, var(--bronze) ${Math.round(10 + v * 0.8)}%, transparent)`, color: v !== null && v > 55 ? "#fff" : undefined, height: 26 }}>
                  {v === null ? "" : `${v}%`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
