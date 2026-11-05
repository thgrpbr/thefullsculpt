"use client";

import { useMemo, useState, type ReactNode, type RefObject } from "react";
import { Camera, Copy, Download, FileVideo, Plus, Sparkles, StepBack, StepForward, Trash2, Upload, Wand2 } from "lucide-react";
import { dateTimeBr } from "@/lib/admin";
import { JOINTS, JOINT_LABEL, MEDIAPIPE_MAP, controlsAt, defaultDef, defaultVideo, referenceCurves, type Check, type JointAngle, type Key, type MotionDef, type VideoRef } from "@/lib/motion";
import type { MotionType } from "@/lib/exercises";
import { Badge, Btn, Field, inputCls } from "@/components/admin/ui";
import { detectKeys } from "./mediapipe";

export type SetDef = (f: (d: MotionDef) => MotionDef) => void;
export const COLORS: Record<JointAngle, string> = { knee: "#E2563B", hip: "#C79A68", trunk: "#3b6fa5", elbow: "#2f7a4a", shoulder: "#7a5aa6" };
export const deg = (r: number) => Math.round((r * 180) / Math.PI * 10) / 10;
export const rad = (d: number) => (d * Math.PI) / 180;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const r4 = (n: number) => Math.round(n * 10000) / 10000;
const mmss = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

/** Bloco com título pequeno, para agrupar campos relacionados. */
export function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border-[0.5px] border-line p-4">
      <legend className="px-2 text-[11px] uppercase tracking-[0.14em] text-muted">{title}</legend>
      {hint && <p className="mb-3 text-[11px] leading-relaxed text-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Num({ label, value, onChange, step = 0.01, suffix, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string; min?: number; max?: number }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <input className={`${inputCls} tabular-nums`} type="number" step={step} min={min} max={max} value={value} onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))} />
        {suffix && <span className="w-6 text-[11px] text-muted">{suffix}</span>}
      </div>
    </Field>
  );
}

/* ================================================================ Curvas */

export function Curves({ def, scrub }: { def: MotionDef; scrub: number }) {
  const c = referenceCurves(def, 61);
  const W = 520;
  const H = 200;
  const x = (p: number) => 28 + p * (W - 40);
  const y = (a: number) => H - 20 - (clamp(a, 0, 180) / 180) * (H - 36);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ângulos de referência ao longo da repetição">
        {[0, 45, 90, 135, 180].map((a) => <g key={a}><line x1={28} x2={W - 12} y1={y(a)} y2={y(a)} stroke="currentColor" strokeOpacity={0.1} /><text x={2} y={y(a) + 3} fontSize={9} fill="currentColor" opacity={0.5}>{a}°</text></g>)}
        {def.checks.filter((k) => k.enabled).map((k) => (
          <path key={"b" + k.joint} d={`M ${c.p.map((p, i) => `${x(p)},${y(c.angles[k.joint][i] + k.tolerance)}`).join(" L ")} L ${[...c.p].reverse().map((p, i) => `${x(p)},${y(c.angles[k.joint][c.p.length - 1 - i] - k.tolerance)}`).join(" L ")} Z`} fill={COLORS[k.joint]} opacity={0.1} />
        ))}
        {JOINTS.map((j) => <polyline key={j} points={c.p.map((p, i) => `${x(p)},${y(c.angles[j][i])}`).join(" ")} fill="none" stroke={COLORS[j]} strokeWidth={2} />)}
        {def.keys.map((k, i) => <line key={i} x1={x(k.p)} x2={x(k.p)} y1={H - 20} y2={H - 13} stroke="currentColor" opacity={0.6} />)}
        <line x1={x(scrub)} x2={x(scrub)} y1={10} y2={H - 20} stroke="#E2563B" strokeDasharray="3 3" />
        {[0, 0.25, 0.5, 0.75, 1].map((p) => <text key={p} x={x(p)} y={H - 3} fontSize={9} textAnchor="middle" fill="currentColor" opacity={0.5}>{Math.round(p * 100)}%</text>)}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">{JOINTS.map((j) => <span key={j} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[j] }} />{JOINT_LABEL[j]}</span>)}<span>faixa clara = tolerância</span></div>
    </div>
  );
}

/* =============================================================== Movimento */

export function MovementPanel({ def, setDef, sel, setSel, setKey, scrub, type }: { def: MotionDef; setDef: SetDef; sel: number; setSel: (i: number) => void; setKey: (i: number, k: Partial<Key>) => void; scrub: number | null; type: MotionType }) {
  const k = def.keys[sel];
  const last = def.keys.length - 1;
  const [model, setModel] = useState<MotionType>(type);
  const insert = (p: number, from?: Key) => {
    if (def.keys.some((x) => Math.abs(x.p - p) < 0.01)) return;
    const c = controlsAt(def, p);
    const nk: Key = from ? { ...from, p: r4(p) } : { p: r4(p), hip: { x: r4(c.hip.x), y: r4(c.hip.y) }, lean: r4(c.lean), headLean: r4(c.headLean), hand: { x: r4(c.hand.x), y: r4(c.hand.y) } };
    setDef((x) => ({ ...x, keys: [...x.keys, nk].sort((a, b) => a.p - b.p) }));
    setSel(def.keys.filter((x) => x.p < nk.p).length);
  };
  const removeKey = () => {
    if (sel === 0 || sel === last) return;
    setDef((x) => ({ ...x, keys: x.keys.filter((_, i) => i !== sel) }));
    setSel(sel - 1);
  };
  const distribute = () => setDef((x) => ({ ...x, keys: x.keys.map((kk, i) => ({ ...kk, p: r4(i / (x.keys.length - 1)) })) }));
  const nextP = scrub ?? (k.p + (def.keys[Math.min(sel + 1, last)].p)) / 2;

  return (
    <div className="space-y-3">
      <Group title="Poses-chave" hint="Selecione uma pose, arraste as bolinhas no desenho e ajuste os números abaixo. Entre as poses o movimento é suavizado automaticamente.">
        <div className="flex flex-wrap items-center gap-2">
          {def.keys.map((x, i) => (
            <button key={i} type="button" onClick={() => setSel(i)} aria-pressed={i === sel} className={`rounded-full border-[0.5px] px-3.5 py-1.5 text-[12px] ${i === sel ? "border-fg bg-fg text-bg" : "border-line hover:bg-surface2"}`}>{Math.round(x.p * 100)}%{i === 0 ? " · início" : i === last ? " · máximo" : ""}</button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={() => insert(nextP)} title="Cria uma pose na posição atual da linha do tempo (ou no meio, se estiver rodando)"><Plus size={12} aria-hidden="true" />Nova pose</Btn>
          <Btn onClick={() => insert(nextP, k)} title="Copia a pose selecionada"><Copy size={12} aria-hidden="true" />Duplicar</Btn>
          <Btn onClick={removeKey} disabled={sel === 0 || sel === last}><Trash2 size={12} aria-hidden="true" />Remover</Btn>
          <Btn onClick={distribute} title="Espaça as poses igualmente de 0 a 100%">Distribuir igualmente</Btn>
        </div>
      </Group>

      <div className="grid gap-3 sm:grid-cols-2">
        <Group title="Quadril">
          <div className="grid grid-cols-2 gap-3">
            <Num label="x (m)" value={k.hip.x} onChange={(v) => setKey(sel, { hip: { ...k.hip, x: clamp(v, -1.5, 1.5) } })} />
            <Num label="altura (m)" value={k.hip.y} onChange={(v) => setKey(sel, { hip: { ...k.hip, y: clamp(v, 0.1, 1.6) } })} />
          </div>
        </Group>
        <Group title="Mão / barra">
          <div className="grid grid-cols-2 gap-3">
            <Num label="x (m)" value={k.hand.x} onChange={(v) => setKey(sel, { hand: { ...k.hand, x: clamp(v, -1.5, 1.5) } })} />
            <Num label="altura (m)" value={k.hand.y} onChange={(v) => setKey(sel, { hand: { ...k.hand, y: clamp(v, -0.2, 2.4) } })} />
          </div>
        </Group>
        <Group title="Tronco e cabeça">
          <div className="grid grid-cols-2 gap-3">
            <Num label="tronco (°)" value={deg(k.lean)} step={1} onChange={(v) => setKey(sel, { lean: clamp(rad(v), -1.6, 1.6) })} />
            <Num label="cabeça (°)" value={deg(k.headLean)} step={1} onChange={(v) => setKey(sel, { headLean: clamp(rad(v), -1.6, 1.6) })} />
          </div>
        </Group>
        <Group title="Posição na repetição">
          {sel === 0 || sel === last
            ? <p className="text-[12px] text-muted">{sel === 0 ? "Pose inicial (0%)" : "Ponto máximo (100%)"}: fixa.</p>
            : <Num label="posição (%)" value={Math.round(k.p * 100)} step={1} min={1} max={99} onChange={(v) => setKey(sel, { p: clamp(r4(v / 100), def.keys[sel - 1].p + 0.01, def.keys[sel + 1].p - 0.01) })} />}
        </Group>
      </div>

      <Group title="Curvas de ângulo" hint="É o que a câmera vai comparar com o aluno. A linha vermelha acompanha a linha do tempo.">
        <Curves def={def} scrub={scrub ?? k.p} />
      </Group>

      <Group title="Começar de um modelo" hint="Substitui as poses pelas do movimento padrão escolhido (as medidas do corpo e o vídeo são mantidos).">
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputCls} !h-9 !w-auto`} value={model} onChange={(e) => setModel(e.target.value as MotionType)} aria-label="Modelo de movimento">
            <option value="squat">Agachamento</option><option value="hinge">Dobradiça de quadril</option><option value="press">Empurrar acima da cabeça</option><option value="raise">Elevação de braços</option>
          </select>
          <Btn onClick={() => { if (confirm("Substituir todas as poses pelas do modelo?")) { setDef((x) => ({ ...x, keys: defaultDef(model, 1).keys })); setSel(0); } }}><Wand2 size={12} aria-hidden="true" />Aplicar modelo</Btn>
        </div>
      </Group>
    </div>
  );
}

/* ================================================================== Vídeo */

export interface VideoState { time: number; duration: number; playing: boolean }

export function VideoPanel({ def, setDef, videoRef, state, exerciseVideo, localName, onLocalFile, sync, setSync, onKeys, onCreateKey, toast }: {
  def: MotionDef; setDef: SetDef; videoRef: RefObject<HTMLVideoElement | null>; state: VideoState; exerciseVideo: string | null; localName: string | null;
  onLocalFile: (f: File | null) => void; sync: boolean; setSync: (v: boolean) => void; onKeys: (keys: Key[], lengths?: MotionDef["lengths"]) => void; onCreateKey: (p: number) => void; toast: (m: string, t?: "ok" | "bad") => void;
}) {
  const v = def.video;
  const set = (patch: Partial<VideoRef>) => setDef((x) => ({ ...x, video: { ...(x.video ?? defaultVideo()), ...patch } }));
  const el = () => videoRef.current;
  const seek = (t: number) => { const e = el(); if (e) e.currentTime = clamp(t, 0, e.duration || t); };
  const step = (n: number) => { const e = el(); if (e) { e.pause(); e.currentTime = clamp(e.currentTime + n / 30, 0, e.duration || 1e6); } };
  const [count, setCount] = useState(5);
  const [adjust, setAdjust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const hasSrc = !!(localName || v?.url || exerciseVideo);
  const marksOk = !!v && v.t1 > v.t0 && v.t2 >= v.t1;
  const pAt = (t: number) => (v && v.t1 > v.t0 ? clamp((t - v.t0) / (v.t1 - v.t0), 0, 1) : 0);
  const inRise = !!v && state.time >= v.t0 && state.time <= v.t1;

  function createHere() {
    if (!v || !inRise) return;
    onCreateKey(r4(pAt(state.time)));
  }
  async function detect() {
    const e = el();
    if (!e) return;
    setBusy(true);
    setNotes([]);
    try {
      const r = await detectKeys(e, def, { count, adjustLengths: adjust, onProgress: setStatus });
      onKeys(r.keys, r.lengths);
      setNotes(r.notes);
      setStatus("Poses geradas. Confira no desenho e ajuste o que for preciso.");
      toast("Poses detectadas e aplicadas no editor (ainda não salvas).");
    } catch (err) {
      setStatus("");
      toast(err instanceof Error ? err.message : "Não foi possível analisar o vídeo.", "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Group title="1. Vídeo da instrutora" hint="Use o vídeo cadastrado no exercício, informe outro endereço ou escolha um arquivo do computador para traçar o movimento por cima.">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-[0.5px] border-line px-3.5 text-[12px] hover:bg-surface2">
              <FileVideo size={13} aria-hidden="true" />Escolher arquivo
              <input type="file" accept="video/*" className="sr-only" onChange={(e) => onLocalFile(e.target.files?.[0] ?? null)} />
            </label>
            {localName && <Badge tone="info">arquivo local: {localName}</Badge>}
            {localName && <Btn onClick={() => onLocalFile(null)}>Usar endereço</Btn>}
          </div>
          <Field label={`Endereço do vídeo${exerciseVideo ? "" : " (https://… ou /videos/…)"}`} hint={exerciseVideo && !v?.url ? `Em uso: vídeo cadastrado no exercício (${exerciseVideo})` : "Vídeos de outros sites podem bloquear a análise automática; prefira hospedar aqui."}>
            <input className={inputCls} value={v?.url ?? ""} onChange={(e) => set({ url: e.target.value.trim() })} placeholder={exerciseVideo ?? "https://…"} maxLength={300} />
          </Field>
          {localName && <p className="text-[11px] text-muted">O arquivo local serve só para o traçado e a análise agora; o que fica salvo no rig são as poses e as marcas de tempo (não o arquivo).</p>}
        </div>
      </Group>

      {hasSrc && (
        <>
          <Group title="2. Reprodução e marcas de tempo" hint="Marque onde a repetição começa, onde chega ao ponto máximo e onde termina. Elas ligam o tempo do vídeo ao 0–100% do movimento.">
            <div className="flex flex-wrap items-center gap-2">
              <Btn onClick={() => step(-1)} title="Quadro anterior"><StepBack size={13} aria-hidden="true" /></Btn>
              <Btn onClick={() => { const e = el(); if (e) void (e.paused ? e.play() : e.pause()); }}>{state.playing ? "Pausar" : "Reproduzir"}</Btn>
              <Btn onClick={() => step(1)} title="Próximo quadro"><StepForward size={13} aria-hidden="true" /></Btn>
              <select className={`${inputCls} !h-8 !w-auto !text-[12px]`} defaultValue="1" onChange={(e) => { const m = el(); if (m) m.playbackRate = Number(e.target.value); }} aria-label="Velocidade">
                {[0.25, 0.5, 1].map((r) => <option key={r} value={r}>{r}×</option>)}
              </select>
              <span className="ml-auto font-mono text-[12px] text-muted">{mmss(state.time)} / {mmss(state.duration || 0)}</span>
            </div>
            <input type="range" className="tfs-range mt-2" min={0} max={state.duration || 1} step={0.01} value={Math.min(state.time, state.duration || 1)} onChange={(e) => seek(Number(e.target.value))} aria-label="Tempo do vídeo" />
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([["t0", "Início"], ["t1", "Ponto máximo"], ["t2", "Fim"]] as const).map(([k, label]) => (
                <div key={k} className="rounded-xl bg-surface2 p-2.5 text-center">
                  <p className="text-[11px] text-muted">{label}</p>
                  <p className="font-mono text-[13px]">{mmss(v?.[k] ?? 0)}</p>
                  <div className="mt-1.5 flex justify-center gap-1.5">
                    <button type="button" onClick={() => set({ [k]: r4(state.time) })} className="rounded-full bg-fg px-2.5 py-1 text-[11px] text-bg">Marcar aqui</button>
                    <button type="button" onClick={() => seek(v?.[k] ?? 0)} className="rounded-full border-[0.5px] border-line px-2.5 py-1 text-[11px]">Ir</button>
                  </div>
                </div>
              ))}
            </div>
            {!marksOk && <p className="mt-2 text-[11px] text-ember">As marcas precisam seguir a ordem: início ≤ ponto máximo ≤ fim.</p>}
            <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} />3D acompanha o vídeo (compare lado a lado)</label>
          </Group>

          <Group title="3. Ajustar o desenho ao vídeo" hint="Alinhe o chão (linha) com os pés da instrutora e a escala com a altura dela. Depois é só traçar as poses.">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label={`Zoom (${(v?.scale ?? 1).toFixed(2)}×)`}><input type="range" className="tfs-range" min={0.4} max={3} step={0.01} value={v?.scale ?? 1} onChange={(e) => set({ scale: Number(e.target.value) })} /></Field>
              <Field label={`Transparência (${Math.round((v?.opacity ?? 0.6) * 100)}%)`}><input type="range" className="tfs-range" min={0.1} max={1} step={0.05} value={v?.opacity ?? 0.6} onChange={(e) => set({ opacity: Number(e.target.value) })} /></Field>
              <Field label={`Horizontal (${Math.round(v?.ox ?? 0)})`}><input type="range" className="tfs-range" min={-300} max={300} step={1} value={v?.ox ?? 0} onChange={(e) => set({ ox: Number(e.target.value) })} /></Field>
              <Field label={`Vertical (${Math.round(v?.oy ?? 0)})`}><input type="range" className="tfs-range" min={-300} max={300} step={1} value={v?.oy ?? 0} onChange={(e) => set({ oy: Number(e.target.value) })} /></Field>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={v?.flip ?? false} onChange={(e) => set({ flip: e.target.checked })} />Instrutora olhando para a esquerda</label>
              <Num label="Altura da instrutora (m)" value={v?.heightM ?? 1.7} min={1} max={2.3} onChange={(n) => set({ heightM: clamp(n, 1, 2.3) })} />
            </div>
          </Group>

          <Group title="4. Gerar as poses" hint="Automático: o MediaPipe lê o corpo em vários quadros entre o início e o ponto máximo e monta as poses. Manual: pause em um quadro, clique em “Criar pose neste quadro” e posicione as alças sobre a instrutora.">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Quantidade de poses"><select className={`${inputCls} !w-auto`} value={count} onChange={(e) => setCount(Number(e.target.value))}>{[3, 5, 7, 9].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
              <label className="flex items-center gap-2 pb-2 text-[13px]"><input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />Ajustar também as medidas do corpo</label>
              <Btn variant="primary" size="md" onClick={detect} disabled={busy || !marksOk}><Sparkles size={13} aria-hidden="true" />{busy ? "Analisando…" : "Detectar pose automaticamente"}</Btn>
              <Btn size="md" onClick={createHere} disabled={!inRise} title="Cria uma pose-chave no ponto da repetição que corresponde a este quadro"><Camera size={13} aria-hidden="true" />Criar pose neste quadro</Btn>
            </div>
            {inRise && <p className="mt-2 text-[12px] text-muted">Este quadro corresponde a <b className="font-medium text-fg">{Math.round(pAt(state.time) * 100)}%</b> do movimento.</p>}
            {status && <p className="mt-2 text-[12px] text-muted" role="status">{status}</p>}
            {notes.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-muted">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            <p className="mt-3 rounded-xl bg-surface2 p-3 text-[11px] leading-relaxed text-muted">Beta: a detecção carrega o modelo do MediaPipe (CDN do Google/jsDelivr) no seu navegador; o vídeo não é enviado ao nosso servidor. Funciona melhor com o corpo inteiro visível, câmera parada e vista lateral. Sempre revise as poses geradas.</p>
          </Group>
        </>
      )}
    </div>
  );
}

/* ====================================================== Corpo e limites */

const LEN_LABEL: Record<keyof MotionDef["lengths"], [string, number, number]> = { thigh: ["Coxa", 0.25, 0.65], shank: ["Canela", 0.25, 0.65], torso: ["Tronco", 0.3, 0.8], uarm: ["Braço", 0.18, 0.45], farm: ["Antebraço", 0.15, 0.4], neck: ["Pescoço", 0.05, 0.3] };

export function BodyPanel({ def, setDef, fresh }: { def: MotionDef; setDef: SetDef; fresh: MotionDef }) {
  const c = referenceCurves(def, 61);
  return (
    <div className="space-y-3">
      <Group title="Proporções do corpo" hint="Comprimento de cada segmento (m). Útil para casos específicos de biomecânica (pernas longas, braços curtos…).">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Btn onClick={() => setDef((x) => ({ ...x, lengths: { ...fresh.lengths } }))}>Medidas padrão</Btn>
          <label className="flex items-center gap-2 text-[12px] text-muted">Duração da repetição (s)
            <input className={`${inputCls} !h-9 !w-20`} type="number" min={1.5} max={12} step={0.5} value={def.repSeconds} onChange={(e) => setDef((x) => ({ ...x, repSeconds: clamp(Number(e.target.value) || 4, 1.5, 12) }))} />
          </label>
        </div>
      </Group>
      <Group title="Amplitude articular" hint="Limites aceitáveis (graus). O Estúdio avisa quando alguma pose passa deles.">
        <div className="space-y-2.5">
          {JOINTS.map((j) => {
            const [lo, hi] = def.limits[j];
            const mn = Math.min(...c.angles[j]);
            const mx = Math.max(...c.angles[j]);
            const out = mn < lo || mx > hi;
            return (
              <div key={j} className="grid grid-cols-[1fr_80px_80px] items-center gap-3 text-[13px]">
                <div><p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[j] }} />{JOINT_LABEL[j]}</p><p className={`text-[11px] ${out ? "text-ember" : "text-muted"}`}>no movimento: {mn}°–{mx}°</p></div>
                <input className={inputCls} type="number" aria-label={`${JOINT_LABEL[j]} mínimo`} value={lo} onChange={(e) => setDef((x) => ({ ...x, limits: { ...x.limits, [j]: [Number(e.target.value), x.limits[j][1]] } }))} />
                <input className={inputCls} type="number" aria-label={`${JOINT_LABEL[j]} máximo`} value={hi} onChange={(e) => setDef((x) => ({ ...x, limits: { ...x.limits, [j]: [x.limits[j][0], Number(e.target.value)] } }))} />
              </div>
            );
          })}
        </div>
      </Group>
    </div>
  );
}

/* =========================================================== Câmera e IA */

export function CameraPanel({ def, setDef, onExport }: { def: MotionDef; setDef: SetDef; onExport: () => void }) {
  const setCheck = (j: JointAngle, c: Partial<Check>) => setDef((x) => ({ ...x, checks: x.checks.map((k) => (k.joint === j ? { ...k, ...c } : k)) }));
  return (
    <div className="space-y-3">
      <Group title="Como a correção por câmera vai funcionar" hint="Em preparação: o recurso para o aluno ainda não existe. O que você define aqui já fica pronto para ele.">
        <ol className="space-y-1.5 text-[12px] leading-relaxed text-muted">
          <li><b className="font-medium text-fg">Referência:</b> as poses e curvas deste rig são o movimento “certo” (o que a instrutora faz).</li>
          <li><b className="font-medium text-fg">Medição:</b> o MediaPipe Pose entrega 33 pontos do corpo do aluno pela câmera; calculamos os mesmos ângulos.</li>
          <li><b className="font-medium text-fg">Comparação:</b> em cada fase da repetição, a diferença para a referência é checada contra a tolerância; fora dela, o aluno vê a dica.</li>
          <li><b className="font-medium text-fg">Privacidade:</b> a imagem da câmera deve ser processada no próprio aparelho, sem ir ao servidor (a prever na Política de Privacidade).</li>
        </ol>
        <div className="mt-3"><Btn onClick={onExport}><Download size={13} aria-hidden="true" />Exportar referência (JSON)</Btn></div>
      </Group>
      {def.checks.map((c) => (
        <Group key={c.joint} title={JOINT_LABEL[c.joint]}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={c.enabled} onChange={(e) => setCheck(c.joint, { enabled: e.target.checked })} /><span className="h-2 w-2 rounded-full" style={{ background: COLORS[c.joint] }} />Conferir este ângulo</label>
            <span className="font-mono text-[10px] text-muted">MediaPipe {MEDIAPIPE_MAP[c.joint].left.join("–")} (esq.) · {MEDIAPIPE_MAP[c.joint].right.join("–")} (dir.)</span>
          </div>
          {c.enabled && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Num label="Tolerância (± graus)" value={c.tolerance} step={1} min={1} max={60} onChange={(v) => setCheck(c.joint, { tolerance: clamp(v, 1, 60) })} />
                <Num label="Peso na nota (1–5)" value={c.weight} step={1} min={1} max={5} onChange={(v) => setCheck(c.joint, { weight: clamp(Math.round(v), 1, 5) })} />
              </div>
              {(["pt", "en", "es"] as const).map((l) => (
                <div key={l} className="grid gap-2 sm:grid-cols-2">
                  <Field label={`Abaixo da referência (${l})`}><input className={inputCls} value={c.cueLow[l]} maxLength={160} onChange={(e) => setCheck(c.joint, { cueLow: { ...c.cueLow, [l]: e.target.value } })} /></Field>
                  <Field label={`Acima da referência (${l})`}><input className={inputCls} value={c.cueHigh[l]} maxLength={160} onChange={(e) => setCheck(c.joint, { cueHigh: { ...c.cueHigh, [l]: e.target.value } })} /></Field>
                </div>
              ))}
            </div>
          )}
        </Group>
      ))}
    </div>
  );
}

/* ============================================================== Versões */

export function VersionsPanel({ slug, def, setDef, history, others, onRestore, onCopy, download, toast }: {
  slug: string; def: MotionDef; setDef: SetDef; history: { id: number; version: number; note: string | null; created_at: string; is_current: number; author: string | null }[];
  others: { slug: string; name: string; rig_version: number | null }[]; onRestore: (v: number) => void; onCopy: (slugs: string[]) => Promise<void>;
  download: (n: string, d: unknown) => void; toast: (m: string, t?: "ok" | "bad") => void;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const targets = useMemo(() => others.filter((o) => o.slug !== slug), [others, slug]);
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
    <div className="space-y-3">
      <Group title="Histórico" hint="Cada salvamento cria uma versão. Restaurar cria uma nova versão a partir da escolhida.">
        <ul className="divide-y divide-line text-[13px]">
          {history.length === 0 && <li className="py-5 text-center text-muted">Nenhuma versão salva ainda.</li>}
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div><p className="flex items-center gap-2">v{h.version}{h.is_current ? <Badge tone="ok">atual</Badge> : null}</p><p className="text-[11px] text-muted">{h.note ?? "—"} · {h.author ?? "—"} · {dateTimeBr(h.created_at)}</p></div>
              {!h.is_current && <Btn onClick={() => onRestore(h.version)}>Restaurar</Btn>}
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Replicar para outros exercícios" hint="Copia este rig (poses, medidas, limites, regras e vídeo) para variações do movimento. Cada cópia vira uma nova versão no exercício de destino.">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {targets.map((o) => (
            <label key={o.slug} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={picked.includes(o.slug)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, o.slug] : p.filter((x) => x !== o.slug)))} />{o.name}{o.rig_version ? <span className="text-[10px] text-muted">(já tem rig v{o.rig_version})</span> : null}</label>
          ))}
        </div>
        <div className="mt-3"><Btn disabled={picked.length === 0 || busy} onClick={async () => { setBusy(true); await onCopy(picked); setBusy(false); setPicked([]); }}><Copy size={12} aria-hidden="true" />Copiar para {picked.length || "…"} exercício(s)</Btn></div>
        <p className="mt-2 text-[11px] text-muted">Copia o que está salvo agora no editor (salve antes se tiver alterações pendentes).</p>
      </Group>
      <Group title="Arquivos">
        <div className="flex flex-wrap gap-2"><Btn onClick={() => download(`${slug}-rig.json`, def)}><Download size={13} aria-hidden="true" />Exportar rig (JSON)</Btn></div>
        <textarea className="mt-3 min-h-[90px] w-full rounded-xl border-[0.5px] border-line bg-surface p-3 font-mono text-[11px] outline-none focus:border-bronze" placeholder="Cole aqui o JSON de um rig exportado para importar" value={text} onChange={(e) => setText(e.target.value)} aria-label="JSON do rig" />
        <div className="mt-2"><Btn disabled={!text.trim()} onClick={load}><Upload size={13} aria-hidden="true" />Importar no editor</Btn></div>
      </Group>
    </div>
  );
}
