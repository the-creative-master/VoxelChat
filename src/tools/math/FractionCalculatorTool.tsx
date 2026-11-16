import React, { useMemo, useState } from 'react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

type FracOp = '+' | '-' | '×' | '÷' | 'simplify';

function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

function lcmBig(a: bigint, b: bigint): bigint {
  const x = a < 0n ? -a : a;
  const y = b < 0n ? -b : b;
  if (x === 0n || y === 0n) return 0n;
  return (x / gcdBig(x, y)) * y;
}

function toImproper(wholeStr: string, numStr: string, denStr: string): { num: bigint; den: bigint } | null {
  try {
    const whole = wholeStr.trim() === '' || wholeStr.trim() === '-' ? 0n : BigInt(wholeStr.trim());
    const num = numStr.trim() === '' ? 0n : BigInt(numStr.trim());
    const den = denStr.trim() === '' ? 1n : BigInt(denStr.trim());
    if (den === 0n) return null;

    const dSign = den < 0n ? -1n : 1n;
    const absDen = den < 0n ? -den : den;
    let totalNum: bigint;
    if (whole < 0n || wholeStr.trim().startsWith('-')) {
      const absW = whole < 0n ? -whole : whole;
      const absN = num < 0n ? -num : num;
      totalNum = -(absW * absDen + absN) * dSign;
    } else {
      totalNum = (whole * absDen + num) * dSign;
    }
    return { num: totalNum, den: absDen };
  } catch {
    return null;
  }
}

function toMixed(num: bigint, den: bigint): { sign: string; whole: bigint; rem: bigint; den: bigint } {
  const neg = (num < 0n) !== (den < 0n);
  const a = num < 0n ? -num : num;
  const b = den < 0n ? -den : den;
  return {
    sign: neg && a !== 0n ? '-' : '',
    whole: a / b,
    rem: a % b,
    den: b,
  };
}

/** SVG Pie + Bar Fraction Visualizer */
const FractionPieSvg: React.FC<{ num: bigint; den: bigint; color: string; label: string }> = ({
  num,
  den,
  color,
  label,
}) => {
  const absNum = Number(num < 0n ? -num : num);
  const absDen = Math.max(1, Number(den < 0n ? -den : den));
  const negative = num < 0n;
  const wholeCount = Math.floor(absNum / absDen);
  const rem = absNum % absDen;
  const pieCount = Math.min(4, Math.max(1, wholeCount + (rem > 0 ? 1 : 0)));
  const overflow = wholeCount + (rem > 0 ? 1 : 0) - pieCount;
  const drawSlices = absDen <= 24;

  const renderPie = (filledRatio: number, slices: number, key: number) => {
    const r = 28;
    const cx = 32;
    const cy = 32;
    const angle = Math.min(1, Math.max(0, filledRatio)) * Math.PI * 2;
    const endX = cx + r * Math.sin(angle);
    const endY = cy - r * Math.cos(angle);
    const largeArc = angle > Math.PI ? 1 : 0;

    return (
      <svg key={key} width="64" height="64" viewBox="0 0 64 64">
        <circle cx={cx} cy={cy} r={r} fill="#FFF8EB" stroke="#8B5A2B" strokeWidth="2.5" />
        {filledRatio >= 0.9999 ? (
          <circle cx={cx} cy={cy} r={r - 1.2} fill={color} />
        ) : filledRatio > 0 ? (
          <path
            d={`M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`}
            fill={color}
          />
        ) : null}
        {drawSlices &&
          slices > 1 &&
          Array.from({ length: slices }).map((_, s) => {
            const a = (s / slices) * Math.PI * 2;
            return (
              <line
                key={s}
                x1={cx}
                y1={cy}
                x2={cx + r * Math.sin(a)}
                y2={cy - r * Math.cos(a)}
                stroke="#6E4928"
                strokeWidth="1.2"
                opacity="0.55"
              />
            );
          })}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#6B3A19" strokeWidth="2.5" />
      </svg>
    );
  };

  const remRatio = absDen > 0 ? rem / absDen : 0;

  return (
    <div className="rounded-2xl bg-[#FFFDF9] border-2 border-[#E2C6A2] p-3.5 text-center">
      <div className="text-xs font-display font-bold text-[#6E4928] mb-2">
        {label} {negative ? '(negative)' : ''}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5 min-h-[68px]">
        {Array.from({ length: pieCount }).map((_, idx) => {
          const isFull = idx < wholeCount;
          const ratio = isFull ? 1 : remRatio;
          return renderPie(ratio, absDen, idx);
        })}
        {overflow > 0 && (
          <span className="px-2 py-1 rounded-lg bg-[#FEF3C7] border border-[#D97706] font-mono text-xs font-bold text-[#78350F]">
            +{overflow} more
          </span>
        )}
      </div>
      {/* Fractional bar visualizer for the proper fractional part */}
      <div className="mt-2.5">
        <div className="h-3.5 rounded-full bg-[#F5E5CC] border border-[#C99B66] overflow-hidden relative flex">
          <div
            className="h-full transition-all"
            style={{
              width: `${(rem === 0 && wholeCount > 0 ? 100 : remRatio * 100).toFixed(2)}%`,
              backgroundColor: color,
            }}
          />
        </div>
        <div className="font-mono text-[11px] font-bold text-[#5C3415] mt-1">
          {num.toString()} / {den.toString()}
        </div>
      </div>
    </div>
  );
};

export default function FractionCalculatorTool() {
  const [op, setOp] = useState<FracOp>('+');
  const [aWhole, setAWhole] = useState('1');
  const [aNum, setANum] = useState('3');
  const [aDen, setADen] = useState('4');

  const [bWhole, setBWhole] = useState('');
  const [bNum, setBNum] = useState('5');
  const [bDen, setBDen] = useState('6');

  const calc = useMemo(() => {
    const a = toImproper(aWhole, aNum, aDen);
    if (!a) return { error: 'Fraction A must have valid integers and a non-zero denominator.' };

    const steps: string[] = [];
    if (aWhole.trim() !== '' && aWhole.trim() !== '0') {
      steps.push(
        `Convert mixed Fraction A (${aWhole} ${aNum || 0}/${aDen}) to improper: ${a.num}/${a.den}`
      );
    } else {
      steps.push(`Start with Fraction A: ${a.num}/${a.den}`);
    }

    if (op === 'simplify') {
      const g = gcdBig(a.num, a.den);
      const sNum = a.num / g;
      const sDen = a.den / g;
      steps.push(`Compute Greatest Common Divisor: GCD(|${a.num}|, ${a.den}) = ${g}`);
      steps.push(`Divide numerator & denominator by ${g}: ${sNum}/${sDen}`);
      const mixed = toMixed(sNum, sDen);
      if (mixed.whole > 0n && mixed.rem > 0n) {
        steps.push(`Express as mixed number: ${mixed.sign}${mixed.whole} ${mixed.rem}/${mixed.den}`);
      }
      return {
        a,
        b: null,
        num: sNum,
        den: sDen,
        mixed,
        decimal: Number(sNum) / Number(sDen),
        steps,
        error: null,
      };
    }

    const b = toImproper(bWhole, bNum, bDen);
    if (!b) return { error: 'Fraction B must have valid integers and a non-zero denominator.' };
    if (bWhole.trim() !== '' && bWhole.trim() !== '0') {
      steps.push(
        `Convert mixed Fraction B (${bWhole} ${bNum || 0}/${bDen}) to improper: ${b.num}/${b.den}`
      );
    } else {
      steps.push(`Start with Fraction B: ${b.num}/${b.den}`);
    }

    let rawNum = 0n;
    let rawDen = 1n;

    if (op === '+' || op === '-') {
      const lcd = lcmBig(a.den, b.den);
      const multA = lcd / a.den;
      const multB = lcd / b.den;
      const eqA = a.num * multA;
      const eqB = b.num * multB;
      steps.push(`Find Least Common Denominator: LCD(${a.den}, ${b.den}) = ${lcd}`);
      steps.push(
        `Scale to common denominator ${lcd}: (${a.num}×${multA})/${lcd} = ${eqA}/${lcd}  and  (${b.num}×${multB})/${lcd} = ${eqB}/${lcd}`
      );
      rawNum = op === '+' ? eqA + eqB : eqA - eqB;
      rawDen = lcd;
      steps.push(
        `${op === '+' ? 'Add' : 'Subtract'} numerators: (${eqA} ${op} ${eqB}) / ${lcd} = ${rawNum}/${rawDen}`
      );
    } else if (op === '×') {
      rawNum = a.num * b.num;
      rawDen = a.den * b.den;
      steps.push(
        `Multiply straight across: (${a.num} × ${b.num}) / (${a.den} × ${b.den}) = ${rawNum}/${rawDen}`
      );
    } else if (op === '÷') {
      if (b.num === 0n) {
        return { error: 'Cannot divide by zero (Fraction B equals 0).' };
      }
      const recipSign = b.num < 0n ? -1n : 1n;
      const recipNum = b.den * recipSign;
      const recipDen = b.num < 0n ? -b.num : b.num;
      steps.push(`Flip Fraction B to its reciprocal: ${recipNum}/${recipDen}`);
      rawNum = a.num * recipNum;
      rawDen = a.den * recipDen;
      steps.push(
        `Multiply by reciprocal: (${a.num} × ${recipNum}) / (${a.den} × ${recipDen}) = ${rawNum}/${rawDen}`
      );
    }

    const g = gcdBig(rawNum, rawDen);
    const sNum = rawNum / g;
    const sDen = rawDen / g;
    if (g > 1n) {
      steps.push(
        `Simplify using GCD(|${rawNum}|, ${rawDen}) = ${g}: (${rawNum}÷${g}) / (${rawDen}÷${g}) = ${sNum}/${sDen}`
      );
    } else {
      steps.push(`GCD(|${rawNum}|, ${rawDen}) = 1 — fraction is already in lowest terms.`);
    }

    const mixed = toMixed(sNum, sDen);
    if (mixed.whole > 0n && mixed.rem > 0n) {
      steps.push(
        `Convert improper fraction to mixed number: ${mixed.sign}${mixed.whole} ${mixed.rem}/${mixed.den}`
      );
    }

    return {
      a,
      b,
      num: sNum,
      den: sDen,
      mixed,
      decimal: Number(sNum) / Number(sDen),
      steps,
      error: null,
    };
  }, [op, aWhole, aNum, aDen, bWhole, bNum, bDen]);

  const formattedMixed = calc.mixed
    ? calc.mixed.rem === 0n
      ? `${calc.mixed.sign}${calc.mixed.whole}`
      : calc.mixed.whole === 0n
      ? `${calc.mixed.sign}${calc.mixed.rem}/${calc.mixed.den}`
      : `${calc.mixed.sign}${calc.mixed.whole} ${calc.mixed.rem}/${calc.mixed.den}`
    : '';

  return (
    <div className="space-y-6">
      {/* Operation Selector Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: '+', label: '+ Add' },
            { id: '-', label: '− Subtract' },
            { id: '×', label: '× Multiply' },
            { id: '÷', label: '÷ Divide' },
            { id: 'simplify', label: 'Simplify Single' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              soundEngine.playPop(1.06);
              setOp(item.id);
            }}
            className={`toy-btn px-4 py-2 text-xs sm:text-sm ${
              op === item.id ? 'toy-btn-primary' : 'toy-btn-cream'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Mixed Fraction Input Cards */}
      <div className="flex flex-wrap items-center justify-center gap-5 rounded-2xl waffle-recess p-5">
        {/* Fraction A */}
        <div className="toy-card p-4 flex items-center gap-3">
          <div>
            <label className="block text-[10px] font-bold text-[#8B5A2B] mb-1 text-center">
              Whole
            </label>
            <input
              type="text"
              value={aWhole}
              onChange={(e) => setAWhole(e.target.value)}
              placeholder="0"
              aria-label="Fraction A whole number"
              className="toy-input w-16 text-center font-mono font-bold text-lg py-2"
            />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <input
              type="text"
              value={aNum}
              onChange={(e) => setANum(e.target.value)}
              placeholder="0"
              aria-label="Fraction A numerator"
              className="toy-input w-20 text-center font-mono font-bold text-base py-1.5"
            />
            <div className="w-full h-[3px] rounded-full bg-[#3B2314]" />
            <input
              type="text"
              value={aDen}
              onChange={(e) => setADen(e.target.value)}
              placeholder="1"
              aria-label="Fraction A denominator"
              className="toy-input w-20 text-center font-mono font-bold text-base py-1.5"
            />
          </div>
        </div>

        {op !== 'simplify' && (
          <>
            <div className="w-12 h-12 rounded-2xl bg-[#EF4444] border-2 border-b-[4px] border-[#991B1B] text-white font-display font-bold text-2xl flex items-center justify-center">
              {op}
            </div>

            {/* Fraction B */}
            <div className="toy-card p-4 flex items-center gap-3">
              <div>
                <label className="block text-[10px] font-bold text-[#8B5A2B] mb-1 text-center">
                  Whole
                </label>
                <input
                  type="text"
                  value={bWhole}
                  onChange={(e) => setBWhole(e.target.value)}
                  placeholder="0"
                  aria-label="Fraction B whole number"
                  className="toy-input w-16 text-center font-mono font-bold text-lg py-2"
                />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <input
                  type="text"
                  value={bNum}
                  onChange={(e) => setBNum(e.target.value)}
                  placeholder="0"
                  aria-label="Fraction B numerator"
                  className="toy-input w-20 text-center font-mono font-bold text-base py-1.5"
                />
                <div className="w-full h-[3px] rounded-full bg-[#3B2314]" />
                <input
                  type="text"
                  value={bDen}
                  onChange={(e) => setBDen(e.target.value)}
                  placeholder="1"
                  aria-label="Fraction B denominator"
                  className="toy-input w-20 text-center font-mono font-bold text-base py-1.5"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {calc.error ? (
        <div className="rounded-2xl bg-[#FEE2E2] border-2 border-[#EF4444] p-4 text-sm font-semibold text-[#991B1B]">
          {calc.error}
        </div>
      ) : (
        calc.a &&
        calc.mixed && (
          <>
            {/* Results Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="toy-card p-4 bg-[#FEF2F2] border-[#FCA5A5]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-[#991B1B]">Simplified Fraction</span>
                  <CopyButton text={`${calc.num}/${calc.den}`} />
                </div>
                <div className="font-mono font-bold text-2xl sm:text-3xl text-[#3B2314]">
                  {calc.den === 1n ? calc.num.toString() : `${calc.num} / ${calc.den}`}
                </div>
              </div>

              <div className="toy-card p-4 bg-[#FFFBEB] border-[#FCD34D]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-[#92400E]">Mixed Number</span>
                  <CopyButton text={formattedMixed} />
                </div>
                <div className="font-mono font-bold text-2xl sm:text-3xl text-[#3B2314]">
                  {formattedMixed}
                </div>
              </div>

              <div className="toy-card p-4 bg-[#F0FDF4] border-[#86EFAC]">
                <div className="text-xs font-bold text-[#166534] mb-1">Decimal &amp; Percentage</div>
                <div className="font-mono font-bold text-xl sm:text-2xl text-[#3B2314]">
                  {Number.isFinite(calc.decimal) ? Number(calc.decimal.toFixed(8)) : '—'}
                </div>
                <div className="font-mono text-xs font-semibold text-[#15803D]">
                  {Number.isFinite(calc.decimal) ? `${(calc.decimal * 100).toFixed(4)}%` : ''}
                </div>
              </div>
            </div>

            {/* Live SVG Pie & Bar Visualizers */}
            <div className={`grid grid-cols-1 ${calc.b ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
              <FractionPieSvg num={calc.a.num} den={calc.a.den} color="#EF4444" label="Fraction A" />
              {calc.b && (
                <FractionPieSvg num={calc.b.num} den={calc.b.den} color="#3B82F6" label="Fraction B" />
              )}
              <FractionPieSvg num={calc.num} den={calc.den} color="#22C55E" label="Simplified Result" />
            </div>

            {/* Step-by-Step LCD & Simplification Breakdown */}
            <div className="toy-panel p-5">
              <h3 className="font-display font-bold text-base text-[#3B2314] mb-3">
                Step-by-Step Solution Breakdown
              </h3>
              <ol className="space-y-2">
                {calc.steps.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-xl bg-[#FFFDF9] border border-[#E6C79C] px-3.5 py-2.5 text-xs sm:text-sm"
                  >
                    <span className="w-6 h-6 rounded-full bg-[#EF4444] text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="font-mono text-[#3B2314] pt-0.5 break-all">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )
      )}
    </div>
  );
}
