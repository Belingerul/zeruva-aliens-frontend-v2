import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Zeruva — Alien Ecosystem on Solana",
  description: "Hatch aliens, earn passive SOL, and compete in high-stakes expeditions. Two realms, one wallet.",
  generator: "zeruva.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

// Make sure mobile devices render at the real device width.
// (Next usually does the right thing, but being explicit avoids surprises.)
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: browser extensions and the iOS Phantom WKWebView
    // inject attributes onto <html>/<body> (e.g. style="-webkit-text-size-adjust:100%")
    // before React hydrates. This suppresses the warning for THIS element's own
    // attributes only (not children), so real mismatches below still surface.
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased`} suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
