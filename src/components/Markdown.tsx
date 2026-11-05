import type { ReactNode } from "react";

/** Renderizador de Markdown mínimo e SEGURO (sem HTML cru): títulos, listas, tabelas, negrito, itálico e código. */

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={i++} className="font-medium">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={i++} className="rounded bg-surface2 px-1 py-0.5 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else out.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      const cls = lvl === 1 ? "font-display text-4xl leading-tight mb-4" : lvl === 2 ? "font-display mt-8 mb-2 text-2xl" : "mt-5 mb-1 text-[15px] font-medium";
      blocks.push(lvl === 1 ? <h1 key={k++} className={cls}>{inline(h[2])}</h1> : lvl === 2 ? <h2 key={k++} className={cls}>{inline(h[2])}</h2> : <h3 key={k++} className={cls}>{inline(h[2])}</h3>);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(<ul key={k++} className="my-3 list-disc space-y-1.5 pl-6">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      blocks.push(<ol key={k++} className="my-3 list-decimal space-y-1.5 pl-6">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>);
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push(
        <div key={k++} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead><tr>{rows[0].map((c, j) => <th key={j} className="border-b-[0.5px] border-line px-3 py-2 text-left font-medium">{inline(c)}</th>)}</tr></thead>
            <tbody>{rows.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border-b-[0.5px] border-line px-3 py-2 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,3}\s|\s*[-*]\s|\s*\d+\.\s|\|)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k++} className="my-3 leading-relaxed">{inline(para.join(" "))}</p>);
  }
  return <div className={className}>{blocks}</div>;
}
