import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/navigation";
import { Providers } from "@/components/providers";
import UmamiAnalytics from "@/components/umami-analytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LoL Bootcamp Tracker",
  description: "Track League of Legends Korean bootcampers in real-time",
  keywords: ["LoL", "Bootcamp", "Tracker", "Korean", "League of Legends", "Esports", "Korea", "Gaming", 
    "Korean Solo Queue", "Korean Ranked", "LoL Stats", "LoL Analytics", "LoL Performance", "Korean Esports",
    "LoL Bootcamp Tracker"],
  authors: [{ name: "Romit Sagu", url: "https://romitsagu.com" }],
  creator: "Romit Sagu",
  openGraph: {
    title: "LoL Bootcamp Tracker",
    description: "Track League of Legends Korean bootcampers in real-time",
    url: process.env.NEXT_PUBLIC_BASE_URL || "https://lol-bootcamp-tracker.romitsagu.com/",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <UmamiAnalytics />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white min-h-screen`}
      >
        <Providers>
          <Navigation />
          <main className="min-h-screen">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
