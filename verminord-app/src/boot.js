import { createClient } from '@supabase/supabase-js';

// Bootstrap: create Supabase client, check session, fetch + sync data.
// Sets window.__vnSb and window.__vnNeedsLogin; persists to localStorage.
export async function vnBoot() {
  const SUPA_URL = 'https://pxduiwrgosdzrkapsuqu.supabase.co';
  const SUPA_KEY = 'sb_publishable_BwasPYmhhkeCzszYpB0XBg_gRbdcZoy';
  const KEY_DATA = 'verminord-v6';

  try {
    const sb = createClient(SUPA_URL, SUPA_KEY);
    window.__vnSb = sb;

    // Session check — if no session, skip data fetches and let the app render LoginScreen.
    // Magic-link sign-in is handled server-side by /.netlify/functions/sign-in (no client passwords).
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        window.__vnNeedsLogin = true;
        return;
      }
    } catch (e) {
      console.warn('[Verminord boot] Session check failed:', e);
      window.__vnNeedsLogin = true;
      return;
    }

    // Fetch all data in parallel
    const [tasksRes, partnersRes, lagerRes, ordrerRes, obsRes, batcherRes, hostRes, labRes, martinRes] = await Promise.all([
      sb.from('oppgaver').select('*').order('frist', { ascending: true, nullsFirst: false }),
      sb.from('partnere').select('*').order('siste_kontakt', { ascending: false, nullsFirst: false }),
      sb.from('lager').select('*').order('sortering'),
      sb.from('ordrer').select('*, partner:partnere(navn, type)').order('ordredato', { ascending: false }),
      sb.from('wedge_observasjoner').select('*').order('dato', { ascending: false }).limit(20),
      sb.from('forkompost_batcher').select('*').order('startdato', { ascending: false }),
      sb.from('host_batcher').select('*').order('hostedato', { ascending: false }).limit(3),
      sb.from('lab_rapporter').select('*').order('test_dato', { ascending: false }).limit(3),
      sb.from('martin_state').select('*'),
    ]);

    // Read any existing local state (preserves unsaved edits)
    let state = {};
    try { state = JSON.parse(localStorage.getItem(KEY_DATA) || '{}'); } catch (e) {}

    // ── TASKS (from oppgaver) ────────────────────────
    if (tasksRes.data && tasksRes.data.length > 0) {
      const prioMap = { hoy: 'høy', medium: 'middels', lav: 'lav' };
      const statusMap = { ferdig: 'done', pagar: 'active', ikke_startet: 'active' };
      state.tasks = tasksRes.data.map(t => ({
        title: t.tittel,
        assignee: t.ansvarlig || '',
        priority: prioMap[t.prioritet] || 'middels',
        due: t.frist || '',
        status: statusMap[t.status] || 'active',
        project: '',
        notes: t.beskrivelse || '',
        _id: t.id,
        _src: 'oppgaver',
        _created_at: t.created_at,
        _updated_at: t.updated_at,
        _fullfort_at: t.fullfort_at,
        _db_prioritet: t.prioritet,
        _db_status: t.status,
      }));
    }

    // ── PARTNERS (from partnere) ─────────────────────
    if (partnersRes.data && partnersRes.data.length > 0) {
      state.partners = partnersRes.data.map(p => {
        const days = p.siste_kontakt
          ? Math.floor((Date.now() - new Date(p.siste_kontakt)) / 86400000)
          : null;
        const temp = days == null ? 'cold'
          : days <= 7 ? 'hot'
          : days <= 21 ? 'warm'
          : days <= 45 ? 'lukewarm'
          : 'cold';
        const last = p.siste_kontakt ? p.siste_kontakt.slice(5, 10).replace('-', '.') : '—';
        return {
          name: p.navn,
          type: p.type || 'Partner',
          temp,
          last,
          age: days != null ? days + 'd' : '—',
          kind: p.status || 'Lead',
          next: p.notater || '',
          _id: p.id,
          _src: 'partnere',
        };
      });
    }

    // ── FEEDSTOCK (from lager) ───────────────────────
    if (lagerRes.data && lagerRes.data.length > 0) {
      state.feedstock = lagerRes.data.map(l => ({
        name: l.navn || l.vare,
        days: Math.round((Number(l.prosent) || 0) / 100 * 30),
        source: l.oppdatert_av ? 'Sist: ' + l.oppdatert_av : '—',
        _id: l.id,
        _src: 'lager',
      }));
    }

    // ── ORDERS (from ordrer + partnere join) ─────────
    if (ordrerRes.data && ordrerRes.data.length > 0) {
      const statusMap = { utkast: 'utkast', bekreftet: 'bekreftet', pakket: 'pakket', sendt: 'sendt', levert: 'levert', betalt: 'betalt' };
      state.orders = ordrerRes.data.slice(0, 10).map(o => ({
        customer: o.partner ? o.partner.navn : (o.ordre_nr || '—'),
        items: '—',
        amount: Number(o.total_nok) || 0,
        status: statusMap[o.status] || 'utkast',
        date: o.ordredato ? o.ordredato.slice(5, 10).replace('-', '.') : '—',
        notes: o.notater || '',
        _id: o.id,
        _src: 'ordrer',
      }));
    }

    // ── PRODUCTION (from wedge_observasjoner — latest per wedge) ──
    if (obsRes.data && obsRes.data.length > 0) {
      const byWedge = {};
      obsRes.data.forEach(o => {
        if (!byWedge[o.wedge_id] || o.dato > byWedge[o.wedge_id].dato) byWedge[o.wedge_id] = o;
      });
      const fmt = (iso) => iso ? iso.slice(5, 10).replace('-', '.') : '—';
      const wedgeIds = Object.keys(byWedge).sort();
      const w1 = wedgeIds[0] ? byWedge[wedgeIds[0]] : null;
      const w2 = wedgeIds[1] ? byWedge[wedgeIds[1]] : null;
      if (w1 || w2) {
        state.production = state.production || {};
        if (w1) state.production.cft1 = {
          lastFed: fmt(w1.dato),
          by: w1.ansvarlig || '—',
          ph: w1.ph != null ? String(w1.ph).replace('.', ',') : '—',
          moisture: w1.fuktighet_pct != null ? Math.round(w1.fuktighet_pct) + ' %' : (w1.fukt || '—'),
          temp: w1.temperatur_c != null ? Math.round(w1.temperatur_c) + '°C' : '—',
          status: w1.avvik ? 'Avvik · ' + w1.avvik : 'Aktiv · stabil',
        };
        if (w2) state.production.cft2 = {
          lastFed: fmt(w2.dato),
          by: w2.ansvarlig || '—',
          ph: w2.ph != null ? String(w2.ph).replace('.', ',') : '—',
          moisture: w2.fuktighet_pct != null ? Math.round(w2.fuktighet_pct) + ' %' : (w2.fukt || '—'),
          temp: w2.temperatur_c != null ? Math.round(w2.temperatur_c) + '°C' : '—',
          status: w2.avvik ? 'Avvik · ' + w2.avvik : 'Aktiv · stabil',
        };
      }
    }

    // Latest harvest batch
    if (hostRes.data && hostRes.data.length > 0 && state.production) {
      const latest = hostRes.data[0];
      state.production.readyBatch = latest.host_batch_id || state.production.readyBatch;
    }
    // Active forkompost batch + day count
    if (batcherRes.data && batcherRes.data.length > 0 && state.production) {
      const active = batcherRes.data.find(b => b.status === 'aktiv') || batcherRes.data[0];
      if (active) {
        state.production.precompostBatch = active.batch_id;
        if (active.startdato) {
          const days = Math.floor((Date.now() - new Date(active.startdato)) / 86400000);
          state.production.precompostDay = days;
        }
      }
    }

    // ── SALES (computed from ordrer) ─────────────────
    if (ordrerRes.data && ordrerRes.data.length > 0) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const mtd = ordrerRes.data
        .filter(o => o.ordredato && new Date(o.ordredato) >= monthStart)
        .reduce((sum, o) => sum + (Number(o.total_nok) || 0), 0);
      const active = ordrerRes.data.filter(o => o.status !== 'levert' && o.status !== 'betalt').length;
      state.sales = state.sales || {};
      if (mtd > 0) state.sales.mtd = mtd;
      state.sales.activeOrders = active;
    }

    // ── LAB REPORTS ──────────────────────────────────
    if (labRes.data && labRes.data.length > 0) {
      const latest = labRes.data[0];
      state.lab = {
        rapportId: latest.rapport_id,
        date: latest.test_dato,
        ph: latest.ph,
        nPct: latest.n_pct,
        pPct: latest.p_pct,
        kPct: latest.k_pct,
        klasse: latest.tungmetallklasse ? 'Klasse ' + latest.tungmetallklasse : '—',
      };
    }

    // ── MARTIN-ONLY SECTIONS (from martin_state) ─────
    if (martinRes.data) {
      martinRes.data.forEach(row => {
        if (row.data && Object.keys(row.data).length > 0) {
          state[row.section] = row.data;
        }
      });
    }

    // P2-2 fix: auto-compute daysLeft from end-of-month each load (don't trust stored value)
    try {
      const _now = new Date();
      const _eom = new Date(_now.getFullYear(), _now.getMonth() + 1, 0);
      state.sales = state.sales || {};
      state.sales.daysLeft = Math.max(0, Math.ceil((_eom - _now) / 86400000));
    } catch (e) { /* keep stored value as fallback */ }

    // Save merged state for React to pick up
    localStorage.setItem(KEY_DATA, JSON.stringify(state));

    // Define explicit sync function (called from React's storageSet directly — more reliable than setItem override on iOS Safari)
    const martinSections = ['projects', 'sops', 'compass', 'events', 'actions', 'quote',
                            'greeting', 'feedstockAlert', 'feedstockOutreach', 'deliveries'];

    // Track last-known data per section so we only write CHANGES
    window.__vnLastSync = {};
    martinSections.forEach(s => { if (state[s] !== undefined) window.__vnLastSync[s] = JSON.stringify(state[s]); });

    // Track last-known state of MATHIAS-SHARED tables for 2-way sync (edit + delete)
    window.__vnLastTasks = JSON.parse(JSON.stringify(state.tasks || []));
    window.__vnLastPartners = JSON.parse(JSON.stringify(state.partners || []));
    window.__vnLastFeedstock = JSON.parse(JSON.stringify(state.feedstock || []));
    window.__vnLastOrders = JSON.parse(JSON.stringify(state.orders || []));

    // ── Helpers for reverse-mapping app values → DB enum values ─────
    const reverseTaskPriority = (p) => ({ 'kritisk': 'hoy', 'høy': 'hoy', 'middels': 'medium', 'lav': 'lav' }[p] || 'medium');
    const reverseTaskStatus = (s) => ({ 'done': 'ferdig', 'active': 'pagar', 'backlog': 'ikke_startet', 'blocked': 'ikke_startet' }[s] || 'ikke_startet');

    // ── Sync shared tables (tasks/partners/feedstock/orders) ────────
    function syncSharedTable(currentItems, lastKey, tableName, dbMap, idField) {
      const current = currentItems || [];
      const last = window[lastKey] || [];
      const currentById = {}; current.forEach(it => { if (it && it[idField]) currentById[it[idField]] = it; });
      const lastById = {}; last.forEach(it => { if (it && it[idField]) lastById[it[idField]] = it; });

      // DELETES — in last, not in current
      Object.keys(lastById).forEach(id => {
        if (!currentById[id]) {
          sb.from(tableName).delete().eq('id', id).then(({error}) => {
            if (error) console.warn('[Sync ' + tableName + ' delete]', error.message);
          });
        }
      });

      // UPDATES — in both, fields differ
      Object.keys(currentById).forEach(id => {
        if (!lastById[id]) return;
        const c = currentById[id], l = lastById[id];
        const dbUpdate = dbMap(c, l);
        if (dbUpdate === null) return; // no relevant change
        sb.from(tableName).update(dbUpdate).eq('id', id).then(({error}) => {
          if (error) console.warn('[Sync ' + tableName + ' update]', error.message);
        });
      });

      // Save snapshot for next diff (deep clone to avoid mutation surprises)
      window[lastKey] = JSON.parse(JSON.stringify(current));
    }

    window.__vnSyncToSupabase = function(fullState) {
      if (!fullState || typeof fullState !== 'object') return;

      // 1) Martin-only sections → martin_state JSONB store
      martinSections.forEach(section => {
        if (fullState[section] === undefined) return;
        const json = JSON.stringify(fullState[section]);
        if (window.__vnLastSync[section] === json) return;
        sb.from('martin_state').upsert(
          { section, data: fullState[section], updated_by: 'Martin', updated_at: new Date().toISOString() },
          { onConflict: 'section' }
        ).then(({ error }) => {
          if (error) {
            console.warn('[Supabase write]', section, error.message);
            window.__vnSyncStatus = 'error';
          } else {
            // Only update last-known on SUCCESS (Bug 1 fix — failed writes will be retried on next sync)
            window.__vnLastSync[section] = json;
            window.__vnSyncStatus = 'ok';
          }
        });
      });

      // 2) Shared tables → Mathias' Supabase rows (Bug 4 fix: 2-way sync)
      // Tasks → oppgaver
      syncSharedTable(fullState.tasks, '__vnLastTasks', 'oppgaver', (c, l) => {
        const changed = c.title !== l.title || c.assignee !== l.assignee
          || c.priority !== l.priority || c.status !== l.status
          || c.due !== l.due || c.notes !== l.notes;
        if (!changed) return null;
        return {
          tittel: c.title || 'Uten tittel',
          ansvarlig: c.assignee || null,
          prioritet: reverseTaskPriority(c.priority),
          status: reverseTaskStatus(c.status),
          frist: c.due || null,
          beskrivelse: c.notes || null,
          fullfort_at: c.status === 'done' && l.status !== 'done' ? new Date().toISOString() : (c.status !== 'done' ? null : l._fullfort_at),
        };
      }, '_id');

      // Partners → partnere
      syncSharedTable(fullState.partners, '__vnLastPartners', 'partnere', (c, l) => {
        const changed = c.name !== l.name || c.type !== l.type || c.kind !== l.kind || c.next !== l.next;
        if (!changed) return null;
        return {
          navn: c.name || 'Ukjent',
          type: c.type || null,
          status: c.kind || null,
          notater: c.next || null,
        };
      }, '_id');

      // Feedstock → lager (prosent only — the days field is derived in UI)
      syncSharedTable(fullState.feedstock, '__vnLastFeedstock', 'lager', (c, l) => {
        // Derive prosent from days (inverse of bootstrap mapping: days = prosent/100*30 → prosent = days/30*100)
        const newProsent = Math.max(0, Math.min(100, Math.round((Number(c.days) || 0) / 30 * 100)));
        const oldProsent = Math.max(0, Math.min(100, Math.round((Number(l.days) || 0) / 30 * 100)));
        if (c.name === l.name && newProsent === oldProsent) return null;
        return {
          navn: c.name || 'Ukjent',
          prosent: newProsent,
          oppdatert_av: 'Martin',
          oppdatert_at: new Date().toISOString(),
        };
      }, '_id');

      // Orders → ordrer
      syncSharedTable(fullState.orders, '__vnLastOrders', 'ordrer', (c, l) => {
        const changed = c.amount !== l.amount || c.status !== l.status || c.notes !== l.notes;
        if (!changed) return null;
        return {
          status: c.status || 'utkast',
          total_nok: Number(c.amount) || 0,
          notater: c.notes || null,
        };
      }, '_id');
    };

    console.log('[Verminord] Live data loaded:',
      'tasks=' + (state.tasks?.length || 0),
      'partners=' + (state.partners?.length || 0),
      'feedstock=' + (state.feedstock?.length || 0),
      'orders=' + (state.orders?.length || 0));
  } catch (err) {
    console.error('[Verminord boot] failed — falling back to SEED:', err);
  }
}
