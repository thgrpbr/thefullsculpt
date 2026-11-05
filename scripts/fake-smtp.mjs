// Servidor SMTP falso para testes (sem TLS, AUTH LOGIN). Guarda as mensagens em memória e expõe GET /inbox em HTTP.
// Uso: node scripts/fake-smtp.mjs [smtpPort=2525] [httpPort=2526]
import net from "node:net";
import http from "node:http";

const smtpPort = Number(process.argv[2] ?? 2525);
const httpPort = Number(process.argv[3] ?? 2526);
const USER = "mailer";
const PASS = "segredo-smtp-teste";
const inbox = [];

net.createServer((sock) => {
  let buf = "";
  let state = "cmd";
  let authStep = 0;
  let msg = { from: "", to: "", data: "" };
  const w = (s) => sock.write(s + "\r\n");
  w("220 fake.smtp ESMTP");
  sock.on("data", (d) => {
    buf += d.toString("utf8");
    while (true) {
      if (state === "data") {
        const i = buf.indexOf("\r\n.\r\n");
        if (i < 0) return;
        msg.data = buf.slice(0, i);
        buf = buf.slice(i + 5);
        inbox.push(msg);
        msg = { from: "", to: "", data: "" };
        state = "cmd";
        w("250 queued");
        continue;
      }
      const i = buf.indexOf("\r\n");
      if (i < 0) return;
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (authStep > 0) {
        const v = Buffer.from(line, "base64").toString();
        if (authStep === 1) {
          authStep = v === USER ? 2 : -1;
          w("334 UGFzc3dvcmQ6");
        } else {
          const ok = authStep === 2 && v === PASS;
          authStep = 0;
          w(ok ? "235 ok" : "535 auth failed");
        }
        continue;
      }
      if (authStep === -1) continue;
      const up = line.toUpperCase();
      if (up.startsWith("EHLO")) w("250-fake.smtp\r\n250 AUTH LOGIN");
      else if (up === "AUTH LOGIN") {
        authStep = 1;
        w("334 VXNlcm5hbWU6");
      } else if (up.startsWith("MAIL FROM")) {
        msg.from = line.slice(10);
        w("250 ok");
      } else if (up.startsWith("RCPT TO")) {
        msg.to = line.slice(8);
        w("250 ok");
      } else if (up === "DATA") {
        state = "data";
        w("354 go");
      } else if (up === "QUIT") {
        w("221 bye");
        sock.end();
      } else w("250 ok");
    }
  });
  sock.on("error", () => {});
}).listen(smtpPort, "127.0.0.1");

http.createServer((req, res) => {
  if (req.url.startsWith("/gw")) {
    // gateway de pagamento falso: credencial contendo "good" => 200, senão 401
    const auth = String(req.headers.authorization ?? "");
    const decoded = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString() : auth;
    const key = decoded + String(req.headers["access_token"] ?? "");
    res.statusCode = key.includes("good") ? 200 : 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: res.statusCode === 200 }));
  }
  if (req.url === "/clear") inbox.length = 0;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(inbox));
}).listen(httpPort, "127.0.0.1");
console.log(`fake smtp :${smtpPort} · inbox http :${httpPort}`);
