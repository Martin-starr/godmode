export const metadata = {
  title: "Verminord",
  description: "Drift · Verminord AS",
  applicationName: "Verminord",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#101A30" },
  ],
};

// Each app brings its own stylesheet: app/(dash)/dash.css for the phone
// dashboard, app/gammel/layout.js keeps globals.css for the old tabs. They
// are never on the same page (links between them are full page loads).
export default function RootLayout({ children }) {
  return (
    <html lang="nb" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
