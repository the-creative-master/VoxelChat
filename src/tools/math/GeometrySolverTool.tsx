import { useMemo, useState } from 'react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

type ShapeId =
  | 'circle'
  | 'triangle'
  | 'rectangle'
  | 'trapezoid'
  | 'polygon'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'prism'
  | 'pyramid';

interface ShapeMeta {
  id: ShapeId;
  name: string;
  dim: '2D' | '3D';
  fields: Array<{ key: string; label: string; defaultVal: string }>;
}

const SHAPES: ShapeMeta[] = [
  // 2D Shapes
  { id: 'circle', name: 'Circle', dim: '2D', fields: [{ key: 'r', label: 'Radius (r)', defaultVal: '7' }] },
  {
    id: 'triangle',
    name: 'Triangle (SSS)',
    dim: '2D',
    fields: [
      { key: 'a', label: 'Side a', defaultVal: '5' },
      { key: 'b', label: 'Side b', defaultVal: '6' },
      { key: 'c', label: 'Side c', defaultVal: '7' },
    ],
  },
  {
    id: 'rectangle',
    name: 'Rectangle',
    dim: '2D',
    fields: [
      { key: 'w', label: 'Width (w)', defaultVal: '12' },
      { key: 'h', label: 'Height (h)', defaultVal: '8' },
    ],
  },
  {
    id: 'trapezoid',
    name: 'Trapezoid',
    dim: '2D',
    fields: [
      { key: 'a', label: 'Top Base (a)', defaultVal: '6' },
      { key: 'b', label: 'Bottom Base (b)', defaultVal: '12' },
      { key: 'h', label: 'Height (h)', defaultVal: '5' },
    ],
  },
  {
    id: 'polygon',
    name: 'Regular Polygon',
    dim: '2D',
    fields: [
      { key: 'n', label: 'Number of Sides (n ≥ 3)', defaultVal: '6' },
      { key: 's', label: 'Side Length (s)', defaultVal: '8' },
    ],
  },
  // 3D Solids
  { id: 'sphere', name: 'Sphere', dim: '3D', fields: [{ key: 'r', label: 'Radius (r)', defaultVal: '5' }] },
  {
    id: 'cylinder',
    name: 'Cylinder',
    dim: '3D',
    fields: [
      { key: 'r', label: 'Radius (r)', defaultVal: '4' },
      { key: 'h', label: 'Height (h)', defaultVal: '10' },
    ],
  },
  {
    id: 'cone',
    name: 'Cone',
    dim: '3D',
    fields: [
      { key: 'r', label: 'Base Radius (r)', defaultVal: '4' },
      { key: 'h', label: 'Height (h)', defaultVal: '9' },
    ],
  },
  {
    id: 'prism',
    name: 'Rectangular Prism',
    dim: '3D',
    fields: [
      { key: 'l', label: 'Length (l)', defaultVal: '10' },
      { key: 'w', label: 'Width (w)', defaultVal: '6' },
      { key: 'h', label: 'Height (h)', defaultVal: '5' },
    ],
  },
  {
    id: 'pyramid',
    name: 'Square Pyramid',
    dim: '3D',
    fields: [
      { key: 'a', label: 'Base Edge (a)', defaultVal: '8' },
      { key: 'h', label: 'Height (h)', defaultVal: '9' },
    ],
  },
];

function fmt(n: number): string {
  return String(Number.parseFloat(n.toFixed(5)));
}

export default function GeometrySolverTool() {
  const [dimTab, setDimTab] = useState<'2D' | '3D'>('2D');
  const [shapeId, setShapeId] = useState<ShapeId>('circle');
  const [vals, setVals] = useState<Record<string, string>>({ r: '7' });

  const shape = SHAPES.find((s) => s.id === shapeId) ?? SHAPES[0];

  const pickShape = (s: ShapeMeta) => {
    soundEngine.playPop(1.06);
    setShapeId(s.id);
    const defaults: Record<string, string> = {};
    for (const f of s.fields) defaults[f.key] = f.defaultVal;
    setVals(defaults);
  };

  const num = (k: string) => Number.parseFloat(vals[k] ?? '0');

  const computed = useMemo(() => {
    const items: Array<{ label: string; formula: string; value: string }> = [];
    const r = num('r');
    const a = num('a');
    const b = num('b');
    const c = num('c');
    const w = num('w');
    const h = num('h');
    const l = num('l');
    const n = Math.floor(num('n'));
    const s = num('s');

    switch (shapeId) {
      case 'circle':
        if (!(r > 0)) return { error: 'Radius r must be > 0.' };
        items.push(
          { label: 'Area', formula: 'πr²', value: fmt(Math.PI * r * r) },
          { label: 'Circumference', formula: '2πr', value: fmt(2 * Math.PI * r) },
          { label: 'Diameter', formula: '2r', value: fmt(2 * r) }
        );
        break;
      case 'triangle':
        if (!(a > 0 && b > 0 && c > 0)) return { error: 'All three sides must be > 0.' };
        if (!(a + b > c && a + c > b && b + c > a)) {
          return { error: 'Triangle inequality violated: sum of any two sides must exceed the third.' };
        }
        {
          const p = a + b + c;
          const sp = p / 2;
          const area = Math.sqrt(sp * (sp - a) * (sp - b) * (sp - c));
          const angA = (Math.acos((b * b + c * c - a * a) / (2 * b * c)) * 180) / Math.PI;
          const angB = (Math.acos((a * a + c * c - b * b) / (2 * a * c)) * 180) / Math.PI;
          const angC = 180 - angA - angB;
          items.push(
            { label: "Area (Heron's)", formula: '√[s(s−a)(s−b)(s−c)]', value: fmt(area) },
            { label: 'Perimeter', formula: 'a + b + c', value: fmt(p) },
            { label: 'Height to base c', formula: '2A / c', value: fmt((2 * area) / c) },
            {
              label: 'Interior Angles',
              formula: 'Law of Cosines',
              value: `${angA.toFixed(1)}°, ${angB.toFixed(1)}°, ${angC.toFixed(1)}°`,
            }
          );
        }
        break;
      case 'rectangle':
        if (!(w > 0 && h > 0)) return { error: 'Width and height must be > 0.' };
        items.push(
          { label: 'Area', formula: 'w × h', value: fmt(w * h) },
          { label: 'Perimeter', formula: '2(w + h)', value: fmt(2 * (w + h)) },
          { label: 'Diagonal', formula: '√(w² + h²)', value: fmt(Math.hypot(w, h)) }
        );
        break;
      case 'trapezoid':
        if (!(a > 0 && b > 0 && h > 0)) return { error: 'Bases a, b and height h must be > 0.' };
        {
          const leg = Math.hypot((b - a) / 2, h);
          items.push(
            { label: 'Area', formula: '½(a + b)h', value: fmt(0.5 * (a + b) * h) },
            { label: 'Median (Midsegment)', formula: '½(a + b)', value: fmt(0.5 * (a + b)) },
            { label: 'Isosceles Perimeter', formula: 'a + b + 2·leg', value: fmt(a + b + 2 * leg) }
          );
        }
        break;
      case 'polygon':
        if (!(n >= 3 && n <= 60 && s > 0)) return { error: 'Sides n must be 3–60 and s > 0.' };
        {
          const apothem = s / (2 * Math.tan(Math.PI / n));
          const area = 0.5 * n * s * apothem;
          const intAngle = ((n - 2) * 180) / n;
          items.push(
            { label: 'Area', formula: '¼ n s² cot(π/n)', value: fmt(area) },
            { label: 'Perimeter', formula: 'n × s', value: fmt(n * s) },
            { label: 'Apothem', formula: 's / (2 tan(π/n))', value: fmt(apothem) },
            { label: 'Interior Angle', formula: '(n−2)×180°/n', value: `${fmt(intAngle)}°` }
          );
        }
        break;
      case 'sphere':
        if (!(r > 0)) return { error: 'Radius r must be > 0.' };
        items.push(
          { label: 'Volume', formula: '(4/3)πr³', value: fmt((4 / 3) * Math.PI * r ** 3) },
          { label: 'Surface Area', formula: '4πr²', value: fmt(4 * Math.PI * r * r) },
          { label: 'Great Circle Circumference', formula: '2πr', value: fmt(2 * Math.PI * r) }
        );
        break;
      case 'cylinder':
        if (!(r > 0 && h > 0)) return { error: 'Radius r and height h must be > 0.' };
        items.push(
          { label: 'Volume', formula: 'πr²h', value: fmt(Math.PI * r * r * h) },
          {
            label: 'Total Surface Area',
            formula: '2πr(r + h)',
            value: fmt(2 * Math.PI * r * (r + h)),
          },
          { label: 'Lateral Surface Area', formula: '2πrh', value: fmt(2 * Math.PI * r * h) }
        );
        break;
      case 'cone':
        if (!(r > 0 && h > 0)) return { error: 'Radius r and height h must be > 0.' };
        {
          const slant = Math.hypot(r, h);
          items.push(
            { label: 'Volume', formula: '(1/3)πr²h', value: fmt((1 / 3) * Math.PI * r * r * h) },
            { label: 'Slant Height (l)', formula: '√(r² + h²)', value: fmt(slant) },
            {
              label: 'Total Surface Area',
              formula: 'πr(r + l)',
              value: fmt(Math.PI * r * (r + slant)),
            },
            { label: 'Lateral Surface Area', formula: 'πrl', value: fmt(Math.PI * r * slant) }
          );
        }
        break;
      case 'prism':
        if (!(l > 0 && w > 0 && h > 0)) return { error: 'Length, width, and height must be > 0.' };
        items.push(
          { label: 'Volume', formula: 'l × w × h', value: fmt(l * w * h) },
          {
            label: 'Total Surface Area',
            formula: '2(lw + lh + wh)',
            value: fmt(2 * (l * w + l * h + w * h)),
          },
          {
            label: 'Space Diagonal',
            formula: '√(l² + w² + h²)',
            value: fmt(Math.sqrt(l * l + w * w + h * h)),
          }
        );
        break;
      case 'pyramid':
        if (!(a > 0 && h > 0)) return { error: 'Base edge a and height h must be > 0.' };
        {
          const slant = Math.hypot(a / 2, h);
          const lateral = 2 * a * slant;
          items.push(
            { label: 'Volume', formula: '(1/3)a²h', value: fmt((1 / 3) * a * a * h) },
            { label: 'Slant Height (s)', formula: '√((a/2)² + h²)', value: fmt(slant) },
            { label: 'Total Surface Area', formula: 'a² + 2as', value: fmt(a * a + lateral) },
            { label: 'Lateral Surface Area', formula: '2as', value: fmt(lateral) }
          );
        }
        break;
    }
    return { items };
  }, [shapeId, vals]);

  const renderDiagram = () => {
    const w = Math.max(0.1, num('w') || 10);
    const h = Math.max(0.1, num('h') || 8);
    const a = Math.max(0.1, num('a') || 6);
    const b = Math.max(0.1, num('b') || 10);
    const r = Math.max(0.1, num('r') || 5);
    const n = Math.min(24, Math.max(3, Math.floor(num('n') || 6)));

    return (
      <svg width="240" height="210" viewBox="0 0 240 210" className="mx-auto">
        {shapeId === 'circle' && (
          <g>
            <circle cx="120" cy="105" r="72" fill="#FEE2E2" stroke="#B91C1C" strokeWidth="3" />
            <line x1="120" y1="105" x2="192" y2="105" stroke="#3B2314" strokeWidth="2.5" strokeDasharray="5 3" />
            <circle cx="120" cy="105" r="4" fill="#3B2314" />
            <text x="152" y="97" fontSize="12" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
              r = {vals.r}
            </text>
          </g>
        )}
        {shapeId === 'rectangle' && (() => {
          const maxSide = Math.max(w, h);
          const rw = Math.max(36, (w / maxSide) * 165);
          const rh = Math.max(32, (h / maxSide) * 135);
          const x = 120 - rw / 2;
          const y = 105 - rh / 2;
          return (
            <g>
              <rect x={x} y={y} width={rw} height={rh} rx="4" fill="#FEF3C7" stroke="#B45309" strokeWidth="3" />
              <text x="120" y={y + rh + 18} textAnchor="middle" fontSize="12" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
                w = {vals.w}
              </text>
              <text x={x + rw + 8} y="109" fontSize="12" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
                h={vals.h}
              </text>
            </g>
          );
        })()}
        {shapeId === 'triangle' && (
          <g>
            <polygon points="44,168 196,168 112,42" fill="#DCFCE7" stroke="#15803D" strokeWidth="3" strokeLinejoin="round" />
            <text x="120" y="188" textAnchor="middle" fontSize="12" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
              c = {vals.c}
            </text>
            <text x="64" y="102" fontSize="12" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
              a={vals.a}
            </text>
            <text x="160" y="102" fontSize="12" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
              b={vals.b}
            </text>
          </g>
        )}
        {shapeId === 'trapezoid' && (() => {
          const maxB = Math.max(a, b, h);
          const tw = Math.max(34, (a / maxB) * 170);
          const bw = Math.max(34, (b / maxB) * 170);
          const th = Math.max(40, Math.min(125, (h / maxB) * 130));
          const y1 = 105 - th / 2;
          const y2 = 105 + th / 2;
          return (
            <g>
              <polygon
                points={`${120 - tw / 2},${y1} ${120 + tw / 2},${y1} ${120 + bw / 2},${y2} ${120 - bw / 2},${y2}`}
                fill="#DBEAFE"
                stroke="#1D4ED8"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <line x1="120" y1={y1} x2="120" y2={y2} stroke="#3B2314" strokeWidth="2" strokeDasharray="4 3" />
              <text x="120" y={y1 - 8} textAnchor="middle" fontSize="11.5" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
                a = {vals.a}
              </text>
              <text x="120" y={y2 + 17} textAnchor="middle" fontSize="11.5" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
                b = {vals.b}
              </text>
              <text x="126" y="108" fontSize="11" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
                h={vals.h}
              </text>
            </g>
          );
        })()}
        {shapeId === 'polygon' && (() => {
          const pts = Array.from({ length: n }, (_, i) => {
            const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
            return `${120 + 72 * Math.cos(ang)},${105 + 72 * Math.sin(ang)}`;
          }).join(' ');
          return (
            <g>
              <polygon points={pts} fill="#FCE7F3" stroke="#BE185D" strokeWidth="3" strokeLinejoin="round" />
              <text x="120" y="110" textAnchor="middle" fontSize="12" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
                n={n}, s={vals.s}
              </text>
            </g>
          );
        })()}
        {shapeId === 'sphere' && (
          <g>
            <circle cx="120" cy="105" r="70" fill="#FEE2E2" stroke="#B91C1C" strokeWidth="3" />
            <ellipse cx="120" cy="105" rx="70" ry="22" fill="none" stroke="#B91C1C" strokeWidth="2" strokeDasharray="5 4" />
            <line x1="120" y1="105" x2="190" y2="105" stroke="#3B2314" strokeWidth="2.4" />
            <text x="148" y="96" fontSize="12" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
              r={vals.r}
            </text>
          </g>
        )}
        {shapeId === 'cylinder' && (() => {
          const m = Math.max(2 * r, h);
          const rx = Math.max(26, Math.min(68, (r / m) * 120));
          const ch = Math.max(48, Math.min(125, (h / m) * 130));
          const topY = 105 - ch / 2;
          const botY = 105 + ch / 2;
          return (
            <g>
              <rect x={120 - rx} y={topY} width={rx * 2} height={ch} fill="#DBEAFE" />
              <ellipse cx="120" cy={botY} rx={rx} ry="14" fill="#BFDBFE" stroke="#1D4ED8" strokeWidth="2.8" />
              <line x1={120 - rx} y1={topY} x2={120 - rx} y2={botY} stroke="#1D4ED8" strokeWidth="2.8" />
              <line x1={120 + rx} y1={topY} x2={120 + rx} y2={botY} stroke="#1D4ED8" strokeWidth="2.8" />
              <ellipse cx="120" cy={topY} rx={rx} ry="14" fill="#EFF6FF" stroke="#1D4ED8" strokeWidth="2.8" />
              <text x="120" y={topY + 4} textAnchor="middle" fontSize="11" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
                r={vals.r}
              </text>
              <text x={126 + rx} y="108" fontSize="11" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
                h={vals.h}
              </text>
            </g>
          );
        })()}
        {shapeId === 'cone' && (
          <g>
            <polygon points="120,34 62,162 178,162" fill="#FEF3C7" stroke="#B45309" strokeWidth="2.8" strokeLinejoin="round" />
            <ellipse cx="120" cy="162" rx="58" ry="15" fill="#FDE68A" stroke="#B45309" strokeWidth="2.8" />
            <line x1="120" y1="34" x2="120" y2="162" stroke="#3B2314" strokeWidth="2" strokeDasharray="4 3" />
            <text x="126" y="114" fontSize="11" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
              h={vals.h}
            </text>
            <text x="145" y="192" fontSize="11" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
              r={vals.r}
            </text>
          </g>
        )}
        {shapeId === 'prism' && (
          <g>
            <polygon points="56,74 92,48 190,48 154,74" fill="#BBF7D0" stroke="#15803D" strokeWidth="2.6" strokeLinejoin="round" />
            <polygon points="154,74 190,48 190,142 154,168" fill="#86EFAC" stroke="#15803D" strokeWidth="2.6" strokeLinejoin="round" />
            <rect x="56" y="74" width="98" height="94" fill="#DCFCE7" stroke="#15803D" strokeWidth="2.8" />
            <text x="105" y="186" textAnchor="middle" fontSize="11" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
              l={vals.l}, w={vals.w}, h={vals.h}
            </text>
          </g>
        )}
        {shapeId === 'pyramid' && (
          <g>
            <polygon points="120,32 54,158 144,174" fill="#FFEDD5" stroke="#C2410C" strokeWidth="2.8" strokeLinejoin="round" />
            <polygon points="120,32 144,174 192,144" fill="#FED7AA" stroke="#C2410C" strokeWidth="2.8" strokeLinejoin="round" />
            <line x1="120" y1="32" x2="122" y2="156" stroke="#3B2314" strokeWidth="2" strokeDasharray="4 3" />
            <text x="120" y="196" textAnchor="middle" fontSize="11" fontFamily="JetBrains Mono" fontWeight="700" fill="#3B2314">
              a={vals.a}, h={vals.h}
            </text>
          </g>
        )}
      </svg>
    );
  };

  return (
    <div className="space-y-5">
      {/* 2D vs 3D Toggle + Shape Pills */}
      <div className="space-y-3">
        <div className="inline-flex rounded-xl bg-[#F6E6CC] p-1 border-2 border-[#DEC098]">
          {(['2D', '3D'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDimTab(d);
                const first = SHAPES.find((s) => s.dim === d)!;
                pickShape(first);
              }}
              className={`px-4 py-1.5 rounded-lg font-display font-bold text-xs sm:text-sm cursor-pointer ${
                dimTab === d ? 'bg-[#EF4444] text-white' : 'text-[#6E4928]'
              }`}
            >
              {d === '2D' ? '2D Shapes (5)' : '3D Solids (5)'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {SHAPES.filter((s) => s.dim === dimTab).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pickShape(s)}
              className={`toy-btn px-3.5 py-2 text-xs sm:text-sm ${
                s.id === shapeId ? 'toy-btn-gold' : 'toy-btn-cream'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Inputs + Scaled SVG Diagram + Exact Formulas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 toy-panel p-5 space-y-4">
          <h3 className="font-display font-bold text-lg text-[#3B2314]">
            {shape.name} Dimensions
          </h3>
          <div className="space-y-3">
            {shape.fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-bold text-[#6E4928] mb-1">{f.label}</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={vals[f.key] ?? ''}
                  onChange={(e) => setVals((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="toy-input font-mono font-bold py-2"
                />
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-[#FFFDF9] border-2 border-[#E2C6A2] p-2">
            {renderDiagram()}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-3">
          {'error' in computed ? (
            <div className="rounded-2xl bg-[#FEE2E2] border-2 border-[#EF4444] p-4 text-sm font-semibold text-[#991B1B]">
              {computed.error}
            </div>
          ) : (
            computed.items.map((item) => (
              <div
                key={item.label}
                className="toy-card p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-display font-bold text-sm text-[#3B2314]">{item.label}</div>
                  <div className="font-mono text-xs text-[#8B5A2B]">Formula: {item.formula}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-xl sm:text-2xl text-[#DC2626]">
                    {item.value}
                  </span>
                  <CopyButton text={item.value} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
