"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { ago, ERRORS, dateBr, dateTimeBr, brl, phaseName, send, useApi } from "@/lib/admin";
import { Badge, Btn, Card, DataTable, Drawer, inputCls, KV, PageHead, Pager, Spinner, Tabs, Toolbar, useAdmin, type Col } from "@/components/admin/ui";

interface Row {
  id: number; name: string; email: string; status: string; created_at: string; last_login_at: string | null; teacher_id: number | null; is_demo: number;
  phase: number; xp: number; streak: number; sub_status: string; last_day: string | null; teacher_name: string | null; lessons: number;
}
interface Page { total: number; page: number; size: number; rows: Row[] }
interface Detail {
  user: { id: number; name: string; email: string; status: string; created_at: string; last_login_at: string | null; locale: string; source: string | null; is_demo: number };
  stats: { phase: number; xp: number; streak: number; best_streak: number; sub_status: string; last_day: string | null };
  teacher: { id: number; name: string } | null;
  subscriptions: { id: number; status: string; price_cents: number; started_at: string; canceled_at: string | null }[];
  payments: { id: number; amount_cents: number; status: string; method: string; paid_at: string | null }[];
  logs: { lesson_id: string; day: string; sec: number; rpe: number; xp: number }[];
  appointments: { id: number; starts_at: string; status: string }[];
  notes: { id: number; note: string; created_at: string; author: string | null }[];
  consents: { type: string; granted: number; version: string; created_at: string }[];
  hasAnamnese: boolean;
}

const CONSENT_PT: Record<string, string> = { terms: "Termos e privacidade", health: "Dados de saúde", marketing: "Marketing" };

export default function Page() {
  return (
    <Suspense fallback={<div className="flex justify-center py-32"><Spinner /></div>}>
      <Students />
    </Suspense>
  );
}

function Students() {
  const sp = useSearchParams();
  const { q, toast } = useAdmin();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [sub, setSub] = useState("");
  const [phase, setPhase] = useState("");
  const [risk, setRisk] = useState(sp.get("risk") === "1");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "created", dir: "desc" });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(sp.get("open") ? Number(sp.get("open")) : null);

  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, loading, reload } = useApi<Page>(q("/admin/students", { q: term, status, sub, phase, risk: risk ? 1 : undefined, sort: sort.key, dir: sort.dir, page, size: 15 }));
  const onSort = (key: string) => {
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
    setPage(1);
  };

  const cols: Col<Row>[] = [
    { key: "name", head: "Aluno", sort: "name", cell: (r) => (
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate">{r.name}{r.is_demo ? <Badge>demo</Badge> : null}{r.status === "suspended" && <Badge tone="bad">suspenso</Badge>}</p>
        <p className="truncate text-[11px] text-muted">{r.email}</p>
      </div>
    ) },
    { key: "phase", head: "Fase", sort: "phase", cell: (r) => <span title={phaseName(r.phase ?? 1)}>{r.phase ?? 1}<span className="text-muted">/9</span></span> },
    { key: "sub", head: "Plano", cell: (r) => <Badge tone={r.sub_status === "active" ? "ok" : "neutral"}>{r.sub_status === "active" ? "assinante" : "grátis"}</Badge> },
    { key: "teacher", head: "Professor", cell: (r) => <span className="text-muted">{r.teacher_name ?? "–"}</span> },
    { key: "lessons", head: "Aulas", align: "right", sort: "lessons", cell: (r) => r.lessons },
    { key: "xp", head: "XP", align: "right", sort: "xp", cell: (r) => r.xp ?? 0 },
    { key: "streak", head: "Streak", align: "right", sort: "streak", cell: (r) => r.streak ?? 0 },
    { key: "act", head: "Atividade", sort: "activity", cell: (r) => {
      const d = r.last_day ? Math.floor((Date.now() - new Date(r.last_day + "T00:00:00Z").getTime()) / 86400000) : null;
      return <span className={d !== null && d >= 7 && r.sub_status === "active" ? "text-ember" : "text-muted"}>{d === null ? "nunca" : d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`}</span>;
    } },
    { key: "created", head: "Cadastro", sort: "created", cell: (r) => <span className="text-muted">{dateBr(r.created_at)}</span> },
  ];

  return (
    <div>
      <PageHead eyebrow="Gestão" title="Alunos">
        <a href="/api/admin/export/students.csv" className="inline-flex h-8 items-center gap-1.5 rounded-full border-[0.5px] border-line px-3.5 text-[12px] hover:bg-surface2"><Download size={13} aria-hidden="true" />Exportar CSV</a>
      </PageHead>
      <Card pad={false}>
        <Toolbar>
          <input className={`${inputCls} !h-9 max-w-[260px]`} placeholder="Buscar por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar" />
          <select className={`${inputCls} !h-9 !w-auto`} value={sub} onChange={(e) => { setSub(e.target.value); setPage(1); }} aria-label="Plano"><option value="">Todos os planos</option><option value="active">Assinantes</option><option value="free">Grátis</option></select>
          <select className={`${inputCls} !h-9 !w-auto`} value={phase} onChange={(e) => { setPhase(e.target.value); setPage(1); }} aria-label="Fase"><option value="">Todas as fases</option>{Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>Fase {i + 1}</option>)}</select>
          <select className={`${inputCls} !h-9 !w-auto`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Situação"><option value="">Qualquer situação</option><option value="active">Ativos</option><option value="suspended">Suspensos</option></select>
          <label className="flex items-center gap-2 text-[12px] text-muted"><input type="checkbox" checked={risk} onChange={(e) => { setRisk(e.target.checked); setPage(1); }} className="h-4 w-4 accent-[#161514]" />Em risco (7+ dias parado)</label>
          {loading && <Spinner />}
        </Toolbar>
        <DataTable cols={cols} rows={data?.rows ?? []} onRow={(r) => setOpen(r.id)} sort={sort} onSort={onSort} loading={loading && !data} empty="Nenhum aluno encontrado com esses filtros." />
        <Pager page={page} size={15} total={data?.total ?? 0} onPage={setPage} />
      </Card>
      <Drawer open={open !== null} onClose={() => setOpen(null)} title="Ficha do aluno" width={620}>
        {open !== null && <StudentDetail id={open} onChanged={reload} toast={toast} onDeleted={() => { setOpen(null); reload(); }} />}
      </Drawer>
    </div>
  );
}

function StudentDetail({ id, onChanged, toast, onDeleted }: { id: number; onChanged: () => void; toast: (m: string, t?: "ok" | "bad") => void; onDeleted: () => void }) {
  const { data, reload } = useApi<Detail>(`/admin/students/${id}`);
  const teachers = useApi<{ rows: { id: number; name: string }[] }>("/admin/teachers");
  const [tab, setTab] = useState<"resumo" | "aulas" | "pagamentos" | "consultas" | "lgpd">("resumo");
  const [note, setNote] = useState("");
  const [anam, setAnam] = useState<unknown>(undefined);
  const [confirm, setConfirm] = useState("");

  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>;
  const { user, stats } = data;

  async function patch(body: Record<string, unknown>, ok: string) {
    const r = await send("PATCH", `/admin/students/${id}`, body);
    if (r.ok) {
      toast(ok);
      reload();
      onChanged();
    } else toast(ERRORS[r.code] ?? ERRORS.generic, "bad");
  }

  return (
    <div>
      <div className="px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-3xl leading-tight">{user.name}</h2>
          {user.is_demo ? <Badge>demo</Badge> : null}
          <Badge tone={user.status === "active" ? "ok" : "bad"}>{user.status === "active" ? "ativo" : "suspenso"}</Badge>
          <Badge tone={stats.sub_status === "active" ? "ok" : "neutral"}>{stats.sub_status === "active" ? "assinante" : "grátis"}</Badge>
        </div>
        <p className="mt-1 text-[12px] text-muted">{user.email} · cadastro {dateBr(user.created_at)} · último acesso {ago(user.last_login_at)}</p>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[{ l: "Fase", v: `${stats.phase}/9` }, { l: "XP", v: stats.xp }, { l: "Streak", v: stats.streak }, { l: "Recorde", v: stats.best_streak }].map((x) => (
            <div key={x.l} className="rounded-xl bg-surface2 py-2.5"><p className="font-display text-2xl leading-none">{x.v}</p><p className="eyebrow mt-1 !text-[9px]">{x.l}</p></div>
          ))}
        </div>
      </div>
      <div className="px-5"><Tabs value={tab} onChange={setTab} items={[{ value: "resumo", label: "Resumo" }, { value: "aulas", label: "Aulas", count: data.logs.length }, { value: "pagamentos", label: "Pagamentos", count: data.payments.length }, { value: "consultas", label: "Consultas", count: data.appointments.length }, { value: "lgpd", label: "Saúde e LGPD" }]} /></div>

      <div className="p-5">
        {tab === "resumo" && (
          <div className="space-y-6">
            <section>
              <h3 className="eyebrow mb-2">Ações</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[11px] text-muted">Professor responsável
                  <select className={`${inputCls} mt-1`} value={data.teacher?.id ?? ""} onChange={(e) => patch({ teacher_id: e.target.value ? Number(e.target.value) : null }, "Professor atualizado.")}>
                    <option value="">Sem professor</option>
                    {teachers.data?.rows.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-muted">Fase no método
                  <select className={`${inputCls} mt-1`} value={stats.phase} onChange={(e) => patch({ phase: Number(e.target.value) }, "Fase atualizada.")}>
                    {Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{phaseName(i + 1)}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {user.status === "active" ? <Btn variant="danger" onClick={() => patch({ status: "suspended" }, "Aluno suspenso.")}>Suspender acesso</Btn> : <Btn variant="primary" onClick={() => patch({ status: "active" }, "Acesso reativado.")}>Reativar acesso</Btn>}
                {stats.sub_status === "active" ? <Btn onClick={() => patch({ sub: "free" }, "Assinatura encerrada.")}>Encerrar assinatura</Btn> : <Btn onClick={() => patch({ sub: "active" }, "Assinatura concedida.")}>Conceder assinatura (cortesia)</Btn>}
              </div>
            </section>
            <section>
              <h3 className="eyebrow mb-2">Notas internas</h3>
              <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; const r = await send("POST", `/admin/students/${id}/note`, { note }); if (r.ok) { setNote(""); reload(); } else toast(ERRORS.generic, "bad"); }}>
                <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: pediu ajuste por dor no joelho" aria-label="Nova nota" />
                <Btn type="submit" variant="primary">Salvar</Btn>
              </form>
              <ul className="mt-3 space-y-2">
                {data.notes.length === 0 && <li className="text-[12px] text-muted">Nenhuma nota ainda.</li>}
                {data.notes.map((n) => <li key={n.id} className="rounded-xl bg-surface2 px-3 py-2 text-[12px]">{n.note}<span className="mt-1 block text-[10px] text-muted">{n.author ?? "sistema"} · {dateTimeBr(n.created_at)}</span></li>)}
              </ul>
            </section>
            <section>
              <h3 className="eyebrow mb-1">Origem e preferências</h3>
              <KV k="Origem do cadastro" v={user.source ?? "–"} />
              <KV k="Idioma" v={user.locale.toUpperCase()} />
              <KV k="Última atividade" v={stats.last_day ?? "nunca"} />
            </section>
          </div>
        )}

        {tab === "aulas" && (
          <ul className="divide-y divide-line text-[12px]">
            {data.logs.length === 0 && <li className="py-8 text-center text-muted">Nenhuma aula concluída.</li>}
            {data.logs.map((l, i) => (
              <li key={i} className="flex items-center justify-between py-2"><span>{l.day} · aula {l.lesson_id.toUpperCase()}</span><span className="text-muted">{Math.round(l.sec / 60)} min · RPE {l.rpe} · +{l.xp} XP</span></li>
            ))}
          </ul>
        )}

        {tab === "pagamentos" && (
          <div className="space-y-5">
            <section>
              <h3 className="eyebrow mb-2">Assinaturas</h3>
              {data.subscriptions.length === 0 && <p className="text-[12px] text-muted">Sem assinaturas.</p>}
              {data.subscriptions.map((s) => <KV key={s.id} k={`${dateBr(s.started_at)} → ${s.canceled_at ? dateBr(s.canceled_at) : "atual"}`} v={<span className="flex items-center gap-2">{brl(s.price_cents)}<Badge tone={s.status === "active" ? "ok" : "neutral"}>{s.status === "active" ? "ativa" : "cancelada"}</Badge></span>} />)}
            </section>
            <section>
              <h3 className="eyebrow mb-2">Pagamentos</h3>
              {data.payments.length === 0 && <p className="text-[12px] text-muted">Sem pagamentos.</p>}
              {data.payments.map((p) => <KV key={p.id} k={`${dateBr(p.paid_at)} · ${p.method === "pix" ? "Pix" : "Cartão"}`} v={<span className="flex items-center gap-2">{brl(p.amount_cents)}<Badge tone={p.status === "paid" ? "ok" : p.status === "refunded" ? "warn" : "bad"}>{({ paid: "pago", refunded: "reembolsado", failed: "falhou", pending: "pendente" } as Record<string, string>)[p.status]}</Badge></span>} />)}
            </section>
          </div>
        )}

        {tab === "consultas" && (
          <ul className="divide-y divide-line text-[12px]">
            {data.appointments.length === 0 && <li className="py-8 text-center text-muted">Nenhuma consulta.</li>}
            {data.appointments.map((a) => <li key={a.id} className="flex items-center justify-between py-2"><span>{dateTimeBr(a.starts_at)}</span><Badge tone={a.status === "done" ? "ok" : a.status === "canceled" || a.status === "no_show" ? "bad" : "warn"}>{a.status}</Badge></li>)}
          </ul>
        )}

        {tab === "lgpd" && (
          <div className="space-y-6">
            <section>
              <h3 className="eyebrow mb-1">Consentimentos registrados</h3>
              {data.consents.map((c, i) => <KV key={i} k={`${CONSENT_PT[c.type] ?? c.type} (v${c.version})`} v={<span className="flex items-center gap-2"><Badge tone={c.granted ? "ok" : "neutral"}>{c.granted ? "concedido" : "negado"}</Badge><span className="text-[11px] text-muted">{dateBr(c.created_at)}</span></span>} />)}
            </section>
            <section>
              <h3 className="eyebrow mb-2">Dados de saúde (anamnese)</h3>
              <p className="text-[12px] text-muted">Criptografados no banco. A leitura é individual e <b className="font-medium text-fg">fica registrada na auditoria</b> com o seu usuário.</p>
              {anam === undefined ? (
                <div className="mt-3"><Btn disabled={!data.hasAnamnese} onClick={async () => { const r = await send<{ anamnese: unknown }>("POST", `/admin/students/${id}/anamnese`); if (r.ok) setAnam(r.data.anamnese ?? null); else toast(ERRORS.generic, "bad"); }}>{data.hasAnamnese ? "Ver anamnese (será auditado)" : "Sem anamnese"}</Btn></div>
              ) : (
                <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-surface2 p-3 text-[11px]">{anam ? JSON.stringify(anam, null, 2) : "Registro de demonstração: sem conteúdo clínico."}</pre>
              )}
            </section>
            <section className="rounded-2xl border-[0.5px] border-ember/40 p-4">
              <h3 className="text-[13px] font-medium text-ember">Excluir aluno (direito ao apagamento)</h3>
              <p className="mt-1 text-[12px] text-muted">Remove conta, anamnese, progresso, pagamentos e consultas de forma definitiva. A auditoria é mantida sem vínculo ao aluno. Digite <b className="font-medium text-fg">EXCLUIR</b> para confirmar.</p>
              <div className="mt-3 flex gap-2">
                <input className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirmação" />
                <Btn variant="danger" disabled={confirm !== "EXCLUIR"} onClick={async () => { const r = await send("DELETE", `/admin/students/${id}`, { confirm: true }); if (r.ok) { toast("Aluno excluído."); onDeleted(); } else toast(ERRORS.generic, "bad"); }}>Excluir</Btn>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
