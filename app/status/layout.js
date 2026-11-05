import "./status.css";

export const metadata = {
  title: "Driftsstatus · Verminord",
  description: "Levende driftsstatus for Verminords anlegg på Jæren.",
  robots: { index: false, follow: false },
};

// The public status page: no login, no navigation, its own stylesheet.
export default function StatusLayout({ children }) {
  return children;
}
