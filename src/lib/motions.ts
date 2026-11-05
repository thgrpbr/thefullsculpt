"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { MotionDef } from "./motion";

let cache: Record<string, MotionDef> | null = null;
let inflight: Promise<Record<string, MotionDef>> | null = null;

function load(): Promise<Record<string, MotionDef>> {
  if (cache) return Promise.resolve(cache);
  inflight ??= api<{ rigs: Record<string, MotionDef> }>("GET", "/motions")
    .then((r) => (cache = r.rigs ?? {}))
    .catch(() => (cache = {}))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Movimentos 3D personalizados no Estúdio (Admin). Sem rig salvo, o app usa o movimento padrão do exercício. */
export function useMotions(): Record<string, MotionDef> {
  const [m, setM] = useState<Record<string, MotionDef>>(cache ?? {});
  useEffect(() => {
    let alive = true;
    void load().then((r) => alive && setM(r));
    return () => {
      alive = false;
    };
  }, []);
  return m;
}
