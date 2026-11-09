import type { Metadata, Viewport } from "next";
import { Prompt, Sarabun } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ศูนย์ข้อมูลน้ำท่วมและโครงข่ายทางหลวง แขวงทางหลวงปัตตานี",
  description: "ระบบแผนที่รายงานสถานการณ์น้ำท่วมและเส้นทางเลี่ยง แขวงทางหลวงปัตตานี กรมทางหลวง",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${prompt.variable} ${sarabun.variable} dark`}>
      <body className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950 font-sans">
        <QueryProvider>{children}</QueryProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  var bp = '${process.env.BASE_PATH || ''}';
                  navigator.serviceWorker.register(bp + '/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
