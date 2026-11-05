import Shell from "@/components/admin/Shell";

export const metadata = { title: "Gestão", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Shell role="admin">{children}</Shell>;
}
