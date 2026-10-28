import SystemView from "@/components/dash/SystemView";

export const metadata = { title: "Anlegg" };
export const dynamic = "force-dynamic";

export default function Page({ params }) {
  return <SystemView keyId={params.key} />;
}
