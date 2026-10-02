import type { Metadata, Viewport } from "next";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "AnubhavPramaan",
  description:
    "AI-assisted Recognition of Prior Learning: a worker speaks their experience in Hindi, the tool maps it to an NSQF Qualification Pack, and the assessor scores and signs. The AI suggests, the assessor decides.",
};

export const viewport: Viewport = {
  themeColor: "#1b2559",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hi">
      <body className="bg-paper text-ink min-h-screen font-sans antialiased">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
