import { json, err, guarded } from "@/lib/http";
import { aiEnabled, claude } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

// "Test AI" in Innstillinger: one tiny round-trip that proves the key works.
export const POST = guarded(
  async () => {
    if (!aiEnabled()) {
      return err("AI er ikke konfigurert — legg inn ANTHROPIC_API_KEY på Vercel-prosjektet verminord-dash.", 503);
    }
    const svar = await claude({
      messages: [{ role: "user", content: "Svar med én kort setning som bekrefter at AI-koblingen til Verminord-dashbordet virker." }],
      maxTokens: 60,
    });
    return json({ svar });
  },
  { edit: true, watchdog: false }
);
