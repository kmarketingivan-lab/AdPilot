import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AdPilot — Digital Marketing Hub",
  description:
    "Gestisci social media, campagne ads, CRM, analytics e landing page da un'unica piattaforma.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={cn("dark", "font-sans", geist.variable)}>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
