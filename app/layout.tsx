import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Hygiene Agent",
  description: "Agent-assisted CRM quality control for revenue teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
