import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OLTFlow",
  description: "Menaxhimi, monitorimi dhe troubleshooting i OLT/ONU (ZTE C300/C320)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sq" className="h-full">
      <body className="min-h-full bg-slate-100 font-sans text-slate-900 antialiased">{children}</body>
    </html>
  );
}
