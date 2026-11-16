import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compile, type EvalFunction } from 'mathjs';
import { Crosshair, Download, Eye, EyeOff, Plus, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { downloadBlob } from '../../utils/storage';
import { soundEngine } from '../../utils/soundEngine';

interface PlotFunc {
  id: string;
  expr: string;
  color: string;
  visible: boolean;
}

interface SpecialPoint {
  x: number;
  y: number;
  kind: 'root' | 'intersection';
  label: string;
  color: string;
}

const CURVE_COLORS = ['#EF4444', '#2563EB', '#16A34A', '#9333EA', '#EA580C', '#DB2777'];

function safeEval(fn: EvalFunction, x: number): number {
  try {
    const res = fn.evaluate({ x, pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2 });
    if (typeof res === 'number' && Number.isFinite(res)) return res;
    return Number.NaN;
  } catch {
    return Number.NaN;
  }
}

function bisectZero(g: (x: number) => number, a: number, b: number): number | null {
  let fa = g(a);
  let fb = g(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
  if (Math.abs(fa) < 1e-12) return a;
  if (fa * fb > 0) return null;
  // Filter vertical asymptotes (e.g. tan(x) or 1/x jumping from -1000 to +1000)
  if (Math.abs(fa - fb) > 50) {
    const midCheck = g((a + b) / 2);
    if (!Number.isFinite(midCheck) || Math.abs(midCheck) > Math.max(Math.abs(fa), Math.abs(fb))) {
      return null;
    }
  }
  let lo = a;
  let hi = b;
  for (let i = 0; i < 36; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = g(mid);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < 1e-11) return mid;
    if (fa * fm <= 0) {
      hi = mid;
      fb = fm;
    } else {
      lo = mid;
      fa = fm;
    }
  }
  const root = 0.5 * (lo + hi);
  const fRoot = g(root);
  return Math.abs(fRoot) < 1e-3 ? root : null;
}

function chooseGridStep(span: number): number {
  const raw = span / 10;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  if (norm < 1.5) return pow;
  if (norm < 3.5) return 2 * pow;
  if (norm < 7.5) return 5 * pow;
  return 10 * pow;
}

export default function GraphingCalculatorTool() {
  const [funcs, setFuncs] = useState<PlotFunc[]>([
    { id: 'f1', expr: 'sin(x)', color: '#EF4444', visible: true },
    { id: 'f2', expr: 'x^2 / 4 - 1', color: '#2563EB', visible: true },
  ]);
  const [view, setView] = useState({ centerX: 0, centerY: 0, scale: 52 }); // px per unit
  const [tracePoints, setTracePoints] = useState(true);
  const [hoverWorld, setHoverWorld] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; cx: number; cy: number } | null>(null);

  const compiled = useMemo(() => {
    return funcs.map((f) => {
      if (!f.expr.trim()) return { ...f, fn: null, err: null };
      try {
        const normalized = f.expr.replace(/^y\s*=\s*/i, '').replace(/ln\(/g, 'log(');
        // Translate bare log(x) with 1 arg to log10 if user writes log10, keep mathjs standard log(x) natural log
        const fn = compile(normalized);
        // Smoke-test evaluation
        void safeEval(fn, 1);
        return { ...f, fn, err: null };
      } catch (e) {
        return { ...f, fn: null, err: e instanceof Error ? e.message : 'Invalid syntax' };
      }
    });
  }, [funcs]);

  const specialPoints = useMemo<SpecialPoint[]>(() => {
    if (!tracePoints) return [];
    const active = compiled.filter((c) => c.visible && c.fn);
    if (active.length === 0) return [];

    const halfUnits = 450 / view.scale;
    const xMin = view.centerX - halfUnits;
    const xMax = view.centerX + halfUnits;
    const samples = 360;
    const dx = (xMax - xMin) / samples;
    const pts: SpecialPoint[] = [];

    const dedupePush = (p: SpecialPoint) => {
      if (
        !pts.some(
          (q) =>
            q.kind === p.kind &&
            Math.abs(q.x - p.x) < dx * 0.6 &&
            Math.abs(q.y - p.y) < 1e-2
        )
      ) {
        pts.push(p);
      }
    };

    // Roots (y = 0)
    for (const c of active) {
      const fn = c.fn!;
      for (let i = 0; i < samples; i++) {
        const a = xMin + i * dx;
        const r = bisectZero((x) => safeEval(fn, x), a, a + dx);
        if (r !== null && pts.length < 40) {
          dedupePush({
            x: Math.abs(r) < 1e-9 ? 0 : r,
            y: 0,
            kind: 'root',
            label: `Root of y = ${c.expr}`,
            color: c.color,
          });
        }
      }
    }

    // Pairwise intersections
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const fA = active[i].fn!;
        const fB = active[j].fn!;
        for (let k = 0; k < samples; k++) {
          const a = xMin + k * dx;
          const r = bisectZero((x) => safeEval(fA, x) - safeEval(fB, x), a, a + dx);
          if (r !== null && pts.length < 60) {
            const yVal = safeEval(fA, r);
            if (Number.isFinite(yVal)) {
              dedupePush({
                x: Math.abs(r) < 1e-9 ? 0 : r,
                y: Math.abs(yVal) < 1e-9 ? 0 : yVal,
                kind: 'intersection',
                label: `Intersection (f${i + 1} = f${j + 1})`,
                color: '#F59E0B',
              });
            }
          }
        }
      }
    }
    return pts;
  }, [compiled, tracePoints, view]);

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(300, Math.floor(rect.width));
    const h = Math.max(340, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Warm cream graph paper background
    ctx.fillStyle = '#FFFDF8';
    ctx.fillRect(0, 0, w, h);

    const toScreenX = (x: number) => w / 2 + (x - view.centerX) * view.scale;
    const toScreenY = (y: number) => h / 2 - (y - view.centerY) * view.scale;
    const toWorldX = (sx: number) => view.centerX + (sx - w / 2) / view.scale;

    const xMin = toWorldX(0);
    const xMax = toWorldX(w);
    const yMin = view.centerY - h / 2 / view.scale;
    const yMax = view.centerY + h / 2 / view.scale;

    const step = chooseGridStep(xMax - xMin);
    const minorStep = step / 5;

    // Minor grid lines
    ctx.strokeStyle = '#F7EBDA';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(xMin / minorStep) * minorStep; x <= xMax; x += minorStep) {
      const sx = toScreenX(x);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = Math.floor(yMin / minorStep) * minorStep; y <= yMax; y += minorStep) {
      const sy = toScreenY(y);
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();

    // Major grid lines
    ctx.strokeStyle = '#E8D2B5';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = Math.floor(xMin / step) * step; x <= xMax; x += step) {
      const sx = toScreenX(x);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = Math.floor(yMin / step) * step; y <= yMax; y += step) {
      const sy = toScreenY(y);
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();

    // X and Y Cartesian axes
    const axisX = toScreenX(0);
    const axisY = toScreenY(0);
    ctx.strokeStyle = '#5C3A1E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (axisX >= 0 && axisX <= w) {
      ctx.moveTo(axisX, 0);
      ctx.lineTo(axisX, h);
    }
    if (axisY >= 0 && axisY <= h) {
      ctx.moveTo(0, axisY);
      ctx.lineTo(w, axisY);
    }
    ctx.stroke();

    // Axis tick labels
    ctx.fillStyle = '#6E4928';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    const labelY = Math.min(h - 6, Math.max(14, axisY + 15));
    for (let x = Math.floor(xMin / step) * step; x <= xMax; x += step) {
      if (Math.abs(x) < step * 1e-6) continue;
      const sx = toScreenX(x);
      const txt = Number.parseFloat(x.toPrecision(6)).toString();
      ctx.fillText(txt, sx + 3, labelY);
    }
    const labelX = Math.min(w - 42, Math.max(6, axisX + 6));
    for (let y = Math.floor(yMin / step) * step; y <= yMax; y += step) {
      if (Math.abs(y) < step * 1e-6) continue;
      const sy = toScreenY(y);
      const txt = Number.parseFloat(y.toPrecision(6)).toString();
      ctx.fillText(txt, labelX, sy - 4);
    }

    // Plot each visible function
    for (const c of compiled) {
      if (!c.visible || !c.fn) continue;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 2.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let penDown = false;
      let prevSy = 0;

      for (let px = 0; px <= w; px += 1) {
        const wx = toWorldX(px);
        const wy = safeEval(c.fn, wx);
        if (!Number.isFinite(wy)) {
          penDown = false;
          continue;
        }
        const sy = toScreenY(wy);
        if (sy < -h * 2 || sy > h * 3 || (penDown && Math.abs(sy - prevSy) > h * 1.1)) {
          penDown = false;
          prevSy = sy;
          continue;
        }
        if (!penDown) {
          ctx.moveTo(px, sy);
          penDown = true;
        } else {
          ctx.lineTo(px, sy);
        }
        prevSy = sy;
      }
      ctx.stroke();
    }

    // Draw traced roots & intersections
    if (tracePoints) {
      for (const p of specialPoints) {
        const sx = toScreenX(p.x);
        const sy = toScreenY(p.y);
        if (sx < -8 || sx > w + 8 || sy < -8 || sy > h + 8) continue;
        ctx.beginPath();
        ctx.arc(sx, sy, p.kind === 'intersection' ? 5.5 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = p.kind === 'intersection' ? '#FBBF24' : '#FFFDF9';
        ctx.fill();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = p.kind === 'intersection' ? '#78350F' : p.color;
        ctx.stroke();
      }
    }

    // Hover crosshair & snapped function evaluations
    if (hoverWorld) {
      const sx = toScreenX(hoverWorld.x);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(92, 58, 30, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
      ctx.restore();

      for (const c of compiled) {
        if (!c.visible || !c.fn) continue;
        const yv = safeEval(c.fn, hoverWorld.x);
        if (!Number.isFinite(yv)) continue;
        const sy = toScreenY(yv);
        if (sy >= 0 && sy <= h) {
          ctx.beginPath();
          ctx.arc(sx, sy, 5, 0, Math.PI * 2);
          ctx.fillStyle = c.color;
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [view, compiled, tracePoints, specialPoints, hoverWorld]);

  useEffect(() => {
    drawGraph();
    const onResize = () => drawGraph();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [drawGraph]);

  // Native non-passive wheel zoom around cursor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;

      setView((prev) => {
        const nextScale = Math.min(2500, Math.max(0.25, prev.scale * factor));
        const wx = prev.centerX + (mx - rect.width / 2) / prev.scale;
        const wy = prev.centerY - (my - rect.height / 2) / prev.scale;
        return {
          scale: nextScale,
          centerX: wx - (mx - rect.width / 2) / nextScale,
          centerY: wy + (my - rect.height / 2) / nextScale,
        };
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) {
        soundEngine.playSuccess();
        downloadBlob(blob, 'bsu-graph.png');
      }
    }, 'image/png');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left Sidebar: Function Equations + Roots/Intersections Inspector */}
      <div className="lg:col-span-4 space-y-4">
        <div className="toy-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-[#3B2314]">Functions y = f(x)</h3>
            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(1.08);
                setFuncs((prev) => [
                  ...prev,
                  {
                    id: `f-${Date.now()}`,
                    expr: '',
                    color: CURVE_COLORS[prev.length % CURVE_COLORS.length],
                    visible: true,
                  },
                ]);
              }}
              className="toy-btn-primary px-3 py-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Curve
            </button>
          </div>

          <div className="space-y-2.5">
            {compiled.map((f, idx) => (
              <div
                key={f.id}
                className="rounded-xl bg-[#FFFDF9] border-2 border-[#E2C6A2] p-2.5 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/20"
                    style={{ backgroundColor: f.color }}
                  />
                  <span className="font-mono text-xs font-bold text-[#7A5433]">
                    f{idx + 1}(x)=
                  </span>
                  <input
                    type="text"
                    value={f.expr}
                    onChange={(e) =>
                      setFuncs((prev) =>
                        prev.map((item) =>
                          item.id === f.id ? { ...item, expr: e.target.value } : item
                        )
                      )
                    }
                    placeholder="e.g. cos(x) * x"
                    className="flex-1 min-w-0 bg-[#FFF8EB] rounded-lg border border-[#DEC098] px-2.5 py-1.5 font-mono text-xs text-[#3B2314] focus:outline-none focus:border-[#D97706]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFuncs((prev) =>
                        prev.map((item) =>
                          item.id === f.id ? { ...item, visible: !item.visible } : item
                        )
                      )
                    }
                    className="p-1 text-[#7A5433] hover:text-[#3B2314]"
                    title={f.visible ? 'Hide curve' : 'Show curve'}
                  >
                    {f.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 opacity-50" />}
                  </button>
                  {funcs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFuncs((prev) => prev.filter((item) => item.id !== f.id))}
                      className="p-1 text-[#991B1B] hover:bg-[#FEE2E2] rounded"
                      title="Remove function"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {f.err && <p className="text-[10.5px] text-[#B91C1C] font-mono pl-5">{f.err}</p>}
              </div>
            ))}
          </div>

          {/* Preset Function Chips */}
          <div className="pt-1">
            <div className="text-[11px] font-bold text-[#8B5A2B] mb-1.5">Quick Presets:</div>
            <div className="flex flex-wrap gap-1.5">
              {['sin(x)', 'x^2 - 4', 'log(x)', 'cos(2*x)', 'x^3 - 3*x', '1/x'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setFuncs((prev) => [
                      ...prev,
                      {
                        id: `f-${Date.now()}`,
                        expr: preset,
                        color: CURVE_COLORS[prev.length % CURVE_COLORS.length],
                        visible: true,
                      },
                    ]);
                  }}
                  className="px-2 py-1 rounded-lg bg-[#FFFDF9] hover:bg-[#FEF3C7] border border-[#D4AA78] font-mono text-[11px] text-[#4A2506] cursor-pointer"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Traced Roots & Intersections List */}
        <div className="toy-panel p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-display font-bold text-sm text-[#3B2314] flex items-center gap-1.5">
              <Crosshair className="w-4 h-4 text-[#D97706]" />
              Roots &amp; Intersections ({specialPoints.length})
            </h4>
            <button
              type="button"
              onClick={() => setTracePoints((t) => !t)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border cursor-pointer ${
                tracePoints
                  ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]'
                  : 'bg-[#F3E5D0] border-[#C99B66] text-[#7A5433]'
              }`}
            >
              {tracePoints ? 'Tracer ON' : 'Tracer OFF'}
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs font-mono">
            {!tracePoints ? (
              <p className="font-sans text-[#7A5433]">Enable Tracer to detect visible roots &amp; intersections.</p>
            ) : specialPoints.length === 0 ? (
              <p className="font-sans text-[#7A5433]">No roots or intersections inside current viewport.</p>
            ) : (
              specialPoints.slice(0, 24).map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[#FFFDF9] border border-[#E6C79C] px-2.5 py-1.5"
                >
                  <span className="font-sans text-[11px] text-[#6E4928] truncate">{p.label}</span>
                  <span className="font-bold text-[#3B2314] shrink-0">
                    ({p.x.toFixed(3)}, {p.y.toFixed(3)})
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Interactive Canvas Plane */}
      <div className="lg:col-span-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView((v) => ({ ...v, scale: Math.min(2500, v.scale * 1.3) }))}
              className="toy-btn-cream px-3 py-1.5 text-xs"
            >
              <ZoomIn className="w-3.5 h-3.5" /> Zoom In
            </button>
            <button
              type="button"
              onClick={() => setView((v) => ({ ...v, scale: Math.max(0.25, v.scale / 1.3) }))}
              className="toy-btn-cream px-3 py-1.5 text-xs"
            >
              <ZoomOut className="w-3.5 h-3.5" /> Zoom Out
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(0.95);
                setView({ centerX: 0, centerY: 0, scale: 52 });
              }}
              className="toy-btn-cream px-3 py-1.5 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Origin
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportPng}
            className="toy-btn-gold px-3.5 py-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export PNG
          </button>
        </div>

        <div className="relative rounded-2xl border-[3px] border-b-[6px] border-[#C99B66] overflow-hidden shadow-toy bg-[#FFFDF8]">
          <canvas
            ref={canvasRef}
            onMouseDown={(e) => {
              dragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                cx: view.centerX,
                cy: view.centerY,
              };
            }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = e.clientX - rect.left;
              const my = e.clientY - rect.top;
              if (dragRef.current) {
                const dx = e.clientX - dragRef.current.startX;
                const dy = e.clientY - dragRef.current.startY;
                setView((v) => ({
                  ...v,
                  centerX: dragRef.current!.cx - dx / v.scale,
                  centerY: dragRef.current!.cy + dy / v.scale,
                }));
              }
              setHoverWorld({
                x: view.centerX + (mx - rect.width / 2) / view.scale,
                y: view.centerY - (my - rect.height / 2) / view.scale,
              });
            }}
            onMouseUp={() => {
              dragRef.current = null;
            }}
            onMouseLeave={() => {
              dragRef.current = null;
              setHoverWorld(null);
            }}
            className="w-full h-[460px] sm:h-[520px] block cursor-grab active:cursor-grabbing"
          />

          {/* Live Hover Coordinate HUD */}
          {hoverWorld && (
            <div className="pointer-events-none absolute top-3 left-3 rounded-xl bg-[#FFFDF9]/95 border-2 border-[#D4AA78] px-3 py-2 text-[11px] font-mono shadow-sm space-y-0.5">
              <div className="font-bold text-[#3B2314]">
                x = {hoverWorld.x.toFixed(3)}, y = {hoverWorld.y.toFixed(3)}
              </div>
              {compiled
                .filter((c) => c.visible && c.fn)
                .map((c, idx) => {
                  const yv = safeEval(c.fn!, hoverWorld.x);
                  return (
                    <div key={c.id} style={{ color: c.color }} className="font-semibold">
                      f{idx + 1}({hoverWorld.x.toFixed(2)}) ={' '}
                      {Number.isFinite(yv) ? yv.toFixed(4) : 'undef'}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
