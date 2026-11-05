"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { dateTimeBr, ERRORS, send, timeBr, useApi } from "@/lib/admin";
import { Badge, Btn, Card, Drawer, Field, inputCls, Modal, PageHead, Spinner, Stat, useAdmin, type Tone } from "@/components/admin/ui";

interface Ap { id: number; user_id: number; teacher_id: number | null; starts_at: string; duration_min: number; status: string; link: string | null; notes: string | null; student: string; student_email: string; teacher: string | null; is_demo: number }

const ST_PT: Record<string, string> = { requested: "pedido", confirmed: "confirmada", done: "realizada", canceled: "cancelada", no_show: "faltou" };
const ST_TONE: Record<string, Tone> = { requested: "warn", confirmed: "info", done: "ok", canceled: "neutral", no_show: "bad" };
const ST_BLOCK: Record<string, string> = {
  requested: "border-bronze bg-bronze/15", confirmed: "border-[#5f6f7e] bg-[#5f6f7e]/15", done: "border-[#6f8a6b] bg-[#6f8a6b]/15", canceled: "border-line bg-surface2 line-through opacity-60", no_show: "border-ember bg-ember/10",
};

// Brasília (UTC-3, sem horário de verão desde 2019)
const BR = -3 * 3600000;
const localDay = (s: string) => new Date(new Date(s.replace(" ", "T") + "Z").getTime() + BR).toISOString().slice(0, 10);
const localHour = (s: string) => { const d = new Date(new Date(s.replace(" ", "T") + "Z").getTime() + BR); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const mondayOf = (d: Date) => { const x = new Date(d.getTime() + BR); const dow = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - dow); return x.toISOString().slice(0, 10); };
const addDays = (iso: string, n: number) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

export default function Consultas() {
  const { q, toast } = useAdmin();
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [open, setOpen] = useState<Ap | null>(null);
  const [creating, setCreating] = useState(false);
  const from = addDays(week, -1);
  const to = addDays(week, 7);
  const { data, loading, reload } = useApi<{ rows: Ap[] }>(q("/admin/appointments", { from, to }));
  const pending = useApi<{ rows: Ap[] }>(q("/admin/appointments", { status: "requested", from: addDays(week, -60), to: addDays(week, 90) }));
  const teachers = useApi<{ rows: { id: number; name: string }[] }>("/admin/teachers");

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const hours = Array.from({ length: 12 }, (_, i) => 8 + i);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const byDay = useMemo(() => {
    const m = new Map<string, Ap[]>();
    for (const a of rows) {
      const d = localDay(a.starts_at);
      m.set(d, [...(m.get(d) ?? []), a]);
    }
    return m;
  }, [rows]);
  const count = (s: string) => rows.filter((a) => a.status === s && days.includes(localDay(a.starts_at))).length;
  const fmtDay = (iso: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
  const [today] = useState(() => new Date(Date.now() + BR).toISOString().slice(0, 10));

  async function patch(id: number, body: Record<string, unknown>, ok: string) {
    const r = await send("PATCH", `/admin/appointments/${id}`, body);
    if (r.ok) {
      toast(ok);
      reload();
      pending.reload();
      setOpen(null);
    } else toast(ERRORS[r.code] ?? ERRORS.generic, "bad");
  }

  return (
    <div>
      <PageHead eyebrow="Atendimento" title="Consultas online">
        {loading && <Spinner />}
        <div className="flex items-center gap-1">
          <Btn onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={14} aria-label="Semana anterior" /></Btn>
          <Btn onClick={() => setWeek(mondayOf(new Date()))}>Hoje</Btn>
          <Btn onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={14} aria-label="Próxima semana" /></Btn>
        </div>
        <Btn variant="primary" size="md" onClick={() => setCreating(true)}><Plus size={14} aria-hidden="true" />Agendar consulta</Btn>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Aguardando confirmação" value={pending.data?.rows.length ?? 0} sub="todas as semanas" />
        <Stat label="Confirmadas na semana" value={count("confirmed")} />
        <Stat label="Realizadas na semana" value={count("done")} />
        <Stat label="Faltas / canceladas" value={count("no_show") + count("canceled")} invert />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8" title={`Semana de ${fmtDay(days[0])} a ${fmtDay(days[6])}`} sub="Horário de Brasília · clique em uma consulta" pad={false}>
          <div className="overflow-x-auto p-3">
            <div className="grid min-w-[640px] gap-px rounded-xl bg-line" style={{ gridTemplateColumns: "44px repeat(7, minmax(0, 1fr))" }}>
              <div className="bg-bg" />
              {days.map((d) => <div key={d} className={`bg-bg py-2 text-center text-[11px] ${d === today ? "font-medium text-bronze" : "text-muted"}`}>{fmtDay(d)}</div>)}
              {hours.map((h) => (
                <div key={h} className="contents">
                  <div className="bg-bg pr-2 pt-1 text-right text-[10px] text-muted">{h}h</div>
                  {days.map((d) => {
                    const here = (byDay.get(d) ?? []).filter((a) => Math.floor(localHour(a.starts_at)) === h);
                    return (
                      <div key={d + h} className="min-h-[44px] bg-bg p-0.5">
                        {here.map((a) => (
                          <button key={a.id} type="button" onClick={() => setOpen(a)} className={`mb-0.5 block w-full truncate rounded-md border-l-2 px-1.5 py-1 text-left text-[10px] leading-tight ${ST_BLOCK[a.status]}`} title={`${a.student} · ${ST_PT[a.status]}`}>
                            {timeBr(a.starts_at)} {a.student.split(" ")[0]}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-4" title="Pedidos aguardando confirmação" sub="Atribua um professor e confirme" pad={false}>
          <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
            {(pending.data?.rows ?? []).length === 0 && <li className="px-5 py-10 text-center text-[13px] text-muted">Nenhum pedido pendente.</li>}
            {(pending.data?.rows ?? []).map((a) => (
              <li key={a.id} className="px-5 py-3">
                <button type="button" onClick={() => setOpen(a)} className="block w-full text-left">
                  <span className="flex items-center justify-between gap-2"><span className="truncate">{a.student}</span>{a.is_demo ? <Badge>demo</Badge> : null}</span>
                  <span className="text-[11px] text-muted">{dateTimeBr(a.starts_at)} · {a.teacher ?? "sem professor"}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Drawer open={open !== null} onClose={() => setOpen(null)} title="Consulta" width={460}>
        {open && <Editor key={open.id} ap={open} teachers={teachers.data?.rows ?? []} onPatch={patch} />}
      </Drawer>
      <Modal open={creating} onClose={() => setCreating(false)} title="Agendar consulta">
        {creating && <Create teachers={teachers.data?.rows ?? []} onDone={() => { setCreating(false); reload(); pending.reload(); }} />}
      </Modal>
    </div>
  );
}

function Editor({ ap, teachers, onPatch }: { ap: Ap; teachers: { id: number; name: string }[]; onPatch: (id: number, b: Record<string, unknown>, ok: string) => void }) {
  const [teacher, setTeacher] = useState(ap.teacher_id ? String(ap.teacher_id) : "");
  const [link, setLink] = useState(ap.link ?? "");
  const [notes, setNotes] = useState(ap.notes ?? "");
  return (
    <div className="space-y-4 p-5">
      <div>
        <h2 className="font-display text-3xl leading-tight">{ap.student}</h2>
        <p className="mt-1 text-[12px] text-muted">{ap.student_email} · {dateTimeBr(ap.starts_at)} · {ap.duration_min} min</p>
        <div className="mt-2"><Badge tone={ST_TONE[ap.status]}>{ST_PT[ap.status]}</Badge></div>
      </div>
      <Field label="Professor responsável">
        <select className={inputCls} value={teacher} onChange={(e) => setTeacher(e.target.value)}><option value="">Sem professor</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </Field>
      <Field label="Link da videochamada (https)"><input className={inputCls} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></Field>
      <Field label="Observações"><textarea className={`${inputCls} !h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" onClick={() => onPatch(ap.id, { teacher_id: teacher ? Number(teacher) : null, link, notes, ...(ap.status === "requested" ? { status: "confirmed" } : {}) }, ap.status === "requested" ? "Consulta confirmada." : "Consulta atualizada.")}>{ap.status === "requested" ? "Confirmar" : "Salvar"}</Btn>
        {ap.status === "confirmed" && <Btn onClick={() => onPatch(ap.id, { status: "done" }, "Marcada como realizada.")}>Realizada</Btn>}
        {ap.status === "confirmed" && <Btn onClick={() => onPatch(ap.id, { status: "no_show" }, "Falta registrada.")}>Faltou</Btn>}
        {ap.status !== "canceled" && <Btn variant="danger" onClick={() => onPatch(ap.id, { status: "canceled" }, "Consulta cancelada.")}>Cancelar</Btn>}
      </div>
    </div>
  );
}

function Create({ teachers, onDone }: { teachers: { id: number; name: string }[]; onDone: () => void }) {
  const { toast } = useAdmin();
  const [term, setTerm] = useState("");
  const found = useApi<{ rows: { id: number; name: string; email: string }[] }>(term.trim().length >= 2 ? `/admin/students?q=${encodeURIComponent(term.trim())}&size=6` : null);
  const [sid, setSid] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [teacher, setTeacher] = useState("");
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    if (!sid || !date) return setErr("Escolha o aluno e a data.");
    const startsUtc = new Date(`${date}T${time}:00-03:00`).toISOString().slice(0, 19).replace("T", " ");
    const r = await send("POST", "/admin/appointments", { user_id: sid, teacher_id: teacher ? Number(teacher) : null, starts_at: startsUtc, status: "confirmed" });
    if (r.ok) {
      toast("Consulta agendada.");
      onDone();
    } else setErr(ERRORS[r.code] ?? ERRORS.generic);
  }
  return (
    <div className="space-y-3">
      <Field label="Aluno"><input className={inputCls} value={term} onChange={(e) => { setTerm(e.target.value); setSid(null); }} placeholder="Digite o nome ou e-mail" /></Field>
      {term.trim().length >= 2 && !sid && (
        <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-xl border-[0.5px] border-line text-[12px]">
          {(found.data?.rows ?? []).map((s) => <li key={s.id}><button type="button" onClick={() => { setSid(s.id); setTerm(s.name); }} className="block w-full px-3 py-2 text-left hover:bg-surface2">{s.name}<span className="ml-2 text-muted">{s.email}</span></button></li>)}
          {found.data && found.data.rows.length === 0 && <li className="px-3 py-2 text-muted">Nenhum aluno encontrado.</li>}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data"><input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Horário (Brasília)"><input className={inputCls} type="time" step={1200} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      <Field label="Professor"><select className={inputCls} value={teacher} onChange={(e) => setTeacher(e.target.value)}><option value="">Definir depois</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
      <Btn variant="primary" size="md" onClick={save}>Agendar</Btn>
    </div>
  );
}
