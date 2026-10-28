import "../globals.css";

export const metadata = {
  title: "Verminord · Intern",
  description: "Internt driftsdashbord for Verminord AS",
};

// The pre-v1 dashboard, unchanged, reachable from Mer. Its own stylesheet
// lives here so it never collides with the phone dashboard's tokens.
export default function GammelLayout({ children }) {
  return children;
}
