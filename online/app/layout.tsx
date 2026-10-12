import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "콜럼버스 한국학교",
  description: "Private parent and teacher homework exchange.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
