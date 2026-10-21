import type { Metadata, Viewport } from "next";
import "./globals.css";
import Pwa from "@/components/pwa";
export const metadata: Metadata = {
  title: "MY WORK AI — 오늘의 중요한 일",
  description: "목표부터 오늘의 실행까지, 나만의 업무 비서",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: {
    capable: true,
    title: "MY WORK AI",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f7f9",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Pwa />
      </body>
    </html>
  );
}
