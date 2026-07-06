import { json, err, guarded } from "@/lib/http";
import { sheetsConfig, syncSheets } from "@/lib/sheets";

export const runtime = "nodejs";
export const maxDuration = 25;

export const POST = guarded(
  async () => {
    if (!sheetsConfig()) {
      return err("Synken kj\u00f8res automatisk av Claude-rutinen (hver time). Manuell synk her krever DASH_SHEETS_ID og DASH_SHEETS_API_KEY p\u00e5 Vercel-prosjektet.", 400);
    }
    const result = await syncSheets();
    return json(result);
  },
  { edit: true }
);
