// Verminord Kontrollrom — TV Dashboard
// Route: /dashboard
// Optimized for 1920×1080 landscape, dark mode only.

import { useState, useEffect, useCallback, useRef } from "react"
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { supabase } from "../lib/supabase" // adjust path if needed

// ─── Brand tokens ───────────────────────────────────────────
const C = {
  navy:      "#1B2A4A",
  navyLight: "#243656",
  navyDark:  "#121D33",
  gold:      "#C9A84C",
  goldDim:   "rgba(201,168,76,0.3)",
  cream:     "#F5F0E6",
  green:     "#2ECC71",
  greenDim:  "rgba(46,204,113,0.15)",
  orange:    "#E67E22",
  orangeDim: "rgba(230,126,34,0.15)",
  red:       "#E74C3C",
  redDim:    "rgba(231,76,60,0.15)",
  blue:      "#3498DB",
  gray:      "#8899AA",
  grayDark:  "#556677",
  border:    "rgba(255,255,255,0.06)",
  cardBg:    "rgba(255,255,255,0.03)",
}
const FONT = `'IBM Plex Sans', 'SF Pro Display', -apple-system, sans-serif`

// ─── Config ─────────────────────────────────────────────────
const DASHBOARD_PIN = "1234"        // change to preferred PIN
const PIN_SESSION_KEY = "vm_krom"
const PERIODS = ["7D", "30D", "60D", "1Å", "ALT"]
const TV_CYCLE_MS = 12000            // rotate period every 12s
const REFRESH_MS  = 60000            // re-fetch data every 60s

// ─── Alert thresholds ───────────────────────────────────────
const THRESH = {
  production: { tempMin: 15, tempMax: 28, moistMin: 55, moistMax: 85, phMin: 6.0, phMax: 8.0 },
  precompost: { tempMin: 45, tempMax: 75, moistMin: 50, moistMax: 80, phMin: 6.5, phMax: 8.5 },
}

// ─── Pure helpers ────────────────────────────────────────────
function periodCutoff(p) {
  const now = Date.now()
  const DAY = 86400000
  const map = { "7D": 7 * DAY, "30D": 30 * DAY, "60D": 60 * DAY, "1Å": 365 * DAY }
  return new Date(p === "ALT" ? 0 : now - map[p])
}

function safeAvg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v))
  if (!valid.length) return null
  return Math.round((valid.reduce((s, v) => s + Number(v), 0) / valid.length) * 10) / 10
}

const MONTHS = ["jan","feb","mar","apr","mai","jun","jul","aug","sep","okt","nov","des"]
function fmtDate(dateStr) {
  const d = new Date(dateStr)
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}`
}

function buildChartData(rows, dateKey) {
  const byDay = {}
  rows.forEach(r => {
    const day = (r[dateKey] || "").split("T")[0]
    if (!day) return
    if (!byDay[day]) byDay[day] = { temps: [], moistures: [], phs: [] }
    if (r.temperature != null) byDay[day].temps.push(Number(r.temperature))
    if (r.moisture != null)    byDay[day].moistures.push(Number(r.moisture))
    if (r.ph != null)          byDay[day].phs.push(Number(r.ph))
  })
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({
      date:       fmtDate(day),
      fuktighet:  safeAvg(v.moistures),
      temperatur: safeAvg(v.temps),
      pH:         safeAvg(v.phs),
    }))
}

function latestPerSystem(rows, systems, dateKey) {
  const latest = {}
  rows.forEach(r => {
    const prev = latest[r.system]
    if (!prev || (r[dateKey] || "") > (prev[dateKey] || "")) latest[r.system] = r
  })
  return systems.map(s => {
    const r = latest[s.name]
    const t = THRESH[s.category] || THRESH.production
    const outOfRange = r && (
      (r.temperature != null && (r.temperature < t.tempMin || r.temperature > t.tempMax)) ||
      (r.moisture    != null && (r.moisture    < t.moistMin || r.moisture    > t.moistMax)) ||
      (r.ph          != null && (r.ph          < t.phMin    || r.ph          > t.phMax))
    )
    return {
      ...s,
      temp:     r?.temperature ?? null,
      ph:       r?.ph          ?? null,
      fukt:     r?.moisture    ?? null,
      lastSeen: r?.[dateKey]   ?? null,
      status:   r ? (outOfRange ? "warning" : "ok") : "inactive",
    }
  })
}

function buildAlerts(enrichedSystems) {
  const out = []
  const now = new Date().toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })
  enrichedSystems.forEach(s => {
    if (s.status === "inactive") return
    const t = THRESH[s.category] || THRESH.production
    if (s.temp != null && s.temp < t.tempMin) out.push({ time: now, msg: `${s.name} temperatur lav (${s.temp}°C)`, level: "warning" })
    if (s.temp != null && s.temp > t.tempMax) out.push({ time: now, msg: `${s.name} temperatur høy (${s.temp}°C)`, level: "warning" })
    if (s.fukt != null && s.fukt < t.moistMin) out.push({ time: now, msg: `${s.name} fuktighet lav (${s.fukt}%)`, level: "warning" })
    if (s.fukt != null && s.fukt > t.moistMax) out.push({ time: now, msg: `${s.name} fuktighet høy (${s.fukt}%)`, level: "warning" })
    if (s.ph != null && s.ph < t.phMin) out.push({ time: now, msg: `${s.name} pH lav (${s.ph})`, level: "warning" })
    if (s.ph != null && s.ph > t.phMax) out.push({ time: now, msg: `${s.name} pH høy (${s.ph})`, level: "warning" })
  })
  if (!out.length) out.push({ time: now, msg: "Alle systemer innenfor normalområde", level: "ok" })
  return out
}

// ─── Sub-components ──────────────────────────────────────────

const StatusDot = ({ status }) => {
  const color = status === "ok" ? C.green : status === "warning" ? C.orange : C.grayDark
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: color,
      boxShadow: status === "ok" ? `0 0 6px ${C.green}` : status === "warning" ? `0 0 6px ${C.orange}` : "none",
    }} />
  )
}

const KPICard = ({ label, value, unit, sub, icon }) => (
  <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "16px 20px", flex: 1, minWidth: 130 }}>
    <div style={{ fontSize: 11, color: C.gray, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
      {label} {icon && <span style={{ marginLeft: 6 }}>{icon}</span>}
    </div>
    <div style={{ fontSize: 28, fontWeight: 700, color: C.cream }}>
      {value ?? "–"}<span style={{ fontSize: 14, fontWeight: 400, color: C.gray, marginLeft: 4 }}>{unit}</span>
    </div>
    {sub && <div style={{ fontSize: 12, color: C.grayDark, marginTop: 4 }}>{sub}</div>}
  </div>
)

const MetricCard = ({ label, value, unit, status }) => (
  <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "14px 18px", flex: 1, minWidth: 100, display: "flex", alignItems: "center", gap: 12 }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: C.gray, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.cream }}>
        {value ?? "–"}<span style={{ fontSize: 12, color: C.gray, marginLeft: 3 }}>{unit}</span>
      </div>
    </div>
    <StatusDot status={status} />
  </div>
)

const HealthScore = ({ score }) => {
  const color = score >= 80 ? C.green : score >= 60 ? C.orange : C.red
  const bg    = color === C.green ? C.greenDim : color === C.orange ? C.orangeDim : C.redDim
  const label = score >= 90 ? "UTMERKET" : score >= 75 ? "GOD" : score >= 60 ? "OK" : "ADVARSEL"
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "20px", textAlign: "center" }}>
      <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>Samlet Anleggshelse</div>
      <div style={{ fontSize: 48, fontWeight: 800, color }}>
        {score}<span style={{ fontSize: 20, fontWeight: 400, color: C.gray }}>/100</span>
      </div>
      <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color, background: bg, padding: "4px 14px", marginTop: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: C.grayDark, marginTop: 10, lineHeight: 1.5 }}>
        Beregnet fra temp, pH og fuktighet for aktive produksjonssystemer.
        Optimal: 18–25°C, pH 6.5–7.5, fuktighet 60–80%.
      </div>
    </div>
  )
}

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: C.navyDark, border: `1px solid ${C.border}`, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: C.gold, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => p.value != null && (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>{p.name}: {Number(p.value).toFixed(1)}</div>
      ))}
    </div>
  )
}

// ─── PIN Gate ────────────────────────────────────────────────

function PinGate({ onUnlock }) {
  const [input, setInput] = useState("")
  const [shake, setShake] = useState(false)

  const press = (k) => {
    if (k === "DEL") { setInput(p => p.slice(0, -1)); return }
    if (input.length >= 4) return
    const next = input + k
    setInput(next)
    if (next.length === 4) {
      if (next === DASHBOARD_PIN) {
        sessionStorage.setItem(PIN_SESSION_KEY, "1")
        onUnlock()
      } else {
        setShake(true)
        setTimeout(() => { setInput(""); setShake(false) }, 700)
      }
    }
  }

  return (
    <div style={{ fontFamily: FONT, background: C.navyDark, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 24 }}>Verminord Kontrollrom</div>
      <div style={{ display: "flex", gap: 16, marginBottom: 32, animation: shake ? "shake 0.3s" : "none" }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 18, height: 18, borderRadius: "50%",
            border: `2px solid ${shake ? C.red : i < input.length ? C.gold : C.grayDark}`,
            background: i < input.length ? (shake ? C.red : C.gold) : "transparent",
            transition: "all 0.12s",
          }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: 10 }}>
        {["1","2","3","4","5","6","7","8","9","","0","DEL"].map((k, i) => (
          k === "" ? <div key={i} /> :
          <button key={i} onClick={() => press(k)} style={{
            height: 72, background: C.navyLight, border: `1px solid ${C.border}`,
            color: C.cream, fontSize: k === "DEL" ? 13 : 24, fontWeight: 600,
            cursor: "pointer", fontFamily: FONT, letterSpacing: k === "DEL" ? "0.02em" : 0,
          }}>{k}</button>
        ))}
      </div>
      <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }`}</style>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────

export default function KontrollromPage() {
  const [unlocked, setUnlocked] = useState(!!sessionStorage.getItem(PIN_SESSION_KEY))
  const [period,   setPeriod]   = useState("30D")
  const [manualP,  setManualP]  = useState(false)
  const [clock,    setClock]    = useState(new Date())

  const [systems,     setSystems]     = useState([])
  const [prodLogs,    setProdLogs]    = useState([])
  const [kompLogs,    setKompLogs]    = useState([])
  const [tasks,       setTasks]       = useState([])
  const [harvests,    setHarvests]    = useState([])
  const [taskChecked, setTaskChecked] = useState({})
  const [loading,     setLoading]     = useState(true)

  const pidxRef = useRef(PERIODS.indexOf("30D"))

  // ── Data fetch ───────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0]
    const [sysR, logR, komR, tskR, hvstR] = await Promise.allSettled([
      supabase.from("systems").select("*").order("sort_order"),
      supabase.from("logs").select("system,date,temperature,moisture,ph,feed_amount_liters,notes,created_by").gte("date", yearAgo).order("date", { ascending: false }),
      supabase.from("pre_compost_logs").select("system,logged_at,temperature,moisture,ph,phase,hygiene_ok").gte("logged_at", yearAgo + "T00:00:00Z").order("logged_at", { ascending: false }),
      supabase.from("tasks").select("id,title,status,priority,due_date,assigned_to,recurring").order("priority").order("due_date"),
      supabase.from("harvests").select("amount_kg,amount_liters,date"),
    ])
    if (sysR.status  === "fulfilled" && sysR.value.data)  setSystems(sysR.value.data)
    if (logR.status  === "fulfilled" && logR.value.data)  setProdLogs(logR.value.data)
    if (komR.status  === "fulfilled" && komR.value.data)  setKompLogs(komR.value.data)
    if (hvstR.status === "fulfilled" && hvstR.value.data) setHarvests(hvstR.value.data)
    if (tskR.status  === "fulfilled" && tskR.value.data) {
      setTasks(tskR.value.data)
      setTaskChecked(prev => {
        const next = { ...prev }
        tskR.value.data.forEach(t => { if (!(t.id in next)) next[t.id] = t.status === "ferdig" })
        return next
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!unlocked) return
    fetchAll()
    const ri = setInterval(fetchAll, REFRESH_MS)
    const ci = setInterval(() => setClock(new Date()), 60000)
    return () => { clearInterval(ri); clearInterval(ci) }
  }, [unlocked, fetchAll])

  // ── TV auto-cycle ────────────────────────────────────────
  useEffect(() => {
    if (!unlocked || manualP) return
    const iv = setInterval(() => {
      pidxRef.current = (pidxRef.current + 1) % PERIODS.length
      setPeriod(PERIODS[pidxRef.current])
    }, TV_CYCLE_MS)
    return () => clearInterval(iv)
  }, [unlocked, manualP])

  const selectPeriod = (p) => {
    setPeriod(p)
    pidxRef.current = PERIODS.indexOf(p)
    setManualP(true)
    setTimeout(() => setManualP(false), 60000)
  }

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />

  if (loading) return (
    <div style={{ fontFamily: FONT, background: C.navyDark, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: C.gray, fontSize: 14 }}>Laster data...</div>
    </div>
  )

  // ── Derived state ────────────────────────────────────────
  const cutoff = periodCutoff(period)

  const prodSystems  = systems.filter(s => s.category === "production")
  const kompSystems  = systems.filter(s => s.category === "precompost")

  const fProdLogs = prodLogs.filter(r => new Date(r.date) >= cutoff)
  const fKompLogs = kompLogs.filter(r => new Date(r.logged_at) >= cutoff)

  const prodEnriched = latestPerSystem(prodLogs, prodSystems, "date")
  const kompEnriched = latestPerSystem(kompLogs, kompSystems, "logged_at")

  const prodChartData = buildChartData(fProdLogs, "date")
  const kompChartData = buildChartData(
    fKompLogs.map(r => ({ ...r, date: (r.logged_at || "").split("T")[0] })), "date"
  )

  const activeProd = prodEnriched.filter(s => s.status !== "inactive")
  const activeKomp = kompEnriched.filter(s => s.status !== "inactive")

  const avgProdTemp = safeAvg(activeProd.map(s => s.temp))
  const avgProdFukt = safeAvg(activeProd.map(s => s.fukt))
  const avgProdPH   = safeAvg(activeProd.map(s => s.ph))
  const avgKompTemp = safeAvg(activeKomp.map(s => s.temp))
  const avgKompFukt = safeAvg(activeKomp.map(s => s.fukt))
  const avgKompPH   = safeAvg(activeKomp.map(s => s.ph))

  const tempScore = avgProdTemp == null ? 50 : avgProdTemp >= 18 && avgProdTemp <= 25 ? 100 : avgProdTemp >= 15 && avgProdTemp <= 28 ? 75 : 40
  const phScore   = avgProdPH   == null ? 50 : avgProdPH   >= 6.5 && avgProdPH   <= 7.5 ? 100 : avgProdPH   >= 6   && avgProdPH   <= 8   ? 70 : 30
  const fuktScore = avgProdFukt == null ? 50 : avgProdFukt >= 60  && avgProdFukt <= 80  ? 100 : avgProdFukt >= 50  && avgProdFukt <= 90  ? 65 : 25
  const healthScore = Math.round((tempScore + phScore + fuktScore) / 3)

  const totalKg     = harvests.reduce((s, h) => s + (Number(h.amount_kg)     || 0), 0)
  const totalLiters = harvests.reduce((s, h) => s + (Number(h.amount_liters) || 0), 0)

  const today = new Date().toISOString().split("T")[0]
  const todayTasks = tasks
    .filter(t => t.status !== "ferdig" && (!t.due_date || t.due_date <= today || t.recurring))
    .slice(0, 8)

  const allEnriched = [...prodEnriched, ...kompEnriched]
  const alerts      = buildAlerts(allEnriched)
  const onlineCount = allEnriched.filter(s => s.status !== "inactive").length

  const metricStatus = (val, min, max, warnMin, warnMax) => {
    if (val == null) return "inactive"
    if (val >= min && val <= max) return "ok"
    return "warning"
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT, background: C.navyDark, color: C.cream, minHeight: "100vh", margin: 0, padding: 0 }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>Kontrollrom</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>Hei, Verminord Team</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 2 }}>
            {PERIODS.map(p => (
              <button key={p} onClick={() => selectPeriod(p)} style={{
                background: period === p ? C.gold : "transparent",
                color: period === p ? C.navyDark : C.gray,
                border: `1px solid ${period === p ? C.gold : C.border}`,
                padding: "6px 14px", fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: FONT, letterSpacing: "0.04em",
              }}>{p}</button>
            ))}
          </div>
          <div style={{ color: C.grayDark, fontSize: 13 }}>
            <span style={{ color: C.green, marginRight: 6 }}>●</span>
            {clock.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {/* 3-COLUMN LAYOUT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 320px", gap: 0, minHeight: "calc(100vh - 60px)" }}>

        {/* ── LEFT: Status ─────────────────────────────── */}
        <div style={{ padding: "20px", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 16 }}>

          <div style={{ display: "flex", gap: 8 }}>
            <KPICard label="Total Høsting" value={totalKg.toFixed(1)} unit="kg" sub={totalLiters > 0 ? `+ ${totalLiters.toFixed(0)} L` : undefined} icon="🍂" />
            <KPICard label="Systemer" value={`${onlineCount}/${systems.length}`} sub="online nå" icon="🪱" />
            <KPICard label="Oppgaver" value={todayTasks.length} sub="åpne i dag" icon="☑️" />
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Produksjon <span style={{ color: C.grayDark, fontWeight: 400 }}>— {activeProd.length} aktive</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <MetricCard label="Temp"     value={avgProdTemp?.toFixed(1)} unit="°C" status={metricStatus(avgProdTemp, 15, 28)} />
              <MetricCard label="Fuktighet" value={avgProdFukt?.toFixed(0)} unit="%" status={metricStatus(avgProdFukt, 55, 85)} />
              <MetricCard label="pH"        value={avgProdPH?.toFixed(2)}  unit=""  status={metricStatus(avgProdPH, 6.0, 8.0)} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Kompost <span style={{ color: C.grayDark, fontWeight: 400 }}>— {activeKomp.length} aktive</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <MetricCard label="Temp"     value={avgKompTemp?.toFixed(1)} unit="°C" status={metricStatus(avgKompTemp, 45, 75)} />
              <MetricCard label="Fuktighet" value={avgKompFukt?.toFixed(0)} unit="%" status={metricStatus(avgKompFukt, 50, 80)} />
              <MetricCard label="pH"        value={avgKompPH?.toFixed(2)}  unit=""  status={metricStatus(avgKompPH, 6.5, 8.5)} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Produksjonssystemer</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {prodEnriched.map(s => (
                <div key={s.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: C.grayDark, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Produksjon</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.cream }}>{s.name}</div>
                    </div>
                    <StatusDot status={s.status} />
                  </div>
                  {s.status !== "inactive" ? (
                    <div style={{ display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap" }}>
                      <span><span style={{ color: C.grayDark }}>Temp</span> <strong>{s.temp}°C</strong></span>
                      <span><span style={{ color: C.grayDark }}>pH</span> <strong>{s.ph}</strong></span>
                      <span><span style={{ color: C.grayDark }}>Fukt</span> <strong>{s.fukt}%</strong></span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: C.grayDark, fontStyle: "italic" }}>Ingen data</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── CENTER: Charts ──────────────────────────── */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 20, borderRight: `1px solid ${C.border}` }}>

          {/* Produksjon chart */}
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "16px 20px", flex: 1, minHeight: 220 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Produksjon — Sensordata</div>
                <div style={{ fontSize: 13, color: C.cream, fontWeight: 600 }}>Fuktighet &amp; temperatur — {period}</div>
              </div>
              <div style={{ fontSize: 11, color: C.grayDark }}>+ {fProdLogs.length} logg</div>
            </div>
            {prodChartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={prodChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fuktGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.green}  stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.green}  stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: C.grayDark, fontSize: 10 }} tickLine={false} axisLine={{ stroke: C.border }} interval="preserveStartEnd" />
                  <YAxis yAxisId="l" tick={{ fill: C.grayDark, fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: C.grayDark, fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 40]} />
                  <Tooltip content={<ChartTip />} />
                  <Area  yAxisId="l" type="monotone" dataKey="fuktighet"  stroke={C.green} fill="url(#fuktGrad)" strokeWidth={2} name="Fuktighet %"   dot={false} connectNulls />
                  <Line  yAxisId="r" type="monotone" dataKey="temperatur" stroke={C.blue}  strokeWidth={2}        name="Temperatur °C" dot={false} connectNulls />
                  <Line  yAxisId="l" type="monotone" dataKey="pH"         stroke={C.gold}  strokeWidth={1.5} strokeDasharray="4 4" name="pH" dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: C.grayDark, fontSize: 13 }}>Ingen data for valgt periode</div>
            )}
          </div>

          {/* Kompost chart */}
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "16px 20px", flex: 1, minHeight: 220 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Kompost — Sensordata</div>
                <div style={{ fontSize: 13, color: C.cream, fontWeight: 600 }}>Fuktighet &amp; temperatur — {period}</div>
              </div>
              <div style={{ fontSize: 11, color: C.grayDark }}>+ {fKompLogs.length} logg</div>
            </div>
            {kompChartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={kompChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="kompFuktGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.orange} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.orange} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: C.grayDark, fontSize: 10 }} tickLine={false} axisLine={{ stroke: C.border }} interval="preserveStartEnd" />
                  <YAxis yAxisId="l" tick={{ fill: C.grayDark, fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: C.grayDark, fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 80]} />
                  <Tooltip content={<ChartTip />} />
                  <Area  yAxisId="l" type="monotone" dataKey="fuktighet"  stroke={C.orange} fill="url(#kompFuktGrad)" strokeWidth={2} name="Fuktighet %" dot={false} connectNulls />
                  <Line  yAxisId="r" type="monotone" dataKey="temperatur" stroke={C.red}    strokeWidth={2} name="Temperatur °C" dot={false} connectNulls />
                  <Line  yAxisId="l" type="monotone" dataKey="pH"         stroke={C.gold}   strokeWidth={1.5} strokeDasharray="4 4" name="pH" dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: C.grayDark, fontSize: 13 }}>Ingen data for valgt periode</div>
            )}
          </div>

          {/* Kompostsystemer list */}
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
              Kompostsystemer <span style={{ color: C.grayDark, fontWeight: 400 }}>— {activeKomp.length} aktive</span>
            </div>
            {kompEnriched.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <StatusDot status={s.status} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                </div>
                {s.status !== "inactive"
                  ? <span style={{ color: C.gray, fontSize: 12 }}>{s.temp}°C, pH {s.ph}, {s.fukt}%</span>
                  : <span style={{ color: C.grayDark, fontSize: 12, fontStyle: "italic" }}>Ingen data</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Tasks, Alerts, Health ─────────────── */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>

          <HealthScore score={healthScore} />

          {/* Dagens Oppgaver */}
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>Dagens Oppgaver</div>
            {todayTasks.length === 0
              ? <div style={{ fontSize: 13, color: C.grayDark, fontStyle: "italic" }}>Ingen åpne oppgaver</div>
              : todayTasks.map(t => (
                <div key={t.id} onClick={() => setTaskChecked(p => ({ ...p, [t.id]: !p[t.id] }))} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 0", borderBottom: `1px solid ${C.border}`,
                  cursor: "pointer", opacity: taskChecked[t.id] ? 0.45 : 1,
                }}>
                  <div style={{
                    width: 18, height: 18, flexShrink: 0,
                    border: `2px solid ${taskChecked[t.id] ? C.green : C.grayDark}`,
                    background: taskChecked[t.id] ? C.greenDim : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, color: C.green,
                  }}>
                    {taskChecked[t.id] && "✓"}
                  </div>
                  <span style={{ fontSize: 13, color: C.cream, textDecoration: taskChecked[t.id] ? "line-through" : "none" }}>{t.title}</span>
                </div>
              ))
            }
          </div>

          {/* Sanntidsvarsler */}
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>Sanntidsvarsler</div>
            {alerts.slice(0, 5).map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: i < Math.min(alerts.length, 5) - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ color: a.level === "ok" ? C.green : C.orange, fontSize: 10, marginTop: 3, flexShrink: 0 }}>●</span>
                <div>
                  <div style={{ fontSize: 13, color: C.cream }}>{a.msg}</div>
                  <div style={{ fontSize: 10, color: C.grayDark, marginTop: 2 }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Live Status */}
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>Live Status</div>
            {[
              { dot: healthScore >= 75 ? C.green : C.orange, text: <>System Health: <strong style={{ color: healthScore >= 75 ? C.green : C.orange }}>{healthScore >= 90 ? "Optimal" : healthScore >= 75 ? "God" : "OK"}</strong></> },
              { dot: C.green, text: <>Online: <strong>{onlineCount}/{systems.length}</strong></> },
              { dot: alerts.some(a => a.level === "warning") ? C.orange : C.green, text: <>Varsler: <strong>{alerts.filter(a => a.level === "warning").length} aktive</strong></> },
              { dot: C.green, text: <>Sist oppdatert: <strong>{clock.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}</strong></> },
            ].map((row, i) => (
              <div key={i} style={{ fontSize: 13, marginBottom: i < 3 ? 6 : 0 }}>
                <span style={{ color: row.dot }}>●</span> {row.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
