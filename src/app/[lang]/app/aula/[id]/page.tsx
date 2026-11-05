import { LESSONS_PER_PHASE, lessonId } from "@/lib/phases";
import LessonClient from "./LessonClient";

export const dynamicParams = false;

export function generateStaticParams() {
  return Array.from({ length: 9 }, (_, p) =>
    Array.from({ length: LESSONS_PER_PHASE }, (_, n) => ({ id: lessonId(p + 1, n + 1) })),
  ).flat();
}

export default function LessonPage() {
  return <LessonClient />;
}
