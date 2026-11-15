import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG Notes",
  description: "Upload documents to a knowledge base and ask questions about them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
