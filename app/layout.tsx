import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golden Coast Syndicate",
  description: "Lightweight feature-rich open-world prototype built with Next.js, Node APIs, and Three.js."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
