import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { latestPerChannel } from "@/lib/ecowitt";
import { listSystems, listChannels, readingOut, UUID } from "@/lib/v2";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

// Which sensor sits in which bed (Mer → Kanaler).
//
// GET  one row per channel: what sensor_channels says about it, plus the
//      newest reading so the sensor can be told apart by its numbers (the
//      hygiene tank runs at 55–60 °C, a bed at 20) and Ecowitt's own name
//      for the channel when the newest row carries one.
// PUT  the whole map in one go. Channel 0 is the GW1200 room climate and
//      keeps role 'room' whatever the body says; only its label can change.

const MAX_CHANNEL = 16;
const MAX_LABEL = 80;
const SOIL_KEY = /^soil(_ec)?_ch\d+$/i;

// The realtime parser stores the whole Ecowitt group on the row, and the
// owner's name for the channel ("Prekompost Temp & Moisture") rides along.
function ecowittName(raw) {
  if (!raw || typeof raw !== "object") return null;
  for (const [key, group] of Object.entries(raw)) {
    if (!SOIL_KEY.test(key) || !group || typeof group !== "object") continue;
    if (typeof group.name === "string" && group.name.trim()) return group.name.trim();
  }
  return null;
}

async function payload(sql) {
  const systems = await listSystems(sql);
  const channels = await listChannels(sql);
  const latest = await latestPerChannel(sql);
  const raws = await sql`select distinct on (channel) channel, raw
    from public.sensor_readings order by channel, ts desc`;

  const latestBy = new Map(latest.map((r) => [r.channel, readingOut(r)]));
  const rawBy = new Map(raws.map((r) => [r.channel, r.raw]));

  // sensor_channels ∪ every channel that has reported: a sensor paired after
  // the map was seeded still gets a row here, as unassigned.
  const byChannel = new Map(channels.map((c) => [c.channel, c]));
  for (const r of latest) {
    if (!byChannel.has(r.channel)) byChannel.set(r.channel, { channel: r.channel, role: "unassigned", system_id: null, label: null });
  }

  const out = [...byChannel.values()].sort((a, b) => a.channel - b.channel).map((c) => {
    const l = latestBy.get(c.channel) || null;
    return {
      channel: c.channel,
      role: c.role,
      system_id: c.system_id || null,
      label: c.label || null,
      hint: ecowittName(rawBy.get(c.channel)),
      latest: l ? { ts: l.ts, temp: l.temp, ec: l.ec, moisture: l.moisture, indoor_temp: l.indoor_temp, indoor_rh: l.indoor_rh } : null,
    };
  });

  return {
    systems: systems.map((s) => ({ id: s.id, name: s.name, category: s.category })),
    channels: out,
  };
}

export const GET = guarded(async () => json(await payload(db())));

export const PUT = guarded(async (req) => {
  let body;
  try {
    body = await req.json();
  } catch {
    return err("Ugyldig forespørsel.");
  }
  const rows = body && Array.isArray(body.channels) ? body.channels : null;
  if (!rows) return err("Mangler kanaler.");

  const sql = db();
  const systems = await listSystems(sql);
  const active = new Set(systems.map((s) => s.id));

  // Validate everything first; nothing is written if one row is wrong.
  const seen = new Set();
  const plan = [];
  for (const r of rows) {
    const channel = r && Number.isInteger(r.channel) ? r.channel : -1;
    if (channel < 0 || channel > MAX_CHANNEL) return err("Ugyldig kanal.");
    if (seen.has(channel)) return err(`CH${channel} er oppgitt to ganger.`);
    seen.add(channel);

    let label = r.label == null ? "" : String(r.label).trim();
    if (label.length > MAX_LABEL) return err(`Merkelappen for CH${channel} kan ha høyst ${MAX_LABEL} tegn.`);
    label = label || null;

    const target = r.target == null ? "none" : String(r.target).trim();
    let role = "unassigned";
    let system_id = null;
    if (channel === 0) {
      role = "room";
    } else if (target === "none") {
      role = "unassigned";
    } else if (target === "hygiene") {
      role = "hygiene";
    } else if (UUID.test(target) && active.has(target.toLowerCase())) {
      role = "bed";
      system_id = target.toLowerCase();
    } else {
      return err(`Ukjent system for CH${channel}.`);
    }
    plan.push({ channel, role, system_id, label });
  }

  // One transaction, rows written one after another on its connection.
  await sql.begin(async (tx) => {
    for (const p of plan) {
      if (p.channel === 0) {
        await tx`insert into public.sensor_channels (channel, role, system_id, label, updated_at)
          values (0, 'room', null, ${p.label}, now())
          on conflict (channel) do update set label = excluded.label, updated_at = now()`;
      } else {
        await tx`insert into public.sensor_channels (channel, role, system_id, label, updated_at)
          values (${p.channel}, ${p.role}, ${p.system_id}, ${p.label}, now())
          on conflict (channel) do update set
            role = excluded.role, system_id = excluded.system_id, label = excluded.label, updated_at = now()`;
      }
    }
  });

  return json(await payload(sql));
}, { edit: true });
