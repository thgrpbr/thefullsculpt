"use client";

import { useRef, useState, type ReactNode } from "react";
import { poseFromKey, type Key, type MotionDef } from "@/lib/motion";
import type { V } from "@/lib/pose";

const S = 180; // px por metro
const OX = 190;
const OY = 372;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const toSvg = (v: V): [number, number] => [OX + v.x * S, OY - v.y * S];

/**
 * Vista lateral editável: arraste as alças (quadril, ombro/tronco, cabeça, mão). Joelho e cotovelo saem da cinemática inversa.
 * `underlay` (ex.: o vídeo da instrutora) aparece atrás do desenho para traçar o movimento por cima.
 */
export function SideEditor({ def, idx, setKey, underlay, showGhosts = true }: { def: MotionDef; idx: number; setKey: (i: number, k: Partial<Key>) => void; underlay?: ReactNode; showGhosts?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<"hip" | "neck" | "head" | "hand" | null>(null);
  const k = def.keys[idx];
  const pose = poseFromKey(def, k);
  const J = pose.j;
  const P = (v: V) => toSvg(v).join(",");
  const ghost = (key: Key) => {
    const g = poseFromKey(def, key).j;
    return [[g.heel, g.toe], [g.ankle, g.knee, g.hip, g.neck, g.head], [g.shoulder, g.elbow, g.wrist]];
  };
  const withVideo = !!underlay;
  const ink = withVideo ? "#ffffff" : "currentColor";

  function world(e: React.PointerEvent): V {
    const r = box.current!.getBoundingClientRect();
    return { x: ((((e.clientX - r.left) / r.width) * 400) - OX) / S, y: (OY - ((e.clientY - r.top) / r.height) * 400) / S };
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const w = world(e);
    if (drag === "hip") setKey(idx, { hip: { x: r4(clamp(w.x, -1.5, 1.5)), y: r4(clamp(w.y, 0.1, 1.6)) } });
    else if (drag === "hand") setKey(idx, { hand: { x: r4(clamp(w.x, -1.5, 1.5)), y: r4(clamp(w.y, -0.2, 2.4)) } });
    else if (drag === "neck") setKey(idx, { lean: r4(clamp(Math.atan2(w.x - k.hip.x, w.y - k.hip.y), -1.6, 1.6)) });
    else setKey(idx, { headLean: r4(clamp(Math.atan2(w.x - J.neck.x, w.y - J.neck.y), -1.6, 1.6)) });
  }
  const handle = (kind: NonNullable<typeof drag>, v: V, label: string, color: string) => {
    const [x, y] = toSvg(v);
    return (
      <g key={kind} onPointerDown={(e) => { box.current?.setPointerCapture(e.pointerId); setDrag(kind); }} style={{ cursor: drag === kind ? "grabbing" : "grab" }} role="slider" aria-label={label} tabIndex={0}>
        <circle cx={x} cy={y} r={18} fill="transparent" />
        <circle cx={x} cy={y} r={drag === kind ? 9 : 7} fill={color} stroke="#fff" strokeWidth={2} />
      </g>
    );
  };

  return (
    <div ref={box} className={`relative mx-auto aspect-square w-full max-w-[440px] touch-none select-none overflow-hidden rounded-2xl ${withVideo ? "bg-black" : "bg-surface2"}`} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
      {underlay}
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" style={{ color: withVideo ? "#fff" : undefined }} aria-label="Editor da pose, vista lateral">
        <line x1={10} y1={OY} x2={390} y2={OY} stroke={ink} strokeOpacity={0.35} />
        {[0, 0.5, 1, 1.5, 2].map((m) => <g key={m}><line x1={OX - 3} y1={OY - m * S} x2={OX + 3} y2={OY - m * S} stroke={ink} strokeOpacity={0.4} /><text x={OX + 8} y={OY - m * S + 3} fontSize={8} fill={ink} opacity={0.5}>{m} m</text></g>)}
        {showGhosts && def.keys.map((kk, i) => i !== idx && ghost(kk).map((seg, n) => <polyline key={`${i}-${n}`} points={seg.map(P).join(" ")} fill="none" stroke={ink} strokeOpacity={0.14} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />))}
        <polyline points={`${P(J.heel)} ${P(J.toe)}`} fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" />
        <polyline points={[J.ankle, J.knee, J.hip, J.neck, J.head].map(P).join(" ")} fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={[J.shoulder, J.elbow, J.wrist].map(P).join(" ")} fill="none" stroke={ink} strokeOpacity={0.75} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        {[J.knee, J.elbow].map((j, i) => <circle key={i} cx={toSvg(j)[0]} cy={toSvg(j)[1]} r={4} fill={ink} opacity={0.7} />)}
        {handle("hip", J.hip, "Quadril", "#C79A68")}
        {handle("neck", J.neck, "Ombro e tronco", "#3b6fa5")}
        {handle("head", J.head, "Cabeça", "#7a5aa6")}
        {handle("hand", k.hand, "Mão", "#E2563B")}
        <g fontSize={10} fill={ink} opacity={0.75}>
          <text x={12} y={18}>joelho {pose.metrics.knee}° · quadril {pose.metrics.hip}° · tronco {pose.metrics.trunk}°</text>
          <text x={12} y={32}>cotovelo {pose.metrics.elbow}° · ombro {pose.metrics.shoulder}°</text>
        </g>
      </svg>
    </div>
  );
}
