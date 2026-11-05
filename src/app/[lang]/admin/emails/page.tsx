"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { Spinner } from "@/components/admin/ui";

/** O editor de e-mails agora fica em Configurações > E-mails. Mantém o endereço antigo funcionando. */
export default function Moved() {
  const { href } = useI18n();
  const router = useRouter();
  useEffect(() => { router.replace(href("/admin/configuracoes/emails")); }, [router, href]);
  return <div className="flex justify-center py-32"><Spinner /></div>;
}
