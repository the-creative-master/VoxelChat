import { useMemo, useState } from 'react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

function cleanNum(n: number): string {
  if (Math.abs(n) < 1e-12) return '0';
  return String(Number.parseFloat(n.toFixed(8)));
}

export default function EquationSolverTool() {
  const [mode, setMode] = useState<'quadratic' | 'linear'>('quadratic');

  // Quadratic ax² + bx + c = 0
  const [qa, setQa] = useState('1');
  const [qb, setQb] = useState('-5');
  const [qc, setQc] = useState('6');

  // Linear ax + b = c
  const [la, setLa] = useState('4');
  const [lb, setLb] = useState('-7');
  const [lc, setLc] = useState('13');

  const quad = useMemo(() => {
    const a = Number.parseFloat(qa);
    const b = Number.parseFloat(qb);
    const c = Number.parseFloat(qc);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      return { error: 'Enter valid numeric coefficients a, b, and c.' };
    }
    if (a === 0) {
      return { error: 'Coefficient a cannot be 0 in a quadratic equation (switch to Linear mode!).' };
    }

    const delta = b * b - 4 * a * c;
    const vx = -b / (2 * a);
    const vy = a * vx * vx + b * vx + c;

    const steps: string[] = [
      `Standard form: (${cleanNum(a)})x² + (${cleanNum(b)})x + (${cleanNum(c)}) = 0`,
      `Compute discriminant Δ = b² − 4ac = (${cleanNum(b)})² − 4(${cleanNum(a)})(${cleanNum(c)}) = ${cleanNum(b * b)} − (${cleanNum(4 * a * c)}) = ${cleanNum(delta)}`,
    ];

    let nature = '';
    let root1 = '';
    let root2 = '';
    let realRoots: number[] = [];

    if (Math.abs(delta) < 1e-12) {
      nature = 'One Repeated Real Root (Δ = 0)';
      const r = -b / (2 * a);
      root1 = `x = ${cleanNum(r)}`;
      root2 = root1;
      realRoots = [r];
      steps.push(`Apply x = −b / (2a) = −(${cleanNum(b)}) / (2 × ${cleanNum(a)}) = ${cleanNum(r)}`);
    } else if (delta > 0) {
      nature = 'Two Distinct Real Roots (Δ > 0)';
      const sq = Math.sqrt(delta);
      const r1 = (-b + sq) / (2 * a);
      const r2 = (-b - sq) / (2 * a);
      root1 = `x₁ = ${cleanNum(r1)}`;
      root2 = `x₂ = ${cleanNum(r2)}`;
      realRoots = [r1, r2];
      steps.push(`√Δ = √${cleanNum(delta)} = ${cleanNum(sq)}`);
      steps.push(
        `Substitute into x = (−b ± √Δ) / (2a) = (${cleanNum(-b)} ± ${cleanNum(sq)}) / ${cleanNum(2 * a)}`
      );
      steps.push(`x₁ = ${cleanNum(-b + sq)} / ${cleanNum(2 * a)} = ${cleanNum(r1)}`);
      steps.push(`x₂ = ${cleanNum(-b - sq)} / ${cleanNum(2 * a)} = ${cleanNum(r2)}`);
    } else {
      nature = 'Two Complex Conjugate Roots (Δ < 0)';
      const sq = Math.sqrt(-delta);
      const re = -b / (2 * a);
      const im = Math.abs(sq / (2 * a));
      root1 = `x₁ = ${cleanNum(re)} + ${cleanNum(im)}i`;
      root2 = `x₂ = ${cleanNum(re)} − ${cleanNum(im)}i`;
      steps.push(`Since Δ < 0, √Δ = i√${cleanNum(-delta)} = ${cleanNum(sq)}i`);
      steps.push(
        `x = (−(${cleanNum(b)}) ± ${cleanNum(sq)}i) / ${cleanNum(2 * a)} = ${cleanNum(re)} ± ${cleanNum(im)}i`
      );
    }

    steps.push(
      `Parabola vertex (h, k): h = −b/(2a) = ${cleanNum(vx)},  k = f(${cleanNum(vx)}) = ${cleanNum(vy)}`
    );

    return { a, b, c, delta, vx, vy, nature, root1, root2, realRoots, steps };
  }, [qa, qb, qc]);

  const linRes = useMemo(() => {
    const a = Number.parseFloat(la);
    const b = Number.parseFloat(lb);
    const c = Number.parseFloat(lc);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      return { error: 'Enter valid numeric coefficients a, b, and c.' };
    }
    if (a === 0) {
      return {
        error:
          b === c
            ? 'Identity (0x = 0): Infinitely many solutions (all real numbers x).'
            : `Contradiction (${cleanNum(b)} = ${cleanNum(c)}): No solution.`,
      };
    }
    const rhs = c - b;
    const x = rhs / a;
    return {
      x,
      steps: [
        `Start with linear equation: (${cleanNum(a)})x + (${cleanNum(b)}) = ${cleanNum(c)}`,
        `Subtract (${cleanNum(b)}) from both sides: (${cleanNum(a)})x = ${cleanNum(c)} − (${cleanNum(b)}) = ${cleanNum(rhs)}`,
        `Divide both sides by ${cleanNum(a)}: x = ${cleanNum(rhs)} / ${cleanNum(a)} = ${cleanNum(x)}`,
      ],
    };
  }, [la, lb, lc]);

  return (
    <div className="space-y-5">
      {/* Mode Pills */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.06);
            setMode('quadratic');
          }}
          className={`toy-btn px-4 py-2 text-xs sm:text-sm ${
            mode === 'quadratic' ? 'toy-btn-primary' : 'toy-btn-cream'
          }`}
        >
          Quadratic (ax² + bx + c = 0)
        </button>
        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.06);
            setMode('linear');
          }}
          className={`toy-btn px-4 py-2 text-xs sm:text-sm ${
            mode === 'linear' ? 'toy-btn-primary' : 'toy-btn-cream'
          }`}
        >
          Linear (ax + b = c)
        </button>
      </div>

      {mode === 'quadratic' ? (
        <div className="space-y-5">
          {/* Coefficient Input Strip */}
          <div className="toy-panel p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5 font-mono text-base font-bold text-[#3B2314]">
              <input
                type="number"
                step="any"
                value={qa}
                onChange={(e) => setQa(e.target.value)}
                aria-label="Coefficient a"
                className="toy-input w-24 py-2 text-center"
              />
              <span>x² +</span>
              <input
                type="number"
                step="any"
                value={qb}
                onChange={(e) => setQb(e.target.value)}
                aria-label="Coefficient b"
                className="toy-input w-24 py-2 text-center"
              />
              <span>x +</span>
              <input
                type="number"
                step="any"
                value={qc}
                onChange={(e) => setQc(e.target.value)}
                aria-label="Coefficient c"
                className="toy-input w-24 py-2 text-center"
              />
              <span>= 0</span>
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                { label: 'Two real (x²−5x+6)', a: '1', b: '-5', c: '6' },
                { label: 'Double root (x²−6x+9)', a: '1', b: '-6', c: '9' },
                { label: 'Complex (x²+2x+5)', a: '1', b: '2', c: '5' },
                { label: 'Downward (−2x²+8x−3)', a: '-2', b: '8', c: '-3' },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setQa(p.a);
                    setQb(p.b);
                    setQc(p.c);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#FFFDF9] hover:bg-[#FEF3C7] border border-[#D4AA78] font-semibold text-[#5C3415] cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {'error' in quad ? (
            <div className="rounded-2xl bg-[#FEE2E2] border-2 border-[#EF4444] p-4 text-sm font-semibold text-[#991B1B]">
              {quad.error}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="toy-card p-4 bg-[#FEF2F2] border-[#FCA5A5]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#991B1B]">Solutions (Roots)</span>
                    <CopyButton text={`${quad.root1}, ${quad.root2}`} />
                  </div>
                  <div className="font-mono font-bold text-lg text-[#3B2314] space-y-0.5">
                    <div>{quad.root1}</div>
                    {quad.root2 !== quad.root1 && <div>{quad.root2}</div>}
                  </div>
                </div>

                <div className="toy-card p-4">
                  <div className="text-xs font-bold text-[#7A5433]">Discriminant (Δ = b² − 4ac)</div>
                  <div className="font-mono font-bold text-2xl text-[#B45309] mt-1">
                    Δ = {cleanNum(quad.delta)}
                  </div>
                  <div className="text-xs font-semibold text-[#5C3A1E] mt-0.5">{quad.nature}</div>
                </div>

                <div className="toy-card p-4">
                  <div className="text-xs font-bold text-[#7A5433]">
                    Vertex ({quad.a > 0 ? 'Minimum' : 'Maximum'}) &amp; Axis
                  </div>
                  <div className="font-mono font-bold text-lg text-[#15803D] mt-1">
                    ({cleanNum(quad.vx)}, {cleanNum(quad.vy)})
                  </div>
                  <div className="font-mono text-xs text-[#6E4928]">
                    Axis: x = {cleanNum(quad.vx)} • y-int: (0, {cleanNum(quad.c)})
                  </div>
                </div>
              </div>

              <div className="toy-panel p-5">
                <h3 className="font-display font-bold text-base text-[#3B2314] mb-3">
                  Step-by-Step Quadratic Formula Substitution
                </h3>
                <ol className="space-y-2">
                  {quad.steps.map((s, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 rounded-xl bg-[#FFFDF9] border border-[#E6C79C] px-3.5 py-2 text-xs sm:text-sm font-mono"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#EF4444] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-[#3B2314]">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="toy-panel p-5 flex flex-wrap items-center gap-2.5 font-mono text-base font-bold text-[#3B2314]">
            <input
              type="number"
              step="any"
              value={la}
              onChange={(e) => setLa(e.target.value)}
              className="toy-input w-24 py-2 text-center"
            />
            <span>x +</span>
            <input
              type="number"
              step="any"
              value={lb}
              onChange={(e) => setLb(e.target.value)}
              className="toy-input w-24 py-2 text-center"
            />
            <span>=</span>
            <input
              type="number"
              step="any"
              value={lc}
              onChange={(e) => setLc(e.target.value)}
              className="toy-input w-24 py-2 text-center"
            />
          </div>

          {'error' in linRes ? (
            <div className="rounded-2xl bg-[#FEF3C7] border-2 border-[#D97706] p-4 text-sm font-semibold text-[#78350F]">
              {linRes.error}
            </div>
          ) : (
            <>
              <div className="toy-card p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[#7A5433]">Exact Solution</div>
                  <div className="font-mono font-bold text-3xl text-[#DC2626] mt-1">
                    x = {cleanNum(linRes.x)}
                  </div>
                </div>
                <CopyButton text={cleanNum(linRes.x)} />
              </div>

              <div className="toy-panel p-5">
                <h3 className="font-display font-bold text-base text-[#3B2314] mb-3">
                  Step-by-Step Algebraic Solution
                </h3>
                <ol className="space-y-2 font-mono text-xs sm:text-sm">
                  {linRes.steps.map((s, idx) => (
                    <li
                      key={idx}
                      className="rounded-xl bg-[#FFFDF9] border border-[#E6C79C] px-3.5 py-2"
                    >
                      {idx + 1}. {s}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
