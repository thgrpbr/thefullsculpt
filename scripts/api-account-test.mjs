// Testes: SMTP, banco (admin), perfil/senha/pagamentos/acessos do aluno e recuperação de senha.
// Requer: servidor PHP de teste + `node scripts/fake-smtp.mjs` rodando. Uso: BASE=... DB=... node scripts/api-account-test.mjs
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.BASE ?? "http://127.0.0.1:8081";
const INBOX = process.env.INBOX ?? "http://127.0.0.1:2526";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 2525);
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
  async call(method, path, body, headers = {}) {
    const h = { "Content-Type": "application/json", "X-Requested-With": "tfs", ...headers };
    if (this.jar) h.Cookie = this.jar;
    const res = await fetch(BASE + "/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
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
  login(email, password = PW, ua) {
    return this.call("POST", "/auth/login", { email, password }, ua ? { "User-Agent": ua } : {});
  }
}
const inbox = async () => (await fetch(INBOX)).json();
// o servidor de e-mail falso pode registrar a mensagem um instante depois da resposta: espera até chegar
const waitInbox = async (n, ms = 4000) => {
  const t0 = Date.now();
  let m = await inbox();
  while (m.length < n && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 100));
    m = await inbox();
  }
  return m;
};
const clearInbox = async () => (await fetch(INBOX + "/clear")).json();
const decode = (m) => Buffer.from((m.data.match(/base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)--/s)?.[1] ?? "").replace(/\s/g, ""), "base64").toString("utf8");

const admin = new Client();
const student = new Client();
ok("admin loga", (await admin.login("admin@teste.local")).status === 200);
ok("aluno loga (Chrome/Windows)", (await student.login("teste@thefullsculpt.com.br", PW, "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537")).status === 200);

console.log("SMTP no admin");
const g0 = await admin.call("GET", "/admin/smtp");
ok("SMTP começa desligado e sem senha", g0.status === 200 && g0.json.enabled === false && g0.json.has_password === false && g0.json.pass_enc === undefined);
ok("não-admin => 403", (await student.call("GET", "/admin/smtp")).status === 403);
ok("porta inválida => 422", (await admin.call("PUT", "/admin/smtp", { host: "smtp.x.com", port: 99999, secure: "tls", from_email: "a@b.com" })).status === 422);
ok("remetente inválido => 422", (await admin.call("PUT", "/admin/smtp", { host: "smtp.x.com", port: 587, secure: "tls", from_email: "x" })).status === 422);
ok("habilitar sem servidor => 422", (await admin.call("PUT", "/admin/smtp", { enabled: true, host: "", port: 587, secure: "none", from_email: "" })).status === 422);
const bad = await admin.call("POST", "/admin/smtp/test", { host: "127.0.0.1", port: SMTP_PORT, secure: "none", user: "mailer", password: "errada", from_email: "noreply@thefullsculpt.com.br", to: "dest@exemplo.com" });
ok("teste com senha errada falha com mensagem clara", bad.json?.ok === false && /recusados/.test(bad.json?.error ?? ""), JSON.stringify(bad.json));
ok("log do teste não vaza a senha", !JSON.stringify(bad.json).includes("errada") && !JSON.stringify(bad.json).includes("segredo-smtp-teste"));
const closed = await admin.call("POST", "/admin/smtp/test", { host: "127.0.0.1", port: 9, secure: "none", from_email: "a@b.com", to: "d@e.com" });
ok("porta fechada => erro de conexão", closed.json?.ok === false && /conectar/.test(closed.json?.error ?? ""));
await clearInbox();
const good = await admin.call("POST", "/admin/smtp/test", { host: "127.0.0.1", port: SMTP_PORT, secure: "none", user: "mailer", password: "segredo-smtp-teste", from_email: "noreply@thefullsculpt.com.br", from_name: "THE FULL SCULPT", to: "dest@exemplo.com" });
ok("teste com credenciais certas envia", good.json?.ok === true, JSON.stringify(good.json));
let mails = await waitInbox(1);
ok("mensagem chegou ao servidor com remetente/destinatário", mails.length === 1 && mails[0].to.includes("dest@exemplo.com") && mails[0].from.includes("noreply@thefullsculpt.com.br"));
ok("corpo em HTML/UTF-8 legível", /funcionando/.test(decode(mails[0])) || mails[0].data.includes("multipart/alternative"));
const save = await admin.call("PUT", "/admin/smtp", { enabled: true, host: "127.0.0.1", port: SMTP_PORT, secure: "none", user: "mailer", password: "segredo-smtp-teste", from_email: "noreply@thefullsculpt.com.br", from_name: "THE FULL SCULPT", public_url: "https://thefullsculpt.com.br" });
ok("salva SMTP habilitado (senha não volta)", save.status === 200 && save.json.enabled === true && save.json.has_password === true && !JSON.stringify(save.json).includes("segredo"));
if (DB) {
  const db = new DatabaseSync(DB);
  const raw = db.prepare("SELECT v FROM settings WHERE k = 'smtp'").get().v;
  ok("senha SMTP criptografada no banco", !raw.includes("segredo-smtp-teste") && JSON.parse(raw).pass_enc.length > 30);
}
ok("GET /admin/settings não expõe SMTP", !("smtp" in (await admin.call("GET", "/admin/settings")).json));
ok("URL pública inválida => 422", (await admin.call("PUT", "/admin/smtp", { enabled: true, host: "127.0.0.1", port: SMTP_PORT, secure: "none", from_email: "noreply@thefullsculpt.com.br", public_url: "http://evil" })).status === 422);
const keep = await admin.call("PUT", "/admin/smtp", { enabled: true, host: "127.0.0.1", port: SMTP_PORT, secure: "none", user: "mailer", from_email: "noreply@thefullsculpt.com.br" });
ok("senha em branco mantém a salva", keep.json.has_password === true && (await admin.call("POST", "/admin/smtp/test", { to: "outro@exemplo.com" })).json?.ok === true);

console.log("E-mails automáticos");
await clearInbox();
const reg = new Client();
const email = `novo${Date.now()}@teste.local`;
await reg.call("POST", "/auth/register", { name: "Nova Aluna", email, password: "uma-senha-bem-longa-123", consents: { terms: true, health: true, adult: true }, locale: "en" });
mails = await waitInbox(1);
const subj = (m) => Buffer.from(m.data.match(/Subject: =\?UTF-8\?B\?([^?]+)/)[1], "base64").toString();
ok("cadastro envia e-mail de confirmação (idioma en)", mails.length === 1 && mails[0].to.includes(email) && /Confirm your email/.test(subj(mails[0])));
const vtoken = decode(mails[0]).match(/verificar\/\?token=([a-f0-9]{64})/)?.[1];
ok("e-mail traz o link de confirmação", !!vtoken);
ok("aluno novo começa com e-mail não confirmado", (await reg.call("GET", "/me")).json.profile.emailVerified === false);
ok("assinar exige e-mail confirmado", (await reg.call("POST", "/subscription/activate")).json?.error === "email_not_verified");
await clearInbox();
ok("reenviar confirmação envia novo e-mail", (await reg.call("POST", "/auth/resend-verification")).status === 200 && (await waitInbox(1)).length === 1);
ok("token de confirmação inválido => 400", (await anon("POST", "/auth/verify-email", { token: "0".repeat(64) })).status === 400);
ok("confirma o e-mail pelo link", (await anon("POST", "/auth/verify-email", { token: vtoken })).status === 200 && (await reg.call("GET", "/me")).json.profile.emailVerified === true);
ok("o mesmo link não vale duas vezes", (await anon("POST", "/auth/verify-email", { token: vtoken })).status === 400);
ok("depois de confirmar já pode assinar", (await reg.call("POST", "/subscription/activate")).status === 200);
ok("reenviar depois de confirmado não envia", (await reg.call("POST", "/auth/resend-verification")).json?.verified === true);

console.log("E-mails / layouts no admin");
const em = await admin.call("GET", "/admin/emails");
ok("lista modelos e layout", em.status === 200 && em.json.items.length === 5 && em.json.items.some((i) => i.kind === "verify") && em.json.layout.button === "#161514");
ok("aluno não acessa", (await student.call("GET", "/admin/emails")).status === 403);
ok("layout com cor inválida => 422", (await admin.call("PUT", "/admin/emails/layout", { button: "vermelho" })).status === 422);
ok("salva layout (cor do botão e rodapé)", (await admin.call("PUT", "/admin/emails/layout", { button: "#112233", footer: "Rodapé legal Ltda", brand: "Marca X" })).status === 200);
ok("modelo sem título => 422", (await admin.call("PUT", "/admin/emails/verify/pt", { title: "", body: "x" })).status === 422);
ok("edita o modelo de confirmação (pt)", (await admin.call("PUT", "/admin/emails/verify/pt", { subject: "Valide seu cadastro, {name}", title: "Quase lá", body: "Olá {name}, clique abaixo.", cta: "Validar agora", foot: "Ignore se não foi você." })).status === 200);
const pv = await admin.call("POST", "/admin/emails/preview", { kind: "verify", lang: "pt" });
ok("pré-visualização usa texto e layout salvos", pv.json.subject === "Valide seu cadastro, Marina" && pv.json.html.includes("#112233") && pv.json.html.includes("Marca X") && pv.json.html.includes("Rodapé legal Ltda") && pv.json.html.includes("Validar agora"));
const pv2 = await admin.call("POST", "/admin/emails/preview", { kind: "verify", lang: "pt", content: { title: "<b>Rascunho</b>", body: "Texto livre", cta: "", foot: "" }, layout: { button: "#abcdef" } });
ok("pré-visualização de rascunho escapa HTML e dispensa o botão", pv2.json.html.includes("&lt;b&gt;Rascunho") && !pv2.json.html.includes("<b>Rascunho"));
await clearInbox();
const reg2 = new Client();
await reg2.call("POST", "/auth/register", { name: "Paula Custom", email: `pc${Date.now()}@teste.local`, password: "uma-senha-bem-longa-123", consents: { terms: true, health: true, adult: true }, locale: "pt" });
mails = await waitInbox(1);
ok("cadastro usa o modelo editado", mails.length === 1 && /Valide seu cadastro, Paula/.test(subj(mails[0])) && decode(mails[0]).includes("Olá Paula"));
await clearInbox();
ok("envia e-mail de teste do modelo ao admin", (await admin.call("POST", "/admin/emails/reset/test", { lang: "pt" })).json?.ok === true && (await waitInbox(1)).length === 1);
ok("restaura o texto padrão", (await admin.call("DELETE", "/admin/emails/verify/pt")).status === 200 && (await admin.call("GET", "/admin/emails")).json.items.find((i) => i.kind === "verify").langs.pt.custom === false);
await clearInbox();
ok("esqueci a senha responde igual para e-mail inexistente", (await anon("POST", "/auth/forgot", { email: "ninguem@teste.local" })).status === 200 && (await inbox()).length === 0);
async function anon(m, p, b) {
  return new Client().call(m, p, b);
}
ok("esqueci a senha envia link", (await anon("POST", "/auth/forgot", { email, locale: "es" })).status === 200 && (await waitInbox(1)).length === 1);
const mail = (await waitInbox(1))[0];
const link = decode(mail).match(/redefinir\/\?token=([a-f0-9]{64})/) ?? mail.data.match(/token=([a-f0-9]{64})/);
const token = link?.[1] ?? (Buffer.from(mail.data.replace(/\s/g, ""), "utf8").toString().match(/([a-f0-9]{64})/) ?? [])[1];
ok("link de redefinição presente no e-mail", !!token && /^[a-f0-9]{64}$/.test(token), mail.data.slice(0, 200));
ok("token inválido => 400", (await anon("POST", "/auth/reset", { token: "0".repeat(64), password: "nova-senha-bem-longa-9" })).status === 400);
ok("senha fraca na redefinição => 422", (await anon("POST", "/auth/reset", { token, password: "curta" })).status === 422);
ok("redefine a senha", (await anon("POST", "/auth/reset", { token, password: "nova-senha-bem-longa-9" })).status === 200);
ok("token não pode ser reutilizado", (await anon("POST", "/auth/reset", { token, password: "outra-senha-bem-longa-9" })).status === 400);
ok("sessões antigas caíram", (await reg.call("GET", "/me")).status === 401);
ok("login com a nova senha", (await new Client().login(email, "nova-senha-bem-longa-9")).status === 200 && (await new Client().login(email, "uma-senha-bem-longa-123")).status === 401);

console.log("Banco de dados (admin)");
const dbi = await admin.call("GET", "/admin/database");
ok("informações do banco", dbi.status === 200 && dbi.json.driver && dbi.json.schema === dbi.json.latest_schema && dbi.json.tables.some((t) => t.name === "users") && dbi.json.latency_ms >= 0, JSON.stringify(dbi.json).slice(0, 160));
ok("aluno não vê o banco", (await student.call("GET", "/admin/database")).status === 403);
ok("teste de conexão com dados inválidos", (await admin.call("POST", "/admin/database/test", { host: "bad host!", dbname: "x", user: "u", password: "p" })).json?.ok === false);
ok("trocar banco exige a senha do admin", (await admin.call("PUT", "/admin/database", { host: "localhost", dbname: "x", user: "u", password: "p", admin_password: "errada" })).status === 401);
ok("trocar banco com credenciais inválidas não altera nada", (await admin.call("PUT", "/admin/database", { host: "localhost", dbname: "x", user: "u", password: "p", admin_password: PW })).status === 422 && (await admin.call("GET", "/admin/database")).status === 200);

console.log("Perfil do aluno");
const p0 = await student.call("GET", "/me/profile");
ok("lê o perfil", p0.status === 200 && p0.json.email === "teste@thefullsculpt.com.br" && p0.json.address.country === "BR");
ok("nome curto => 422", (await student.call("PUT", "/me/profile", { name: "A" })).status === 422);
ok("telefone inválido => 422", (await student.call("PUT", "/me/profile", { name: "Marina Duarte", phone: "abc" })).status === 422);
ok("endereço longo demais => 422", (await student.call("PUT", "/me/profile", { name: "Marina Duarte", address: { street: "x".repeat(200) } })).status === 422);
const up = await student.call("PUT", "/me/profile", { name: "Marina Duarte Silva", phone: "+55 11 99999-0000", locale: "es", address: { zip: "01310-100", street: "Av. Paulista", number: "1000", complement: "ap 12", district: "Bela Vista", city: "São Paulo", state: "sp", country: "br" } });
ok("salva perfil", up.status === 200);
const p1 = await student.call("GET", "/me/profile");
ok("perfil atualizado (UF/País normalizados)", p1.json.name === "Marina Duarte Silva" && p1.json.address.state === "SP" && p1.json.address.country === "BR" && p1.json.address.city === "São Paulo" && p1.json.locale === "es");
if (DB) {
  const db = new DatabaseSync(DB);
  const enc = db.prepare("SELECT profile_enc FROM users WHERE email = 'teste@thefullsculpt.com.br'").get().profile_enc;
  ok("endereço criptografado em repouso", enc && !enc.includes("Paulista") && !enc.includes("01310"));
}
ok("e-mail não é alterável por este endpoint", (await student.call("PUT", "/me/profile", { name: "Marina Duarte", email: "outro@x.com" })).status === 200 && (await student.call("GET", "/me/profile")).json.email === "teste@thefullsculpt.com.br");

console.log("Pagamentos do aluno");
const pay = await student.call("GET", "/me/payments");
ok("assinatura e histórico", pay.status === 200 && Array.isArray(pay.json.payments) && pay.json.price_cents > 0 && pay.json.method.type === "card");
ok("meio de pagamento inválido => 422", (await student.call("PUT", "/me/payment-method", { method: "boleto" })).status === 422);
ok("troca para Pix", (await student.call("PUT", "/me/payment-method", { method: "pix" })).status === 200 && (await student.call("GET", "/me/payments")).json.method.type === "pix");
const buyer = new Client();
await buyer.login(email, "nova-senha-bem-longa-9");
await buyer.call("PUT", "/anamnese", { answers: { goal: "sculpt" }, assignment: { phase: 1, medicalClearance: false, restrictions: [] } });
await buyer.call("POST", "/subscription/activate");
const bp = await buyer.call("GET", "/me/payments");
ok("assinatura de teste aparece com próxima cobrança", bp.json.subscription?.status === "active" && bp.json.payments.length === 1 && bp.json.next_charge === undefined && bp.json.subscription.next_charge?.length === 10 && bp.json.total_paid_cents > 0, JSON.stringify(bp.json).slice(0, 200));
ok("cancelar exige confirmação", (await buyer.call("POST", "/me/subscription/cancel", {})).status === 422);
ok("cancela a própria assinatura", (await buyer.call("POST", "/me/subscription/cancel", { confirm: true })).status === 200 && (await buyer.call("GET", "/me")).json.sub === "free");
ok("cancelar de novo => 409", (await buyer.call("POST", "/me/subscription/cancel", { confirm: true })).status === 409);

console.log("Segurança e acessos");
const other = new Client();
await other.login("teste@thefullsculpt.com.br", PW, "Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604");
const acc = await student.call("GET", "/me/access");
ok("lista sessões com dispositivo e marca a atual", acc.status === 200 && acc.json.sessions.length >= 2 && acc.json.sessions.filter((s) => s.current).length === 1 && acc.json.sessions.some((s) => s.device === "Safari · iOS") && acc.json.sessions.some((s) => s.device === "Chrome · Windows"), JSON.stringify(acc.json.sessions));
ok("eventos de acesso com dispositivo", acc.json.events.some((e) => e.action === "login_ok" && e.meta === "Chrome · Windows") && acc.json.events.some((e) => e.action === "profile_updated"));
ok("senha atual errada => 401", (await student.call("PUT", "/me/password", { current: "errada-errada-12", new: "nova-senha-longa-123" })).status === 401);
ok("senha nova fraca => 422", (await student.call("PUT", "/me/password", { current: PW, new: "curta" })).status === 422);
const iosSession = acc.json.sessions.find((s) => s.device === "Safari · iOS");
ok("não encerra a sessão atual por este caminho", (await student.call("DELETE", `/me/sessions/${acc.json.sessions.find((s) => s.current).id}`)).status === 404);
ok("encerra outra sessão", (await student.call("DELETE", `/me/sessions/${iosSession.id}`)).status === 200 && (await other.call("GET", "/me")).status === 401);
const third = new Client();
await third.login("teste@thefullsculpt.com.br");
ok("encerra todas as outras", (await student.call("POST", "/me/sessions/revoke-others")).json?.revoked >= 1 && (await third.call("GET", "/me")).status === 401 && (await student.call("GET", "/me")).status === 200);
ok("altera a senha e mantém a sessão atual", (await student.call("PUT", "/me/password", { current: PW, new: "outra-senha-longa-456" })).status === 200 && (await student.call("GET", "/me")).status === 200);
ok("senha antiga deixa de valer", (await new Client().login("teste@thefullsculpt.com.br", PW)).status === 401 && (await new Client().login("teste@thefullsculpt.com.br", "outra-senha-longa-456")).status === 200);
ok("rotas /me exigem login", (await anon("GET", "/me/profile")).status === 401 && (await anon("GET", "/me/access")).status === 401);

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
