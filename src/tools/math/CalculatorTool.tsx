import { useCallback, useEffect, useMemo, useState } from 'react';
import { create, all } from 'mathjs';
import { Delete, History, Trash2 } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

const math = create(all, { number: 'number' });

interface HistoryItem {
  id: string;
  expression: string;
  result: string;
  angleMode: 'DEG' | 'RAD';
}

function formatCalcNumber(val: unknown): string {
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return Number.isNaN(val) ? 'Undefined' : val > 0 ? '∞' : '-∞';
    if (Math.abs(val) < 1e-13 && val !== 0) return '0';
    // Clean floating point noise like 0.30000000000000004 or sin(180 deg)
    const rounded = Number.parseFloat(val.toPrecision(12));
    if (Math.abs(rounded) >= 1e12 || (Math.abs(rounded) < 1e-6 && rounded !== 0)) {
      return rounded.toExponential(8).replace(/\.?0+e/, 'e');
    }
    return String(rounded);
  }
  return math.format(val, { precision: 12 });
}

function evaluateExpression(raw: string, angleMode: 'DEG' | 'RAD', lastAns: number): number {
  const normalized = raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/φ/g, 'phi')
    .replace(/√\(/g, 'sqrt(')
    .replace(/∛\(/g, 'cbrt(')
    .replace(/\bAns\b/g, `(${lastAns})`)
    .replace(/\bln\(/g, 'lnFn(')
    .replace(/\blog\(/g, 'log10Fn(');

  // Auto-close unmatched opening parentheses
  const opens = (normalized.match(/\(/g) ?? []).length;
  const closes = (normalized.match(/\)/g) ?? []).length;
  const balanced = opens > closes ? normalized + ')'.repeat(opens - closes) : normalized;

  const toRad = (x: number) => (angleMode === 'DEG' ? (x * Math.PI) / 180 : x);
  const fromRad = (x: number) => (angleMode === 'DEG' ? (x * 180) / Math.PI : x);

  const scope = {
    pi: Math.PI,
    e: Math.E,
    phi: (1 + Math.sqrt(5)) / 2,
    lnFn: (x: number) => Math.log(x),
    log10Fn: (x: number) => Math.log10(x),
    sin: (x: number) => {
      const r = toRad(x);
      const v = Math.sin(r);
      return Math.abs(v) < 1e-15 ? 0 : v;
    },
    cos: (x: number) => {
      const r = toRad(x);
      const v = Math.cos(r);
      return Math.abs(v) < 1e-15 ? 0 : v;
    },
    tan: (x: number) => {
      const r = toRad(x);
      if (Math.abs(Math.cos(r)) < 1e-15) return Number.NaN;
      const v = Math.tan(r);
      return Math.abs(v) < 1e-15 ? 0 : v;
    },
    asin: (x: number) => fromRad(Math.asin(x)),
    acos: (x: number) => fromRad(Math.acos(x)),
    atan: (x: number) => fromRad(Math.atan(x)),
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    ncr: (n: number, r: number) => Number(math.combinations(n, r)),
    npr: (n: number, r: number) => Number(math.permutations(n, r)),
  };

  const out = math.evaluate(balanced, scope);
  if (typeof out === 'number') return out;
  const num = Number(out);
  if (Number.isNaN(num)) throw new Error('Invalid result');
  return num;
}

export default function CalculatorTool() {
  const [mode, setMode] = useState<'scientific' | 'standard'>('scientific');
  const [angleMode, setAngleMode] = useState<'DEG' | 'RAD'>('DEG');
  const [expression, setExpression] = useState('');
  const [displayResult, setDisplayResult] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [lastAns, setLastAns] = useState(0);
  const [memory, setMemory] = useState<number>(0);
  const [hasMemory, setHasMemory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const livePreview = useMemo(() => {
    if (!expression.trim() || justEvaluated) return null;
    try {
      const v = evaluateExpression(expression, angleMode, lastAns);
      if (!Number.isFinite(v)) return null;
      return formatCalcNumber(v);
    } catch {
      return null;
    }
  }, [expression, angleMode, lastAns, justEvaluated]);

  const insertToken = useCallback(
    (token: string, isOperator = false) => {
      soundEngine.playClick();
      setError(null);
      setExpression((prev) => {
        if (justEvaluated) {
          setJustEvaluated(false);
          return isOperator ? `${displayResult}${token}` : token;
        }
        return prev + token;
      });
    },
    [justEvaluated, displayResult]
  );

  const handleClear = useCallback(() => {
    soundEngine.playClick();
    setExpression('');
    setDisplayResult('0');
    setError(null);
    setJustEvaluated(false);
  }, []);

  const handleBackspace = useCallback(() => {
    soundEngine.playClick();
    setError(null);
    if (justEvaluated) {
      setJustEvaluated(false);
      return;
    }
    setExpression((prev) => prev.slice(0, -1));
  }, [justEvaluated]);

  const handleEvaluate = useCallback(() => {
    if (!expression.trim()) return;
    try {
      const value = evaluateExpression(expression, angleMode, lastAns);
      if (!Number.isFinite(value)) {
        setError(Number.isNaN(value) ? 'Math Error (domain / undefined)' : 'Division by zero (∞)');
        return;
      }
      const formatted = formatCalcNumber(value);
      soundEngine.playPop(1.12);
      setDisplayResult(formatted);
      setLastAns(value);
      setError(null);
      setJustEvaluated(true);
      setHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          expression,
          result: formatted,
          angleMode,
        },
        ...prev.slice(0, 49),
      ]);
    } catch {
      setError('Syntax Error — check parentheses or operators');
    }
  }, [expression, angleMode, lastAns]);

  const getCurrentNumericValue = useCallback((): number => {
    if (expression.trim() && !justEvaluated) {
      try {
        const v = evaluateExpression(expression, angleMode, lastAns);
        if (Number.isFinite(v)) return v;
      } catch {
        // Fallback to displayed result
      }
    }
    const parsed = Number.parseFloat(displayResult);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [expression, justEvaluated, angleMode, lastAns, displayResult]);

  // Memory registers: MC, MR, M+, M-
  const handleMemory = (op: 'MC' | 'MR' | 'M+' | 'M-') => {
    soundEngine.playClick();
    if (op === 'MC') {
      setMemory(0);
      setHasMemory(false);
    } else if (op === 'MR') {
      if (!hasMemory) return;
      insertToken(formatCalcNumber(memory));
    } else if (op === 'M+') {
      const val = getCurrentNumericValue();
      setMemory((m) => m + val);
      setHasMemory(true);
    } else if (op === 'M-') {
      const val = getCurrentNumericValue();
      setMemory((m) => m - val);
      setHasMemory(true);
    }
  };

  // Full physical keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        insertToken(e.key);
      } else if (['+', '-', '*', '/', '^', '%'].includes(e.key)) {
        e.preventDefault();
        const pretty = e.key === '*' ? '×' : e.key === '/' ? '÷' : e.key;
        insertToken(pretty, true);
      } else if (e.key === '(' || e.key === ')' || e.key === '!') {
        e.preventDefault();
        insertToken(e.key, e.key === '!');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEvaluate();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [insertToken, handleEvaluate, handleBackspace, handleClear]);

  const sciButtons: Array<{ label: string; action: () => void; title?: string }> = [
    { label: 'sin', action: () => insertToken('sin(') },
    { label: 'cos', action: () => insertToken('cos(') },
    { label: 'tan', action: () => insertToken('tan(') },
    { label: 'sin⁻¹', action: () => insertToken('asin(') },
    { label: 'cos⁻¹', action: () => insertToken('acos(') },
    { label: 'tan⁻¹', action: () => insertToken('atan(') },
    { label: 'ln', action: () => insertToken('ln(') },
    { label: 'log₁₀', action: () => insertToken('log(') },
    { label: '√x', action: () => insertToken('√(') },
    { label: '∛x', action: () => insertToken('∛(') },
    { label: 'x²', action: () => insertToken('^2', true) },
    { label: 'xʸ', action: () => insertToken('^', true) },
    { label: 'n!', action: () => insertToken('!', true) },
    { label: '|x|', action: () => insertToken('abs(') },
    { label: '1/x', action: () => insertToken('^(-1)', true) },
    { label: 'π', action: () => insertToken('π'), title: 'Pi ≈ 3.14159265359' },
    { label: 'e', action: () => insertToken('e'), title: "Euler's number ≈ 2.71828182846" },
    { label: 'φ', action: () => insertToken('φ'), title: 'Golden ratio ≈ 1.61803398875' },
    { label: '(', action: () => insertToken('(') },
    { label: ')', action: () => insertToken(')') },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Main 2.5D Calculator Unit */}
      <div className="lg:col-span-8 space-y-4">
        {/* Top Mode & Angle Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="inline-flex rounded-xl bg-[#F6E6CC] p-1 border-2 border-[#DEC098]">
            {(['standard', 'scientific'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  soundEngine.playPop(1.05);
                  setMode(m);
                }}
                className={`px-3.5 py-1.5 rounded-lg font-display font-bold text-xs sm:text-sm capitalize transition-all cursor-pointer ${
                  mode === m
                    ? 'bg-[#EF4444] text-white shadow-sm'
                    : 'text-[#6E4928] hover:text-[#3B2314]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* DEG / RAD Toggle */}
            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(1.08);
                setAngleMode((a) => (a === 'DEG' ? 'RAD' : 'DEG'));
              }}
              className="toy-btn bg-[#FEF3C7] border-[#B45309] text-[#78350F] px-3.5 py-1.5 text-xs font-mono"
              title="Toggle trigonometric angle unit (Degrees / Radians)"
            >
              <span>ANGLE:</span>
              <span className="font-extrabold text-[#DC2626]">{angleMode}</span>
            </button>

            <CopyButton text={displayResult} label="Copy Result" />
          </div>
        </div>

        {/* Tactile Recessed LCD Display */}
        <div className="rounded-2xl bg-[#241A13] border-[3px] border-b-[6px] border-[#5C3A1E] p-4 sm:p-5 text-right shadow-inner">
          {/* Status indicators */}
          <div className="flex items-center justify-between text-[11px] font-mono text-[#D6B48E] mb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#3B2A1E] text-[#FDE047] font-bold">
                {angleMode}
              </span>
              {hasMemory && (
                <span className="px-2 py-0.5 rounded bg-[#14532D] text-[#86EFAC] font-bold">
                  M = {formatCalcNumber(memory)}
                </span>
              )}
            </div>
            <span className="text-[#A98768]">Ans = {formatCalcNumber(lastAns)}</span>
          </div>

          {/* Direct editable expression line */}
          <input
            type="text"
            value={expression}
            onChange={(e) => {
              setJustEvaluated(false);
              setError(null);
              setExpression(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleEvaluate();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleClear();
              }
            }}
            placeholder="Type or tap an expression..."
            aria-label="Calculator expression"
            className="w-full bg-transparent text-right font-mono text-base sm:text-lg text-[#F8DEC0] placeholder:text-[#6E523B] focus:outline-none mb-1"
          />

          {/* Main Result Readout */}
          <div className="font-mono font-bold text-3xl sm:text-5xl text-[#FFFDF7] tracking-tight break-all">
            {error ? (
              <span className="text-base sm:text-lg text-[#FCA5A5] font-semibold">{error}</span>
            ) : livePreview ? (
              <span className="text-[#FDE68A]">= {livePreview}</span>
            ) : (
              displayResult
            )}
          </div>
        </div>

        {/* Memory Registers Strip (MC, MR, M+, M-, Ans) */}
        <div className="grid grid-cols-5 gap-2">
          {(['MC', 'MR', 'M+', 'M-'] as const).map((memOp) => (
            <button
              key={memOp}
              type="button"
              onClick={() => handleMemory(memOp)}
              disabled={(memOp === 'MC' || memOp === 'MR') && !hasMemory}
              className="toy-btn bg-[#FFF5E4] border-[#C99B66] text-[#5C3415] py-2 text-xs sm:text-sm font-mono"
            >
              {memOp}
            </button>
          ))}
          <button
            type="button"
            onClick={() => insertToken('Ans')}
            className="toy-btn bg-[#FEF3C7] border-[#B45309] text-[#78350F] py-2 text-xs sm:text-sm font-mono"
          >
            Ans
          </button>
        </div>

        {/* Scientific Functions Deck */}
        {mode === 'scientific' && (
          <div className="grid grid-cols-5 gap-2 p-3 rounded-2xl waffle-recess">
            {sciButtons.map((btn) => (
              <button
                key={btn.label}
                type="button"
                title={btn.title}
                onClick={btn.action}
                className="toy-btn bg-[#FFFDF9] hover:bg-[#FEF2F2] border-[#D4AA78] text-[#4A2506] py-2.5 text-xs sm:text-sm font-mono"
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}

        {/* Primary 2.5D Number & Operator Keypad */}
        <div className="grid grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={handleClear}
            className="toy-btn bg-[#FEE2E2] hover:bg-[#FECACA] border-[#B91C1C] text-[#991B1B] py-3.5 text-base font-bold"
          >
            AC
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="toy-btn bg-[#FFEDD5] hover:bg-[#FED7AA] border-[#C2410C] text-[#9A3412] py-3.5 text-base"
            aria-label="Backspace"
          >
            <Delete className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => insertToken('%', true)}
            className="toy-btn bg-[#FEF3C7] border-[#B45309] text-[#78350F] py-3.5 text-lg font-mono font-bold"
          >
            %
          </button>
          <button
            type="button"
            onClick={() => insertToken('÷', true)}
            className="toy-btn bg-[#FEF3C7] border-[#B45309] text-[#9A3412] py-3.5 text-xl font-mono font-bold"
          >
            ÷
          </button>

          {['7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => insertToken(d)}
              className="toy-btn-cream py-3.5 text-xl font-mono font-bold"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => insertToken('×', true)}
            className="toy-btn bg-[#FEF3C7] border-[#B45309] text-[#9A3412] py-3.5 text-xl font-mono font-bold"
          >
            ×
          </button>

          {['4', '5', '6'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => insertToken(d)}
              className="toy-btn-cream py-3.5 text-xl font-mono font-bold"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => insertToken('-', true)}
            className="toy-btn bg-[#FEF3C7] border-[#B45309] text-[#9A3412] py-3.5 text-xl font-mono font-bold"
          >
            −
          </button>

          {['1', '2', '3'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => insertToken(d)}
              className="toy-btn-cream py-3.5 text-xl font-mono font-bold"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => insertToken('+', true)}
            className="toy-btn bg-[#FEF3C7] border-[#B45309] text-[#9A3412] py-3.5 text-xl font-mono font-bold"
          >
            +
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setExpression((prev) =>
                prev.startsWith('-') ? prev.slice(1) : `-${prev || (justEvaluated ? displayResult : '')}`
              );
              setJustEvaluated(false);
            }}
            className="toy-btn-cream py-3.5 text-base font-mono font-bold"
          >
            ±
          </button>
          <button
            type="button"
            onClick={() => insertToken('0')}
            className="toy-btn-cream py-3.5 text-xl font-mono font-bold"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => insertToken('.')}
            className="toy-btn-cream py-3.5 text-xl font-mono font-bold"
          >
            .
          </button>
          <button
            type="button"
            onClick={handleEvaluate}
            className="toy-btn-primary py-3.5 text-2xl font-mono font-bold"
          >
            =
          </button>
        </div>
      </div>

      {/* Scrollable Paper History Tape with Click-to-Recall */}
      <div className="lg:col-span-4 toy-panel p-4 flex flex-col max-h-[640px]">
        <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-dashed border-[#DEC098]">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#DC2626]" />
            <h3 className="font-display font-bold text-base text-[#3B2314]">History Tape</h3>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(0.9);
                setHistory([]);
              }}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#991B1B] hover:underline cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {history.length === 0 ? (
            <div className="text-center py-14 text-xs text-[#8B6240]">
              <p className="font-display font-semibold text-sm text-[#5C3A1E] mb-1">
                No calculations yet
              </p>
              <p>
                Evaluate any expression and click an entry here to recall its expression or result.
              </p>
              <div className="mt-4 space-y-1.5 text-left bg-[#FFFDF9] rounded-xl p-3 border border-[#E6C79C] font-mono text-[11px]">
                <div className="font-sans font-bold text-[#78350F] mb-1">Try clicking a sample:</div>
                {['sin(30) + cos(60)', '√(144) + 5!', 'φ^2 - φ', 'log(1000) × π'].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setJustEvaluated(false);
                      setExpression(sample);
                    }}
                    className="block w-full text-left px-2 py-1 rounded hover:bg-[#FEF3C7] text-[#4A2506] cursor-pointer"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            history.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setExpression(item.expression);
                  setDisplayResult(item.result);
                  setJustEvaluated(false);
                  setError(null);
                }}
                className="w-full text-right rounded-xl bg-[#FFFDF9] hover:bg-[#FEF3C7] border-2 border-[#E6C79C] px-3.5 py-2.5 transition-colors cursor-pointer"
                title="Click to recall calculation"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-[#9A7B5C]">
                  <span>{item.angleMode}</span>
                  <span>Recall ↺</span>
                </div>
                <div className="font-mono text-xs text-[#6E4928] truncate mt-0.5">
                  {item.expression}
                </div>
                <div className="font-mono font-bold text-lg text-[#3B2314]">= {item.result}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
