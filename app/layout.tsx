export const metadata = { title: "Fluent", description: "Voice coaching for non-native English speakers" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f5f4ff", color: "#1a1a2a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  );
}
