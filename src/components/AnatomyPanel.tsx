"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { EXERCISES, type MuscleId, type MuscleRole } from "@/lib/exercises";
import type { Pose } from "@/lib/pose";
import { useI18n } from "@/i18n/provider";
import { Segmented } from "./ui";
import type { Layer, ViewPreset } from "./Anatomy3D";

const Anatomy3D = dynamic(() => import("./Anatomy3D"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-surface" />,
});

const ROLE_DOT: Record<MuscleRole, string> = { primary: "#E2563B", secondary: "#C79A68", stabilizer: "#8C877E" };

export default function AnatomyPanel({
  exerciseId,
  playing,
  resetKey,
  speed = 1,
  defaultLayer = "muscle",
  className = "",
  showMetrics = true,
}: {
  exerciseId: string;
  playing: boolean;
  resetKey?: number | string;
  speed?: number;
  defaultLayer?: Layer;
  className?: string;
  showMetrics?: boolean;
}) {
  const { t } = useI18n();
  const ex = EXERCISES[exerciseId];
  const [layer, setLayer] = useState<Layer>(defaultLayer);
  const [view, setView] = useState<ViewPreset>("angle");
  const [ik, setIk] = useState(false);
  const [hover, setHover] = useState<MuscleId | null>(null);
  const [metrics, setMetrics] = useState<Pose["metrics"] | null>(null);

  const groups: [MuscleRole, MuscleId[]][] = [
    ["primary", ex.primary],
    ["secondary", ex.secondary],
    ["stabilizer", ex.stabilizers],
  ];

  return (
    <section className={`theme-dark relative overflow-hidden rounded-[28px] border-[0.5px] border-line ${className}`} aria-label={t("anatomy.title")}>
      <div className="absolute inset-0">
        <Anatomy3D
          exerciseId={exerciseId}
          playing={playing}
          layer={layer}
          showIK={ik}
          view={view}
          resetKey={resetKey}
          speed={speed}
          hoverMuscle={hover}
          onHover={setHover}
          onMetrics={showMetrics ? setMetrics : undefined}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto">
          <Segmented<Layer>
            label={t("anatomy.layers")}
            value={layer}
            onChange={setLayer}
            options={[
              { value: "skin", label: t("anatomy.skin") },
              { value: "muscle", label: t("anatomy.muscle") },
              { value: "skeleton", label: t("anatomy.skeleton") },
            ]}
          />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Segmented<ViewPreset>
            label={t("anatomy.views")}
            value={view}
            onChange={setView}
            options={[
              { value: "side", label: t("anatomy.side") },
              { value: "angle", label: "3/4" },
              { value: "front", label: t("anatomy.front") },
            ]}
          />
          <button
            type="button"
            aria-pressed={ik}
            onClick={() => setIk((v) => !v)}
            className={`rounded-full border-[0.5px] border-line px-3 py-1.5 text-[12px] backdrop-blur transition-colors ${ik ? "bg-bronze text-[#161514]" : "bg-surface/70 text-muted hover:text-fg"}`}
          >
            IK
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3">
        {showMetrics && metrics && (
          <div className="flex gap-4 text-[11px] text-muted" aria-live="off">
            <span>{t("anatomy.knee")} <b className="font-normal text-fg">{metrics.knee}°</b></span>
            <span>{t("anatomy.hip")} <b className="font-normal text-fg">{metrics.hip}°</b></span>
            <span>{t("anatomy.trunk")} <b className="font-normal text-fg">{metrics.trunk}°</b></span>
          </div>
        )}
        <div className="pointer-events-auto flex flex-wrap gap-x-4 gap-y-1.5">
          {groups.map(([role, ids]) =>
            ids.map((id) => (
              <button
                key={`${role}-${id}`}
                type="button"
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(id)}
                onBlur={() => setHover(null)}
                className={`flex items-center gap-1.5 text-[12px] transition-colors ${hover === id ? "text-fg" : "text-muted"}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: ROLE_DOT[role] }} aria-hidden="true" />
                {t(`muscle.${id}`)}
                <span className="sr-only">{t(`anatomy.${role}`)}</span>
              </button>
            )),
          )}
        </div>
        <div className="flex gap-3 text-[10px] uppercase tracking-[0.16em] text-muted">
          {groups.map(([role]) => (
            <span key={role} className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: ROLE_DOT[role] }} aria-hidden="true" />
              {t(`anatomy.${role}`)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
