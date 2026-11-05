"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pause, Play, Redo2, Undo2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ERRORS, send, useApi } from "@/lib/admin";
import { EXERCISES } from "@/lib/exercises";
import { defaultDef, defaultVideo, exportReference, limitWarnings, type Key, type MotionDef } from "@/lib/motion";
import { Badge, Btn, Card, inputCls, PageHead, Spinner, Tabs, useAdmin } from "@/components/admin/ui";
import { SideEditor } from "@/components/studio/SideEditor";
import { BodyPanel, CameraPanel, MovementPanel, VersionsPanel, VideoPanel, clamp, r4, type VideoState } from "@/components/studio/panels";

const AnatomyPanel = dynamic(() => import("@/components/AnatomyPanel"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-surface" /> });

interface Row { slug: string; name: string; motion: string; depth: number; rig_version: number | null }
interface Detail { slug: string; name: string; motion: "squat" | "hinge" | "press" | "raise"; depth: number; video_url: string | null; def: MotionDef | null; version: number | null; history: { id: number; version: number; note: string | null; created_at: string; is_current: number; author: string | null }[] }

const MORE: Record<string, string> = { invalid_rig: "Algum valor está fora da faixa aceita.", rig_keys_range: "As poses-chave precisam começar em 0% e terminar em 100%.", rig_keys_duplicate: "Duas poses-chave estão na mesma posição.", video_marks: "As marcas do vídeo precisam seguir a ordem: início ≤ ponto máximo ≤ fim." };
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type Tab = "movimento" | "video" | "corpo" | "camera" | "versoes";

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
      <Editor key={`${d.slug}-${d.version}`} d={d} rows={list.data.rows} reload={() => { detail.reload(); list.reload(); }} />
    </div>
  );
}

function Editor({ d, rows, reload }: { d: Detail; rows: Row[]; reload: () => void }) {
  const { toast } = useAdmin();
  const fresh = useMemo(() => defaultDef(d.motion, d.depth), [d.motion, d.depth]);
  const baseline = d.def ?? fresh;

  /* ---------- estado com desfazer/refazer ---------- */
  const [def, setDefState] = useState<MotionDef>(baseline);
  const defRef = useRef(def);
  const past = useRef<MotionDef[]>([]);
  const future = useRef<MotionDef[]>([]);
  const lastPush = useRef(0);
  const [hist, setHist] = useState({ u: 0, r: 0 });
  const sync2 = () => setHist({ u: past.current.length, r: future.current.length });
  const setDef = useCallback((f: (x: MotionDef) => MotionDef) => {
    const prev = defRef.current;
    const next = f(prev);
    if (sameJson(next, prev)) return;
    const now = Date.now();
    if (now - lastPush.current > 700) {   // agrupa arrastos e digitação rápidos em um único passo
      past.current = [...past.current.slice(-59), prev];
      future.current = [];
    }
    lastPush.current = now;
    defRef.current = next;
    setDefState(next);
    sync2();
  }, []);
  const undo = useCallback(() => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(defRef.current);
    defRef.current = p;
    lastPush.current = 0;
    setDefState(p);
    sync2();
  }, []);
  const redo = useCallback(() => {
    const n = future.current.pop();
    if (!n) return;
    past.current.push(defRef.current);
    defRef.current = n;
    lastPush.current = 0;
    setDefState(n);
    sync2();
  }, []);

  const [sel, setSelRaw] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("movimento");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = !sameJson(def, baseline);
  const playing = scrub === null;
  const warnings = useMemo(() => limitWarnings(def), [def]);
  const exerciseId = EXERCISES[d.slug] ? d.slug : "squat";
  const safeSel = Math.min(sel, def.keys.length - 1);

  /* ---------- vídeo de referência ---------- */
  const videoRef = useRef<HTMLVideoElement>(null);
  const [vs, setVs] = useState<VideoState>({ time: 0, duration: 0, playing: false });
  const [local, setLocal] = useState<{ url: string; name: string } | null>(null);
  const [sync, setSync] = useState(false);
  const v = def.video;
  const src = local?.url || v?.url || d.video_url || "";
  const marksOk = !!v && v.t1 > v.t0 && v.t2 >= v.t1;
  const pFromTime = useCallback((t: number) => {
    const vv = defRef.current.video;
    if (!vv || vv.t1 <= vv.t0) return 0;
    if (t <= vv.t1) return clamp((t - vv.t0) / (vv.t1 - vv.t0), 0, 1);
    return vv.t2 > vv.t1 ? clamp(1 - (t - vv.t1) / (vv.t2 - vv.t1), 0, 1) : 0;
  }, []);

  useEffect(() => () => { if (local) URL.revokeObjectURL(local.url); }, [local]);
  useEffect(() => {
    // 3D acompanha o vídeo (e o vídeo repete só o trecho marcado)
    if (!sync || !marksOk) return;
    let raf = 0;
    const loop = () => {
      const e = videoRef.current;
      const vv = defRef.current.video;
      if (e && vv) {
        if (!e.paused && e.currentTime > vv.t2 + 0.03) e.currentTime = vv.t0;
        setScrub(pFromTime(e.currentTime));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sync, marksOk, pFromTime]);

  function setSel(i: number) {
    setSelRaw(i);
    const k = defRef.current.keys[i];
    setScrub(k.p);
    const e = videoRef.current;
    const vv = defRef.current.video;
    if (e && vv && vv.t1 > vv.t0 && src) e.currentTime = vv.t0 + k.p * (vv.t1 - vv.t0);   // mostra no vídeo o quadro desta pose
  }
  const setKey = useCallback((i: number, k: Partial<Key>) => setDef((x) => ({ ...x, keys: x.keys.map((kk, j) => (j === i ? { ...kk, ...k } : kk)) })), [setDef]);
  const fail = (code: string) => toast(MORE[code] ?? ERRORS[code] ?? ERRORS.generic, "bad");

  async function save() {
    if (!dirty || busy) return;
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
  async function copyTo(slugs: string[]) {
    let okCount = 0;
    for (const s of slugs) {
      const r = await send("PUT", `/admin/studio/${s}`, { def, note: `Copiado de ${d.slug}` });
      if (r.ok) okCount++;
      else fail(r.code);
    }
    if (okCount) { toast(`Rig copiado para ${okCount} exercício(s).`); reload(); }
  }
  function download(name: string, data: unknown) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- atalhos de teclado ---------- */
  const keys = useRef({ undo, redo, save, setSel, sel: safeSel, n: def.keys.length });
  useEffect(() => { keys.current = { undo, redo, save, setSel, sel: safeSel, n: def.keys.length }; });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && (t as HTMLInputElement).type !== "range";
      const k = keys.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) k.redo(); else k.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); k.redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void k.save(); }
      else if (!typing && e.key === " ") { e.preventDefault(); setScrub((s) => (s === null ? defRef.current.keys[k.sel].p : null)); }
      else if (!typing && e.key === "ArrowRight") k.setSel(Math.min(k.n - 1, k.sel + 1));
      else if (!typing && e.key === "ArrowLeft") k.setSel(Math.max(0, k.sel - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const underlay = src ? (
    <video
      ref={videoRef}
      key={src}
      src={src}
      muted
      playsInline
      preload="auto"
      className="absolute inset-0 h-full w-full object-contain"
      style={{ opacity: v?.opacity ?? 0.6, transform: `translate(${v?.ox ?? 0}px, ${v?.oy ?? 0}px) scale(${v?.scale ?? 1}) scaleX(${v?.flip ? -1 : 1})` }}
      onLoadedMetadata={(e) => {
        const dur = e.currentTarget.duration;
        setVs((s) => ({ ...s, duration: dur }));
        if (!defRef.current.video) setDef((x) => ({ ...x, video: { ...defaultVideo(), t1: r4(dur / 2), t2: r4(dur) } }));
      }}
      onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; setVs((s) => ({ ...s, time: t })); }}
      onPlay={() => setVs((s) => ({ ...s, playing: true }))}
      onPause={() => setVs((s) => ({ ...s, playing: false }))}
      onSeeked={(e) => { const t = e.currentTarget.currentTime; setVs((s) => ({ ...s, time: t })); }}
    />
  ) : undefined;

  const TABS: { value: Tab; label: string; count?: number }[] = [{ value: "movimento", label: "Movimento" }, { value: "video", label: "Vídeo da instrutora" }, { value: "corpo", label: "Corpo e limites" }, { value: "camera", label: "Correção por câmera" }, { value: "versoes", label: "Versões e cópias", count: d.history.length }];

  return (
    <div className="space-y-4">
      {/* barra de ações fixa */}
      <div className="sticky top-[57px] z-10 flex flex-wrap items-center gap-2 rounded-2xl border-[0.5px] border-line bg-bg/90 px-4 py-2.5 backdrop-blur-xl">
        <Badge tone={d.def ? "ok" : "neutral"}>{d.def ? `rig personalizado v${d.version}` : "movimento padrão"}</Badge>
        {dirty && <Badge tone="warn">alterações não salvas</Badge>}
        <div className="flex items-center gap-1">
          <button type="button" onClick={undo} disabled={hist.u === 0} aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)" className="flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-line hover:bg-surface2 disabled:opacity-30"><Undo2 size={14} aria-hidden="true" /></button>
          <button type="button" onClick={redo} disabled={hist.r === 0} aria-label="Refazer (Ctrl+Shift+Z)" title="Refazer (Ctrl+Shift+Z)" className="flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-line hover:bg-surface2 disabled:opacity-30"><Redo2 size={14} aria-hidden="true" /></button>
        </div>
        <span className="flex-1" />
        <input className={`${inputCls} !h-9 max-w-[220px] !text-[13px]`} placeholder="Nota da versão (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label="Nota da versão" />
        <Btn variant="primary" size="md" disabled={!dirty || busy} onClick={save}>Salvar (Ctrl+S)</Btn>
        <Btn size="md" disabled={!dirty} onClick={() => { defRef.current = baseline; setDefState(baseline); past.current = []; future.current = []; setSelRaw(0); sync2(); }}>Descartar</Btn>
        {d.def && <Btn size="md" onClick={useDefault}>Voltar ao padrão</Btn>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        {/* esquerda: pré-visualização 3D */}
        <div className="space-y-3 xl:sticky xl:top-[125px] xl:self-start">
          <div className="relative h-[440px] overflow-hidden rounded-[28px]">
            <AnatomyPanel exerciseId={exerciseId} playing={playing} motionDef={def} scrub={scrub} defaultLayer="skeleton" className="h-full" />
          </div>
          <div className="flex items-center gap-3 rounded-2xl border-[0.5px] border-line bg-surface px-4 py-3">
            <button type="button" onClick={() => setScrub(playing ? def.keys[safeSel].p : null)} aria-label={playing ? "Pausar (Espaço)" : "Reproduzir (Espaço)"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fg text-bg">
              {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
            </button>
            <div className="relative flex-1">
              <input type="range" className="tfs-range" min={0} max={1} step={0.005} value={scrub ?? 0} onChange={(e) => { setSync(false); setScrub(Number(e.target.value)); }} aria-label="Posição na repetição" />
              <div className="pointer-events-none absolute inset-x-[14px] top-[3px] h-[3px]" aria-hidden="true">
                {def.keys.map((k, i) => <span key={i} className={`absolute top-[-3px] h-[9px] w-[9px] -translate-x-1/2 rounded-full ${i === safeSel ? "bg-ember" : "bg-fg/60"}`} style={{ left: `${k.p * 100}%` }} />)}
              </div>
            </div>
            <span className="w-12 text-right font-mono text-[12px] text-muted">{scrub === null ? "auto" : `${Math.round(scrub * 100)}%`}</span>
          </div>
          {warnings.length > 0 ? (
            <ul role="status" className="space-y-1 rounded-2xl border-[0.5px] border-ember/40 bg-ember/5 px-4 py-3 text-[12px] text-ember">{warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>
          ) : <p className="rounded-2xl bg-surface2 px-4 py-3 text-[12px] text-muted">Todas as poses estão dentro dos limites de amplitude.</p>}
          <p className="px-1 text-[11px] text-muted">Atalhos: Espaço reproduz/pausa · ← → troca de pose · Ctrl+Z desfaz · Ctrl+S salva.</p>
        </div>

        {/* direita: editor 2D + painéis agrupados */}
        <div className="space-y-3">
          <Card title={src ? "Editor 2D sobre o vídeo" : "Editor 2D"} sub={src ? "Arraste as bolinhas sobre a instrutora para copiar cada pose." : "Arraste as bolinhas para posicionar o corpo. Para copiar um vídeo, adicione-o na aba “Vídeo da instrutora”."}>
            <SideEditor def={def} idx={safeSel} setKey={setKey} underlay={underlay} />
          </Card>
          <Tabs value={tab} onChange={setTab} items={TABS} />
          {tab === "movimento" && <MovementPanel def={def} setDef={setDef} sel={safeSel} setSel={setSel} setKey={setKey} scrub={scrub} type={d.motion} />}
          {tab === "video" && (
            <VideoPanel
              def={def} setDef={setDef} videoRef={videoRef} state={vs} exerciseVideo={d.video_url} localName={local?.name ?? null}
              onLocalFile={(f) => { setLocal(f ? { url: URL.createObjectURL(f), name: f.name } : null); setVs({ time: 0, duration: 0, playing: false }); }}
              sync={sync} setSync={(b) => { setSync(b); if (!b) setScrub(def.keys[safeSel].p); }}
              onKeys={(keys, lengths) => { setDef((x) => ({ ...x, keys, lengths: lengths ?? x.lengths })); setSelRaw(0); setScrub(0); }}
              onCreateKey={(p) => { const at = defRef.current.keys.findIndex((k) => Math.abs(k.p - p) < 0.01); if (at >= 0) { setSel(at); toast(`Já existe uma pose em ${Math.round(p * 100)}%: ela foi selecionada.`); return; } setDef((x) => { const ks = [...x.keys]; const i = ks.findIndex((k) => k.p > p); const a = ks[i - 1]; const b = ks[i]; const t = (p - a.p) / (b.p - a.p); const L = (m: number, n: number) => r4(m + (n - m) * t); ks.splice(i, 0, { p, hip: { x: L(a.hip.x, b.hip.x), y: L(a.hip.y, b.hip.y) }, lean: L(a.lean, b.lean), headLean: L(a.headLean, b.headLean), hand: { x: L(a.hand.x, b.hand.x), y: L(a.hand.y, b.hand.y) } }); return { ...x, keys: ks }; }); setTimeout(() => setSelRaw(defRef.current.keys.findIndex((k) => Math.abs(k.p - p) < 0.011)), 0); }}
              toast={toast}
            />
          )}
          {tab === "corpo" && <BodyPanel def={def} setDef={setDef} fresh={fresh} />}
          {tab === "camera" && <CameraPanel def={def} setDef={setDef} onExport={() => download(`${d.slug}-referencia.json`, exportReference(d.slug, def))} />}
          {tab === "versoes" && <VersionsPanel slug={d.slug} def={def} setDef={setDef} history={d.history} others={rows} onRestore={restore} onCopy={copyTo} download={download} toast={toast} />}
        </div>
      </div>
    </div>
  );
}
