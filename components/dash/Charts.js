"use client";

import { useEffect, useRef, useState } from "react";
import { fmtNum, fmtDay, fmtTime } from "@/lib/format";
import { dayStart, isoDateOslo, addDaysIso } from "@/lib/time";

function useWidth(ref, fallback = 320) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setW(Math.max(160, Math.round(el.getBoundingClientRect().width)));
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// 1-2-5 steps so gridlines land on readable numbers.
function niceStep(range, target = 4) {
  const rough = range / target;
  const pow = 10 ** Math.floor(Math.log10(rough || 1));
  for (const m of [1, 2, 5, 10]) if (m * pow >= rough) return m * pow;
  return 10 * pow;
}

// points: [{ t: ms, v: number|null }] in time order. Gaps (null) break the line.
function pathFor(points, x, y) {
  let d = "", pen = false;
  for (const p of points) {
    if (p.v == null) { pen = false; continue; }
    d += (pen ? " L" : " M") + x(p.t).toFixed(1) + " " + y(p.v).toFixed(1);
    pen = true;
  }
  return d.trim();
}

// X ticks: Oslo midnights, thinned so labels never collide.
function dayTicks(t0, t1, width) {
  const span = t1 - t0;
  if (span <= 0) return [];
  const ticks = [];
  let iso = isoDateOslo(new Date(t0));
  for (let i = 0; i < 400; i++) {
    const t = dayStart(iso).getTime();
    if (t > t1) break;
    if (t >= t0) ticks.push({ t, label: fmtDay(new Date(t)) });
    iso = addDaysIso(iso, 1);
  }
  const maxLabels = Math.max(2, Math.floor(width / 64));
  if (ticks.length <= maxLabels) {
    if (ticks.length >= 2) return ticks;
    // under two days: hour ticks instead
    const out = [];
    const step = span <= 6 * 3600e3 ? 3600e3 : 6 * 3600e3;
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push({ t, label: fmtTime(new Date(t)).replace("kl ", "") });
    return out;
  }
  const every = Math.ceil(ticks.length / maxLabels);
  return ticks.filter((_, i) => i % every === 0);
}

export function LineChart({ points = [], height = 190, unit = "", decimals = 1, yMin, yMax, title, emptyText = "Ingen måling", ariaLabel }) {
  const ref = useRef(null);
  const w = useWidth(ref);
  const valid = points.filter((p) => p.v != null);

  if (!valid.length) {
    return <div ref={ref} className="chart empty" style={{ height }} aria-label={ariaLabel || title}>{emptyText}</div>;
  }

  const padL = 44, padR = 10, padT = 12, padB = 24;
  const iw = Math.max(10, w - padL - padR), ih = height - padT - padB;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  let lo = yMin ?? Math.min(...valid.map((p) => p.v));
  let hi = yMax ?? Math.max(...valid.map((p) => p.v));
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  const x = (t) => padL + ((t - t0) / (t1 - t0 || 1)) * iw;
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * ih;

  const yTicks = [];
  for (let v = lo; v <= hi + 1e-9; v += step) yTicks.push(v);
  const xTicks = dayTicks(t0, t1, iw);
  const dec = step < 1 ? Math.max(decimals, 1) : step >= 10 ? 0 : decimals;

  return (
    <div ref={ref} className="chart">
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={ariaLabel || title}>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end">{fmtNum(v, dec)}</text>
          </g>
        ))}
        <line className="axis" x1={padL} x2={w - padR} y1={padT + ih} y2={padT + ih} />
        {xTicks.map((tk) => (
          <text key={tk.t} x={x(tk.t)} y={height - 6} textAnchor="middle">{tk.label}</text>
        ))}
        <path className="line" d={pathFor(points, x, y)} />
      </svg>
      {unit ? <span className="small">{unit}</span> : null}
    </div>
  );
}

// Tiny trend line, no axes. Scales to its box; the stroke stays 1.5px.
export function Sparkline({ points = [], width = 112, height = 28, ariaLabel = "Siste 7 dager" }) {
  const valid = points.filter((p) => p.v != null);
  if (valid.length < 2) return <span className="spark empty" aria-hidden="true" />;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  let lo = Math.min(...valid.map((p) => p.v)), hi = Math.max(...valid.map((p) => p.v));
  if (hi - lo < 0.5) { lo -= 0.5; hi += 0.5; }
  const x = (t) => 1 + ((t - t0) / (t1 - t0 || 1)) * (width - 2);
  const y = (v) => 2 + (1 - (v - lo) / (hi - lo)) * (height - 4);
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
      <path d={pathFor(points, x, y)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
