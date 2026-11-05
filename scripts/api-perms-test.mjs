// Testes: equipe do painel com permissões detalhadas + trilha de auditoria das edições jurídicas.
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.BASE ?? "http://127.0.0.1:8081";
const DB = process.env.DB;
const PW = "senha-de-teste-local-1";
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log("  ok  ", name);
  } else {
    fail++;
    console.log("  FAIL", name, String(extra).slice(0, 300));
  }
};

class Client {
  jar = "";
  async call(method, path, body, { raw = false } = {}) {
    const h = { "Content-Type": "application/json", "X-Requested-With": "tfs" };
    if (this.jar) h.Cookie = this.jar;
    const res = await fetch(BASE + "/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [k, v] = c.split(";")[0].split("=");
      this.jar = v === "" ? "" : `${k}=${v}`;
    }
    if (raw) return { status: res.status, text: await res.text(), type: res.headers.get("content-type") ?? "" };
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json };
  }
  login(email, password = PW) {
    return this.call("POST", "/auth/login", { email, password });
  }
}

const admin = new Client();
await admin.login("admin@teste.local");

console.log("Equipe e permissões");
const list = await admin.call("GET", "/admin/users");
ok("master lista usuários, catálogo e perfis", list.status === 200 && list.json.catalog.length >= 20 && list.json.presets.some((p) => p.key === "advogado") && list.json.rows.some((r) => r.role === "admin"), JSON.stringify(list.json)?.slice(0, 200));
ok("e-mail inválido => 422", (await admin.call("POST", "/admin/users", { name: "Ana", email: "x", profile: "financeiro" })).status === 422);
ok("sem permissões => 422", (await admin.call("POST", "/admin/users", { name: "Ana Souza", email: "semperm@teste.local", profile: "custom", permissions: [] })).status === 422);
ok("e-mail já usado => 409", (await admin.call("POST", "/admin/users", { name: "Ana Souza", email: "admin@teste.local", profile: "financeiro" })).status === 409);

const fin = await admin.call("POST", "/admin/users", { name: "Fabio Financeiro", email: "fin@teste.local", profile: "financeiro" });
ok("cria usuário Financeiro com senha temporária", fin.status === 201 && fin.json.tempPassword?.length >= 10, JSON.stringify(fin.json));
const finC = new Client();
const finLogin = await finC.login("fin@teste.local", fin.json.tempPassword);
ok("login do usuário novo traz permissões e perfil", finLogin.status === 200 && finLogin.json.profile.role === "staff" && finLogin.json.profile.permissions.includes("payments.view") && finLogin.json.profile.profileLabel === "Financeiro", JSON.stringify(finLogin.json?.profile));
ok("financeiro vê pagamentos e alunos", (await finC.call("GET", "/admin/payments")).status === 200 && (await finC.call("GET", "/admin/students")).status === 200);
ok("financeiro NÃO edita aluno nem lê anamnese", (await finC.call("PATCH", "/admin/students/1", { status: "suspended" })).status === 403 && (await finC.call("GET", "/admin/students/1/anamnese")).status === 403);
ok("financeiro NÃO acessa gateways, SMTP, jurídico, auditoria", (await finC.call("GET", "/admin/gateways")).status === 403 && (await finC.call("GET", "/admin/smtp")).status === 403 && (await finC.call("GET", "/admin/legal")).status === 403 && (await finC.call("GET", "/admin/audit")).status === 403);
ok("financeiro NÃO exporta dados pessoais de alunos", (await finC.call("GET", "/admin/export/students.csv", undefined, { raw: true })).status === 403);
ok("financeiro NÃO gerencia usuários", (await finC.call("GET", "/admin/users")).status === 403 && (await finC.call("POST", "/admin/users", { name: "Ze Teste", email: "ze@teste.local", profile: "leitura" })).status === 403);

const adv = await admin.call("POST", "/admin/users", { name: "Dra. Advogada", email: "adv@teste.local", profile: "advogado" });
const advC = new Client();
const advLogin = await advC.login("adv@teste.local", adv.json.tempPassword);
ok("perfil Advogado = role legal com permissões do Jurídico", advLogin.json.profile.role === "legal" && advLogin.json.profile.permissions.includes("legal.edit") && !advLogin.json.profile.permissions.includes("legal.publish"), JSON.stringify(advLogin.json?.profile));
ok("advogado só enxerga o Jurídico", (await advC.call("GET", "/admin/legal")).status === 200 && (await advC.call("GET", "/admin/overview")).status === 403 && (await advC.call("GET", "/admin/users")).status === 403);

console.log("Trilha de auditoria jurídica");
const pv = await advC.call("GET", "/admin/legal/terms");
const original = pv.json.selected.content.pt;
const edited = original + "\n\n## Cláusula nova\n\nTexto novo escrito pela advogada.";
ok("advogado edita e registra o motivo", (await advC.call("PUT", "/admin/legal/terms/draft", { content: { pt: edited, en: "", es: "" }, change_note: "Cláusula nova" })).status === 200);
const h = await admin.call("GET", "/admin/legal/history?slug=terms");
const saved = h.json.rows.find((r) => r.action === "saved");
ok("histórico registra quem editou, perfil, nota e tamanho da mudança", saved && saved.user_name === "Dra. Advogada" && saved.user_role === "legal" && saved.note === "Cláusula nova" && saved.chars_added > 20 && saved.chars_removed === 0, JSON.stringify(saved));
ok("histórico inclui criação do modelo inicial", h.json.rows.some((r) => r.action === "created"));
const det = await admin.call("GET", `/admin/legal/edits/${saved.id}`);
ok("detalhe da edição traz texto antes e depois", det.status === 200 && det.json.before.pt === original && det.json.after.pt === edited && det.json.entry_hash.length === 64);
ok("cadeia de hashes íntegra", h.json.chain_ok === true);
await advC.call("POST", "/admin/legal/terms/submit");
ok("não publica sem a permissão legal.publish", (await advC.call("POST", "/admin/legal/terms/approve")).status === 200 && (await advC.call("POST", "/admin/legal/terms/publish")).status === 403);
const pub = await admin.call("POST", "/admin/legal/terms/publish");
const h2 = await admin.call("GET", "/admin/legal/history?slug=terms");
ok("aprovação e publicação ficam registradas com o autor", pub.status === 200 && ["submit", "approve", "publish"].every((a) => h2.json.rows.some((r) => r.action === a)) && h2.json.rows.find((r) => r.action === "publish").user_name !== "Dra. Advogada");
await advC.call("POST", "/admin/legal/terms/comments", { body: "Revisar foro" });
ok("comentário também é auditado", (await admin.call("GET", "/admin/legal/history?slug=terms")).json.rows.some((r) => r.action === "comment" && r.note === "Revisar foro"));
const csv = await admin.call("GET", "/admin/legal/history.csv", undefined, { raw: true });
ok("exporta a trilha em CSV", csv.status === 200 && csv.type.includes("text/csv") && csv.text.includes("Dra. Advogada") && csv.text.includes("usuario"));
ok("financeiro não lê a trilha", (await finC.call("GET", "/admin/legal/history")).status === 401 || (await finC.call("GET", "/admin/legal/history")).status === 403);
await advC.call("PUT", "/admin/legal/terms/draft", { content: { pt: edited + "\nOutra mudança.", en: "", es: "" } });
const pubText = await new Client().call("GET", "/legal/terms");
ok("versão publicada permanece intacta até nova publicação", pubText.json.content === edited && pubText.json.version === 1);
const h3 = await admin.call("GET", "/admin/legal/history?slug=terms");
ok("nova versão (v2) registrada na trilha", h3.json.rows.some((r) => r.action === "saved" && r.version === 2));
if (DB) {
  const db = new DatabaseSync(DB);
  db.prepare("UPDATE legal_edits SET user_name = 'Outra Pessoa' WHERE id = ?").run(saved.id);
  ok("trocar o nome de quem editou é detectado", (await admin.call("GET", "/admin/legal/history")).json.chain_ok === false);
  db.prepare("UPDATE legal_edits SET user_name = ? WHERE id = ?").run(saved.user_name, saved.id);
  ok("restaurar o registro devolve a integridade", (await admin.call("GET", "/admin/legal/history")).json.chain_ok === true);
  db.prepare("UPDATE legal_edits SET chars_added = 1 WHERE id = ?").run(saved.id);
  ok("adulterar o tamanho da mudança é detectado", (await admin.call("GET", "/admin/legal/history")).json.chain_ok === false);
  db.close();
}

console.log("Dados da empresa");
ok("e-mail do DPO inválido => 422", (await advC.call("PUT", "/admin/legal/company", { legal_name: "X", dpo_email: "nao-e-email" })).status === 422);
ok("advogado salva dados da empresa", (await advC.call("PUT", "/admin/legal/company", { legal_name: "Full Sculpt Ltda", trade_name: "THE FULL SCULPT", cnpj: "00.000.000/0001-00", address: "Rua A, 1", support_email: "oi@exemplo.com", dpo_name: "Maria DPO", dpo_email: "dpo@exemplo.com" })).status === 200);
const pubIdx = await new Client().call("GET", "/legal");
ok("dados da empresa aparecem publicamente", pubIdx.json.company.dpo_email === "dpo@exemplo.com" && pubIdx.json.company.cnpj === "00.000.000/0001-00");

console.log("Gestão de usuários");
const custom = await admin.call("POST", "/admin/users", { name: "Paula Publica", email: "paula@teste.local", profile: "custom", permissions: ["legal.publish"] });
const cC = new Client();
const cl = await cC.login("paula@teste.local", custom.json.tempPassword);
ok("publicar implica poder ver", cl.json.profile.permissions.includes("legal.view") && !cl.json.profile.permissions.includes("legal.edit"));
ok("sem legal.edit não altera texto", (await cC.call("GET", "/admin/legal")).status === 200 && (await cC.call("PUT", "/admin/legal/privacy/draft", { content: { pt: "x" } })).status === 403);
const finId = (await admin.call("GET", "/admin/users")).json.rows.find((r) => r.email === "fin@teste.local").id;
ok("master altera permissões e a sessão antiga é encerrada", (await admin.call("PATCH", `/admin/users/${finId}`, { profile: "custom", permissions: ["students.edit"] })).status === 200 && (await finC.call("GET", "/admin/students")).status === 401);
const fin2 = new Client();
await fin2.login("fin@teste.local", fin.json.tempPassword);
ok("editar implica ver e libera só o que foi marcado", (await fin2.call("GET", "/admin/students")).status === 200 && (await fin2.call("GET", "/admin/payments")).status === 403);
ok("suspender bloqueia o login", (await admin.call("PATCH", `/admin/users/${finId}`, { status: "suspended" })).status === 200 && (await new Client().login("fin@teste.local", fin.json.tempPassword)).status === 403);
const rst = await admin.call("POST", `/admin/users/${finId}/reset-password`);
await admin.call("PATCH", `/admin/users/${finId}`, { status: "active" });
ok("redefinir senha gera nova e invalida a antiga", rst.status === 200 && (await new Client().login("fin@teste.local", fin.json.tempPassword)).status === 401 && (await new Client().login("fin@teste.local", rst.json.tempPassword)).status === 200);
const masterId = list.json.rows.find((r) => r.role === "admin").id;
ok("master não é editável por esta tela", (await admin.call("PATCH", `/admin/users/${masterId}`, { status: "suspended" })).status === 403);
ok("exclui usuário e o login deixa de funcionar", (await admin.call("DELETE", `/admin/users/${finId}`)).status === 200 && (await new Client().login("fin@teste.local", rst.json.tempPassword)).status === 401);
ok("rota admin sem regra mapeada é só do master", (await advC.call("GET", "/admin/rota-inexistente")).status === 403);

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
