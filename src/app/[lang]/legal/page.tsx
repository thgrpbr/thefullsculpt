"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Markdown from "@/components/Markdown";
import { LegalFooter } from "@/components/LegalBits";
import { LangSwitch, Wordmark } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { useApi } from "@/lib/admin";

interface Index { docs: { slug: string; title: string; category: string; version: number; published_at: string }[] }
interface Doc { slug: string; title: string; version: number; published_at: string; lang: string; content: string; langs: string[] }

export default function Page() {
  return (
    <Suspense fallback={<div className="theme-light min-h-dvh" />}>
      <Legal />
    </Suspense>
  );
}

function Legal() {
  const { href, lang } = useI18n();
  const sp = useSearchParams();
  const slug = sp.get("doc");
  const list = useApi<Index>(slug ? null : "/legal");
  const doc = useApi<Doc>(slug && /^[a-z_]{2,40}$/.test(slug) ? `/legal/${slug}?lang=${lang}` : null);
  const loc = lang === "pt" ? "pt-BR" : lang;
  const date = (s: string) => new Intl.DateTimeFormat(loc, { dateStyle: "long", timeZone: "UTC" }).format(new Date(s.replace(" ", "T") + "Z"));

  return (
    <div className="theme-light min-h-dvh">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <Link href={href("/")}><Wordmark size="sm" /></Link>
        <LangSwitch />
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-8">
        {slug ? (
          doc.error ? (
            <div className="py-20 text-center">
              <h1 className="font-display text-4xl">Documento indisponível</h1>
              <p className="mt-3 text-muted">Este documento ainda não foi publicado.</p>
              <Link href={href("/legal")} className="btn btn-ghost mt-8">Ver documentos</Link>
            </div>
          ) : doc.data ? (
            <article>
              <p className="eyebrow">Versão {doc.data.version} · publicado em {date(doc.data.published_at)}</p>
              <div className="mt-4 text-[15px]"><Markdown text={doc.data.content} /></div>
              <Link href={href("/legal")} className="mt-12 inline-block text-[13px] text-muted underline underline-offset-4">Todos os documentos</Link>
            </article>
          ) : <p className="py-20 text-center text-muted">…</p>
        ) : (
          <>
            <h1 className="font-display text-5xl">Documentos legais</h1>
            <p className="mt-3 text-muted">Transparência sobre como tratamos seus dados e as regras do serviço.</p>
            <ul className="mt-10 divide-y divide-line overflow-hidden rounded-[20px] border-[0.5px] border-line bg-surface">
              {(list.data?.docs ?? []).map((d) => (
                <li key={d.slug}><Link href={href(`/legal?doc=${d.slug}`)} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface2"><span>{d.title}</span><span className="text-[12px] text-muted">v{d.version}</span></Link></li>
              ))}
              {list.data && list.data.docs.length === 0 && <li className="px-5 py-10 text-center text-[14px] text-muted">Os documentos estão em revisão e serão publicados em breve.</li>}
            </ul>
          </>
        )}
        <div className="mt-16 border-t-[0.5px] border-line pt-8"><LegalFooter /></div>
      </main>
    </div>
  );
}
