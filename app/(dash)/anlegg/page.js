import AnleggView from "@/components/dash/AnleggView";

export const metadata = { title: "Anlegg" };
export const dynamic = "force-dynamic";

// The Anlegg cards at their own address: on a computer "/" opens the full
// dashboard, so this is how the sidebar there reaches the cards.
export default function Page() {
  return <AnleggView />;
}
