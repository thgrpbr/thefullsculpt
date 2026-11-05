"use client";

import { num, useApi } from "@/lib/admin";
import { Card, KV, PageHead, Spinner } from "@/components/admin/ui";
import { DemoData, type System } from "@/components/admin/settings";
import { DatabaseCard } from "@/components/admin/SystemSettings";

export default function ConfigSistema() {
  const sys = useApi<System>("/admin/system");
  if (!sys.data) return <div className="flex justify-center py-32"><Spinner /></div>;
  const s = sys.data;
  return (
    <div>
      <PageHead eyebrow="Configurações" title="Banco de dados e sistema" sub="Conexão com o banco, dados de demonstração e informações técnicas do servidor." />
      <div className="grid gap-4 xl:grid-cols-2">
        <DatabaseCard />
        <DemoData sys={s} onChanged={sys.reload} />
        <Card title="Informações do sistema" sub="Servidor e volume de dados" className="xl:col-span-2">
          <div className="grid gap-x-10 sm:grid-cols-2">
            <div>
              <KV k="PHP" v={s.php} />
              <KV k="Banco de dados" v={s.db === "mysql" ? "MySQL" : s.db} />
              <KV k="Versão do esquema" v={`v${s.schema}`} />
              <KV k="Hora do servidor (UTC)" v={s.time.slice(0, 19).replace("T", " ")} />
            </div>
            <div>
              {Object.entries({ students: "Alunos", teachers: "Professores", admins: "Administradores", lessonLogs: "Aulas concluídas", payments: "Pagamentos", appointments: "Consultas", exercises: "Exercícios", lessons: "Aulas no método" }).map(([k, l]) => <KV key={k} k={l} v={num(s.counts[k])} />)}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
