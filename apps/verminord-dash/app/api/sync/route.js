import { json, err, guarded } from "@/lib/http";
import { sheetsConfig, syncSheets } from "@/lib/sheets";

export const runtime = "nodejs";
export const maxDuration = 25;

export const POST = guarded(
  async () => {
    if (!sheetsConfig()) return err("Google Sheets er ikke konfigurert.", 400);
    const result = await syncSheets();
    return json(result);
  },
  { edit: true }
);
