"use client";

import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { ERRORS, send, useApi } from "@/lib/admin";
import { Badge, Btn, Card, Field, inputCls, PageHead, Spinner, Tabs, useAdmin } from "@/components/admin/ui";

type Lang = "pt" | "en" | "es";
interface Content { subject: string; title: string; body: string; cta: string; foot: string }
interface Item { kind: string; label: string; langs: Record<Lang, Content & { custom: boolean; default: Content }> }
interface Layout { brand: string; bg: string; card: string; text: string; muted: string; button: string; button_text: string; radius: number; footer: string }
interface Data { items: Item[]; layout: Layout; layout_defaults: Layout; smtp_enabled: boolean; variables: Record<string, string> }

const MORE: Record<string, string> = { too_long: "Texto longo demais.", smtp_disabled: "Ative o envio de e-mails em Configurações > SMTP para enviar o teste." };
const COLORS: [keyof Layout, string][] = [["bg", "Fundo da página"], ["card", "Cartão"], ["text", "Texto"], ["muted", "Texto secundário"], ["button", "Botão"], ["button_text", "Texto do botão"]];

export default function Emails() {
  const { data, reload } = useApi<Data>("/admin/emails");
  if (!data) return <div className="flex justify-center py-32"><Spinner /></div>;
  return <Editor key={JSON.stringify(data.layout) + data.items.map((i) => Object.values(i.langs).map((l) => l.custom).join("")).join("")} data={data} reload={reload} />;
}

function Editor({ data, reload }: { data: Data; reload: () => void }) {
  const { toast } = useAdmin();
  const [kind, setKind] = useState(data.items[0].kind);
  const [lang, setLang] = useState<Lang>("pt");
  const item = data.items.find((i) => i.kind === kind)!;
  const saved = item.langs[lang];
  const [drafts, setDrafts] = useState<Record<string, Content>>({});
  const key = `${kind}/${lang}`;
  const content = useMemo<Content>(() => drafts[key] ?? { subject: saved.subject, title: saved.title, body: saved.body, cta: saved.cta, foot: saved.foot }, [drafts, key, saved]);
  const [layout, setLayout] = useState<Layout>(data.layout);
  const [html, setHtml] = useState("");
  const [subject, setSubject] = useState("");
  const dirty = !!drafts[key] && JSON.stringify(drafts[key]) !== JSON.stringify({ subject: saved.subject, title: saved.title, body: saved.body, cta: saved.cta, foot: saved.foot });
  const layoutDirty = JSON.stringify(layout) !== JSON.stringify(data.layout);
  const set = (k: keyof Content, v: string) => setDrafts({ ...drafts, [key]: { ...content, [k]: v } });

  // pré-visualização ao vivo (com o rascunho e o layout ainda não salvos)
  const sig = useMemo(() => JSON.stringify([kind, lang, content, layout]), [kind, lang, content, layout]);
  useEffect(() => {
    const id = setTimeout(async () => {
      const r = await send<{ subject: string; html: string }>("POST", "/admin/emails/preview", { kind, lang, content, layout });
      if (r.ok) { setHtml(r.data.html); setSubject(r.data.subject); }
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const fail = (code: string) => toast(MORE[code] ?? ERRORS[code] ?? ERRORS.generic, "bad");
  async function saveTemplate() {
    const r = await send("PUT", `/admin/emails/${kind}/${lang}`, content);
    if (r.ok) { toast("Modelo salvo."); setDrafts((d) => { const n = { ...d }; delete n[key]; return n; }); reload(); } else fail(r.code);
  }
  async function resetTemplate() {
    if (!confirm("Voltar este e-mail ao texto padrão?")) return;
    const r = await send("DELETE", `/admin/emails/${kind}/${lang}`);
    if (r.ok) { toast("Texto padrão restaurado."); setDrafts((d) => { const n = { ...d }; delete n[key]; return n; }); reload(); } else fail(r.code);
  }
  async function saveLayout() {
    const r = await send("PUT", "/admin/emails/layout", layout);
    if (r.ok) { toast("Layout salvo para todos os e-mails."); reload(); } else fail(r.code);
  }
  async function test() {
    if (dirty) toast("O teste usa a versão salva; salve o modelo antes para testar as mudanças.", "bad");
    const r = await send<{ ok: boolean; to: string; error: string | null }>("POST", `/admin/emails/${kind}/test`, { lang });
    if (r.ok && r.data.ok) toast(`Teste enviado para ${r.data.to}.`);
    else if (r.ok) toast(r.data.error ?? ERRORS.generic, "bad");
    else fail(r.code);
  }

  return (
    <div>
      <PageHead eyebrow="Comunicação" title="E-mails e layouts">
        <Btn onClick={test}><Send size={13} aria-hidden="true" />Enviar teste para mim</Btn>
      </PageHead>
      {!data.smtp_enabled && <p className="mb-4 rounded-xl bg-surface2 px-4 py-3 text-[12px] text-muted">O envio de e-mails está desligado (Configurações &gt; SMTP). Você pode editar e pré-visualizar, mas nada será enviado e a confirmação de e-mail do cadastro não será exigida.</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Modelo de e-mail" sub="Escolha o e-mail e o idioma. Variáveis: {name} (primeiro nome) e {when} (data da consulta).">
            <div className="mb-4 flex flex-wrap gap-2">
              {data.items.map((i) => (
                <button key={i.kind} type="button" onClick={() => setKind(i.kind)} aria-pressed={kind === i.kind} className={`rounded-full border-[0.5px] px-3.5 py-1.5 text-[12px] ${kind === i.kind ? "border-fg bg-fg text-bg" : "border-line hover:bg-surface2"}`}>{i.label}</button>
              ))}
            </div>
            <Tabs value={lang} onChange={setLang} items={[{ value: "pt", label: "Português" }, { value: "en", label: "English" }, { value: "es", label: "Español" }]} />
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void saveTemplate(); }}>
              <p className="flex items-center gap-2 text-[11px] text-muted">{saved.custom ? <Badge tone="info">editado</Badge> : <Badge tone="neutral">texto padrão</Badge>}{dirty && <Badge tone="warn">alterações não salvas</Badge>}</p>
              <Field label="Assunto"><input className={inputCls} value={content.subject} onChange={(e) => set("subject", e.target.value)} maxLength={200} /></Field>
              <Field label="Título dentro do e-mail"><input className={inputCls} value={content.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required /></Field>
              <Field label="Mensagem"><textarea className="min-h-[130px] w-full rounded-xl border-[0.5px] border-line bg-surface p-3 text-[13px] leading-relaxed outline-none focus:border-bronze" value={content.body} onChange={(e) => set("body", e.target.value)} maxLength={4000} required /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Texto do botão (vazio = sem botão)"><input className={inputCls} value={content.cta} onChange={(e) => set("cta", e.target.value)} maxLength={80} /></Field>
                <Field label="Observação no rodapé"><input className={inputCls} value={content.foot} onChange={(e) => set("foot", e.target.value)} maxLength={400} /></Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn type="submit" variant="primary" size="md" disabled={!dirty}>Salvar modelo</Btn>
                {saved.custom && <Btn type="button" size="md" onClick={resetTemplate}>Restaurar padrão</Btn>}
                <Btn type="button" size="md" disabled={!dirty} onClick={() => { const n = { ...drafts }; delete n[key]; setDrafts(n); }}>Descartar mudanças</Btn>
              </div>
              <p className="text-[11px] text-muted">O link do botão é gerado pelo sistema (confirmação, redefinição de senha etc.) e não pode ser alterado aqui.</p>
            </form>
          </Card>

          <Card title="Layout comum a todos os e-mails" sub="Cores, marca e rodapé. A pré-visualização ao lado mostra o resultado antes de salvar.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome da marca (topo)"><input className={inputCls} value={layout.brand} onChange={(e) => setLayout({ ...layout, brand: e.target.value })} maxLength={60} /></Field>
              <Field label={`Arredondamento do cartão (${layout.radius}px)`}><input type="range" min={0} max={32} value={layout.radius} onChange={(e) => setLayout({ ...layout, radius: Number(e.target.value) })} className="w-full" /></Field>
              {COLORS.map(([k, label]) => (
                <Field key={k} label={label}>
                  <div className="flex items-center gap-2">
                    <input type="color" value={String(layout[k])} onChange={(e) => setLayout({ ...layout, [k]: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border-[0.5px] border-line bg-transparent p-1" aria-label={label} />
                    <input className={`${inputCls} font-mono`} value={String(layout[k])} onChange={(e) => setLayout({ ...layout, [k]: e.target.value })} maxLength={7} />
                  </div>
                </Field>
              ))}
              <div className="sm:col-span-2"><Field label="Rodapé em todos os e-mails (ex.: razão social, CNPJ, endereço)"><textarea className="min-h-[70px] w-full rounded-xl border-[0.5px] border-line bg-surface p-3 text-[13px] outline-none focus:border-bronze" value={layout.footer} onChange={(e) => setLayout({ ...layout, footer: e.target.value })} maxLength={400} /></Field></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn variant="primary" size="md" disabled={!layoutDirty} onClick={saveLayout}>Salvar layout</Btn>
              <Btn size="md" onClick={() => setLayout(data.layout_defaults)}>Usar cores padrão</Btn>
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card title="Pré-visualização" sub={subject ? `Assunto: ${subject}` : "Carregando…"} pad={false}>
            <iframe title="Pré-visualização do e-mail" sandbox="" srcDoc={html} className="h-[640px] w-full rounded-b-2xl border-0 bg-white" />
          </Card>
        </div>
      </div>
    </div>
  );
}
