import { Suspense } from "react";
import DataView from "@/components/dash/DataView";

export const metadata = { title: "Data" };
export const dynamic = "force-dynamic";

// The range and system live in the query string (?from&to&system) so a link
// can be shared; DataView reads them with useSearchParams, hence Suspense.
export default function Page() {
  return (
    <Suspense fallback={<p className="lead">Laster.</p>}>
      <DataView />
    </Suspense>
  );
}
