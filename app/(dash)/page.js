import { redirect } from "next/navigation";
import AnleggView from "@/components/dash/AnleggView";

export const metadata = { title: "Anlegg" };
export const dynamic = "force-dynamic";

// Links into the old dashboard (the Monday SEO mail uses /?view=seo) keep
// working: they are forwarded to where that app now lives.
const OLD_VIEWS = new Set(["brief", "logg", "systemer", "foring", "hygienisering", "innboks", "oppgaver", "prosjekter", "sop", "seo", "innstillinger"]);

export default function Page({ searchParams }) {
  const view = searchParams && searchParams.view;
  if (typeof view === "string" && OLD_VIEWS.has(view)) redirect("/gammel?view=" + encodeURIComponent(view));
  return <AnleggView />;
}
