import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export const metadata: Metadata = {
  title: "Командировки",
  description: "Расходы в командировках без бумажной рутины",
  applicationName: "Командировки",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Командировки" },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  themeColor: "#2563eb"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
