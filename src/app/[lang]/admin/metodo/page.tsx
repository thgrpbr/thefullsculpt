"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ERRORS, FOCUS_PT, INTENSITY_PT, LEVEL_PT, MOTION_PT, MUSCLE_PT, send, useApi } from "@/lib/admin";
import { Badge, Btn, Card, DataTable, Drawer, Field, inputCls, Modal, PageHead, Spinner, Tabs, useAdmin, type Col } from "@/components/admin/ui";

interface Ex { id: number; slug: string; motion: string; depth: number; primary_m: string; secondary_m: string; stabilizers_m: string; video_url: string | null; i18n: string; active: number; used: number }
interface Lesson { id: number; phase: number; n: number; focus: string; work_sec: number; rest_sec: number; rounds: number; active: number; exercises: { id: number; slug: string }[] }
interface Method { lessons: Lesson[]; usage: Record<string, { n: number; rpe: number; sec: number }>; exerciseCount: number }
type I18n = Record<"pt" | "en" | "es", { name: string; bio: string; cues: string[] }>;

const parse = (e: Ex): I18n => {
  try {
    const j = JSON.parse(e.i18n);
    return { pt: { name: "", bio: "", cues: [], ...j.pt }, en: { name: "", bio: "", cues: [], ...j.en }, es: { name: "", bio: "", cues: [], ...j.es } };
  } catch {
    return { pt: { name: e.slug, bio: "", cues: [] }, en: { name: "", bio: "", cues: [] }, es: { name: "", bio: "", cues: [] } };
  }
};
const split = (s: string) => s.split(",").filter(Boolean);

export default function MethodPage() {
  const { toast } = useAdmin();
  const { href } = useI18n();
  const method = useApi<Method>("/admin/method");
  const exs = useApi<{ rows: Ex[] }>("/admin/exercises");
  const [tab, setTab] = useState<"grade" | "exercicios">("grade");
  const [phase, setPhase] = useState(1);
  const [lessonOpen, setLessonOpen] = useState<Lesson | null>(null);
  const [exOpen, setExOpen] = useState<Ex | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const exById = useMemo(() => new Map((exs.data?.rows ?? []).map((e) => [e.id, e])), [exs.data]);
  const name = (id: number) => (exById.get(id) ? parse(exById.get(id)!).pt.name || exById.get(id)!.slug : "?");

  if (!method.data || !exs.data) return <div className="flex justify-center py-32"><Spinner /></div>;
  const lessons = method.data.lessons;
  const reload = () => { method.reload(); exs.reload(); };

  async function importDefault() {
    setBusy(true);
    const r = await send<{ exercises: number; lessons: number }>("POST", "/admin/method/import-default");
    setBusy(false);
    if (r.ok) {
      toast(r.data.lessons || r.data.exercises ? `Importado: ${r.data.exercises} exercícios e ${r.data.lessons} aulas.` : "O método padrão já estava importado.");
      reload();
    } else toast(ERRORS.generic, "bad");
  }

  const phaseStats = (p: number) => {
    const ls = lessons.filter((l) => l.phase === p);
    const done = ls.reduce((a, l) => a + (method.data!.usage[`f${p}-${l.n}`]?.n ?? 0), 0);
    return { count: ls.length, done };
  };
  const phaseLessons = lessons.filter((l) => l.phase === phase);

  const exCols: Col<Ex>[] = [
    { key: "n", head: "Exercício", cell: (e) => <div><p>{parse(e).pt.name}</p><p className="font-mono text-[10px] text-muted">{e.slug}</p></div> },
    { key: "m", head: "Movimento 3D", cell: (e) => <div className="flex flex-col gap-1"><span className="text-muted">{MOTION_PT[e.motion]} · {Math.round(e.depth * 100)}%</span><Link href={href(`/admin/estudio?ex=${e.slug}`)} onClick={(ev) => ev.stopPropagation()} className="text-[11px] text-bronze underline underline-offset-4">Abrir no Estúdio 3D →</Link></div> },
    { key: "p", head: "Músculos principais", cell: (e) => <div className="flex flex-wrap gap-1">{split(e.primary_m).map((m) => <Badge key={m} tone="warn">{MUSCLE_PT[m]}</Badge>)}</div> },
    { key: "v", head: "Vídeo", cell: (e) => e.video_url ? <Badge tone="ok">cadastrado</Badge> : <Badge>pendente</Badge> },
    { key: "u", head: "Em aulas", align: "right", cell: (e) => e.used },
    { key: "a", head: "Situação", cell: (e) => <Badge tone={e.active ? "ok" : "neutral"}>{e.active ? "ativo" : "inativo"}</Badge> },
  ];

  return (
    <div>
      <PageHead eyebrow="Conteúdo" title="Método e exercícios">
        <Link href={href("/admin/estudio")} className="inline-flex h-10 items-center rounded-full border-[0.5px] border-line px-5 text-[13px] hover:bg-surface2">Estúdio 3D (rigs)</Link>
        <Btn onClick={importDefault} disabled={busy}>{busy ? "Importando…" : "Importar método padrão"}</Btn>
        <Btn variant="primary" size="md" onClick={() => setExOpen("new")}><Plus size={14} aria-hidden="true" />Novo exercício</Btn>
      </PageHead>

      {lessons.length === 0 && (
        <Card className="mb-4">
          <h2 className="font-display text-3xl">O método ainda não está no banco</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">Importe a grade padrão (9 fases × 6 aulas, 5 exercícios em 3 idiomas). Depois você pode editar tempos, trocar exercícios, criar novos e acrescentar os vídeos.</p>
          <div className="mt-4"><Btn variant="primary" size="md" onClick={importDefault} disabled={busy}>Importar método padrão</Btn></div>
        </Card>
      )}

      <Tabs value={tab} onChange={setTab} items={[{ value: "grade", label: "Grade de aulas", count: lessons.length }, { value: "exercicios", label: "Exercícios", count: exs.data.rows.length }]} />

      {tab === "grade" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Fases do método" sub="Selecione para ver as aulas">
            <div className="grid grid-cols-[84px_repeat(3,1fr)] gap-1.5 text-[11px]">
              <span />
              {INTENSITY_PT.map((i) => <span key={i} className="eyebrow text-center !text-[9px]">{i}</span>)}
              {LEVEL_PT.map((lv, li) => (
                <div key={lv} className="contents">
                  <span className="self-center text-muted">{lv}</span>
                  {[0, 1, 2].map((ii) => {
                    const p = li * 3 + ii + 1;
                    const s = phaseStats(p);
                    return (
                      <button key={p} type="button" aria-pressed={phase === p} onClick={() => setPhase(p)} className={`rounded-xl border-[0.5px] p-2.5 text-left transition-colors ${phase === p ? "border-fg bg-surface2" : "border-line hover:bg-surface2/60"}`}>
                        <span className="font-display text-2xl leading-none">{p}</span>
                        <span className="mt-1 block text-[10px] text-muted">{s.count} aulas · {s.done} concl.</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>
          <Card className="lg:col-span-7" title={`Fase ${phase} · ${LEVEL_PT[Math.floor((phase - 1) / 3)]} ${INTENSITY_PT[(phase - 1) % 3].toLowerCase()}`} sub="Clique em uma aula para editar tempos e exercícios" pad={false}>
            <ul className="divide-y divide-line">
              {phaseLessons.length === 0 && <li className="px-5 py-10 text-center text-[13px] text-muted">Sem aulas nesta fase.</li>}
              {phaseLessons.map((l) => {
                const u = method.data!.usage[`f${l.phase}-${l.n}`];
                return (
                  <li key={l.id}>
                    <button type="button" onClick={() => setLessonOpen(l)} className="flex w-full items-start gap-4 px-5 py-3 text-left hover:bg-surface2/60">
                      <span className="font-display w-6 pt-0.5 text-2xl leading-none text-muted">{l.n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">{FOCUS_PT[l.focus] ?? l.focus}{!l.active && <Badge>oculta</Badge>}</span>
                        <span className="mt-1.5 flex flex-wrap gap-1">{l.exercises.map((e, i) => <span key={i} className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-muted">{name(e.id)}</span>)}</span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] text-muted">{l.work_sec}s / {l.rest_sec}s × {l.rounds}<span className="block">{u ? `${u.n} concl. · RPE ${u.rpe}` : "sem conclusões"}</span></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      {tab === "exercicios" && (
        <Card className="mt-4" pad={false}>
          <DataTable cols={exCols} rows={exs.data.rows} onRow={(e) => setExOpen(e)} empty="Nenhum exercício. Importe o método padrão ou crie um novo." />
        </Card>
      )}

      <Drawer open={lessonOpen !== null} onClose={() => setLessonOpen(null)} title={lessonOpen ? `Aula ${lessonOpen.n} · Fase ${lessonOpen.phase}` : ""} width={520}>
        {lessonOpen && <LessonEditor key={lessonOpen.id} lesson={lessonOpen} exercises={exs.data.rows} name={name} onSaved={() => { setLessonOpen(null); reload(); }} />}
      </Drawer>
      <Modal open={exOpen !== null} onClose={() => setExOpen(null)} title={exOpen === "new" ? "Novo exercício" : "Editar exercício"} width={760}>
        {exOpen !== null && <ExerciseEditor key={exOpen === "new" ? "new" : exOpen.id} ex={exOpen === "new" ? null : exOpen} onSaved={() => { setExOpen(null); reload(); }} />}
      </Modal>
    </div>
  );
}

function LessonEditor({ lesson, exercises, name, onSaved }: { lesson: Lesson; exercises: Ex[]; name: (id: number) => string; onSaved: () => void }) {
  const { toast } = useAdmin();
  const [work, setWork] = useState(lesson.work_sec);
  const [rest, setRest] = useState(lesson.rest_sec);
  const [rounds, setRounds] = useState(lesson.rounds);
  const [active, setActive] = useState(!!lesson.active);
  const [ids, setIds] = useState(lesson.exercises.map((e) => e.id));
  const [add, setAdd] = useState("");
  const move = (i: number, d: number) => setIds((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const total = (ids.length * work + (ids.length * rounds - 1) * rest + 0) ;
  const minutes = Math.round(((ids.length * rounds) * work + (ids.length * rounds - 1) * rest) / 60);

  async function save() {
    const r = await send("PUT", `/admin/lessons/${lesson.id}`, { work_sec: work, rest_sec: rest, rounds, active, exercises: ids });
    if (r.ok) {
      toast("Aula atualizada.");
      onSaved();
    } else toast(ERRORS[r.code] ?? ERRORS.generic, "bad");
  }
  void total;

  return (
    <div className="space-y-5 p-5">
      <p className="text-[12px] text-muted">{FOCUS_PT[lesson.focus]} · duração estimada <b className="font-medium text-fg">{minutes} min</b></p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Execução (s)"><input className={inputCls} type="number" min={10} max={180} value={work} onChange={(e) => setWork(Number(e.target.value))} /></Field>
        <Field label="Pausa (s)"><input className={inputCls} type="number" min={5} max={180} value={rest} onChange={(e) => setRest(Number(e.target.value))} /></Field>
        <Field label="Rodadas"><input className={inputCls} type="number" min={1} max={6} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} /></Field>
      </div>
      <section>
        <h3 className="eyebrow mb-2">Exercícios (em ordem)</h3>
        <ol className="space-y-1.5">
          {ids.map((id, i) => (
            <li key={`${id}-${i}`} className="flex items-center gap-2 rounded-xl bg-surface2 px-3 py-2 text-[12px]">
              <span className="w-4 text-muted">{i + 1}</span><span className="flex-1">{name(id)}</span>
              <button type="button" aria-label="Subir" onClick={() => move(i, -1)} className="p-1 text-muted hover:text-fg"><ArrowUp size={13} /></button>
              <button type="button" aria-label="Descer" onClick={() => move(i, 1)} className="p-1 text-muted hover:text-fg"><ArrowDown size={13} /></button>
              <button type="button" aria-label="Remover" onClick={() => setIds((l) => l.filter((_, j) => j !== i))} className="p-1 text-ember"><X size={13} /></button>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex gap-2">
          <select className={inputCls} value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Adicionar exercício">
            <option value="">Adicionar exercício…</option>
            {exercises.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{name(e.id)}</option>)}
          </select>
          <Btn disabled={!add || ids.length >= 12} onClick={() => { setIds((l) => [...l, Number(add)]); setAdd(""); }}>Adicionar</Btn>
        </div>
      </section>
      <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#161514]" />Aula visível para os alunos</label>
      <Btn variant="primary" size="md" onClick={save}>Salvar aula</Btn>
    </div>
  );
}

const ROLES = ["", "primary", "secondary", "stabilizer"] as const;
const ROLE_PT = { "": "–", primary: "principal", secondary: "auxiliar", stabilizer: "estabilizador" } as const;
const ROLE_TONE = { "": "border-line text-muted", primary: "border-ember bg-ember/10 text-ember", secondary: "border-bronze bg-bronze/10 text-bronze", stabilizer: "border-muted bg-surface2 text-fg" } as const;

function ExerciseEditor({ ex, onSaved }: { ex: Ex | null; onSaved: () => void }) {
  const { toast } = useAdmin();
  const initial = ex ? parse(ex) : { pt: { name: "", bio: "", cues: ["", "", "", ""] }, en: { name: "", bio: "", cues: ["", "", "", ""] }, es: { name: "", bio: "", cues: ["", "", "", ""] } };
  const [i18n, setI18n] = useState<I18n>(initial);
  const [lang, setLang] = useState<"pt" | "en" | "es">("pt");
  const [slug, setSlug] = useState(ex?.slug ?? "");
  const [motion, setMotion] = useState(ex?.motion ?? "squat");
  const [depth, setDepth] = useState(ex?.depth ?? 1);
  const [video, setVideo] = useState(ex?.video_url ?? "");
  const [active, setActive] = useState(ex ? !!ex.active : true);
  const [roles, setRoles] = useState<Record<string, (typeof ROLES)[number]>>(() => {
    const r: Record<string, (typeof ROLES)[number]> = {};
    if (ex) {
      split(ex.primary_m).forEach((m) => (r[m] = "primary"));
      split(ex.secondary_m).forEach((m) => (r[m] = "secondary"));
      split(ex.stabilizers_m).forEach((m) => (r[m] = "stabilizer"));
    }
    return r;
  });
  const [err, setErr] = useState("");

  const setField = (k: "name" | "bio", v: string) => setI18n((s) => ({ ...s, [lang]: { ...s[lang], [k]: v } }));
  const setCue = (i: number, v: string) => setI18n((s) => { const cues = [...s[lang].cues]; while (cues.length <= i) cues.push(""); cues[i] = v; return { ...s, [lang]: { ...s[lang], cues } }; });
  const cycle = (m: string) => setRoles((r) => ({ ...r, [m]: ROLES[(ROLES.indexOf(r[m] ?? "") + 1) % ROLES.length] }));
  const pick = (role: string) => Object.entries(roles).filter(([, v]) => v === role).map(([k]) => k);

  async function save() {
    setErr("");
    const body = { slug, motion, depth, video_url: video, active, primary: pick("primary"), secondary: pick("secondary"), stabilizers: pick("stabilizer"), i18n };
    const r = ex ? await send("PUT", `/admin/exercises/${ex.id}`, body) : await send("POST", "/admin/exercises", body);
    if (r.ok) {
      toast(ex ? "Exercício atualizado." : "Exercício criado.");
      onSaved();
    } else setErr(ERRORS[r.code] ?? ERRORS.generic);
  }
  async function remove() {
    if (!ex) return;
    const r = await send("DELETE", `/admin/exercises/${ex.id}`);
    if (r.ok) {
      toast("Exercício excluído.");
      onSaved();
    } else setErr(ERRORS[r.code] ?? ERRORS.generic);
  }

  const cur = i18n[lang];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Identificador" hint="letras e números, sem espaço"><input className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!ex && ex.used > 0} /></Field>
        <Field label="Movimento no 3D">
          <select className={inputCls} value={motion} onChange={(e) => setMotion(e.target.value)}>{Object.entries(MOTION_PT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label={`Amplitude: ${Math.round(depth * 100)}%`}><input type="range" min={0.2} max={1} step={0.05} value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="h-10 w-full accent-[#a97c50]" /></Field>
      </div>

      <section>
        <h3 className="eyebrow mb-2">Músculos (toque para alternar: principal → auxiliar → estabilizador)</h3>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(MUSCLE_PT).map(([m, label]) => {
            const r = roles[m] ?? "";
            return <button key={m} type="button" onClick={() => cycle(m)} className={`rounded-full border-[0.5px] px-3 py-1.5 text-[11px] ${ROLE_TONE[r]}`}>{label}{r && <span className="ml-1 opacity-70">· {ROLE_PT[r]}</span>}</button>;
          })}
        </div>
      </section>

      <section>
        <Tabs value={lang} onChange={setLang} items={[{ value: "pt", label: "Português" }, { value: "en", label: "English" }, { value: "es", label: "Español" }]} />
        <div className="mt-3 space-y-3">
          <Field label="Nome"><input className={inputCls} value={cur.name} onChange={(e) => setField("name", e.target.value)} /></Field>
          <Field label="Biomecânica (texto exibido ao lado do 3D)"><textarea className={`${inputCls} !h-24 py-2`} value={cur.bio} onChange={(e) => setField("bio", e.target.value)} /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <Field key={i} label={`Legenda ${i + 1}`}><input className={inputCls} value={cur.cues[i] ?? ""} onChange={(e) => setCue(i, e.target.value)} /></Field>)}
          </div>
        </div>
      </section>

      <Field label="URL do vídeo (https) — aparece no player da aula" hint="Enquanto vazio, o aluno vê o espaço reservado “Videoaula em breve”."><input className={inputCls} value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://" /></Field>
      <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#161514]" />Exercício ativo (disponível para montar aulas)</label>
      {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Btn variant="primary" size="md" onClick={save}>{ex ? "Salvar alterações" : "Criar exercício"}</Btn>
        {ex && <Btn variant="danger" onClick={remove}>Excluir</Btn>}
      </div>
    </div>
  );
}
