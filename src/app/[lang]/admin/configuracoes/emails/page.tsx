"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { PageHead, Tabs } from "@/components/admin/ui";
import { SmtpCard } from "@/components/admin/SystemSettings";
import { EmailTemplates } from "@/components/admin/EmailTemplates";

/** Tudo de e-mail em um só lugar: servidor de envio, entregabilidade (SPF/DKIM/DMARC), modelos e layout. */
export default function ConfigEmails() {
  const role = useStore((s) => s.role);
  const perms = useStore((s) => s.perms);
  const canTemplates = role === "admin" || perms.includes("emails.manage");
  const canServer = role === "admin" || perms.includes("system.manage");
  const [tab, setTab] = useState<"modelos" | "servidor">(canTemplates ? "modelos" : "servidor");
  return (
    <div>
      <PageHead eyebrow="Configurações" title="E-mails" sub="Servidor de envio, entregabilidade, modelos de mensagem e o layout visual dos e-mails da plataforma." />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} items={[...(canTemplates ? [{ value: "modelos" as const, label: "Modelos e layout" }] : []), ...(canServer ? [{ value: "servidor" as const, label: "Servidor e entrega (SMTP, SPF, DKIM)" }] : [])]} />
      </div>
      {tab === "modelos" && canTemplates && <EmailTemplates />}
      {tab === "servidor" && canServer && <div className="max-w-3xl"><SmtpCard /></div>}
    </div>
  );
}
