"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { X } from "lucide-react";
import Player from "@/components/Player";
import { useI18n } from "@/i18n/provider";
import { lessonId } from "@/lib/phases";
import { useStore } from "@/lib/store";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const { href } = useI18n();
  const router = useRouter();
  const sub = useStore((s) => s.sub);
  const phase = useStore((s) => s.assignment?.phase ?? 1);
  const isFree = id === lessonId(phase, 1);
  const allowed = sub === "active" || isFree;

  useEffect(() => {
    if (!allowed) router.replace(href("/assine"));
  }, [allowed, router, href]);

  if (!allowed) return null;

  return (
    <div className="relative min-h-dvh">
      <Link href={href("/app")} aria-label="Close" className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border-[0.5px] border-line bg-bg/80 backdrop-blur">
        <X size={18} />
      </Link>
      <Player lessonId={id} free={isFree && sub !== "active"} />
    </div>
  );
}
