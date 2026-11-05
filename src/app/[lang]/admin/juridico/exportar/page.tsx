"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import Markdown from "@/components/Markdown";
import { useI18n } from "@/i18n/provider";
import { dateBr, useApi } from "@/lib/admin";
import { Badge, Spinner } from "@/components/admin/ui";

interface Exp {
  generatedAt: string;
  docs: { slug: string; title: string; category: string; required: boolean; version: number | null; status: string | null; updated_at: string | null; content: Record<string, string>; comments: { author_name: string; body: string; resolved: number; created_at: string }[] }[];
}
const ST: Record<string, string> = { draft: "Rascunho", review: "Em revisão", approved: "Aprovado", published: "Publicado", archived: "Arquivado" };

/** Visão única, em ordem, de TODOS os documentos jurídicos + comentários — pronta para imprimir ou salvar em PDF. */
export default function LegalExport() {
  const { href } = useI18n();
  const { data } = useApi<Exp>("/admin/legal/export");
  if (!data) return <div className="flex justify-center py-32"><Spinner /></div>;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={href("/admin/juridico")} className="text-[13px] text-muted underline underline-offset-4">← Voltar ao Jurídico</Link>
        <button type="button" onClick={() => window.print()} className="btn btn-primary !h-10"><Printer size={15} aria-hidden="true" />Imprimir / salvar PDF</button>
      </div>
      <h1 className="font-display text-5xl">THE FULL SCULPT</h1>
      <p className="mt-1 text-[14px] text-muted">Dossiê jurídico para revisão · gerado em {dateBr(data.generatedAt.replace("T", " ").slice(0, 19))} · {data.docs.length} documentos</p>

      <h2 className="font-display mt-10 text-3xl">Índice</h2>
      <table className="mt-3 w-full border-collapse text-[13px]">
        <thead><tr className="text-left text-muted"><th className="border-b-[0.5px] border-line py-2 font-normal">Documento</th><th className="border-b-[0.5px] border-line py-2 font-normal">Situação</th><th className="border-b-[0.5px] border-line py-2 font-normal">Versão</th><th className="border-b-[0.5px] border-line py-2 font-normal">Comentários abertos</th></tr></thead>
        <tbody>
          {data.docs.map((d) => (
            <tr key={d.slug}><td className="border-b-[0.5px] border-line py-2">{d.title}{d.required ? " *" : ""}</td><td className="border-b-[0.5px] border-line py-2">{ST[d.status ?? ""] ?? "–"}</td><td className="border-b-[0.5px] border-line py-2">v{d.version ?? "–"}</td><td className="border-b-[0.5px] border-line py-2">{d.comments.filter((c) => !c.resolved).length}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted">* documento essencial para o lançamento.</p>

      {data.docs.map((d) => (
        <section key={d.slug} className="mt-14 break-before-page">
          <p className="eyebrow">{d.category} · {ST[d.status ?? ""] ?? "–"} · v{d.version ?? "–"} {d.required && <Badge tone="dark">essencial</Badge>}</p>
          <div className="mt-3 text-[14px]"><Markdown text={d.content.pt || "_(sem texto em português)_"} /></div>
          {["en", "es"].map((l) => d.content[l]?.trim() && (
            <div key={l} className="mt-8 border-t-[0.5px] border-line pt-4">
              <p className="eyebrow mb-2">Versão em {l === "en" ? "inglês" : "espanhol"}</p>
              <div className="text-[13px]"><Markdown text={d.content[l]} /></div>
            </div>
          ))}
          {d.comments.length > 0 && (
            <div className="mt-8 rounded-2xl border-[0.5px] border-line p-5">
              <p className="eyebrow mb-2">Comentários do advogado</p>
              <ul className="space-y-2 text-[13px]">{d.comments.map((c, i) => <li key={i} className={c.resolved ? "text-muted line-through" : ""}>{c.body}<span className="ml-2 text-[11px] text-muted no-underline">— {c.author_name}, {dateBr(c.created_at)}{c.resolved ? " (resolvido)" : ""}</span></li>)}</ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
