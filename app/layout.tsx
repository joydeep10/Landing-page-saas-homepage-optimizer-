import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Landing page copy audit",
  description: "Capture one landing page for a controlled local copy-audit preview.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
