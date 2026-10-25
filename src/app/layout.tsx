import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitness Blueprint",
  description:
    "Book sessions, track progress, and stay connected with your coaches at Fitness Blueprint.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fitness Blueprint",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Render every page per request, never at build time: the CSP's script
  // nonce is made fresh per request (proxy.ts), and a page prerendered at
  // build time has no nonce on its scripts, so the browser would block them
  // (/login, /signup and /privacy were static).
  await connection();
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
