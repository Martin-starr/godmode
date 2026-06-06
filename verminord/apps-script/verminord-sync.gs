// =============================================================
// Verminord Google Sheets → Supabase Sync
// =============================================================
// SETUP (one-time, ~5 minutes):
//
//  1. Open the Verminord Logg sheet
//  2. Extensions → Apps Script → replace all code with this file
//  3. Paste your Supabase SERVICE ROLE key below (Settings → API)
//     The service role key bypasses Row Level Security so inserts
//     always succeed regardless of auth state.
//  4. Click the clock icon (Triggers) → Add trigger:
//       Function:        onFormSubmit
//       Event source:    From spreadsheet
//       Event type:      On form submit
//     Do this ONCE — one trigger fires for both Produksjon and
//     Forkompost form submissions automatically.
//  5. Run testConnection() manually (▶ button) to verify.
//
// HOW IT WORKS:
//  Produksjon form submit  → INSERT into public.logs
//  Forkompost form submit  → INSERT into public.pre_compost_logs
// =============================================================

const SUPABASE_URL = 'https://ftjxpivxeavxdgcfpsba.supabase.co';
const SUPABASE_KEY = 'PASTE_SERVICE_ROLE_KEY_HERE';

// Sheet tab names (must match exactly)
const TAB_PRODUKSJON = 'Produksjon';
const TAB_FORKOMPOST = 'Forkompost';

// Column header text as it appears in each sheet tab
const PROD = {
  timestamp:   'Timestamp',
  system:      'System',
  loggedBy:    'Hvem logger?',
  temperature: 'Temperatur (C)',
  ph:          'pH',
  moisture:    'Fuktighet (%)',
  feed:        'For tilfort (liter)',
  notes:       'Kommentar',
};

const FORKOMP = {
  timestamp:   'Timestamp',
  system:      'System',
  loggedBy:    'Hvem logger?',
  temperature: 'Temperatur (C)',
  ph:          'pH',
  moisture:    'Fuktighet (%)',
  notes:       'Kommentar',
};

// =============================================================
// Main trigger — fires on every form submit
// =============================================================
function onFormSubmit(e) {
  try {
    const tab  = e.range.getSheet().getName();
    const vals = e.namedValues; // { "Column Header": ["value"] }

    if (tab === TAB_PRODUKSJON) {
      const row = {
        system:             str(vals, PROD.system),
        date:               toDate(vals[PROD.timestamp]?.[0]),
        temperature:        num(vals, PROD.temperature),
        ph:                 num(vals, PROD.ph),
        moisture:           num(vals, PROD.moisture),
        feed_amount_liters: num(vals, PROD.feed),
        notes:              str(vals, PROD.notes),
        created_by:         str(vals, PROD.loggedBy),
      };
      supabaseInsert('/rest/v1/logs', row);
      Logger.log('Produksjon synced: ' + JSON.stringify(row));

    } else if (tab === TAB_FORKOMPOST) {
      const row = {
        system:      str(vals, FORKOMP.system),
        logged_at:   toIso(vals[FORKOMP.timestamp]?.[0]),
        logged_by:   str(vals, FORKOMP.loggedBy),
        temperature: num(vals, FORKOMP.temperature),
        ph:          num(vals, FORKOMP.ph),
        moisture:    num(vals, FORKOMP.moisture),
        notes:       str(vals, FORKOMP.notes),
      };
      supabaseInsert('/rest/v1/pre_compost_logs', row);
      Logger.log('Forkompost synced: ' + JSON.stringify(row));

    } else {
      Logger.log('onFormSubmit: ignored tab "' + tab + '"');
    }
  } catch (err) {
    Logger.log('onFormSubmit ERROR: ' + err.message);
    // Optionally email on failure:
    // MailApp.sendEmail('martin@verminord.no', 'Sync feil', err.message);
  }
}

// =============================================================
// Backfill — sync all existing rows from a tab (run manually)
// Call backfillProduksjon() or backfillForkompost() from the
// Apps Script editor when you want to push historical data.
// =============================================================
function backfillProduksjon() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(TAB_PRODUKSJON);
  if (!sheet) { Logger.log('Sheet not found: ' + TAB_PRODUKSJON); return; }

  const [headers, ...rows] = sheet.getDataRange().getValues();
  let ok = 0, fail = 0;

  rows.forEach((row, i) => {
    if (!row[0]) return; // skip empty rows
    try {
      const vals = {};
      headers.forEach((h, j) => { vals[h] = [String(row[j] ?? '')]; });
      const payload = {
        system:             str(vals, PROD.system),
        date:               toDate(String(row[0])),
        temperature:        num(vals, PROD.temperature),
        ph:                 num(vals, PROD.ph),
        moisture:           num(vals, PROD.moisture),
        feed_amount_liters: num(vals, PROD.feed),
        notes:              str(vals, PROD.notes),
        created_by:         str(vals, PROD.loggedBy),
      };
      supabaseInsert('/rest/v1/logs', payload);
      ok++;
    } catch (e) {
      Logger.log('Row ' + (i + 2) + ' failed: ' + e.message);
      fail++;
    }
  });
  Logger.log('Backfill Produksjon done. OK: ' + ok + ', Failed: ' + fail);
}

function backfillForkompost() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(TAB_FORKOMPOST);
  if (!sheet) { Logger.log('Sheet not found: ' + TAB_FORKOMPOST); return; }

  const [headers, ...rows] = sheet.getDataRange().getValues();
  let ok = 0, fail = 0;

  rows.forEach((row, i) => {
    if (!row[0]) return;
    try {
      const vals = {};
      headers.forEach((h, j) => { vals[h] = [String(row[j] ?? '')]; });
      const payload = {
        system:      str(vals, FORKOMP.system),
        logged_at:   toIso(String(row[0])),
        logged_by:   str(vals, FORKOMP.loggedBy),
        temperature: num(vals, FORKOMP.temperature),
        ph:          num(vals, FORKOMP.ph),
        moisture:    num(vals, FORKOMP.moisture),
        notes:       str(vals, FORKOMP.notes),
      };
      supabaseInsert('/rest/v1/pre_compost_logs', payload);
      ok++;
    } catch (e) {
      Logger.log('Row ' + (i + 2) + ' failed: ' + e.message);
      fail++;
    }
  });
  Logger.log('Backfill Forkompost done. OK: ' + ok + ', Failed: ' + fail);
}

// =============================================================
// Connection test — run this once after setup
// =============================================================
function testConnection() {
  Logger.log('Testing connection to Supabase...');
  const res = UrlFetchApp.fetch(
    SUPABASE_URL + '/rest/v1/logs?limit=1&select=id',
    {
      method: 'get',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      muteHttpExceptions: true,
    }
  );
  const code = res.getResponseCode();
  if (code === 200) {
    Logger.log('Connection OK (HTTP 200). Supabase is reachable.');
  } else {
    Logger.log('Connection FAILED (HTTP ' + code + '): ' + res.getContentText());
  }
}

// =============================================================
// Helpers
// =============================================================

function str(vals, key) {
  const v = vals[key]?.[0];
  return (v !== undefined && String(v).trim() !== '') ? String(v).trim() : null;
}

function num(vals, key) {
  const v = vals[key]?.[0];
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function toDate(raw) {
  if (!raw || raw === '') return new Date().toISOString().split('T')[0];
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  } catch (_) {
    return new Date().toISOString().split('T')[0];
  }
}

function toIso(raw) {
  if (!raw || raw === '') return new Date().toISOString();
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  } catch (_) {
    return new Date().toISOString();
  }
}

function supabaseInsert(path, payload) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + path, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer':        'return=minimal',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code >= 400) {
    throw new Error('HTTP ' + code + ' — ' + res.getContentText());
  }
}
