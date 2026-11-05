"use client";

import { useApi } from "@/lib/admin";
import { PageHead, Spinner } from "@/components/admin/ui";
import { Commissions, Consults, type Settings } from "@/components/admin/settings";

export default function ConfigGeral() {
  const { data, reload } = useApi<Settings>("/admin/settings");
  if (!data) return <div className="flex justify-center py-32"><Spinner /></div>;
  return (
    <div>
      <PageHead eyebrow="Configurações" title="Geral" sub="Regras de comissão dos professores e o funcionamento das consultas online." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Commissions s={data} onSaved={reload} />
        <Consults s={data} onSaved={reload} />
      </div>
    </div>
  );
}
