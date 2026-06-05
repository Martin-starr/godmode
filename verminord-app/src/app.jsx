// Verminord Storskjerm — TV Dashboard
// Route: /dashboard
// Fixed 1920×1080, auto-scaling, 4 rotating scenes, dark blueprint theme

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { supabase } from "./supabase"

// ─── Brand tokens ───────────────────────────────────────────
const BGC = "#0C1A2B"
const CARD = "rgba(255,255,255,0.04)"
const BD = "1px solid rgba(255,255,255,0.09)"
const TEAL = "#6FB8B8"
const GOLD = "#B8993A"
const GREEN = "#5BAE7A"
const C_TEMP = "#CF9A72"
const C_PH = "#8E9BD0"
const C_FUKT = "#6FAE9C"
const FONT = "'IBM Plex Sans', sans-serif"
const lab = {
  fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase",
  color: "rgba(255,255,255,0.42)", fontWeight: 600,
}

const DASHBOARD_PIN = "1234"
const PIN_SESSION_KEY = "vm_krom"

const RANGES = [
  { key: "7D", label: "7 DGR", n: 7 },
  { key: "21D", label: "21 DGR", n: 21 },
  { key: "3M", label: "3 MND", n: 90 },
  { key: "6M", label: "6 MND", n: 180 },
  { key: "YTD", label: "I ÅR", n: Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1)) / 86400000) },
  { key: "ALL", label: "ALT", n: 365 },
]

const SCENES = [
  { id: "main", dwell: 20000 },
  { id: "spotlight", dwell: 13000 },
  { id: "week", dwell: 13000 },
  { id: "milestones", dwell: 12000 },
]

// ─── Hooks ──────────────────────────────────────────────────

function useRotation(count, ms, offset) {
  const [i, setI] = useState(offset ? offset % count : 0)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % count), ms)
    return () => clearInterval(id)
  }, [count, ms])
  return i
}

function useClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

// ─── Mock Data Generator ────────────────────────────────────

function rng(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

function series(seed, n, base, amp, drift) {
  const r = rng(seed)
  const out = []
  let v = base
  for (let i = 0; i < n; i++) {
    v += (drift || 0) / n + (r() - 0.5) * amp
    v += (base - v) * 0.06
    out.push(Math.round(v * 10) / 10)
  }
  return out
}

function metricSet(seed, base, amp, drift) {
  const m = {}
  RANGES.forEach((rg, i) => { m[rg.key] = series(seed + i * 7, rg.n, base, amp, drift) })
  return m
}

function buildMockData() {
  const PROD = [
    { id: "cft1", name: "CFT1", group: "prod", updated: "03.06 18:26", status: "ok", temp: 22, ph: 7.5, fukt: 73, for: 10 },
    { id: "cft2", name: "CFT2", group: "prod", updated: "03.06 18:22", status: "ok", temp: 24, ph: 7.5, fukt: 76, for: 10 },
    { id: "cft3", name: "CFT3", group: "prod", updated: "03.06 00:16", status: "watch", temp: 22, ph: 7.0, fukt: 75, for: 2 },
    { id: "wedge1", name: "Wedge 1", group: "prod", updated: "03.06 18:10", status: "ok", temp: 23, ph: 7.5, fukt: 63, for: 0 },
    { id: "wedge2", name: "Wedge 2", group: "prod", updated: "03.06 18:12", status: "watch", temp: 21, ph: 7.5, fukt: 62, for: 0 },
    { id: "breeder", name: "Breeder Bin", group: "prod", updated: "03.06 18:22", status: "ok", temp: 23, ph: 7.5, fukt: 73, for: 10 },
  ]
  PROD.forEach((s, i) => {
    s.targets = { temp: [15, 25], fukt: [60, 80], ph: [6.0, 8.0] }
    s.tempSeries = metricSet(101 + i * 13, s.temp, 1.6, i % 2 ? -2 : 2)
    s.fuktSeries = metricSet(211 + i * 13, s.fukt, 3.5, i % 2 ? 3 : -3)
    s.phSeries = metricSet(311 + i * 13, s.ph, 0.18, 0)
  })

  const FORK = [
    { id: "fork1", name: "Forkompost 1", group: "fork", updated: "03.06 00:50", status: "under",
      temp: 33, ph: 7.5, fukt: 77, streak: 0, threshold: 55, required: 5,
      dailyLow: [48, 52, 57, 61, 64, 59, 54, 51, 44, 33] },
    { id: "fork2", name: "Forkompost 2", group: "fork", updated: "03.06 18:22", status: "ok",
      temp: 60, ph: 7.25, fukt: 66, streak: 6, threshold: 55, required: 5,
      dailyLow: [44, 49, 51, 50, 61, 63, 62, 60, 59, 60] },
  ]
  FORK.forEach((s, i) => {
    let st = 0
    for (let k = s.dailyLow.length - 1; k >= 0; k--) { if (s.dailyLow[k] >= s.threshold) st++; else break }
    s.streak = st
    s.targets = { temp: [40, 70], fukt: [50, 60], ph: [6.0, 8.0] }
    s.tempSeries = metricSet(411 + i * 13, s.temp, 6, i ? 10 : -8)
    s.fuktSeries = metricSet(511 + i * 13, s.fukt, 4, 0)
    s.phSeries = metricSet(611 + i * 13, s.ph, 0.2, 0)
  })

  return {
    RANGES,
    SYSTEMS: PROD.concat(FORK),
    PROD,
    FORK,
    KPIS: {
      avvik: 0, hygienisering: { met: 1, total: 2 }, aktive: 8,
      populasjon: 15936, hosting: 51.2, oppgaver: 9,
      omsetning: 47200, omsetningMaal: 100000, omsetningDager: 9,
    },
    REMINDERS: [
      { id: 1, tag: "AKUTT", tone: "gold", title: "Forkompost 1 falt under 55 °C", meta: "Streak nullstilt · §19 brutt" },
      { id: 2, tag: "FÔRING", tone: "navy", title: "CFT3 og Wedge 1–2 ikke fôret i dag", meta: "Fôr = 0 L · 3 systemer" },
      { id: 3, tag: "PRØVE", tone: "navy", title: "ALS-rapport batch 2026-007 klar", meta: "Ikke konvertert til kundeformat" },
      { id: 4, tag: "PARTNER", tone: "muted", title: "RYGR — siste kontakt 12 dager siden", meta: "Mash-leveranse stabil" },
    ],
    PROJECTS: [
      { id: 1, name: "Dyrkeland-ordre", status: "Venter på revidert pristilbud", progress: 60, value: "31 200 NOK", due: "4 dgr", tone: "gold" },
      { id: 2, name: "Lansering / salgsklar", status: "Tripletex + Habiba-delen", progress: 45, value: "—", due: "9 dgr", tone: "navy" },
      { id: 3, name: "Hygieniseringsdok. §19", status: "Mattilsynet-pakke", progress: 80, value: "—", due: "14 dgr", tone: "navy" },
    ],
    WEEK: {
      number: 23, title: "Ukens fokus",
      goal: "Få Forkompost 1 tilbake over 55 °C og hold §19-streak i 5 døgn.",
      tasks: [
        { t: "Lukk Dyrkeland-ordren (40 × 20 L)", who: "Habiba", tone: "gold" },
        { t: "Konverter ALS batch 2026-007 til kundeformat", who: "Mathias", tone: "navy" },
        { t: "Fôr CFT3 + Wedge 1–2 — fôr står på 0 L", who: "Martin", tone: "navy" },
        { t: "Ferdigstill §19-dokumentasjon til Mattilsynet", who: "Martin", tone: "navy" },
      ],
      metric: { label: "Omsetning mot 100 000-mål", value: 47200, target: 100000 },
    },
    MILESTONES: [
      { title: "15 936 i populasjon", detail: "Høyeste noensinne — +4,2 % på én uke", tone: "green", icon: "▲" },
      { title: "51,2 kg hostet i mai", detail: "Passerte forrige rekord (47 kg)", tone: "green", icon: "★" },
      { title: "17 dager uten avvik", detail: "Alle produksjonssystemer innen mål", tone: "green", icon: "●" },
      { title: "Bryne Bakeri levert", detail: "Første gjentakende B2B-kunde lukket", tone: "teal", icon: "✓" },
    ],
    MOTIVATION: [
      { tag: "UKENS MÅL", text: "350 / 500 poser solgt denne måneden · 16 dager igjen — stå på!" },
      { tag: "OMSETNING", text: "47 200 av 100 000 kr i mai — vi nærmer oss, hold trykket!" },
      { tag: "REKORD", text: "17 dager uten avvik — beste rekke i år. Fortsett sånn!" },
      { tag: "POPULASJON", text: "15 936 i populasjon — ny toppnotering. Bra jobba, team!" },
      { tag: "DAGENS MÅL", text: "Få Forkompost 1 over 55 °C i dag, så er §19 i boks." },
    ],
    fmt: { nok: (n) => Number(n).toLocaleString("nb-NO") },
  }
}

// ─── SVG Chart Helpers ──────────────────────────────────────

function smoothLine(pts) {
  if (pts.length < 3) return pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ")
  const k = 6
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / k, c1y = p1[1] + (p2[1] - p0[1]) / k
    const c2x = p2[0] - (p3[0] - p1[0]) / k, c2y = p2[1] - (p3[1] - p1[1]) / k
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

function resolveW(w, fallback) {
  if (typeof w === "number") return [w, w, false]
  return [fallback, "100%", true]
}

const isFork = (s) => !!s && (s.group === "fork" || s.group === "precompost" || s.group === "forkompost")

const AXIS_BASE = new Date(2026, 5, 4)
const MON = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
function axisTicks(rangeKey, count) {
  const rg = RANGES.find((r) => r.key === rangeKey)
  const n = rg.n, c = count || 3
  const out = []
  for (let i = 0; i < c; i++) {
    const pos = i / (c - 1)
    const d = new Date(AXIS_BASE)
    d.setDate(d.getDate() - Math.round((1 - pos) * (n - 1)))
    let label
    if (pos >= 1) label = "nå"
    else if (n <= 31) label = String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0")
    else label = MON[d.getMonth()] + " '" + String(d.getFullYear()).slice(2)
    out.push({ pos, label })
  }
  return out
}

// ─── Chart Components ───────────────────────────────────────

function TriLine({ temp, ph, fukt, w = 260, h = 70, cTemp = C_TEMP, cPh = C_PH, cFukt = C_FUKT,
  stroke = 2.4, ticks, refDots = true, markers = false, maxPoints = 46 }) {
  const [vw, svgW, fluid] = resolveW(w, 600)
  const p = 5
  const ds = (data) => {
    if (!data || data.length <= maxPoints) return data || []
    const bucket = data.length / maxPoints, out = []
    for (let i = 0; i < maxPoints; i++) {
      const s = Math.floor(i * bucket), e = Math.max(s + 1, Math.floor((i + 1) * bucket))
      let sum = 0, c = 0
      for (let j = s; j < e; j++) { sum += data[j]; c++ }
      out.push(sum / c)
    }
    return out
  }
  const norm = (data) => {
    const mn = Math.min(...data), mx = Math.max(...data), sp = mx - mn || 1
    const stepX = (vw - p * 2) / (data.length - 1 || 1)
    return data.map((v, i) => [p + i * stepX, h - p - ((v - mn) / sp) * (h - p * 2)])
  }
  const build = (pts) => smoothLine(pts)
  const seriesData = [
    { data: fukt, c: cFukt, key: "fukt" },
    { data: temp, c: cTemp, key: "temp" },
    { data: ph, c: cPh, key: "ph" },
  ].filter((s) => Array.isArray(s.data) && s.data.length >= 2 && s.data.every((x) => typeof x === "number" && isFinite(x)))
    .map((s) => {
      const d = ds(s.data)
      const pts = norm(d)
      let maxI = 0, minI = 0
      d.forEach((v, i) => { if (v > d[maxI]) maxI = i; if (v < d[minI]) minI = i })
      return { ...s, pts, last: pts[pts.length - 1], maxPt: pts[maxI], minPt: pts[minI] }
    })
  const xPct = (x) => (x / vw) * 100
  const dotStyle = (left, top, color, size, hollow) => ({
    position: "absolute", left: `${left}%`, top: `${top}px`, width: size, height: size,
    borderRadius: "50%", transform: "translate(-50%,-50%)",
    background: hollow ? "transparent" : color, border: `${hollow ? 1.5 : 2}px solid ${hollow ? color : "#0C1A2B"}`,
    boxShadow: hollow ? "none" : `0 0 0 1px ${color}`, opacity: hollow ? 0.65 : 1,
  })
  return (
    <div style={{ width: "100%" }}>
      <div style={{ position: "relative", height: h, overflow: "visible" }}>
        <svg width={svgW} height={h} viewBox={`0 0 ${vw} ${h}`}
          preserveAspectRatio={fluid ? "none" : "xMidYMid meet"} style={{ display: "block" }}>
          {seriesData.map((s, i) => (
            <path key={i} d={build(s.pts)} fill="none" stroke={s.c} strokeWidth={stroke}
              strokeLinejoin="round" strokeLinecap="round"
              vectorEffect={fluid ? "non-scaling-stroke" : undefined} />
          ))}
        </svg>
        {markers && seriesData.map((s, i) => (
          <span key={"mx" + i}>
            <span style={dotStyle(xPct(s.maxPt[0]), s.maxPt[1], s.c, 11, true)} />
            <span style={dotStyle(xPct(s.minPt[0]), s.minPt[1], s.c, 11, true)} />
          </span>
        ))}
        {refDots && seriesData.map((s, i) => (
          <span key={"d" + i} style={dotStyle(xPct(s.last[0]), s.last[1], s.c, 8, false)} />
        ))}
      </div>
      {ticks && (
        <div style={{ position: "relative", height: 14, marginTop: 5 }}>
          {ticks.map((t, i) => (
            <span key={i} style={{
              position: "absolute", left: `${t.pos * 100}%`,
              transform: t.pos <= 0 ? "none" : t.pos >= 1 ? "translateX(-100%)" : "translateX(-50%)",
              fontSize: 10.5, letterSpacing: "0.04em", color: "rgba(255,255,255,0.34)",
              whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
            }}>{t.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function MultiLine({ seriesData, w = 600, h = 200 }) {
  const [vw, svgW, fluid] = resolveW(w, 900)
  const valid = seriesData.filter((s) => Array.isArray(s.data) && s.data.length >= 2)
  if (!valid.length) return <svg width={svgW} height={h} style={{ display: "block" }} />
  const all = valid.flatMap((s) => s.data)
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1
  const px = 4
  const toPath = (data, withArea) => {
    const stepX = (vw - px * 2) / (data.length - 1 || 1)
    const pts = data.map((v, i) => [px + i * stepX, h - px - ((v - min) / span) * (h - px * 2 - 14)])
    const line = smoothLine(pts)
    return withArea ? line + ` L ${vw - px} ${h - px} L ${px} ${h - px} Z` : line
  }
  return (
    <svg width={svgW} height={h} viewBox={`0 0 ${vw} ${h}`}
      preserveAspectRatio={fluid ? "none" : "xMidYMid meet"} style={{ display: "block" }}>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={px} x2={vw - px} y1={(h - 14) * g + 2} y2={(h - 14) * g + 2}
          stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}
      {valid.map((s, i) => (
        <g key={i}>
          {s.fill && <path d={toPath(s.data, true)} fill={s.color} opacity="0.12" />}
          <path d={toPath(s.data, false)} fill="none" stroke={s.color} strokeWidth={s.dash ? 1.5 : 2}
            strokeDasharray={s.dash ? "4 3" : undefined} strokeLinejoin="round" strokeLinecap="round"
            vectorEffect={fluid ? "non-scaling-stroke" : undefined} />
        </g>
      ))}
    </svg>
  )
}

function ThermoChecker({ dailyLow, threshold = 55, required = 5, dark = false, compact = false }) {
  const recent = dailyLow.slice(-required)
  let streak = 0
  for (let i = dailyLow.length - 1; i >= 0; i--) {
    if (dailyLow[i] >= threshold) streak++; else break
  }
  const met = streak >= required
  const cell = compact ? 16 : 22
  return (
    <div>
      <div style={{ display: "flex", gap: 4 }}>
        {recent.map((v, i) => {
          const ok = v >= threshold
          return (
            <div key={i} title={v + " °C"} style={{
              width: cell, height: cell, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: compact ? 8 : 9, fontWeight: 600,
              border: `1px solid ${ok ? GOLD : dark ? "rgba(255,255,255,0.25)" : "rgba(28,58,92,0.25)"}`,
              background: ok ? GOLD : "transparent",
              color: ok ? "#1C3A5C" : dark ? "rgba(255,255,255,0.5)" : "#5A6270",
            }}>{Math.round(v)}</div>
          )
        })}
      </div>
      {!compact && (
        <div style={{ marginTop: 6, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
          color: met ? GOLD : dark ? "rgba(255,255,255,0.6)" : "#5A6270", fontWeight: 600 }}>
          {streak}/{required} døgn ≥ {threshold}°C {met ? "· godkjent" : "· ikke nådd"}
        </div>
      )}
    </div>
  )
}

function RangePips({ ranges, activeKey, color = GOLD }) {
  return (
    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {ranges.map((r) => (
        <span key={r.key} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: r.key === activeKey ? color : "currentColor",
          opacity: r.key === activeKey ? 1 : 0.25,
        }} />
      ))}
    </span>
  )
}

function RoundBar({ pct, h = 7, color = TEAL, showPct = true }) {
  return (
    <div>
      <div style={{ height: h, background: "rgba(255,255,255,0.08)", borderRadius: h, overflow: "hidden" }}>
        <div style={{ height: "100%", width: Math.max(2, Math.min(100, pct)) + "%", background: color, borderRadius: h }} />
      </div>
      {showPct && <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{pct}%</div>}
    </div>
  )
}

function Legend({ small }) {
  const items = [["Fukt", C_FUKT], ["Temp", C_TEMP], ["pH", C_PH]]
  return (
    <span style={{ display: "flex", gap: small ? 10 : 16 }}>
      {items.map(([k, c]) => (
        <span key={k} style={{ fontSize: small ? 11 : 13, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
          <span style={{ width: small ? 12 : 16, height: 3, background: c, borderRadius: 2 }} />{k}
        </span>
      ))}
    </span>
  )
}

// ─── System Card ────────────────────────────────────────────

function SysCard({ s, offset }) {
  const idx = useRotation(RANGES.length, 3200, offset)
  const rg = RANGES[idx], R = rg.key
  const fork = isFork(s), warn = s.status === "under", watch = s.status === "watch"
  const dot = warn ? GOLD : watch ? "#C9A227" : GREEN
  return (
    <div style={{
      background: CARD, border: BD, borderRadius: 18, padding: "18px 20px 16px",
      display: "flex", flexDirection: "column", borderTop: `2px solid ${warn ? GOLD : "rgba(111,184,184,0.4)"}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.09)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: dot, boxShadow: `0 0 10px ${dot}` }} />
          <span style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{s.name}</span>
        </span>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", fontVariantNumeric: "tabular-nums" }}>{(s.updated || "—").slice(6) || "—"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
        {[["TEMP", s.temp, "°C", C_TEMP], ["PH", s.ph, "", C_PH], ["FUKT", s.fukt, "%", C_FUKT],
          [fork ? "STREAK" : "FÔR", fork ? s.streak : s.for, fork ? "d" : "L", "#fff"]].map(([k, v, u, c]) => {
          const has = v !== null && v !== undefined
          return (
            <div key={k}>
              <div style={{ ...lab, fontSize: 11 }}>{k}</div>
              <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.05, marginTop: 4,
                color: !has ? "rgba(255,255,255,0.3)" : warn && k === "TEMP" ? GOLD : "#fff" }}>
                {has ? v : "—"}{has && <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.42)" }}>{u}</span>}
              </div>
            </div>
          )
        })}
      </div>
      {fork && Array.isArray(s.dailyLow) && s.dailyLow.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <ThermoChecker dailyLow={s.dailyLow} threshold={s.threshold || 55} required={s.required || 5} dark compact />
        </div>
      )}
      <div style={{ marginTop: "auto", paddingTop: 14 }}>
        <TriLine temp={(s.tempSeries || {})[R]} ph={(s.phSeries || {})[R]} fukt={(s.fuktSeries || {})[R]}
          w="100%" h={fork ? 70 : 92} cTemp={C_TEMP} cPh={C_PH} cFukt={C_FUKT}
          ticks={axisTicks(R, 3)} refDots maxPoints={14} stroke={2.6} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <Legend small />
        <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.14em", color: TEAL, fontWeight: 700 }}>{rg.label}</span>
          <span style={{ color: TEAL }}><RangePips ranges={RANGES} activeKey={R} color={TEAL} /></span>
        </span>
      </div>
    </div>
  )
}

// ─── Scene: Main Dashboard ──────────────────────────────────

function SceneMain({ data }) {
  const { SYSTEMS, KPIS, PROD, REMINDERS } = data
  const n = SYSTEMS.length
  const cols = n <= 4 ? n : n <= 8 ? 4 : 3
  const rows = Math.ceil(n / cols)
  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 452px", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)`, gap: 18, minHeight: 0 }}>
        {SYSTEMS.map((s, i) => <SysCard key={s.id} s={s} offset={i} />)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 18 }}>
          {[
            ["Avvik (auto)", KPIS.avvik, "siste måling", TEAL],
            ["§19 hygienisering", KPIS.hygienisering.met + " / " + KPIS.hygienisering.total, "1 under 55 °C", GOLD],
            ["Populasjon", data.fmt.nok(KPIS.populasjon), "7 systemer", TEAL],
            ["Hosting hittil", KPIS.hosting + " kg", "+97 L denne uka", TEAL],
          ].map(([k, v, sub, c]) => (
            <div key={k} style={{ background: CARD, border: BD, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ ...lab, fontSize: 12 }}>{k}</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: c, margin: "8px 0 3px" }}>{v}</div>
              <div style={{ ...lab, fontSize: 11, textTransform: "none", letterSpacing: "0.02em" }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ background: CARD, border: BD, borderRadius: 16, padding: "18px 20px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...lab, fontSize: 12, color: TEAL }}>Produksjon · sensordata</div>
              <div style={{ fontSize: 19, fontWeight: 700, marginTop: 3, whiteSpace: "nowrap" }}>Fuktighet & temperatur · 3 mnd</div>
            </div>
            <div style={{ paddingTop: 4 }}><Legend /></div>
          </div>
          <MultiLine w="100%" h={184} seriesData={[
            { data: (PROD[0] && PROD[0].fuktSeries && PROD[0].fuktSeries["3M"]) || [], color: C_FUKT, fill: true },
            { data: (PROD[0] && PROD[0].tempSeries && PROD[0].tempSeries["3M"]) || [], color: C_TEMP },
            { data: ((PROD[0] && PROD[0].phSeries && PROD[0].phSeries["3M"]) || []).map((v) => v * 9), color: C_PH, dash: true },
          ]} />
        </div>
        <div style={{ background: CARD, border: BD, borderRadius: 16, padding: "16px 20px", flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={{ ...lab, fontSize: 12, color: TEAL, marginBottom: 6 }}>Krever handling i dag</div>
          {REMINDERS.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 12, padding: "11px 0", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 7, flexShrink: 0, background: r.tone === "gold" ? GOLD : TEAL }} />
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25 }}>{r.title}</div>
                <div style={{ ...lab, fontSize: 11.5, textTransform: "none", letterSpacing: "0.02em", marginTop: 2 }}>{r.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Scene: Spotlight ───────────────────────────────────────

function SceneSpotlight({ data, pass }) {
  const { SYSTEMS } = data
  const s = SYSTEMS[pass % SYSTEMS.length]
  const R = RANGES[(pass * 2 + 3) % RANGES.length].key
  const rgLabel = RANGES.find((r) => r.key === R).label
  const fork = isFork(s), warn = s.status === "under"
  const c = warn ? GOLD : TEAL
  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 520px", gap: 28 }}>
      <div style={{
        background: CARD, border: BD, borderRadius: 22, padding: "34px 38px",
        display: "flex", flexDirection: "column", borderTop: `3px solid ${warn ? GOLD : "rgba(111,184,184,0.5)"}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ ...lab, fontSize: 15, color: c }}>I fokus nå · {fork ? "Forkompost · §19" : "Produksjon"}</div>
            <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 8 }}>{s.name}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ ...lab, fontSize: 13, color: c }}>Tidsrom</div>
            <div style={{ fontSize: 40, fontWeight: 700, marginTop: 4 }}>{rgLabel}</div>
          </div>
        </div>
        <div style={{ marginTop: "auto", paddingTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}><Legend /></div>
          <TriLine temp={(s.tempSeries || {})[R]} ph={(s.phSeries || {})[R]} fukt={(s.fuktSeries || {})[R]}
            w="100%" h={288} stroke={3.2} cTemp={C_TEMP} cPh={C_PH} cFukt={C_FUKT}
            ticks={axisTicks(R, 4)} refDots markers maxPoints={60} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 18 }}>
          {[["TEMP", s.temp, "°C", C_TEMP], ["FUKT", s.fukt, "%", C_FUKT], ["PH", s.ph, "", C_PH],
            [fork ? "STREAK" : "FÔR", fork ? (s.streak != null ? s.streak + "/5" : null) : s.for, fork ? "" : " L", warn ? GOLD : "#fff"]].map(([k, v, u, col]) => {
            const has = v !== null && v !== undefined
            return (
              <div key={k} style={{ background: CARD, border: BD, borderRadius: 18, padding: "22px 24px" }}>
                <div style={{ ...lab, fontSize: 13 }}>{k}</div>
                <div style={{ fontSize: 58, fontWeight: 700, color: has ? col : "rgba(255,255,255,0.3)", marginTop: 8, lineHeight: 1 }}>
                  {has ? v : "—"}{has && <span style={{ fontSize: 22, color: "rgba(255,255,255,0.4)" }}>{u}</span>}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ background: CARD, border: BD, borderRadius: 18, padding: "22px 24px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {fork
            ? (<div>
                <div style={{ ...lab, fontSize: 13, color: c, marginBottom: 16 }}>Termofil §19 · 5 døgn ≥ 55 °C</div>
                {Array.isArray(s.dailyLow) && s.dailyLow.length
                  ? <ThermoChecker dailyLow={s.dailyLow} threshold={s.threshold || 55} required={s.required || 5} dark />
                  : <div style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}>Ingen data ennå</div>}
              </div>)
            : (<div>
                <div style={{ ...lab, fontSize: 13, color: TEAL, marginBottom: 10 }}>Mål-vinduer</div>
                {[["Temperatur", (s.targets || {}).temp, "°C", s.temp], ["Fuktighet", (s.targets || {}).fukt, "%", s.fukt], ["pH", (s.targets || {}).ph, "", s.ph]].map(([k, tg, u, val]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontSize: 18, color: "rgba(255,255,255,0.7)" }}>{k}</span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>
                      {val == null ? "—" : val}{val == null ? "" : u}{" "}
                      {tg && <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>· mål {tg[0]}–{tg[1]}{u}</span>}
                    </span>
                  </div>
                ))}
              </div>)}
        </div>
      </div>
    </div>
  )
}

// ─── Scene: Weekly Focus ────────────────────────────────────

function SceneWeek({ data }) {
  const { WEEK } = data
  const pct = Math.round((WEEK.metric.value / WEEK.metric.target) * 100)
  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, alignContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ ...lab, fontSize: 17, color: TEAL }}>Uke {WEEK.number} · {WEEK.title}</div>
        <div style={{ fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginTop: 18, lineHeight: 1.2 }}>Mål for uken</div>
        <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.12, marginTop: 8 }}>{WEEK.goal}</div>
        <div style={{ marginTop: 40, background: CARD, border: BD, borderRadius: 18, padding: "24px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ ...lab, fontSize: 13 }}>{WEEK.metric.label}</span>
            <span style={{ fontSize: 17, color: GOLD, fontWeight: 700 }}>{pct}%</span>
          </div>
          <div style={{ fontSize: 46, fontWeight: 700, margin: "10px 0 14px" }}>
            {data.fmt.nok(WEEK.metric.value)} <span style={{ fontSize: 20, color: "rgba(255,255,255,0.4)" }}>/ {data.fmt.nok(WEEK.metric.target)} NOK</span>
          </div>
          <RoundBar pct={pct} color={GOLD} showPct={false} h={10} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ ...lab, fontSize: 15, color: TEAL, marginBottom: 8 }}>Ukens hovedoppgaver</div>
        {WEEK.tasks.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 20, alignItems: "center", padding: "22px 4px", borderBottom: "1px solid rgba(255,255,255,0.09)" }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: t.tone === "gold" ? GOLD : "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums", width: 36 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ fontSize: 26, fontWeight: 600, flex: 1, lineHeight: 1.2 }}>{t.t}</span>
            <span style={{ ...lab, fontSize: 13, color: t.tone === "gold" ? GOLD : TEAL }}>{t.who}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Scene: Milestones ──────────────────────────────────────

function SceneMilestones({ data }) {
  const { MILESTONES } = data
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ ...lab, fontSize: 16, color: GREEN }}>Denne måneden · det går bra</div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 10 }}>Milepæler & framgang</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 24 }}>
        {MILESTONES.map((m, i) => {
          const c = m.tone === "teal" ? TEAL : GREEN
          return (
            <div key={i} style={{
              background: "rgba(91,174,122,0.07)", border: `1px solid ${c}55`, borderRadius: 20,
              padding: "30px 34px", display: "flex", alignItems: "center", gap: 26,
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%", background: `${c}22`, border: `2px solid ${c}`,
                display: "grid", placeItems: "center", fontSize: 30, color: c, flexShrink: 0,
              }}>{m.icon}</div>
              <div>
                <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.05 }}>{m.title}</div>
                <div style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>{m.detail}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Motivation Ticker ──────────────────────────────────────

function MotivationTicker({ items }) {
  const [i, setI] = useState(0)
  const [on, setOn] = useState(true)
  useEffect(() => {
    let tid
    const a = setInterval(() => {
      setOn(false)
      tid = setTimeout(() => { setI((v) => (v + 1) % items.length); setOn(true) }, 450)
    }, 7000)
    return () => { clearInterval(a); clearTimeout(tid) }
  }, [items.length])
  const m = items[i % items.length] || items[0]
  return (
    <div style={{
      textAlign: "center", maxWidth: 880, opacity: on ? 1 : 0,
      transform: on ? "none" : "translateY(6px)", transition: "opacity 0.45s ease, transform 0.45s ease",
    }}>
      <div style={{ ...lab, fontSize: 13, letterSpacing: "0.22em", color: TEAL }}>{m.tag}</div>
      <div style={{ fontSize: 27, fontWeight: 600, marginTop: 5, lineHeight: 1.2 }}>{m.text}</div>
    </div>
  )
}

// ─── TVDashboard Orchestrator ───────────────────────────────

function TVDashboard({ data }) {
  const now = useClock()
  const [scene, setScene] = useState(0)
  const [shown, setShown] = useState(true)
  const passRef = useRef(0)
  const [pass, setPass] = useState(0)

  useEffect(() => {
    const dwell = SCENES[scene].dwell
    const outId = setTimeout(() => setShown(false), dwell - 550)
    const id = setTimeout(() => {
      setScene((v) => {
        const next = (v + 1) % SCENES.length
        if (SCENES[next].id === "spotlight") { passRef.current += 1; setPass(passRef.current) }
        return next
      })
      setShown(true)
    }, dwell)
    return () => { clearTimeout(outId); clearTimeout(id) }
  }, [scene])

  const days = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"]
  const months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
  const dn = days[now.getDay()], dd = now.getDate(), mo = months[now.getMonth()], yr = now.getFullYear()
  const hh = String(now.getHours()).padStart(2, "0"), mm = String(now.getMinutes()).padStart(2, "0"), ss = String(now.getSeconds()).padStart(2, "0")
  const week = (() => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
    const w1 = new Date(d.getFullYear(), 0, 4)
    return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)
  })()

  const sysAll = data.SYSTEMS || []
  const inMaal = sysAll.filter((s) => s.status === "ok").length
  const totSys = sysAll.length || 1
  const score = Math.round((inMaal / totSys) * 100)
  const scoreWord = score >= 90 ? "Utmerket" : score >= 75 ? "Bra" : score >= 55 ? "OK" : "Krever tilsyn"
  const scoreColor = score >= 75 ? GREEN : score >= 55 ? "#C9A227" : GOLD

  const sceneComponents = [
    () => <SceneMain data={data} />,
    () => <SceneSpotlight data={data} pass={pass} />,
    () => <SceneWeek data={data} />,
    () => <SceneMilestones data={data} />,
  ]
  const SceneComp = sceneComponents[scene]

  return (
    <div style={{
      width: 1920, height: 1080, background: BGC, color: "#fff",
      fontFamily: FONT, padding: 36, display: "flex", flexDirection: "column",
      backgroundImage: "radial-gradient(circle at 80% -8%, rgba(111,184,184,0.08), transparent 42%)",
    }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 120, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff" }}>
            <span style={{ color: TEAL }}>V</span>erminord
          </div>
        </div>
        <MotivationTicker items={data.MOTIVATION} />
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{
            background: "rgba(91,174,122,0.12)", border: "1px solid rgba(91,174,122,0.42)",
            borderRadius: 14, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14,
          }}>
            <div>
              <div style={{ ...lab, fontSize: 11 }}>Samlet anleggshelse</div>
              <div style={{ fontSize: 13, color: scoreColor, fontWeight: 600, marginTop: 2 }}>{scoreWord} · {inMaal}/{totSys} i mål</div>
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
              {score}<span style={{ fontSize: 17, color: "rgba(255,255,255,0.4)" }}>/100</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {hh}:{mm}<span style={{ fontSize: 22, color: "rgba(255,255,255,0.4)" }}>:{ss}</span>
            </div>
            <div style={{ ...lab, fontSize: 12, marginTop: 4, textTransform: "capitalize" }}>{dn} {dd}. {mo} {yr} · uke {week}</div>
          </div>
        </div>
      </div>

      {/* BODY (scene swaps) */}
      <div style={{
        flex: 1, marginTop: 22, minHeight: 0,
        opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(8px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}>
        <SceneComp />
      </div>

      {/* Scene progress dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16, flexShrink: 0 }}>
        {SCENES.map((sc, i) => (
          <div key={sc.id} style={{
            height: 4, width: i === scene ? 40 : 18, borderRadius: 2,
            background: i === scene ? TEAL : "rgba(255,255,255,0.18)", transition: "all 0.4s",
          }} />
        ))}
      </div>
    </div>
  )
}

// ─── PIN Gate ───────────────────────────────────────────────

function PinGate({ onUnlock }) {
  const [input, setInput] = useState("")
  const [shake, setShake] = useState(false)

  const press = (k) => {
    if (k === "DEL") { setInput((p) => p.slice(0, -1)); return }
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
    <div style={{ fontFamily: FONT, background: BGC, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff" }}>
      <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
        <span style={{ color: TEAL }}>V</span>erminord
      </div>
      <div style={{ ...lab, fontSize: 12, color: TEAL, marginBottom: 32 }}>Kontrollrom</div>
      <div style={{ display: "flex", gap: 16, marginBottom: 32, animation: shake ? "vn-shake 0.3s" : "none" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            width: 18, height: 18, borderRadius: "50%",
            border: `2px solid ${shake ? "#E74C3C" : i < input.length ? GOLD : "rgba(255,255,255,0.2)"}`,
            background: i < input.length ? (shake ? "#E74C3C" : GOLD) : "transparent",
            transition: "all 0.12s",
          }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: 10 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "DEL"].map((k, i) => (
          k === "" ? <div key={i} /> :
            <button key={i} onClick={() => press(k)} style={{
              height: 72, background: CARD, border: BD,
              color: "#fff", fontSize: k === "DEL" ? 13 : 24, fontWeight: 600,
              cursor: "pointer", fontFamily: FONT, borderRadius: 12,
            }}>{k}</button>
        ))}
      </div>
      <style>{`@keyframes vn-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }`}</style>
    </div>
  )
}

// ─── Main Export ────────────────────────────────────────────

export default function KontrollromPage() {
  const [unlocked, setUnlocked] = useState(!!sessionStorage.getItem(PIN_SESSION_KEY))
  const [data, setData] = useState(buildMockData)
  const screenRef = useRef(null)

  // Auto-scale the 1920x1080 screen to fit any viewport
  useEffect(() => {
    if (!unlocked) return
    const screen = screenRef.current
    if (!screen) return
    function fit() {
      const w = window.innerWidth, h = window.innerHeight
      if (!w || !h) return
      screen.style.transform = "scale(" + Math.min(w / 1920, h / 1080) + ")"
    }
    window.addEventListener("resize", fit)
    window.addEventListener("orientationchange", fit)
    fit()
    requestAnimationFrame(fit)
    requestAnimationFrame(() => requestAnimationFrame(fit))
    const tid = setTimeout(fit, 300)
    let ro
    if (window.ResizeObserver) {
      try { ro = new ResizeObserver(fit); ro.observe(document.documentElement) } catch (_) {}
    }
    return () => {
      window.removeEventListener("resize", fit)
      window.removeEventListener("orientationchange", fit)
      clearTimeout(tid)
      if (ro) ro.disconnect()
    }
  }, [unlocked])

  // Supabase overlay: fetch real data and merge into mock data
  useEffect(() => {
    if (!unlocked) return
    let alive = true
    async function fetchLive() {
      try {
        const [sysR, logR, kompR] = await Promise.allSettled([
          supabase.from("systems").select("*").order("sort_order"),
          supabase.from("logs").select("system,date,temperature,moisture,ph,feed_amount_liters").order("date", { ascending: false }).limit(500),
          supabase.from("pre_compost_logs").select("system,logged_at,temperature,moisture,ph").order("logged_at", { ascending: false }).limit(200),
        ])
        if (!alive) return
        const systems = sysR.status === "fulfilled" && sysR.value.data ? sysR.value.data : null
        const logs = logR.status === "fulfilled" && logR.value.data ? logR.value.data : null
        const kompLogs = kompR.status === "fulfilled" && kompR.value.data ? kompR.value.data : null

        if (systems && systems.length > 0) {
          setData((prev) => {
            const mock = { ...prev }
            // Overlay latest readings onto mock systems
            const latestBySystem = {}
            if (logs) {
              logs.forEach((r) => {
                if (!latestBySystem[r.system]) latestBySystem[r.system] = r
              })
            }
            if (kompLogs) {
              kompLogs.forEach((r) => {
                if (!latestBySystem[r.system]) latestBySystem[r.system] = r
              })
            }
            const alias = { "Wedge 1": "W1", "Wedge 2": "W2", "Breeder Bin": "BBIN", "Forkompost 1": "BIN 1", "Forkompost 2": "BIN 2" }
            mock.SYSTEMS = mock.SYSTEMS.map((s) => {
              const live = latestBySystem[s.name] || latestBySystem[alias[s.name]]
              if (!live) return s
              return {
                ...s,
                temp: live.temperature != null ? Number(live.temperature) : s.temp,
                ph: live.ph != null ? Number(live.ph) : s.ph,
                fukt: live.moisture != null ? Number(live.moisture) : s.fukt,
                for: live.feed_amount_liters != null ? Number(live.feed_amount_liters) : s.for,
              }
            })
            mock.PROD = mock.SYSTEMS.filter((s) => s.group === "prod")
            mock.FORK = mock.SYSTEMS.filter((s) => isFork(s))
            return mock
          })
        }
      } catch (_) {
        // Keep mock data on failure
      }
    }
    fetchLive()
    const iv = setInterval(fetchLive, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(iv) }
  }, [unlocked])

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: BGC, overflow: "hidden" }}>
      <div ref={screenRef} style={{ width: 1920, height: 1080, transformOrigin: "center center", flexShrink: 0 }}>
        <TVDashboard data={data} />
      </div>
    </div>
  )
}
