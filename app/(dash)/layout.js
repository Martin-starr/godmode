import "./dash.css";
import "./desktop.css";
import Shell from "@/components/dash/Shell";

export const metadata = {
  title: { default: "Verminord", template: "%s · Verminord" },
};

export default function DashLayout({ children }) {
  return <Shell>{children}</Shell>;
}
