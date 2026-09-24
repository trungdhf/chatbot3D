import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Linh — bạn chat 3D",
  description: "Tán gẫu, trêu đùa, đố vui với cô bạn avatar 3D (VRM).",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
