import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phywise",
  description: "Physics tutoring workspace for guided reasoning and simulations."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

