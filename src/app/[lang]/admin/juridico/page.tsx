"use client";

import Link from "next/link";
import { useState } from "react";
import { Printer, UserPlus } from "lucide-react";
import Markdown from "@/components/Markdown";
import { useI18n } from "@/i18n/provider";
import { dateBr, ERRORS, send, useApi } from "@/lib/admin";
import { useStore } from "@/lib/store";
import { Badge, Btn, Card, DataTable, Drawer, Field, inputCls, Modal, PageHead, Spinner, Stat, Tabs, useAdmin, type Col, type Tone } from "@/components/admin/ui";

interface Latest { id: number; version: number; status: string; updated_at: string; change_note: string | null }
interface Doc { slug: string; title: string; category: string; required: boolean; latest: Latest | null; published: { version: number; published_at: string } | null; open_comments: number }
interface List { docs: Doc[]; summary: { total: number; required: number; required_published: number; draft: number; review: number; approved: number; published: number; open_comments: number; readiness: number }; consent_version: string; role: string }
interface Detail {
  doc: { slug: string; title: string; category: string; required: boolean };
  selected: { id: number; version: number; status: string; content: Record<"pt" | "en" | "es", string>; change_note: string | null } | null;
  versions: { id: number; version: number; status: string; change_note: string | null; created_at: string; updated_at: string; approved_at: string | null; published_at: string | null; approved_by_name: string | null; author: string | null }[];
  comments: { id: number; version_id: number | null; author_name: string; body: string; resolved: number; created_at: string }[];
  role: string;
}

const ST_PT: Record<string, string> = { draft: "Rascunho", review: "Em revisão", approved: "Aprovado", published: "Publicado", archived: "Arquivado" };
const ST_TONE: Record<string, Tone> = { draft: "neutral", review: "warn", approved: "info", published: "ok", archived: "neutral" };
const CAT_PT: Record<string, string> = { lgpd: "LGPD", contratos: "Contratos", saude: "Saúde", seguranca: "Segurança" };
const MORE: Record<string, string> = { invalid_state: "Essa ação não é possível no estado atual do documento.", pt_required: "O texto em português é obrigatório.", too_long: "Texto longo demais.", no_version: "Documento sem versão." };

export default function Legal() {
  const { href } = useI18n();
  const { toast } = useAdmin();
  const { data, loading, reload } = useApi<List>("/admin/legal");
  const [open, setOpen] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const isAdmin = data?.role === "admin";

  if (!data) return <div className="flex justify-center py-32"><Spinner /></div>;
  const s = data.summary;

  const cols: Col<Doc>[] = [
    { key: "t", head: "Documento", cell: (d) => <div><p className="flex items-center gap-2">{d.title}{d.required && <Badge tone="dark">essencial</Badge>}</p><p className="font-mono text-[10px] text-muted">{d.slug}</p></div> },
    { key: "c", head: "Área", cell: (d) => <span className="text-muted">{CAT_PT[d.category] ?? d.category}</span> },
    { key: "s", head: "Situação", cell: (d) => d.latest ? <Badge tone={ST_TONE[d.latest.status]}>{ST_PT[d.latest.status]}</Badge> : "–" },
    { key: "v", head: "Versão", align: "right", cell: (d) => <span>v{d.latest?.version ?? "–"}{d.published && d.latest?.version !== d.published.version && <span className="ml-1 text-[10px] text-muted">(no ar: v{d.published.version})</span>}</span> },
    { key: "u", head: "Atualizado", cell: (d) => <span className="text-muted">{dateBr(d.latest?.updated_at)}</span> },
    { key: "k", head: "Comentários", align: "right", cell: (d) => d.open_comments ? <Badge tone="warn">{d.open_comments} em aberto</Badge> : <span className="text-muted">–</span> },
    { key: "p", head: "Página pública", cell: (d) => d.published ? <Link href={href(`/legal?doc=${d.slug}`)} onClick={(e) => e.stopPropagation()} target="_blank" className="text-[11px] text-bronze">abrir ↗</Link> : <span className="text-[11px] text-muted">não publicada</span> },
  ];

  return (
    <div>
      <PageHead eyebrow="Conformidade" title="Jurídico">
        {loading && <Spinner />}
        <Link href={href("/admin/juridico/exportar")} className="inline-flex h-10 items-center gap-2 rounded-full border-[0.5px] border-line px-5 text-[13px] hover:bg-surface2"><Printer size={14} aria-hidden="true" />Visão para o advogado (imprimir/PDF)</Link>
        {isAdmin && <Btn variant="primary" size="md" onClick={() => setInviting(true)}><UserPlus size={14} aria-hidden="true" />Convidar advogado</Btn>}
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Prontidão para o lançamento" value={`${s.readiness}%`} sub={`${s.required_published} de ${s.required} essenciais publicados`} />
        <Stat label="Documentos" value={s.total} sub={`${s.published} publicados`} />
        <Stat label="Em rascunho" value={s.draft} />
        <Stat label="Em revisão / aprovados" value={`${s.review} / ${s.approved}`} />
        <Stat label="Comentários em aberto" value={s.open_comments} sub={`consentimento v${data.consent_version}`} />
      </div>

      <Card pad={false} title="Todos os documentos jurídicos" sub="Fluxo: rascunho → revisão do advogado → aprovado → publicado (só o administrador publica)">
        <DataTable cols={cols} rows={data.docs.map((d) => ({ ...d, id: d.slug }))} onRow={(d) => setOpen(d.slug)} empty="Nenhum documento." />
      </Card>
      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-muted">Os textos iniciais são <b className="font-medium">modelos em rascunho</b> e não constituem aconselhamento jurídico. Campos entre [COLCHETES] precisam ser preenchidos. Ao publicar Privacidade, Termos, Aviso de saúde ou Termo de dados de saúde, a versão do consentimento muda e passa a ser gravada nos novos cadastros.</p>

      <Drawer open={open !== null} onClose={() => setOpen(null)} title="Documento jurídico" width={860}>
        {open && <Editor slug={open} onChanged={reload} toast={toast} />}
      </Drawer>
      <Invite open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

function Invite({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: "", email: "" });
  const [res, setRes] = useState<{ tempPassword: string } | null>(null);
  const [err, setErr] = useState("");
  async function go() {
    setErr("");
    const r = await send<{ tempPassword: string }>("POST", "/admin/legal/invite", f);
    if (r.ok) setRes(r.data);
    else setErr(ERRORS[r.code] ?? ERRORS.generic);
  }
  const close = () => { setRes(null); setErr(""); setF({ name: "", email: "" }); onClose(); };
  return (
    <Modal open={open} onClose={close} title={res ? "Advogado convidado" : "Convidar advogado"}>
      {res ? (
        <div className="space-y-4 text-[13px]">
          <p>Envie estes dados por um canal seguro. A senha temporária <b className="font-medium">não será exibida novamente</b>.</p>
          <div className="rounded-xl bg-surface2 p-4 font-mono text-[12px]"><p>E-mail: {f.email}</p><p>Senha temporária: {res.tempPassword}</p></div>
          <p className="text-muted">O advogado enxerga somente esta área (Jurídico): pode editar, comentar, enviar para revisão e aprovar. A publicação fica com o administrador.</p>
          <Btn variant="primary" size="md" onClick={close}>Concluir</Btn>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void go(); }}>
          <Field label="Nome"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="E-mail (será o login)"><input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
          <Btn type="submit" variant="primary" size="md">Criar acesso</Btn>
        </form>
      )}
    </Modal>
  );
}

function Editor({ slug, onChanged, toast }: { slug: string; onChanged: () => void; toast: (m: string, t?: "ok" | "bad") => void }) {
  const me = useStore((s) => s.role);
  const [vid, setVid] = useState<number | null>(null);
  const { data, reload } = useApi<Detail>(`/admin/legal/${slug}${vid ? `?v=${vid}` : ""}`);
  const [tab, setTab] = useState<"editar" | "historico" | "comentarios">("editar");
  if (!data || !data.selected) return <div className="flex justify-center py-24"><Spinner /></div>;
  // `key` reinicia o estado do formulário quando muda a versão carregada
  return <EditorBody key={`${slug}-${data.selected.id}-${data.selected.status}`} d={data} me={me} tab={tab} setTab={setTab} setVid={setVid} reload={() => { reload(); onChanged(); }} toast={toast} />;
}

function EditorBody({ d, me, tab, setTab, setVid, reload, toast }: { d: Detail; me: string | null; tab: "editar" | "historico" | "comentarios"; setTab: (t: "editar" | "historico" | "comentarios") => void; setVid: (n: number | null) => void; reload: () => void; toast: (m: string, t?: "ok" | "bad") => void }) {
  const sel = d.selected!;
  const latest = d.versions[0];
  const isLatest = sel.id === latest.id;
  const [lang, setLang] = useState<"pt" | "en" | "es">("pt");
  const [content, setContent] = useState(sel.content);
  const [note, setNote] = useState(sel.change_note ?? "");
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState(false);
  const editable = isLatest && (sel.status === "draft" || sel.status === "review" || sel.status === "approved" || sel.status === "published");
  const open = d.comments.filter((c) => !c.resolved).length;

  async function act(fn: Promise<{ ok: boolean; code?: string }>, ok: string) {
    const r = await fn;
    if (r.ok) {
      toast(ok);
      reload();
    } else toast(MORE[r.code ?? ""] ?? ERRORS[r.code ?? "generic"] ?? ERRORS.generic, "bad");
  }
  const save = () => act(send("PUT", `/admin/legal/${d.doc.slug}/draft`, { content, change_note: note }), sel.status === "published" || sel.status === "approved" ? "Nova versão criada em rascunho." : "Rascunho salvo.");

  return (
    <div>
      <div className="px-6 pb-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-3xl leading-tight">{d.doc.title}</h2>
          <Badge tone={ST_TONE[sel.status]}>{ST_PT[sel.status]} · v{sel.version}</Badge>
          {d.doc.required && <Badge tone="dark">essencial</Badge>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {isLatest && sel.status === "draft" && <Btn variant="primary" onClick={() => act(send("POST", `/admin/legal/${d.doc.slug}/submit`), "Enviado para revisão.")}>Enviar para revisão</Btn>}
          {isLatest && sel.status === "review" && <Btn variant="primary" onClick={() => act(send("POST", `/admin/legal/${d.doc.slug}/approve`), "Documento aprovado.")}>Aprovar</Btn>}
          {isLatest && (sel.status === "review" || sel.status === "approved") && <Btn onClick={() => act(send("POST", `/admin/legal/${d.doc.slug}/reopen`), "Voltou para rascunho.")}>Devolver para rascunho</Btn>}
          {isLatest && sel.status === "approved" && (me === "admin" ? <Btn variant="ember" onClick={() => act(send("POST", `/admin/legal/${d.doc.slug}/publish`), "Documento publicado.")}>Publicar agora</Btn> : <span className="self-center text-[12px] text-muted">Aguardando publicação pelo administrador.</span>)}
        </div>
      </div>

      <div className="px-6"><Tabs value={tab} onChange={setTab} items={[{ value: "editar", label: "Texto" }, { value: "historico", label: "Histórico", count: d.versions.length }, { value: "comentarios", label: "Comentários do advogado", count: open }]} /></div>

      <div className="p-6">
        {tab === "editar" && (
          <div className="space-y-4">
            {!isLatest && <p className="rounded-xl bg-surface2 px-4 py-2.5 text-[12px] text-muted">Você está vendo a versão {sel.version} (somente leitura). <button type="button" className="text-bronze underline" onClick={() => setVid(null)}>Voltar à versão mais recente</button></p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs value={lang} onChange={setLang} items={[{ value: "pt", label: "Português" }, { value: "en", label: "English" }, { value: "es", label: "Español" }]} />
              <button type="button" onClick={() => setPreview((p) => !p)} className="text-[12px] text-bronze">{preview ? "Editar" : "Pré-visualizar"}</button>
            </div>
            {preview ? (
              <div className="min-h-[320px] rounded-2xl border-[0.5px] border-line bg-surface p-6 text-[14px]"><Markdown text={content[lang] || "_(vazio neste idioma)_"} /></div>
            ) : (
              <textarea value={content[lang]} onChange={(e) => setContent({ ...content, [lang]: e.target.value })} readOnly={!isLatest} spellCheck className="min-h-[420px] w-full rounded-2xl border-[0.5px] border-line bg-surface p-4 font-mono text-[12px] leading-relaxed outline-none focus:border-bronze" aria-label={`Texto em ${lang}`} />
            )}
            <p className="text-[11px] text-muted">Formatação: <span className="font-mono"># Título</span>, <span className="font-mono">## Seção</span>, <span className="font-mono">- lista</span>, <span className="font-mono">**negrito**</span>, tabelas com <span className="font-mono">|</span>. {lang !== "pt" && "Se um idioma ficar vazio, a página pública usa o português."}</p>
            {editable && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[260px] flex-1"><Field label="O que mudou nesta versão (opcional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: incluída cláusula de foro" /></Field></div>
                <Btn variant="primary" size="md" onClick={save}>{sel.status === "published" || sel.status === "approved" ? "Salvar como nova versão" : "Salvar rascunho"}</Btn>
              </div>
            )}
          </div>
        )}

        {tab === "historico" && (
          <ul className="divide-y divide-line text-[13px]">
            {d.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="flex items-center gap-2">Versão {v.version}<Badge tone={ST_TONE[v.status]}>{ST_PT[v.status]}</Badge></p>
                  <p className="text-[11px] text-muted">{v.change_note ?? "—"} · {v.author ?? "sistema"} · atualizado {dateBr(v.updated_at)}{v.approved_by_name ? ` · aprovado por ${v.approved_by_name}` : ""}{v.published_at ? ` · publicado ${dateBr(v.published_at)}` : ""}</p>
                </div>
                <Btn onClick={() => { setVid(v.id); setTab("editar"); }}>Ver texto</Btn>
              </li>
            ))}
          </ul>
        )}

        {tab === "comentarios" && (
          <div className="space-y-4">
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!comment.trim()) return; await act(send("POST", `/admin/legal/${d.doc.slug}/comments`, { body: comment }), "Comentário registrado."); setComment(""); }}>
              <textarea className="min-h-[72px] w-full rounded-xl border-[0.5px] border-line bg-surface p-3 text-[13px] outline-none focus:border-bronze" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Observação, exigência legal ou ponto a corrigir" aria-label="Novo comentário" />
              <Btn type="submit" variant="primary">Comentar</Btn>
            </form>
            <ul className="space-y-2">
              {d.comments.length === 0 && <li className="py-6 text-center text-[13px] text-muted">Nenhum comentário.</li>}
              {d.comments.map((c) => (
                <li key={c.id} className={`rounded-xl border-[0.5px] px-4 py-3 text-[13px] ${c.resolved ? "border-line bg-surface2/50 text-muted" : "border-bronze/40 bg-bronze/5"}`}>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                  <p className="mt-1.5 flex items-center justify-between text-[11px] text-muted"><span>{c.author_name} · {dateBr(c.created_at)}</span>
                    <button type="button" className="text-bronze" onClick={() => act(send("PATCH", `/admin/legal/comments/${c.id}`, { resolved: !c.resolved }), c.resolved ? "Reaberto." : "Resolvido.")}>{c.resolved ? "reabrir" : "marcar como resolvido"}</button></p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
