import { json, guarded } from "@/lib/http";
import { canEdit } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export const GET = guarded(async (req, ctx, user) => json({ name: user.name, access: user.access, canEdit: canEdit(user) }));
