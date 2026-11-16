import React, { useMemo, useState } from 'react';
import { CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

/* Deterministic Miller-Rabin for all 64-bit integers + strong 16-base test for arbitrary huge BigInts */
const MR_BASES: bigint[] = [
  2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n,
];

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if ((e & 1n) === 1n) result = (result * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

function isPrimeBigInt(n: bigint): boolean {
  if (n < 2n) return false;
  for (const p of MR_BASES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  for (const a of MR_BASES) {
    if (a >= n - 1n) continue;
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let composite = true;
    for (let r = 1; r < s; r++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

function nextPrime(n: bigint): bigint {
  if (n < 2n) return 2n;
  let cand = n + 1n;
  if (cand % 2n === 0n && cand > 2n) cand += 1n;
  while (!isPrimeBigInt(cand)) cand += 2n;
  return cand;
}

function prevPrime(n: bigint): bigint | null {
  if (n <= 2n) return null;
  if (n === 3n) return 2n;
  let cand = n - 1n;
  if (cand % 2n === 0n) cand -= 1n;
  while (cand >= 2n && !isPrimeBigInt(cand)) cand -= 2n;
  return cand >= 2n ? cand : null;
}

interface FactorNode {
  val: bigint;
  isPrime: boolean;
  left?: FactorNode;
  right?: FactorNode;
}

function smallestFactor(n: bigint): bigint {
  if (n % 2n === 0n) return 2n;
  if (n % 3n === 0n) return 3n;
  for (let i = 5n; i * i <= n && i <= 2_000_000n; i += 6n) {
    if (n % i === 0n) return i;
    if (n % (i + 2n) === 0n) return i + 2n;
  }
  return n;
}

function buildFactorTree(n: bigint, depth = 0): { tree: FactorNode; factors: bigint[]; partial: boolean } {
  if (isPrimeBigInt(n)) {
    return { tree: { val: n, isPrime: true }, factors: [n], partial: false };
  }
  if (depth > 24) {
    return { tree: { val: n, isPrime: false }, factors: [n], partial: true };
  }
  const f = smallestFactor(n);
  if (f === n) {
    return { tree: { val: n, isPrime: false }, factors: [n], partial: true };
  }
  const rightRes = buildFactorTree(n / f, depth + 1);
  return {
    tree: {
      val: n,
      isPrime: false,
      left: { val: f, isPrime: true },
      right: rightRes.tree,
    },
    factors: [f, ...rightRes.factors],
    partial: rightRes.partial,
  };
}

function sieveRange(minVal: number, maxVal: number): number[] {
  const hi = Math.max(2, Math.floor(maxVal));
  const lo = Math.max(2, Math.floor(minVal));
  if (hi < lo) return [];
  const flags = new Uint8Array(hi + 1);
  flags[0] = 1;
  flags[1] = 1;
  const limit = Math.floor(Math.sqrt(hi));
  for (let p = 2; p <= limit; p++) {
    if (!flags[p]) {
      for (let m = p * p; m <= hi; m += p) flags[m] = 1;
    }
  }
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) {
    if (!flags[i]) out.push(i);
  }
  return out;
}

const FactorTreeSvg: React.FC<{ root: FactorNode }> = ({ root }) => {
  // Flatten right-leaning factor tree into clean SVG coordinates
  const levels: Array<{ node: FactorNode; x: number; y: number; px?: number; py?: number }> = [];
  let cur: FactorNode | undefined = root;
  let row = 0;
  let cx = 180;
  while (cur && row < 12) {
    const y = 34 + row * 58;
    if (cur.left && cur.right) {
      levels.push({ node: cur, x: cx, y });
      levels.push({ node: cur.left, x: cx - 72, y: y + 58, px: cx, py: y });
      const nextX = cx + 52;
      if (!cur.right.left) {
        levels.push({ node: cur.right, x: nextX, y: y + 58, px: cx, py: y });
        break;
      } else {
        levels.push({ node: cur.right, x: nextX, y: y + 58, px: cx, py: y });
        // Avoid duplicating node
        const parentX = nextX;
        const parentY = y + 58;
        cur = cur.right;
        row++;
        cx = parentX;
        // Pop the pre-pushed right node so loop pushes it with children cleanly, keeping connector
        levels.pop();
        levels.push({
          node: { val: cur.val, isPrime: cur.isPrime },
          x: parentX,
          y: parentY,
          px: parentX - 52,
          py: y,
        });
        while (cur.left && cur.right && row < 11) {
          const cy = 34 + row * 58;
          levels.push({ node: cur.left, x: cx - 68, y: cy + 58, px: cx, py: cy });
          const rx = cx + 48;
          levels.push({ node: cur.right, x: rx, y: cy + 58, px: cx, py: cy });
          cur = cur.right;
          cx = rx;
          row++;
        }
        break;
      }
    } else {
      levels.push({ node: cur, x: cx, y });
      break;
    }
  }

  const maxX = Math.max(340, ...levels.map((l) => l.x + 80));
  const maxY = Math.max(100, ...levels.map((l) => l.y + 42));

  return (
    <div className="overflow-x-auto rounded-xl bg-[#FFFDF9] border-2 border-[#E2C6A2] p-3">
      <svg width={maxX} height={maxY} viewBox={`0 0 ${maxX} ${maxY}`} className="mx-auto">
        {levels.map(
          (item, i) =>
            item.px !== undefined &&
            item.py !== undefined && (
              <line
                key={`line-${i}`}
                x1={item.px}
                y1={item.py}
                x2={item.x}
                y2={item.y}
                stroke="#B47438"
                strokeWidth="2.5"
              />
            )
        )}
        {levels.map((item, i) => {
          const text = item.node.val.toString();
          const label = text.length > 9 ? `${text.slice(0, 7)}…` : text;
          const w = Math.max(44, label.length * 9 + 18);
          return (
            <g key={`node-${i}`} transform={`translate(${item.x}, ${item.y})`}>
              <rect
                x={-w / 2}
                y={-17}
                width={w}
                height={34}
                rx={11}
                fill={item.node.isPrime ? '#DCFCE7' : '#FEF3C7'}
                stroke={item.node.isPrime ? '#15803D' : '#B45309'}
                strokeWidth="2.4"
              />
              <text
                x={0}
                y={5}
                textAnchor="middle"
                fill={item.node.isPrime ? '#14532D' : '#5C3415'}
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
                fontSize="12.5"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-center gap-4 text-[11px] font-semibold text-[#6E4928] mt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#DCFCE7] border border-[#15803D]" /> Prime Leaf
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#FEF3C7] border border-[#B45309]" /> Composite Node
        </span>
      </div>
    </div>
  );
};

export default function PrimePlaygroundTool() {
  const [tab, setTab] = useState<'tester' | 'sieve'>('tester');
  const [numInput, setNumInput] = useState('840');
  const [rangeMin, setRangeMin] = useState('1');
  const [rangeMax, setRangeMax] = useState('200');

  const analysis = useMemo(() => {
    const clean = numInput.replace(/[,\s_]/g, '');
    if (!clean || !/^\d+$/.test(clean)) return { error: 'Enter a positive whole number.' };
    if (clean.length > 80) return { error: 'Keep input within 80 digits for instant local testing.' };
    const n = BigInt(clean);
    if (n < 2n) return { n, prime: false, special: n === 1n ? '1 is a unit (neither prime nor composite).' : '0 is not prime.' };
    const prime = isPrimeBigInt(n);
    const prev = n <= 10n ** 30n ? prevPrime(n) : null;
    const next = n <= 10n ** 30n ? nextPrime(n) : null;
    const isTwin = prime && (isPrimeBigInt(n - 2n) || isPrimeBigInt(n + 2n));
    const isCousin = prime && (isPrimeBigInt(n - 4n) || isPrimeBigInt(n + 4n));

    let factorInfo: {
      tree: FactorNode;
      grouped: Array<[bigint, number]>;
      divisorCount: bigint;
      partial: boolean;
    } | null = null;

    if (n <= 9_999_999_999_999n) {
      const ft = buildFactorTree(n);
      const map = new Map<string, [bigint, number]>();
      for (const f of ft.factors) {
        const k = f.toString();
        const ex = map.get(k);
        map.set(k, [f, (ex?.[1] ?? 0) + 1]);
      }
      const grouped = Array.from(map.values());
      const divisorCount = grouped.reduce((acc, [, exp]) => acc * BigInt(exp + 1), 1n);
      factorInfo = { tree: ft.tree, grouped, divisorCount, partial: ft.partial };
    }

    return { n, prime, prev, next, isTwin, isCousin, factorInfo };
  }, [numInput]);

  const sieveData = useMemo(() => {
    const lo = Math.max(1, Number.parseInt(rangeMin, 10) || 1);
    const hi = Math.max(lo, Number.parseInt(rangeMax, 10) || 200);
    if (hi > 250_000) {
      return { error: 'Set maximum ≤ 250,000 for instant Sieve of Eratosthenes generation.' };
    }
    const primes = sieveRange(lo, hi);
    const set = new Set(primes);
    const twins: Array<[number, number]> = [];
    const cousins: Array<[number, number]> = [];
    for (const p of primes) {
      if (set.has(p + 2)) twins.push([p, p + 2]);
      if (set.has(p + 4)) cousins.push([p, p + 4]);
    }
    return { lo, hi, primes, twins, cousins };
  }, [rangeMin, rangeMax]);

  return (
    <div className="space-y-5">
      {/* Mode Switcher */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.05);
            setTab('tester');
          }}
          className={`toy-btn px-4 py-2 text-xs sm:text-sm ${
            tab === 'tester' ? 'toy-btn-primary' : 'toy-btn-cream'
          }`}
        >
          Miller-Rabin Tester &amp; Factor Tree
        </button>
        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.05);
            setTab('sieve');
          }}
          className={`toy-btn px-4 py-2 text-xs sm:text-sm ${
            tab === 'sieve' ? 'toy-btn-primary' : 'toy-btn-cream'
          }`}
        >
          Sieve of Eratosthenes &amp; Twin/Cousin Spotter
        </button>
      </div>

      {tab === 'tester' ? (
        <div className="space-y-5">
          <div className="toy-panel p-5 space-y-3">
            <label className="block font-display font-bold text-base text-[#3B2314]">
              Test Any Integer (Supports Huge BigInt Numbers!)
            </label>
            <input
              type="text"
              value={numInput}
              onChange={(e) => setNumInput(e.target.value)}
              placeholder="e.g. 2305843009213693951"
              className="toy-input font-mono font-bold text-lg py-2.5"
            />
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '840 (Rich tree)', val: '840' },
                { label: '9,973 (Prime)', val: '9973' },
                { label: '1,000,003 (Prime)', val: '1000003' },
                { label: '2⁶¹−1 Mersenne Prime', val: '2305843009213693951' },
                { label: '360,360 (Composite)', val: '360360' },
              ].map((s) => (
                <button
                  key={s.val}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setNumInput(s.val);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#FFFDF9] hover:bg-[#FEF3C7] border border-[#D4AA78] font-mono text-[11px] font-semibold text-[#5C3415] cursor-pointer"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {'error' in analysis ? (
            <div className="rounded-2xl bg-[#FEE2E2] border-2 border-[#EF4444] p-4 text-sm font-semibold text-[#991B1B]">
              {analysis.error}
            </div>
          ) : 'special' in analysis ? (
            <div className="toy-card p-5 text-sm font-semibold text-[#78350F]">{analysis.special}</div>
          ) : (
            <div className="space-y-4">
              {/* Verdict Card */}
              <div
                className={`toy-card p-5 ${
                  analysis.prime
                    ? 'bg-[#F0FDF4] border-[#22C55E]'
                    : 'bg-[#FFFBEB] border-[#F59E0B]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {analysis.prime ? (
                      <CheckCircle2 className="w-8 h-8 text-[#16A34A] shrink-0" />
                    ) : (
                      <XCircle className="w-8 h-8 text-[#D97706] shrink-0" />
                    )}
                    <div>
                      <h3 className="font-display font-bold text-xl text-[#3B2314]">
                        {analysis.prime ? 'PRIME NUMBER!' : 'COMPOSITE NUMBER'}
                      </h3>
                      <p className="text-xs text-[#6E4928] font-mono break-all">
                        n = {analysis.n.toString()} ({analysis.n.toString().length} digits)
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {analysis.isTwin && (
                      <span className="toy-pill bg-[#FEF08A] border-[#B45309] text-[#78350F]">
                        <Sparkles className="w-3 h-3" /> Twin Prime Member
                      </span>
                    )}
                    {analysis.isCousin && (
                      <span className="toy-pill bg-[#DBEAFE] border-[#2563EB] text-[#1E3A8A]">
                        Cousin Prime Member
                      </span>
                    )}
                  </div>
                </div>

                {/* Neighbor Primes + Canonical Factorization */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-[#E2C6A2] text-xs font-mono">
                  <div>
                    <span className="text-[#7A5433] block font-sans font-bold">Previous Prime</span>
                    <span className="font-bold text-[#3B2314] break-all">
                      {analysis.prev ? analysis.prev.toString() : 'None'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7A5433] block font-sans font-bold">Next Prime</span>
                    <span className="font-bold text-[#3B2314] break-all">
                      {analysis.next ? analysis.next.toString() : '—'}
                    </span>
                  </div>
                  {analysis.factorInfo && !analysis.factorInfo.partial && (
                    <div>
                      <span className="text-[#7A5433] block font-sans font-bold">
                        Prime Factorization ({analysis.factorInfo.divisorCount.toString()} divisors)
                      </span>
                      <span className="font-bold text-[#B91C1C]">
                        {analysis.factorInfo.grouped
                          .map(([p, e]) => (e > 1 ? `${p}^${e}` : `${p}`))
                          .join(' × ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Visual Prime Factorization Tree */}
              {analysis.factorInfo && (
                <div className="toy-panel p-4 space-y-2.5">
                  <h4 className="font-display font-bold text-base text-[#3B2314]">
                    Visual Prime Factorization Tree
                  </h4>
                  <FactorTreeSvg root={analysis.factorInfo.tree} />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="toy-panel p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-[#6E4928] mb-1">Range Min</label>
              <input
                type="number"
                min="1"
                value={rangeMin}
                onChange={(e) => setRangeMin(e.target.value)}
                className="toy-input font-mono font-bold py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6E4928] mb-1">
                Range Max (≤ 250,000)
              </label>
              <input
                type="number"
                min="2"
                max="250000"
                value={rangeMax}
                onChange={(e) => setRangeMax(e.target.value)}
                className="toy-input font-mono font-bold py-2"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[
                ['1', '100'],
                ['1', '500'],
                ['1000', '2000'],
                ['1', '10000'],
              ].map(([a, b]) => (
                <button
                  key={`${a}-${b}`}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setRangeMin(a);
                    setRangeMax(b);
                  }}
                  className="toy-btn-cream px-2.5 py-2 text-xs font-mono"
                >
                  {a}–{b}
                </button>
              ))}
            </div>
          </div>

          {'error' in sieveData ? (
            <div className="rounded-2xl bg-[#FEE2E2] border-2 border-[#EF4444] p-4 text-sm font-semibold text-[#991B1B]">
              {sieveData.error}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="toy-card p-4">
                  <div className="text-xs font-bold text-[#7A5433]">Primes Found</div>
                  <div className="font-mono font-bold text-2xl text-[#DC2626]">
                    {sieveData.primes.length.toLocaleString()}
                  </div>
                </div>
                <div className="toy-card p-4">
                  <div className="text-xs font-bold text-[#7A5433]">Twin Prime Pairs (p, p+2)</div>
                  <div className="font-mono font-bold text-2xl text-[#15803D]">
                    {sieveData.twins.length.toLocaleString()}
                  </div>
                </div>
                <div className="toy-card p-4">
                  <div className="text-xs font-bold text-[#7A5433]">Cousin Prime Pairs (p, p+4)</div>
                  <div className="font-mono font-bold text-2xl text-[#1D4ED8]">
                    {sieveData.cousins.length.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Primes List */}
              <div className="toy-panel p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="font-display font-bold text-sm text-[#3B2314]">
                    Primes in [{sieveData.lo.toLocaleString()}, {sieveData.hi.toLocaleString()}]
                  </h4>
                  <CopyButton text={sieveData.primes.join(', ')} label="Copy All Primes" />
                </div>
                <div className="max-h-52 overflow-y-auto flex flex-wrap gap-1.5">
                  {sieveData.primes.slice(0, 400).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setNumInput(String(p));
                        setTab('tester');
                      }}
                      className="px-2 py-0.5 rounded-md bg-[#FFFDF9] hover:bg-[#FEF3C7] border border-[#DEC098] font-mono text-xs font-semibold text-[#3B2314] cursor-pointer"
                    >
                      {p}
                    </button>
                  ))}
                  {sieveData.primes.length > 400 && (
                    <span className="px-2.5 py-0.5 text-xs font-bold text-[#8B5A2B]">
                      + {(sieveData.primes.length - 400).toLocaleString()} more (use Copy All)
                    </span>
                  )}
                </div>
              </div>

              {/* Twin & Cousin Pairs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="toy-panel p-4">
                  <h4 className="font-display font-bold text-sm text-[#14532D] mb-2">
                    Twin Primes (p, p + 2)
                  </h4>
                  <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5 font-mono text-xs">
                    {sieveData.twins.length === 0 ? (
                      <span className="font-sans text-[#7A5433]">No twin prime pairs in range.</span>
                    ) : (
                      sieveData.twins.slice(0, 120).map(([a, b]) => (
                        <span
                          key={a}
                          className="px-2 py-0.5 rounded-lg bg-[#DCFCE7] border border-[#86EFAC] text-[#14532D] font-bold"
                        >
                          ({a}, {b})
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="toy-panel p-4">
                  <h4 className="font-display font-bold text-sm text-[#1E3A8A] mb-2">
                    Cousin Primes (p, p + 4)
                  </h4>
                  <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5 font-mono text-xs">
                    {sieveData.cousins.length === 0 ? (
                      <span className="font-sans text-[#7A5433]">No cousin prime pairs in range.</span>
                    ) : (
                      sieveData.cousins.slice(0, 120).map(([a, b]) => (
                        <span
                          key={a}
                          className="px-2 py-0.5 rounded-lg bg-[#DBEAFE] border border-[#93C5FD] text-[#1E3A8A] font-bold"
                        >
                          ({a}, {b})
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
