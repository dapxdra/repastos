import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SCRIPT_TEMA } from "@/components/tema";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")),
  applicationName: "Repastos",
  title: { default: "Repastos", template: "%s · Repastos" },
  description: "Gestión de potreros, rotaciones, abonos y tiempos de espera para ganaderías de Costa Rica.",
};

export const viewport: Viewport = {
  themeColor: "#f3ecdc",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CR" className={`${inter.variable} ${jakarta.variable} h-full antialiased`} data-theme="light" suppressHydrationWarning>
      <head>
        {/* Aplica el tema guardado (claro/oscuro/sistema) antes de pintar */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
