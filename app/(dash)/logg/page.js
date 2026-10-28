import LoggView from "@/components/dash/LoggView";

export const metadata = { title: "Logg" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <LoggView />;
}
