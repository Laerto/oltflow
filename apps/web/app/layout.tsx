import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OLTFlow",
  description: "Menaxhimi, monitorimi dhe troubleshooting i OLT/ONU (ZTE C300/C320)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sq" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
