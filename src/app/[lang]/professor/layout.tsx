import Shell from "@/components/admin/Shell";

export const metadata = { title: "Painel do professor", robots: { index: false, follow: false } };

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <Shell role="teacher">{children}</Shell>;
}
