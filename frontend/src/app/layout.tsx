import type { Metadata } from "next";
import { Newsreader, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// next/font handles subsetting, self-hosting, and CLS-free loading.
// Weights/styles here match the glosse-design spec.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "glosse",
  description: "AI that helps you think while you read.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      {/*
        `data-surface` drives the surface mode (novel / study / article /
        focus). Defaults to novel; a client-side switcher updates it via
        `document.body.dataset.surface = "study"`.
        LATER: persist the chosen surface in localStorage + hydrate on mount.
      */}
      <body data-surface="novel" className="min-h-full">{children}</body>
    </html>
  );
}
