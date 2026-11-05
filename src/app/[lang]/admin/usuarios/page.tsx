"use client";

import { useMemo, useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { dateBr, ERRORS, send, useApi } from "@/lib/admin";
import { Badge, Btn, Card, DataTable, Drawer, Field, inputCls, Modal, PageHead, Spinner, useAdmin, type Col } from "@/components/admin/ui";

interface Row { id: number; name: string; email: string; role: string; profile_label: string | null; status: string; permissions: string[]; last_login_at: string | null; created_at: string }
interface Data {
  rows: Row[];
  catalog: { key: string; group: string; label: string }[];
  presets: { key: string; label: string; role: string; permissions: string[] }[];
  me: number;
}
const MORE: Record<string, string> = { no_permissions: "Marque ao menos uma permissão.", master_protected: "O administrador master não pode ser alterado por aqui." };

export default function Team() {
  const { toast } = useAdmin();
  const { data, reload } = useApi<Data>("/admin/users");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [secret, setSecret] = useState<{ name: string; email: string; password: string } | null>(null);
  if (!data) return <div className="flex justify-center py-32"><Spinner /></div>;

  const cols: Col<Row>[] = [
    { key: "n", head: "Usuário", cell: (r) => <div><p>{r.name}</p><p className="text-[11px] text-muted">{r.email}</p></div> },
    { key: "p", head: "Perfil", cell: (r) => r.role === "admin" ? <Badge tone="dark">Master</Badge> : <Badge tone="info">{r.profile_label ?? "Personalizado"}</Badge> },
    { key: "a", head: "Acesso", cell: (r) => r.role === "admin" ? <span className="text-muted">Tudo, inclusive esta tela</span> : <span className="text-muted">{r.permissions.length} permissões</span> },
    { key: "l", head: "Último acesso", cell: (r) => <span className="text-muted">{r.last_login_at ? dateBr(r.last_login_at) : "nunca"}</span> },
    { key: "s", head: "Situação", cell: (r) => <Badge tone={r.status === "active" ? "ok" : "bad"}>{r.status === "active" ? "Ativo" : "Suspenso"}</Badge> },
  ];

  return (
    <div>
      <PageHead eyebrow="Configurações" title="Equipe e permissões" sub="Cadastre usuários do painel e defina, uma a uma, o que cada pessoa pode ver ou fazer.">
        <Btn variant="primary" size="md" onClick={() => setEditing("new")}><UserPlus size={14} aria-hidden="true" />Novo usuário</Btn>
      </PageHead>
      <Card pad={false} title="Usuários do painel" sub="Somente o administrador master cadastra usuários e define o que cada um pode ver ou fazer. Alterações de permissão encerram as sessões do usuário.">
        <DataTable cols={cols} rows={data.rows} onRow={(r) => (r.role === "admin" ? undefined : setEditing(r))} empty="Nenhum usuário." />
      </Card>
      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-muted">O perfil <b className="font-medium">Advogado</b> enxerga apenas a área Jurídico: cadastra e edita documentos, comenta e aprova. A publicação no site é uma permissão separada. Toda edição jurídica fica registrada com autor, data e o texto antes e depois.</p>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Novo usuário" : "Editar usuário"} width={620}>
        {editing && <UserForm key={editing === "new" ? "new" : editing.id} data={data} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} toast={toast} onSecret={setSecret} />}
      </Drawer>

      <Modal open={secret !== null} onClose={() => setSecret(null)} title="Senha temporária">
        {secret && (
          <div className="space-y-4 text-[13px]">
            <p>Envie estes dados por um canal seguro. A senha temporária <b className="font-medium">não será exibida novamente</b>; peça que {secret.name.split(" ")[0]} a troque no primeiro acesso.</p>
            <div className="rounded-xl bg-surface2 p-4 font-mono text-[12px]"><p>E-mail: {secret.email}</p><p>Senha: {secret.password}</p></div>
            <Btn variant="primary" size="md" onClick={() => setSecret(null)}>Concluir</Btn>
          </div>
        )}
      </Modal>
    </div>
  );
}

function UserForm({ data, row, onClose, onSaved, toast, onSecret }: { data: Data; row: Row | null; onClose: () => void; onSaved: () => void; toast: (m: string, t?: "ok" | "bad") => void; onSecret: (s: { name: string; email: string; password: string }) => void }) {
  const [name, setName] = useState(row?.name ?? "");
  const [email, setEmail] = useState(row?.email ?? "");
  const initialProfile = row ? (data.presets.find((p) => p.label === row.profile_label)?.key ?? "custom") : "financeiro";
  const [profile, setProfile] = useState(initialProfile);
  const [perms, setPerms] = useState<string[]>(row ? row.permissions : (data.presets.find((p) => p.key === "financeiro")?.permissions ?? []));
  const [err, setErr] = useState("");
  const groups = useMemo(() => {
    const g: Record<string, Data["catalog"]> = {};
    for (const c of data.catalog) (g[c.group] ??= []).push(c);
    return Object.entries(g);
  }, [data.catalog]);

  const pick = (key: string) => {
    setProfile(key);
    const p = data.presets.find((x) => x.key === key);
    if (p) setPerms(p.permissions);
  };
  const toggle = (k: string) => {
    setProfile("custom");
    setPerms((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  };
  const fail = (code: string) => setErr(MORE[code] ?? ERRORS[code] ?? ERRORS.generic);

  async function save() {
    setErr("");
    if (!row) {
      const r = await send<{ tempPassword: string }>("POST", "/admin/users", { name, email, profile, permissions: perms });
      if (!r.ok) return fail(r.code);
      onSecret({ name, email, password: r.data.tempPassword });
      toast("Usuário criado.");
    } else {
      const r = await send("PATCH", `/admin/users/${row.id}`, { name, profile, permissions: perms });
      if (!r.ok) return fail(r.code);
      toast("Permissões atualizadas.");
    }
    onSaved();
    onClose();
  }
  async function act(fn: Promise<{ ok: boolean; code?: string; data?: unknown }>, ok: string, secret?: boolean) {
    const r = await fn;
    if (!r.ok) return fail(r.code ?? "generic");
    if (secret && row) onSecret({ name: row.name, email: row.email, password: (r.data as { tempPassword: string }).tempPassword });
    toast(ok);
    onSaved();
    if (!secret) onClose();
  }

  return (
    <form className="space-y-6 p-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>
        <Field label={row ? "E-mail (login)" : "E-mail (será o login)"}><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required readOnly={!!row} /></Field>
      </div>

      <div>
        <p className="eyebrow mb-2">Perfil</p>
        <div className="flex flex-wrap gap-2">
          {[...data.presets, { key: "custom", label: "Personalizado", role: "staff", permissions: [] }].map((p) => (
            <button key={p.key} type="button" onClick={() => (p.key === "custom" ? setProfile("custom") : pick(p.key))} aria-pressed={profile === p.key}
              className={`rounded-full border-[0.5px] px-4 py-1.5 text-[12px] ${profile === p.key ? "border-fg bg-fg text-bg" : "border-line hover:bg-surface2"}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow mb-2">Permissões detalhadas</p>
        <div className="space-y-4">
          {groups.map(([g, items]) => (
            <fieldset key={g} className="rounded-2xl border-[0.5px] border-line p-4">
              <legend className="px-2 text-[11px] uppercase tracking-[0.14em] text-muted">{g}</legend>
              <div className="grid gap-2">
                {items.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-start gap-3 text-[13px]">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#161514]" checked={perms.includes(c.key)} onChange={() => toggle(c.key)} />
                    <span>{c.label}{c.key === "students.health" && <Badge tone="warn"> sensível</Badge>}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Marcar “editar” libera automaticamente o “ver” correspondente. Gerir usuários é exclusivo do master.</p>
      </div>

      {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Btn type="submit" variant="primary" size="md">{row ? "Salvar alterações" : "Criar usuário"}</Btn>
        {row && (
          <>
            <Btn type="button" onClick={() => act(send("POST", `/admin/users/${row.id}/reset-password`), "Nova senha gerada.", true)}><KeyRound size={13} aria-hidden="true" />Gerar nova senha</Btn>
            <Btn type="button" onClick={() => act(send("PATCH", `/admin/users/${row.id}`, { status: row.status === "active" ? "suspended" : "active" }), row.status === "active" ? "Usuário suspenso." : "Usuário reativado.")}>{row.status === "active" ? "Suspender" : "Reativar"}</Btn>
            <Btn type="button" variant="ember" onClick={() => { if (confirm(`Excluir o acesso de ${row.name}? O histórico de edições continua preservado.`)) void act(send("DELETE", `/admin/users/${row.id}`), "Usuário excluído."); }}>Excluir</Btn>
          </>
        )}
      </div>
    </form>
  );
}
