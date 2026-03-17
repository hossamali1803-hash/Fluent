import type { Metadata } from "next";

const BASE_URL = "https://fluent-production-63b4.up.railway.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "Fluent — Practice real conversations",
  description: "Speak with an AI that plays the other person. Practice English or German through real scenarios — interviews, restaurants, travel and more.",
  openGraph: {
    title: "Fluent — Practice real conversations",
    description: "Speak with an AI that plays the other person. Practice English or German through real scenarios.",
    type: "website",
    url: BASE_URL,
    images: [{ url: `${BASE_URL}/opengraph-image`, width: 1200, height: 630, alt: "Fluent" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fluent — Practice real conversations",
    description: "Speak with an AI that plays the other person. Practice English or German through real scenarios.",
    images: [`${BASE_URL}/opengraph-image`],
  },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Fluent" />
        <meta name="theme-color" content="#8b5cf6" />
      </head>
      <body style={{ margin: 0, background: "#f5f4ff", color: "#1a1a2a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  );
}
