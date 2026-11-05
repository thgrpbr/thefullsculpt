// Testes: central jurídica, gateways de pagamento (multi-empresa), webhooks e verificação de DNS.
// Requer servidor PHP de teste + `node scripts/fake-smtp.mjs` (inclui um gateway falso em /gw).
import { createHmac } from "node:crypto";
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
  async call(method, path, body, { csrf = true, headers = {}, rawBody } = {}) {
    const h = { "Content-Type": "application/json", ...headers };
    if (csrf) h["X-Requested-With"] = "tfs";
    if (this.jar) h.Cookie = this.jar;
    const res = await fetch(BASE + "/api" + path, { method, headers: h, body: rawBody ?? (body ? JSON.stringify(body) : undefined) });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [k, v] = c.split(";")[0].split("=");
      this.jar = v === "" ? "" : `${k}=${v}`;
    }
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
const legal = new Client();
const student = new Client();
const anon = new Client();
await admin.login("admin@teste.local");
await legal.login("legal@teste.local");
await student.login("teste@thefullsculpt.com.br");

console.log("Central jurídica");
const l0 = await admin.call("GET", "/admin/legal");
ok("modelos iniciais criados (14 documentos, todos em rascunho)", l0.status === 200 && l0.json.summary.total === 14 && l0.json.summary.draft === 14 && l0.json.summary.readiness === 0, JSON.stringify(l0.json?.summary));
ok("documentos essenciais presentes", ["privacy", "terms", "health", "consent_health", "cookies", "refund", "teachers", "dpo", "incident", "ropa", "ripd"].every((s) => l0.json.docs.some((d) => d.slug === s)));
ok("aluno não acessa o jurídico", (await student.call("GET", "/admin/legal")).status === 403);
ok("advogado acessa o jurídico", (await legal.call("GET", "/admin/legal")).status === 200);
ok("advogado NÃO acessa o resto do admin", (await legal.call("GET", "/admin/students")).status === 403 && (await legal.call("GET", "/admin/overview")).status === 403 && (await legal.call("GET", "/admin/gateways")).status === 403);
ok("nada publicado: público vazio e 404", (await anon.call("GET", "/legal")).json.docs.length === 0 && (await anon.call("GET", "/legal/privacy")).status === 404);
const pv = await admin.call("GET", "/admin/legal/privacy");
ok("detalhe traz rascunho v1 com o texto", pv.json.selected.version === 1 && pv.json.selected.status === "draft" && pv.json.selected.content.pt.includes("Política de Privacidade"));
ok("texto vazio => 422", (await admin.call("PUT", "/admin/legal/privacy/draft", { content: { pt: "" } })).status === 422);
ok("texto gigante => 422", (await admin.call("PUT", "/admin/legal/privacy/draft", { content: { pt: "x".repeat(60001) } })).status === 422);
const edited = pv.json.selected.content.pt.replace("[RAZÃO SOCIAL]", "Full Sculpt Ltda");
ok("advogado edita o rascunho", (await legal.call("PUT", "/admin/legal/privacy/draft", { content: { pt: edited, en: "# Privacy Policy\n\nDraft.", es: "" }, change_note: "Razão social preenchida" })).status === 200);
ok("publicar sem aprovar => 409", (await admin.call("POST", "/admin/legal/privacy/publish")).status === 409);
ok("aprovar sem enviar para revisão => 409", (await legal.call("POST", "/admin/legal/privacy/approve")).status === 409);
ok("envia para revisão", (await admin.call("POST", "/admin/legal/privacy/submit")).status === 200);
ok("reabrir volta para rascunho", (await legal.call("POST", "/admin/legal/privacy/reopen")).status === 200 && (await admin.call("GET", "/admin/legal/privacy")).json.selected.status === "draft");
await admin.call("POST", "/admin/legal/privacy/submit");
ok("advogado aprova", (await legal.call("POST", "/admin/legal/privacy/approve")).status === 200);
ok("advogado NÃO publica (só admin)", (await legal.call("POST", "/admin/legal/privacy/publish")).status === 403);
ok("admin publica", (await admin.call("POST", "/admin/legal/privacy/publish")).status === 200);
const pub = await anon.call("GET", "/legal/privacy?lang=pt");
ok("página pública mostra a versão publicada", pub.status === 200 && pub.json.content.includes("Full Sculpt Ltda") && pub.json.version === 1 && pub.json.langs.includes("en"));
ok("idioma en disponível, es cai para pt", (await anon.call("GET", "/legal/privacy?lang=en")).json.content.includes("Privacy Policy") && (await anon.call("GET", "/legal/privacy?lang=es")).json.lang === "pt");
ok("lista pública só traz publicados", (await anon.call("GET", "/legal")).json.docs.length === 1);
const l1 = await admin.call("GET", "/admin/legal");
ok("prontidão sobe e versão de consentimento muda", l1.json.summary.readiness > 0 && /^\d{4}-\d{2}-\d{2}\.privacyv1$/.test(l1.json.consent_version), JSON.stringify([l1.json.summary.readiness, l1.json.consent_version]));
const emailC = `cons${Date.now()}@teste.local`;
await new Client().call("POST", "/auth/register", { name: "Consent Teste", email: emailC, password: "uma-senha-bem-longa-123", consents: { terms: true, health: true } });
if (DB) {
  const db = new DatabaseSync(DB);
  const v = db.prepare("SELECT DISTINCT c.version FROM consents c JOIN users u ON u.id = c.user_id WHERE u.email = ?").all(emailC).map((r) => r.version);
  ok("consentimento do novo aluno grava a versão publicada", v.length === 1 && v[0] === l1.json.consent_version, JSON.stringify(v));
}
await admin.call("PUT", "/admin/legal/privacy/draft", { content: { pt: edited + "\n\n## 10. Novidade\nTexto novo.", en: "# Privacy Policy v2", es: "" }, change_note: "Cláusula 10" });
const pv2 = await admin.call("GET", "/admin/legal/privacy");
ok("editar publicado cria v2 em rascunho (v1 segue público)", pv2.json.selected.version === 2 && pv2.json.selected.status === "draft" && pv2.json.versions.length === 2 && (await anon.call("GET", "/legal/privacy")).json.version === 1);
await admin.call("POST", "/admin/legal/privacy/submit");
await legal.call("POST", "/admin/legal/privacy/approve");
await admin.call("POST", "/admin/legal/privacy/publish");
const pv3 = await admin.call("GET", "/admin/legal/privacy");
ok("publicar v2 arquiva a v1", (await anon.call("GET", "/legal/privacy")).json.version === 2 && pv3.json.versions.find((v) => v.version === 1).status === "archived" && pv3.json.versions.find((v) => v.version === 2).approved_by_name === "Advogada Teste");
ok("advogado comenta", (await legal.call("POST", "/admin/legal/terms/comments", { body: "Incluir cláusula de foro do consumidor." })).status === 201);
const lt = await admin.call("GET", "/admin/legal/terms");
ok("admin vê o comentário e resolve", lt.json.comments.length === 1 && lt.json.comments[0].author_name === "Advogada Teste" && (await admin.call("PATCH", `/admin/legal/comments/${lt.json.comments[0].id}`, { resolved: true })).status === 200 && (await admin.call("GET", "/admin/legal")).json.summary.open_comments === 0);
ok("comentário vazio => 422", (await legal.call("POST", "/admin/legal/terms/comments", { body: "  " })).status === 422);
const ex = await legal.call("GET", "/admin/legal/export");
ok("exportação reúne todos os documentos e comentários", ex.status === 200 && ex.json.docs.length === 14 && ex.json.docs.find((d) => d.slug === "terms").comments.length === 1 && ex.json.docs.find((d) => d.slug === "privacy").status === "published");
const inv = await admin.call("POST", "/admin/legal/invite", { name: "Dr. Carlos Advogado", email: "carlos.adv@teste.local" });
ok("admin convida advogado (senha temporária)", inv.status === 201 && inv.json.tempPassword.length >= 12);
ok("advogado convidado loga e acessa o jurídico", (await new Client().login("carlos.adv@teste.local", inv.json.tempPassword)).status === 200);
ok("advogado não convida", (await legal.call("POST", "/admin/legal/invite", { name: "X Y", email: "x@y.com" })).status === 403);
ok("documento inexistente => 404", (await admin.call("GET", "/admin/legal/naoexiste")).status === 404);

console.log("Gateways de pagamento");
const g0 = await admin.call("GET", "/admin/gateways");
ok("catálogo com 4 provedores e nenhuma conta", g0.json.catalog.map((c) => c.provider).sort().join() === "asaas,mercadopago,pagarme,stripe" && g0.json.items.length === 0);
ok("só admin vê gateways", (await student.call("GET", "/admin/gateways")).status === 403);
ok("provedor inválido => 422", (await admin.call("POST", "/admin/gateways", { provider: "paypal" })).status === 422);
ok("sem chave secreta => 422", (await admin.call("POST", "/admin/gateways", { provider: "stripe", fields: { public_key: "pk_test_1" } })).status === 422);
ok("meios inválidos => 422", (await admin.call("POST", "/admin/gateways", { provider: "stripe", methods: ["boleto"], fields: { secret_key: "sk_test_good", public_key: "pk_test_1" } })).status === 422);
const s1 = await admin.call("POST", "/admin/gateways", { provider: "stripe", label: "Stripe BR", mode: "sandbox", methods: ["card", "pix"], fields: { secret_key: "sk_test_good123", public_key: "pk_test_pub1", webhook_secret: "whsec_abc123" } });
ok("cria Stripe (sandbox)", s1.status === 201);
const g1 = await admin.call("GET", "/admin/gateways");
const txt = JSON.stringify(g1.json);
ok("segredos nunca voltam na API", !txt.includes("sk_test_good123") && !txt.includes("whsec_abc123") && g1.json.items[0].fields.find((f) => f.key === "secret_key").has_value === true && g1.json.items[0].fields.find((f) => f.key === "secret_key").value === null);
ok("chave pública é visível", g1.json.items[0].fields.find((f) => f.key === "public_key").value === "pk_test_pub1");
if (DB) {
  const db = new DatabaseSync(DB);
  const raw = db.prepare("SELECT config_enc FROM payment_gateways").get().config_enc;
  ok("credenciais criptografadas no banco", !raw.includes("sk_test_good123") && !raw.includes("whsec") && raw.length > 40);
}
const sid = s1.json.id;
ok("ativar sem testar => 409", (await admin.call("PUT", `/admin/gateways/${sid}`, { enabled: true, mode: "sandbox", methods: ["card", "pix"] })).status === 409);
ok("teste ok (credencial válida)", (await admin.call("POST", `/admin/gateways/${sid}/test`)).json?.ok === true);
ok("ativa após testar e vira padrão", (await admin.call("PUT", `/admin/gateways/${sid}`, { enabled: true, mode: "sandbox", methods: ["card", "pix"] })).status === 200 && (await admin.call("GET", "/admin/gateways")).json.items[0].is_default === true);
const cc = await anon.call("GET", "/gateways/checkout-config");
ok("checkout-config público traz só a chave pública", cc.status === 200 && cc.json.gateways.length === 1 && cc.json.gateways[0].public_key === "pk_test_pub1" && !JSON.stringify(cc.json).includes("sk_test") && cc.json.gateways[0].methods.includes("pix"));
const mp = await admin.call("POST", "/admin/gateways", { provider: "mercadopago", mode: "sandbox", fields: { access_token: "TEST-bad-token", public_key: "TEST-pub" } });
const mpTest = await admin.call("POST", `/admin/gateways/${mp.json.id}/test`);
ok("credencial recusada é informada", mpTest.json?.ok === false && /recusadas/.test(mpTest.json.msg));
ok("não ativa gateway reprovado", (await admin.call("PUT", `/admin/gateways/${mp.json.id}`, { enabled: true, mode: "sandbox" })).status === 409);
const mp2 = await admin.call("PUT", `/admin/gateways/${mp.json.id}`, { mode: "sandbox", fields: { access_token: "TEST-good-token" }, methods: ["card", "pix"] });
ok("trocar a credencial zera o teste", mp2.status === 200 && (await admin.call("GET", "/admin/gateways")).json.items.find((i) => i.id === mp.json.id).last_test_ok === null);
ok("teste com token novo passa e ativa", (await admin.call("POST", `/admin/gateways/${mp.json.id}/test`)).json?.ok === true && (await admin.call("PUT", `/admin/gateways/${mp.json.id}`, { enabled: true, mode: "sandbox", methods: ["card", "pix"] })).status === 200);
const live = await admin.call("POST", "/admin/gateways", { provider: "stripe", label: "Stripe produção", mode: "live", fields: { secret_key: "sk_test_good999", public_key: "pk_live_x" } });
ok("modo produção com chave de teste é barrado", (await admin.call("POST", `/admin/gateways/${live.json.id}/test`)).json?.ok === false);
const pg = await admin.call("POST", "/admin/gateways", { provider: "pagarme", mode: "sandbox", methods: ["card", "pix", "boleto"], fields: { secret_key: "sk_good_pagarme", public_key: "pk_pagarme" } });
const asa = await admin.call("POST", "/admin/gateways", { provider: "asaas", mode: "sandbox", fields: { api_key: "good_asaas_key" } });
ok("Pagar.me e Asaas testam ok", (await admin.call("POST", `/admin/gateways/${pg.json.id}/test`)).json?.ok === true && (await admin.call("POST", `/admin/gateways/${asa.json.id}/test`)).json?.ok === true);
await admin.call("PUT", `/admin/gateways/${pg.json.id}`, { enabled: true, mode: "sandbox", methods: ["card", "pix", "boleto"] });
await admin.call("PUT", `/admin/gateways/${asa.json.id}`, { enabled: true, mode: "sandbox", methods: ["card", "pix", "boleto"] });
ok("padrão só em gateway ativo", (await admin.call("POST", `/admin/gateways/${live.json.id}/default`)).status === 409);
ok("define Asaas como padrão (apenas um padrão)", (await admin.call("POST", `/admin/gateways/${asa.json.id}/default`)).status === 200 && (await admin.call("GET", "/admin/gateways")).json.items.filter((i) => i.is_default).length === 1);
const cc2 = await anon.call("GET", "/gateways/checkout-config");
ok("4 gateways ativos, o padrão primeiro", cc2.json.gateways.length === 4 && cc2.json.gateways[0].provider === "asaas" && cc2.json.gateways.map((g) => g.provider).sort().join() === "asaas,mercadopago,pagarme,stripe");
ok("desativar remove do checkout e do padrão", (await admin.call("PUT", `/admin/gateways/${asa.json.id}`, { enabled: false, mode: "sandbox", methods: ["card"] })).status === 200 && (await anon.call("GET", "/gateways/checkout-config")).json.gateways.length === 3);
ok("exclui gateway", (await admin.call("DELETE", `/admin/gateways/${live.json.id}`)).status === 200);

console.log("Webhook Stripe");
const stu = (await admin.call("GET", "/admin/students?q=teste@thefullsculpt")).json.rows[0];
const send = async (ev, { secret = "whsec_abc123", ts = Math.floor(Date.now() / 1000), sig } = {}) => {
  const raw = JSON.stringify(ev);
  const v1 = sig ?? createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  return new Client().call("POST", "/webhooks/stripe", undefined, { csrf: false, headers: { "Stripe-Signature": `t=${ts},v1=${v1}` }, rawBody: raw });
};
const evPaid = { id: "evt_test_1", type: "invoice.paid", data: { object: { id: "in_test_1", amount_paid: 7990, metadata: { user_id: String(stu.id) } } } };
ok("assinatura inválida => 400", (await send(evPaid, { sig: "0".repeat(64) })).status === 400);
ok("segredo errado => 400", (await send(evPaid, { secret: "whsec_outro" })).status === 400);
ok("timestamp antigo => 400", (await send(evPaid, { ts: Math.floor(Date.now() / 1000) - 3600 })).status === 400);
const before = (await admin.call("GET", `/admin/payments?q=teste@thefullsculpt`)).json.total;
const w1 = await send(evPaid);
ok("evento válido é aceito sem cookie/CSRF", w1.status === 200 && w1.json.received === true, JSON.stringify(w1.json));
const after = (await admin.call("GET", `/admin/payments?q=teste@thefullsculpt`)).json;
ok("pagamento registrado (R$ 79,90, cartão, assinatura ativa)", after.total === before + 1 && after.rows[0].amount_cents === 7990 && after.rows[0].method === "card" && (await student.call("GET", "/me")).json.sub === "active");
ok("evento repetido é idempotente", (await send(evPaid)).json?.duplicate === true && (await admin.call("GET", `/admin/payments?q=teste@thefullsculpt`)).json.total === before + 1);
const pixEv = { id: "evt_test_2", type: "payment_intent.succeeded", data: { object: { id: "pi_test_2", amount_received: 7990, payment_method_types: ["pix"], metadata: { user_id: String(stu.id) } } } };
ok("pagamento Pix reconhecido", (await send(pixEv)).status === 200 && (await admin.call("GET", `/admin/payments?q=teste@thefullsculpt&method=pix`)).json.total === 1);
ok("assinatura cancelada pelo provedor", (await send({ id: "evt_test_3", type: "customer.subscription.deleted", data: { object: { id: "sub_1", metadata: { user_id: String(stu.id) } } } })).status === 200 && (await student.call("GET", "/me")).json.sub === "free");
ok("usuário inexistente não gera pagamento", (await send({ id: "evt_test_4", type: "invoice.paid", data: { object: { id: "in_x", amount_paid: 100, metadata: { user_id: "999999" } } } })).status === 200 && (await admin.call("GET", `/admin/payments?q=teste@thefullsculpt`)).json.total === before + 2);
ok("provedor não verificado: recebido (202) e registrado", (await new Client().call("POST", "/webhooks/asaas", { event: "PAYMENT_RECEIVED" }, { csrf: false })).status === 202);
ok("provedor desconhecido => 404 e GET => 404", (await new Client().call("POST", "/webhooks/paypal", {}, { csrf: false })).status === 404 && (await new Client().call("GET", "/webhooks/stripe")).status === 404);
if (DB) {
  const db = new DatabaseSync(DB);
  ok("todos os eventos ficam registrados (válidos e inválidos)", db.prepare("SELECT COUNT(*) n FROM webhook_events").get().n >= 8 && db.prepare("SELECT COUNT(*) n FROM webhook_events WHERE valid = 0").get().n >= 4);
}

console.log("DNS do e-mail (SPF/DKIM/DMARC)");
ok("exige remetente configurado", (await admin.call("GET", "/admin/smtp/dns")).status === 422);
await admin.call("PUT", "/admin/smtp", { enabled: false, host: "smtp.teste-tfs.invalid", port: 465, secure: "ssl", from_email: "nao-responder@teste-tfs.invalid" });
const dns = await admin.call("GET", "/admin/smtp/dns?selectors=hostingermail-a,../x,meu_sel");
ok("devolve estado e sugestões de registros", dns.status === 200 && dns.json.domain === "teste-tfs.invalid" && typeof dns.json.spf.found === "boolean" && typeof dns.json.dmarc.found === "boolean" && dns.json.dkim.length === 2 && dns.json.suggest.some((s) => s.name === "_dmarc") && dns.json.suggest.some((s) => s.type === "TXT" && s.value.startsWith("v=spf1")), JSON.stringify(dns.json).slice(0, 200));
ok("seletor inválido é descartado", !dns.json.dkim.some((d) => d.selector.includes("..")));

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
