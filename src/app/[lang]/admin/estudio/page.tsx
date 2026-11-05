"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Pause, Play, Plus, Trash2, Upload } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { dateTimeBr, ERRORS, send, useApi } from "@/lib/admin";
import { EXERCISES } from "@/lib/exercises";
import { JOINTS, JOINT_LABEL, MEDIAPIPE_MAP, controlsAt, defaultDef, exportReference, limitWarnings, poseFromKey, referenceCurves, type Check, type JointAngle, type Key, type MotionDef } from "@/lib/motion";
import type { V } from "@/lib/pose";
import { Badge, Btn, Card, Field, inputCls, PageHead, Spinner, Tabs, useAdmin } from "@/components/admin/ui";

const AnatomyPanel = dynamic(() => import("@/components/AnatomyPanel"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-surface" /> });

interface Row { slug: string; name: string; motion: string; depth: number; rig_version: number | null }
interface Detail { slug: string; name: string; motion: "squat" | "hinge" | "press" | "raise"; depth: number; def: MotionDef | null; version: number | null; history: { id: number; version: number; note: string | null; created_at: string; is_current: number; author: string | null }[] }

const MORE: Record<string, string> = { invalid_rig: "Algum valor está fora da faixa aceita.", rig_keys_range: "As poses-chave precisam começar em 0% e terminar em 100%.", rig_keys_duplicate: "Duas poses-chave estão na mesma posição." };
const COLORS: Record<JointAngle, string> = { knee: "#E2563B", hip: "#C79A68", trunk: "#3b6fa5", elbow: "#2f7a4a", shoulder: "#7a5aa6" };
const deg = (r: number) => Math.round((r * 180) / Math.PI * 10) / 10;
const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function Page() {
  return (
    <Suspense fallback={<div className="flex justify-center py-32"><Spinner /></div>}>
      <Studio />
    </Suspense>
  );
}

function Studio() {
  const { href } = useI18n();
  const ex = useSearchParams().get("ex") ?? "squat";
  const list = useApi<{ rows: Row[] }>("/admin/studio");
  const detail = useApi<Detail>(`/admin/studio/${ex}`);
  if (!list.data || !detail.data) return <div className="flex justify-center py-32"><Spinner /></div>;
  const d = detail.data;
  return (
    <div>
      <PageHead eyebrow="Método e exercícios" title="Estúdio 3D">
        <label className="flex items-center gap-2 text-[12px] text-muted">
          Exercício
          <select className={`${inputCls} !h-10 !w-auto`} value={ex} onChange={(e) => { location.assign(href(`/admin/estudio?ex=${e.target.value}`)); }}>
            {list.data.rows.map((r) => <option key={r.slug} value={r.slug}>{r.name}{r.rig_version ? ` · rig v${r.rig_version}` : ""}</option>)}
          </select>
        </label>
        <Link href={href("/admin/metodo")} className="inline-flex h-10 items-center rounded-full border-[0.5px] border-line px-5 text-[13px] hover:bg-surface2">← Método</Link>
      </PageHead>
      <Editor key={`${d.slug}-${d.version}`} d={d} reload={() => { detail.reload(); list.reload(); }} />
    </div>
  );
}

function Editor({ d, reload }: { d: Detail; reload: () => void }) {
  const { toast } = useAdmin();
  const fresh = useMemo(() => defaultDef(d.motion, d.depth), [d.motion, d.depth]);
  const baseline = d.def ?? fresh;
  const [def, setDef] = useState<MotionDef>(baseline);
  const [sel, setSel] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [tab, setTab] = useState<"poses" | "corpo" | "limites" | "camera" | "curvas" | "versoes">("poses");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = !sameJson(def, baseline);
  const playing = scrub === null;
  const warnings = useMemo(() => limitWarnings(def), [def]);
  const exerciseId = EXERCISES[d.slug] ? d.slug : "squat";

  const setKey = (i: number, k: Partial<Key>) => setDef((x) => ({ ...x, keys: x.keys.map((kk, j) => (j === i ? { ...kk, ...k } : kk)) }));
  const fail = (code: string) => toast(MORE[code] ?? ERRORS[code] ?? ERRORS.generic, "bad");

  async function save() {
    setBusy(true);
    const r = await send<{ version: number }>("PUT", `/admin/studio/${d.slug}`, { def, note });
    setBusy(false);
    if (r.ok) { toast(`Rig salvo (v${r.data.version}). O app já usa este movimento.`); setNote(""); reload(); } else fail(r.code);
  }
  async function useDefault() {
    if (!confirm("Voltar ao movimento padrão deste exercício? O histórico de versões é mantido.")) return;
    const r = await send("DELETE", `/admin/studio/${d.slug}`);
    if (r.ok) { toast("Movimento padrão restaurado."); reload(); } else fail(r.code);
  }
  async function restore(version: number) {
    const r = await send("POST", `/admin/studio/${d.slug}/restore`, { version });
    if (r.ok) { toast(`Versão ${version} restaurada.`); reload(); } else fail(r.code);
  }
  function download(name: string, data: unknown) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <div className="relative h-[460px] overflow-hidden rounded-[28px]">
          <AnatomyPanel exerciseId={exerciseId} playing={playing} motionDef={def} scrub={scrub} defaultLayer="skeleton" className="h-full" />
        </div>
        <div className="flex items-center gap-3 rounded-2xl border-[0.5px] border-line bg-surface px-4 py-3">
          <button type="button" onClick={() => setScrub(playing ? def.keys[sel].p : null)} aria-label={playing ? "Pausar" : "Reproduzir"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fg text-bg">
            {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          </button>
          <div className="relative flex-1">
            <input type="range" className="tfs-range" min={0} max={1} step={0.005} value={scrub ?? 0} onChange={(e) => setScrub(Number(e.target.value))} aria-label="Posição na repetição" />
            <div className="pointer-events-none absolute inset-x-[14px] top-[3px] h-[3px]" aria-hidden="true">
              {def.keys.map((k, i) => <span key={i} className={`absolute top-[-3px] h-[9px] w-[9px] -translate-x-1/2 rounded-full ${i === sel ? "bg-ember" : "bg-fg/60"}`} style={{ left: `${k.p * 100}%` }} />)}
            </div>
          </div>
          <span className="w-12 text-right font-mono text-[12px] text-muted">{scrub === null ? "auto" : `${Math.round(scrub * 100)}%`}</span>
        </div>
        {warnings.length > 0 ? (
          <ul role="status" className="space-y-1 rounded-2xl border-[0.5px] border-ember/40 bg-ember/5 px-4 py-3 text-[12px] text-ember">{warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>
        ) : <p className="rounded-2xl bg-surface2 px-4 py-3 text-[12px] text-muted">Todas as poses estão dentro dos limites de amplitude definidos.</p>}
      </div>

      <div className="space-y-3">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={d.def ? "ok" : "neutral"}>{d.def ? `rig personalizado v${d.version}` : "movimento padrão"}</Badge>
            {dirty && <Badge tone="warn">alterações não salvas</Badge>}
            <span className="flex-1" />
            <input className={`${inputCls} !h-10 max-w-[220px]`} placeholder="Nota da versão (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label="Nota da versão" />
            <Btn variant="primary" size="md" disabled={!dirty || busy} onClick={save}>Salvar rig</Btn>
            <Btn size="md" disabled={!dirty} onClick={() => { setDef(baseline); setSel(0); }}>Descartar</Btn>
            {d.def && <Btn size="md" onClick={useDefault}>Voltar ao padrão</Btn>}
          </div>
          <p className="mt-2 text-[11px] text-muted">Ao salvar, o app do aluno passa a usar este movimento neste exercício. Sem rig salvo, vale o movimento padrão.</p>
        </Card>

        <Tabs value={tab} onChange={setTab} items={[{ value: "poses", label: "Poses" }, { value: "corpo", label: "Corpo" }, { value: "limites", label: "Limites" }, { value: "camera", label: "Câmera e IA" }, { value: "curvas", label: "Curvas" }, { value: "versoes", label: "Versões", count: d.history.length }]} />

        {tab === "poses" && <PosesTab def={def} setDef={setDef} sel={sel} setSel={(i) => { setSel(i); setScrub(def.keys[i].p); }} setKey={setKey} scrub={scrub} />}
        {tab === "corpo" && <BodyTab def={def} setDef={setDef} fresh={fresh} />}
        {tab === "limites" && <LimitsTab def={def} setDef={setDef} />}
        {tab === "camera" && <CameraTab def={def} setDef={setDef} onExport={() => download(`${d.slug}-referencia.json`, exportReference(d.slug, def))} />}
        {tab === "curvas" && <CurvesTab def={def} scrub={scrub ?? 0} />}
        {tab === "versoes" && (
          <Card title="Versões e arquivos" sub="Cada salvamento cria uma versão. Restaurar cria uma nova versão a partir da escolhida.">
            <ul className="divide-y divide-line text-[13px]">
              {d.history.length === 0 && <li className="py-6 text-center text-muted">Nenhuma versão salva ainda.</li>}
              {d.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div><p className="flex items-center gap-2">v{h.version}{h.is_current ? <Badge tone="ok">atual</Badge> : null}</p><p className="text-[11px] text-muted">{h.note ?? "—"} · {h.author ?? "—"} · {dateTimeBr(h.created_at)}</p></div>
                  {!h.is_current && <Btn onClick={() => restore(h.version)}>Restaurar</Btn>}
                </li>
              ))}
            </ul>
            <FilesBox def={def} setDef={setDef} slug={d.slug} download={download} />
          </Card>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Poses */

function PosesTab({ def, setDef, sel, setSel, setKey, scrub }: { def: MotionDef; setDef: (f: (d: MotionDef) => MotionDef) => void; sel: number; setSel: (i: number) => void; setKey: (i: number, k: Partial<Key>) => void; scrub: number | null }) {
  const k = def.keys[sel];
  const last = def.keys.length - 1;
  const addKey = () => {
    const p = scrub ?? (def.keys[Math.min(sel + 1, last)].p + k.p) / 2;
    if (def.keys.some((x) => Math.abs(x.p - p) < 0.01)) return;
    const c = controlsAt(def, p);
    const nk: Key = { p: r4(p), hip: { x: r4(c.hip.x), y: r4(c.hip.y) }, lean: r4(c.lean), headLean: r4(c.headLean), hand: { x: r4(c.hand.x), y: r4(c.hand.y) } };
    setDef((x) => ({ ...x, keys: [...x.keys, nk].sort((a, b) => a.p - b.p) }));
    setSel(def.keys.filter((x) => x.p < nk.p).length);
  };
  const removeKey = () => {
    if (sel === 0 || sel === last) return;
    setDef((x) => ({ ...x, keys: x.keys.filter((_, i) => i !== sel) }));
    setSel(sel - 1);
  };
  const num = (label: string, value: number, on: (v: number) => void, step = 0.01, suffix = "") => (
    <Field label={label}><div className="flex items-center gap-1"><input className={inputCls} type="number" step={step} value={value} onChange={(e) => e.target.value !== "" && on(Number(e.target.value))} />{suffix && <span className="text-[11px] text-muted">{suffix}</span>}</div></Field>
  );
  return (
    <Card title="Poses-chave" sub="Arraste as bolinhas do desenho para posicionar quadril, tronco, cabeça e mão. Joelho e cotovelo são calculados (cinemática inversa).">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {def.keys.map((x, i) => (
          <button key={i} type="button" onClick={() => setSel(i)} aria-pressed={i === sel} className={`rounded-full border-[0.5px] px-3.5 py-1.5 text-[12px] ${i === sel ? "border-fg bg-fg text-bg" : "border-line hover:bg-surface2"}`}>{Math.round(x.p * 100)}%{i === 0 ? " · início" : i === last ? " · máximo" : ""}</button>
        ))}
        <Btn onClick={addKey} title="Cria uma pose-chave na posição atual da linha do tempo"><Plus size={12} aria-hidden="true" />Nova pose</Btn>
        {sel !== 0 && sel !== last && <Btn onClick={removeKey}><Trash2 size={12} aria-hidden="true" />Remover</Btn>}
      </div>
      <SideEditor def={def} idx={sel} setKey={setKey} />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {sel !== 0 && sel !== last && num("Posição (%)", Math.round(k.p * 100), (v) => setKey(sel, { p: clamp(r4(v / 100), def.keys[sel - 1].p + 0.01, def.keys[sel + 1].p - 0.01) }), 1)}
        {num("Quadril x (m)", k.hip.x, (v) => setKey(sel, { hip: { ...k.hip, x: clamp(v, -1.5, 1.5) } }))}
        {num("Quadril y (m)", k.hip.y, (v) => setKey(sel, { hip: { ...k.hip, y: clamp(v, 0.1, 1.6) } }))}
        {num("Tronco (°)", deg(k.lean), (v) => setKey(sel, { lean: clamp(rad(v), -1.6, 1.6) }), 1)}
        {num("Cabeça (°)", deg(k.headLean), (v) => setKey(sel, { headLean: clamp(rad(v), -1.6, 1.6) }), 1)}
        {num("Mão x (m)", k.hand.x, (v) => setKey(sel, { hand: { ...k.hand, x: clamp(v, -1.5, 1.5) } }))}
        {num("Mão y (m)", k.hand.y, (v) => setKey(sel, { hand: { ...k.hand, y: clamp(v, -0.2, 2.4) } }))}
      </div>
    </Card>
  );
}

const S = 180;
const OX = 190;
const OY = 372;
const toSvg = (v: V): [number, number] => [OX + v.x * S, OY - v.y * S];

/** Vista lateral com alças arrastáveis (quadril, ombro/tronco, cabeça, mão). */
function SideEditor({ def, idx, setKey }: { def: MotionDef; idx: number; setKey: (i: number, k: Partial<Key>) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<"hip" | "neck" | "head" | "hand" | null>(null);
  const k = def.keys[idx];
  const pose = poseFromKey(def, k);
  const J = pose.j;
  const P = (v: V) => toSvg(v).join(",");
  const line = (a: V, b: V) => `${P(a)} ${P(b)}`;
  const ghost = (key: Key) => {
    const g = poseFromKey(def, key).j;
    return [[g.heel, g.toe], [g.ankle, g.knee, g.hip, g.neck, g.head], [g.shoulder, g.elbow, g.wrist]];
  };

  function world(e: React.PointerEvent): V {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 400;
    const py = ((e.clientY - r.top) / r.height) * 400;
    return { x: (px - OX) / S, y: (OY - py) / S };
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const w = world(e);
    if (drag === "hip") setKey(idx, { hip: { x: r4(clamp(w.x, -1.5, 1.5)), y: r4(clamp(w.y, 0.1, 1.6)) } });
    else if (drag === "hand") setKey(idx, { hand: { x: r4(clamp(w.x, -1.5, 1.5)), y: r4(clamp(w.y, -0.2, 2.4)) } });
    else if (drag === "neck") setKey(idx, { lean: r4(clamp(Math.atan2(w.x - k.hip.x, w.y - k.hip.y), -1.6, 1.6)) });
    else setKey(idx, { headLean: r4(clamp(Math.atan2(w.x - J.neck.x, w.y - J.neck.y), -1.6, 1.6)) });
  }
  const handle = (kind: NonNullable<typeof drag>, v: V, label: string, color: string) => {
    const [x, y] = toSvg(v);
    return (
      <g key={kind} onPointerDown={(e) => { svg.current?.setPointerCapture(e.pointerId); setDrag(kind); }} style={{ cursor: "grab" }} role="slider" aria-label={label} tabIndex={0}>
        <circle cx={x} cy={y} r={16} fill="transparent" />
        <circle cx={x} cy={y} r={drag === kind ? 9 : 7} fill={color} stroke="#fff" strokeWidth={2} />
      </g>
    );
  };

  return (
    <svg ref={svg} viewBox="0 0 400 400" className="mx-auto block h-[400px] w-full max-w-[420px] touch-none select-none rounded-2xl bg-surface2" onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} aria-label="Editor da pose, vista lateral">
      <line x1={10} y1={OY} x2={390} y2={OY} stroke="currentColor" strokeOpacity={0.25} />
      {[0, 0.5, 1, 1.5, 2].map((m) => <g key={m}><line x1={OX - 3} y1={OY - m * S} x2={OX + 3} y2={OY - m * S} stroke="currentColor" strokeOpacity={0.3} /><text x={OX + 8} y={OY - m * S + 3} fontSize={8} fill="currentColor" opacity={0.4}>{m} m</text></g>)}
      {def.keys.map((kk, i) => i !== idx && ghost(kk).map((seg, n) => <polyline key={`${i}-${n}`} points={seg.map(P).join(" ")} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />))}
      <polyline points={line(J.heel, J.toe)} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <polyline points={[J.ankle, J.knee, J.hip, J.neck, J.head].map(P).join(" ")} fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={[J.shoulder, J.elbow, J.wrist].map(P).join(" ")} fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      {[J.knee, J.elbow].map((j, i) => <circle key={i} cx={toSvg(j)[0]} cy={toSvg(j)[1]} r={4} fill="currentColor" opacity={0.6} />)}
      {handle("hip", J.hip, "Quadril", "#C79A68")}
      {handle("neck", J.neck, "Ombro e tronco", "#3b6fa5")}
      {handle("head", J.head, "Cabeça", "#7a5aa6")}
      {handle("hand", k.hand, "Mão", "#E2563B")}
      <g fontSize={10} fill="currentColor" opacity={0.6}>
        <text x={14} y={20}>joelho {pose.metrics.knee}° · quadril {pose.metrics.hip}° · tronco {pose.metrics.trunk}°</text>
        <text x={14} y={34}>cotovelo {pose.metrics.elbow}° · ombro {pose.metrics.shoulder}°</text>
      </g>
    </svg>
  );
}

/* ----------------------------------------------------------------- Corpo */

const LEN_LABEL: Record<keyof MotionDef["lengths"], [string, number, number]> = { thigh: ["Coxa", 0.25, 0.65], shank: ["Canela", 0.25, 0.65], torso: ["Tronco", 0.3, 0.8], uarm: ["Braço", 0.18, 0.45], farm: ["Antebraço", 0.15, 0.4], neck: ["Pescoço", 0.05, 0.3] };

function BodyTab({ def, setDef, fresh }: { def: MotionDef; setDef: (f: (d: MotionDef) => MotionDef) => void; fresh: MotionDef }) {
  return (
    <Card title="Proporções do corpo" sub="Comprimento de cada segmento (m). Serve para casos específicos de biomecânica (ex.: pernas longas, braços curtos).">
      <div className="space-y-4">
        {(Object.keys(LEN_LABEL) as (keyof MotionDef["lengths"])[]).map((k) => {
          const [label, lo, hi] = LEN_LABEL[k];
          return (
            <div key={k}>
              <div className="flex items-baseline justify-between text-[13px]"><span>{label}</span><span className="font-mono text-[12px] text-muted">{def.lengths[k].toFixed(2)} m</span></div>
              <input type="range" className="tfs-range" min={lo} max={hi} step={0.01} value={def.lengths[k]} onChange={(e) => setDef((x) => ({ ...x, lengths: { ...x.lengths, [k]: Number(e.target.value) } }))} aria-label={label} />
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Btn onClick={() => setDef((x) => ({ ...x, lengths: { ...fresh.lengths } }))}>Medidas padrão</Btn>
        <label className="flex items-center gap-2 text-[12px] text-muted">Duração da repetição (s)
          <input className={`${inputCls} !h-9 !w-20`} type="number" min={1.5} max={12} step={0.5} value={def.repSeconds} onChange={(e) => setDef((x) => ({ ...x, repSeconds: clamp(Number(e.target.value) || 4, 1.5, 12) }))} />
        </label>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Limites */

function LimitsTab({ def, setDef }: { def: MotionDef; setDef: (f: (d: MotionDef) => MotionDef) => void }) {
  const c = referenceCurves(def, 61);
  return (
    <Card title="Amplitude articular" sub="Limites aceitáveis (graus) para cada articulação. O Estúdio avisa quando alguma pose passa deles.">
      <div className="space-y-3">
        {JOINTS.map((j) => {
          const [lo, hi] = def.limits[j];
          const mn = Math.min(...c.angles[j]);
          const mx = Math.max(...c.angles[j]);
          const out = mn < lo || mx > hi;
          return (
            <div key={j} className="grid grid-cols-[1fr_88px_88px] items-center gap-3 text-[13px]">
              <div><p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[j] }} />{JOINT_LABEL[j]}</p><p className={`text-[11px] ${out ? "text-ember" : "text-muted"}`}>no movimento: {mn}°–{mx}°</p></div>
              <input className={inputCls} type="number" aria-label={`${JOINT_LABEL[j]} mínimo`} value={lo} onChange={(e) => setDef((x) => ({ ...x, limits: { ...x.limits, [j]: [Number(e.target.value), x.limits[j][1]] } }))} />
              <input className={inputCls} type="number" aria-label={`${JOINT_LABEL[j]} máximo`} value={hi} onChange={(e) => setDef((x) => ({ ...x, limits: { ...x.limits, [j]: [x.limits[j][0], Number(e.target.value)] } }))} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------- Câmera e IA */

function CameraTab({ def, setDef, onExport }: { def: MotionDef; setDef: (f: (d: MotionDef) => MotionDef) => void; onExport: () => void }) {
  const setCheck = (j: JointAngle, c: Partial<Check>) => setDef((x) => ({ ...x, checks: x.checks.some((k) => k.joint === j) ? x.checks.map((k) => (k.joint === j ? { ...k, ...c } : k)) : x.checks }));
  return (
    <div className="space-y-3">
      <Card title="Correção por câmera (MediaPipe)" sub="Em preparação — o recurso para o aluno ainda não existe. O que você define aqui já fica pronto para ele.">
        <ol className="space-y-1.5 text-[12px] leading-relaxed text-muted">
          <li><b className="font-medium text-fg">1. Referência:</b> a pose-chave e as curvas deste rig são o movimento “certo” (o que a instrutora faz).</li>
          <li><b className="font-medium text-fg">2. Medição:</b> o MediaPipe Pose entrega 33 pontos do corpo do aluno pela câmera; calculamos os mesmos ângulos (tabela abaixo).</li>
          <li><b className="font-medium text-fg">3. Comparação:</b> em cada fase da repetição, a diferença para a referência é checada contra a tolerância; fora dela, o aluno recebe a dica de correção.</li>
          <li><b className="font-medium text-fg">Privacidade:</b> o vídeo da câmera deve ser processado no próprio aparelho, sem enviar imagens ao servidor (a ser previsto na Política de Privacidade).</li>
        </ol>
        <div className="mt-3"><Btn onClick={onExport}><Download size={13} aria-hidden="true" />Exportar referência (JSON)</Btn></div>
      </Card>
      <Card title="Regras de checagem" sub="Quais ângulos valem para este exercício, a tolerância e o que dizer ao aluno.">
        <div className="space-y-4">
          {def.checks.map((c) => (
            <div key={c.joint} className={`rounded-2xl border-[0.5px] p-4 ${c.enabled ? "border-line" : "border-line opacity-60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={c.enabled} onChange={(e) => setCheck(c.joint, { enabled: e.target.checked })} /><span className="h-2 w-2 rounded-full" style={{ background: COLORS[c.joint] }} />{JOINT_LABEL[c.joint]}</label>
                <span className="font-mono text-[10px] text-muted">MediaPipe: {MEDIAPIPE_MAP[c.joint].left.join("–")} (esq.) · {MEDIAPIPE_MAP[c.joint].right.join("–")} (dir.)</span>
              </div>
              {c.enabled && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Tolerância (± graus)"><input className={inputCls} type="number" min={1} max={60} value={c.tolerance} onChange={(e) => setCheck(c.joint, { tolerance: clamp(Number(e.target.value) || 1, 1, 60) })} /></Field>
                    <Field label="Peso na nota (1–5)"><input className={inputCls} type="number" min={1} max={5} value={c.weight} onChange={(e) => setCheck(c.joint, { weight: clamp(Math.round(Number(e.target.value) || 1), 1, 5) })} /></Field>
                  </div>
                  {(["pt", "en", "es"] as const).map((l) => (
                    <div key={l} className="grid gap-2 sm:grid-cols-2">
                      <Field label={`Abaixo da referência (${l})`}><input className={inputCls} value={c.cueLow[l]} maxLength={160} onChange={(e) => setCheck(c.joint, { cueLow: { ...c.cueLow, [l]: e.target.value } })} /></Field>
                      <Field label={`Acima da referência (${l})`}><input className={inputCls} value={c.cueHigh[l]} maxLength={160} onChange={(e) => setCheck(c.joint, { cueHigh: { ...c.cueHigh, [l]: e.target.value } })} /></Field>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- Curvas */

function CurvesTab({ def, scrub }: { def: MotionDef; scrub: number }) {
  const c = referenceCurves(def, 61);
  const W = 520;
  const H = 220;
  const x = (p: number) => 28 + p * (W - 40);
  const y = (a: number) => H - 20 - (clamp(a, 0, 180) / 180) * (H - 36);
  return (
    <Card title="Curvas de referência" sub="Ângulo de cada articulação ao longo da repetição (0% = início, 100% = ponto máximo). É esta a curva que a câmera vai comparar.">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ângulos de referência ao longo da repetição">
        {[0, 45, 90, 135, 180].map((a) => <g key={a}><line x1={28} x2={W - 12} y1={y(a)} y2={y(a)} stroke="currentColor" strokeOpacity={0.1} /><text x={2} y={y(a) + 3} fontSize={9} fill="currentColor" opacity={0.5}>{a}°</text></g>)}
        {def.checks.filter((k) => k.enabled).map((k) => {
          const mid = (v: number) => v;
          return <path key={"band" + k.joint} d={`M ${c.p.map((p, i) => `${x(p)},${y(mid(c.angles[k.joint][i]) + k.tolerance)}`).join(" L ")} L ${[...c.p].reverse().map((p, i) => `${x(p)},${y(c.angles[k.joint][c.p.length - 1 - i] - k.tolerance)}`).join(" L ")} Z`} fill={COLORS[k.joint]} opacity={0.1} />;
        })}
        {JOINTS.map((j) => <polyline key={j} points={c.p.map((p, i) => `${x(p)},${y(c.angles[j][i])}`).join(" ")} fill="none" stroke={COLORS[j]} strokeWidth={2} />)}
        {def.keys.map((k, i) => <line key={i} x1={x(k.p)} x2={x(k.p)} y1={H - 20} y2={H - 14} stroke="currentColor" opacity={0.6} />)}
        <line x1={x(scrub)} x2={x(scrub)} y1={10} y2={H - 20} stroke="#E2563B" strokeDasharray="3 3" />
        {[0, 0.25, 0.5, 0.75, 1].map((p) => <text key={p} x={x(p)} y={H - 3} fontSize={9} textAnchor="middle" fill="currentColor" opacity={0.5}>{Math.round(p * 100)}%</text>)}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">{JOINTS.map((j) => <span key={j} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[j] }} />{JOINT_LABEL[j]}</span>)}<span>faixa clara = tolerância das regras ativas</span></div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Arquivos */

function FilesBox({ def, setDef, slug, download }: { def: MotionDef; setDef: (f: (d: MotionDef) => MotionDef) => void; slug: string; download: (n: string, d: unknown) => void }) {
  const { toast } = useAdmin();
  const [text, setText] = useState("");
  function load() {
    try {
      const j = JSON.parse(text) as MotionDef;
      if (j.v !== 1 || !Array.isArray(j.keys) || j.keys.length < 2 || !j.lengths || !j.limits) throw new Error("formato");
      setDef(() => j);
      setText("");
      toast("Rig importado no editor. Revise e salve.");
    } catch {
      toast("JSON inválido para um rig.", "bad");
    }
  }
  return (
    <div className="mt-5 border-t-[0.5px] border-line pt-4">
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => download(`${slug}-rig.json`, def)}><Download size={13} aria-hidden="true" />Exportar rig (JSON)</Btn>
      </div>
      <textarea className="mt-3 min-h-[90px] w-full rounded-xl border-[0.5px] border-line bg-surface p-3 font-mono text-[11px] outline-none focus:border-bronze" placeholder="Cole aqui o JSON de um rig exportado para importar (copiar de outro exercício, por exemplo)" value={text} onChange={(e) => setText(e.target.value)} aria-label="JSON do rig" />
      <div className="mt-2"><Btn disabled={!text.trim()} onClick={load}><Upload size={13} aria-hidden="true" />Importar no editor</Btn></div>
    </div>
  );
}
