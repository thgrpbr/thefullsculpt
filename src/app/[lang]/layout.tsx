import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Inter, Instrument_Serif } from "next/font/google";
import "../globals.css";
import { hasLocale, localeMeta, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { CookieNotice } from "@/components/LegalBits";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["300", "400", "500"] });
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    title: { default: "THE FULL SCULPT", template: "%s · THE FULL SCULPT" },
    description: (dict.meta as { description: string }).description,
    metadataBase: new URL("https://www.thefullsculpt.com.br"),
    alternates: {
      languages: Object.fromEntries(locales.map((l) => [localeMeta[l].html, `/${l}`])),
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#0f0e0d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <html lang={localeMeta[lang].html} className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-dvh">
        <I18nProvider lang={lang} dict={dict}>
          {children}
          <CookieNotice />
        </I18nProvider>
      </body>
    </html>
  );
}
