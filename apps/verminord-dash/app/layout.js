import "./globals.css";

export const metadata = {
  title: "Verminord · Intern",
  description: "Internt driftsdashbord for Verminord AS",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c3a5c",
};

export default function RootLayout({ children }) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
