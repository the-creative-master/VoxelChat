import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

function gcdWithSteps(aIn: bigint, bIn: bigint): { gcd: bigint; steps: string[] } {
  let a = aIn < 0n ? -aIn : aIn;
  let b = bIn < 0n ? -bIn : bIn;
  if (a < b) [a, b] = [b, a];
  const steps: string[] = [];
  while (b !== 0n) {
    const q = a / b;
    const r = a % b;
    steps.push(`${a} = ${q} × ${b} + ${r}`);
    a = b;
    b = r;
  }
  return { gcd: a, steps };
}

function getFactorPairs(n: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const lim = Math.floor(Math.sqrt(n));
  for (let d = 1; d <= lim; d++) {
    if (n % d === 0) pairs.push([d, n / d]);
  }
  return pairs;
}

export default function LcmGcdFinderTool() {
  const [inputs, setInputs] = useState<string[]>(['48', '180', '300']);

  const result = useMemo(() => {
    const parsed: bigint[] = [];
    for (const s of inputs) {
      const clean = s.trim();
      if (!/^\d+$/.test(clean)) {
        return { error: 'Fill every slot with a positive integer (≥ 1).' };
      }
      const v = BigInt(clean);
      if (v < 1n) return { error: 'All numbers must be positive integers (≥ 1).' };
      parsed.push(v);
    }
    if (parsed.length < 2) return { error: 'Add at least 2 numbers.' };

    let runningGcd = parsed[0];
    let runningLcm = parsed[0];
    const stepBlocks: Array<{ header: string; lines: string[] }> = [];

    for (let i = 1; i < parsed.length; i++) {
      const next = parsed[i];
      const { gcd, steps } = gcdWithSteps(runningGcd, next);
      stepBlocks.push({
        header: `Euclidean Algorithm for GCD(${runningGcd}, ${next}) → ${gcd}`,
        lines: steps,
      });
      runningGcd = gcd;

      const pairGcd = gcdWithSteps(runningLcm, next).gcd;
      runningLcm = (runningLcm / pairGcd) * next;
    }

    const factorTables = parsed.map((v) => {
      if (v <= 50_000_000n) {
        const num = Number(v);
        return { val: v, pairs: getFactorPairs(num) };
      }
      return { val: v, pairs: null };
    });

    return { parsed, gcd: runningGcd, lcm: runningLcm, stepBlocks, factorTables };
  }, [inputs]);

  return (
    <div className="space-y-5">
      {/* 2 to 10 Number Inputs */}
      <div className="toy-panel p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-bold text-base text-[#3B2314]">
            Numbers ({inputs.length} / 10)
          </h3>
          <button
            type="button"
            disabled={inputs.length >= 10}
            onClick={() => {
              soundEngine.playPop(1.06);
              setInputs((prev) => [...prev, '24']);
            }}
            className="toy-btn-primary px-3.5 py-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Add Number
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {inputs.map((val, idx) => (
            <div key={idx} className="relative flex items-center gap-1">
              <input
                type="text"
                inputMode="numeric"
                value={val}
                onChange={(e) =>
                  setInputs((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                }
                aria-label={`Number ${idx + 1}`}
                className="toy-input font-mono font-bold py-2 pr-8 text-sm"
              />
              {inputs.length > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setInputs((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  className="absolute right-2 text-[#991B1B] hover:text-[#DC2626] cursor-pointer"
                  aria-label="Remove number"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {'error' in result ? (
        <div className="rounded-2xl bg-[#FEE2E2] border-2 border-[#EF4444] p-4 text-sm font-semibold text-[#991B1B]">
          {result.error}
        </div>
      ) : (
        <>
          {/* GCD & LCM Hero Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="toy-card p-5 bg-[#FEF2F2] border-[#FCA5A5]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[#991B1B]">
                  Greatest Common Divisor (GCD / GCF)
                </span>
                <CopyButton text={result.gcd.toString()} />
              </div>
              <div className="font-mono font-bold text-3xl text-[#3B2314] break-all">
                {result.gcd.toString()}
              </div>
              {result.gcd === 1n && (
                <div className="text-xs font-semibold text-[#15803D] mt-1">
                  The set is mutually coprime (GCD = 1).
                </div>
              )}
            </div>

            <div className="toy-card p-5 bg-[#F0FDF4] border-[#86EFAC]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[#166534]">
                  Least Common Multiple (LCM)
                </span>
                <CopyButton text={result.lcm.toString()} />
              </div>
              <div className="font-mono font-bold text-3xl text-[#3B2314] break-all">
                {result.lcm.toString()}
              </div>
            </div>
          </div>

          {/* Euclidean Algorithm Step-by-Step */}
          <div className="toy-panel p-5 space-y-3">
            <h3 className="font-display font-bold text-base text-[#3B2314]">
              Euclidean Algorithm Division Steps
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {result.stepBlocks.map((blk, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-[#FFFDF9] border-2 border-[#E2C6A2] p-3.5 space-y-1.5"
                >
                  <div className="text-xs font-display font-bold text-[#B91C1C]">{blk.header}</div>
                  <div className="font-mono text-xs text-[#3B2314] space-y-1">
                    {blk.lines.map((line, li) => (
                      <div key={li} className="bg-[#FFF8EB] rounded px-2.5 py-1">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Complete Factor Pairs */}
          <div className="toy-panel p-5 space-y-3">
            <h3 className="font-display font-bold text-base text-[#3B2314]">
              Complete Factor Pairs
            </h3>
            <div className="space-y-3">
              {result.factorTables.map((ft, idx) => (
                <div
                  key={idx}
                  className="rounded-xl bg-[#FFFDF9] border border-[#E2C6A2] p-3.5"
                >
                  <div className="text-xs font-bold text-[#5C3415] mb-2 font-mono">
                    {ft.val.toString()}{' '}
                    {ft.pairs && (
                      <span className="text-[#8B5A2B]">
                        ({ft.pairs.length} factor {ft.pairs.length === 1 ? 'pair' : 'pairs'})
                      </span>
                    )}
                  </div>
                  {ft.pairs ? (
                    <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                      {ft.pairs.map(([a, b]) => (
                        <span
                          key={a}
                          className="px-2.5 py-1 rounded-lg bg-[#FEF3C7] border border-[#EAB308] text-[#4A2506] font-semibold"
                        >
                          {a} × {b}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-[#7A5433]">
                      Factor-pair enumeration shown for numbers ≤ 50,000,000.
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
