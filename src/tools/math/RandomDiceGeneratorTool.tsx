import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Dices, RefreshCw } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

const DIE_FACES = [4, 6, 8, 10, 12, 20, 100] as const;
type DieType = (typeof DIE_FACES)[number];

/** Unbiased cryptographic integer in [min, max] inclusive */
function cryptoRandInt(min: number, max: number): number {
  const range = max - min + 1;
  if (range <= 1) return min;
  const arr = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / range) * range;
  let val = 0;
  do {
    crypto.getRandomValues(arr);
    val = arr[0];
  } while (val >= limit);
  return min + (val % range);
}

/** Log-factorial table for accurate binomial & hypergeometric probability calculations */
function logFact(n: number): number {
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFact(n) - logFact(k) - logFact(n - k);
}

function binomialPmf(n: number, p: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

function hypergeomPmf(N: number, K: number, n: number, k: number): number {
  if (k < Math.max(0, n + K - N) || k > Math.min(n, K)) return 0;
  return Math.exp(logChoose(K, k) + logChoose(N - K, n - k) - logChoose(N, n));
}

export default function RandomDiceGeneratorTool() {
  const [tab, setTab] = useState<'dice' | 'integers' | 'coin' | 'probability'>('dice');

  // Polyhedral Dice state
  const [dieType, setDieType] = useState<DieType>(20);
  const [diceCount, setDiceCount] = useState(2);
  const [modifier, setModifier] = useState(0);
  const [rolls, setRolls] = useState<number[]>([17, 20]);
  const [rollSeq, setRollSeq] = useState(0);

  // Integer generator state
  const [intMin, setIntMin] = useState('1');
  const [intMax, setIntMax] = useState('100');
  const [intQty, setIntQty] = useState('10');
  const [noRepeat, setNoRepeat] = useState(true);
  const [sortOut, setSortOut] = useState(false);
  const [genNums, setGenNums] = useState<number[]>([7, 19, 34, 42, 58, 63, 71, 84, 92, 99]);
  const [intErr, setIntErr] = useState<string | null>(null);

  // Coin flipper state
  const [coinSide, setCoinSide] = useState<'HEADS' | 'TAILS'>('HEADS');
  const [coinFlips, setCoinFlips] = useState<{ heads: number; tails: number; seq: number }>({
    heads: 1,
    tails: 0,
    seq: 0,
  });

  // Probability calculator state
  const [probModel, setProbModel] = useState<'binomial' | 'hypergeometric'>('binomial');
  const [binN, setBinN] = useState('10');
  const [binP, setBinP] = useState('0.5');
  const [binK, setBinK] = useState('6');
  const [hypPop, setHypPop] = useState('52');
  const [hypSucc, setHypSucc] = useState('4');
  const [hypDraw, setHypDraw] = useState('5');
  const [hypK, setHypK] = useState('1');

  const rollDice = () => {
    soundEngine.playDiceRoll();
    const next = Array.from({ length: Math.min(20, Math.max(1, diceCount)) }, () =>
      cryptoRandInt(1, dieType)
    );
    setRolls(next);
    setRollSeq((s) => s + 1);
  };

  const generateInts = () => {
    const lo = Math.floor(Number.parseFloat(intMin));
    const hi = Math.floor(Number.parseFloat(intMax));
    const qty = Math.min(500, Math.max(1, Math.floor(Number.parseFloat(intQty) || 1)));
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) {
      setIntErr('Max must be greater than or equal to Min.');
      return;
    }
    const span = hi - lo + 1;
    if (noRepeat && qty > span) {
      setIntErr(`Cannot pick ${qty} unique numbers from a range of only ${span} integers.`);
      return;
    }
    setIntErr(null);
    soundEngine.playPop(1.08);
    let list: number[];
    if (noRepeat) {
      const picked = new Set<number>();
      while (picked.size < qty) picked.add(cryptoRandInt(lo, hi));
      list = Array.from(picked);
    } else {
      list = Array.from({ length: qty }, () => cryptoRandInt(lo, hi));
    }
    if (sortOut) list.sort((a, b) => a - b);
    setGenNums(list);
  };

  const flipCoin = () => {
    soundEngine.playPop(1.2);
    const isHeads = cryptoRandInt(0, 1) === 0;
    setCoinSide(isHeads ? 'HEADS' : 'TAILS');
    setCoinFlips((prev) => ({
      heads: prev.heads + (isHeads ? 1 : 0),
      tails: prev.tails + (isHeads ? 0 : 1),
      seq: prev.seq + 1,
    }));
  };

  const probStats = useMemo(() => {
    if (probModel === 'binomial') {
      const n = Math.floor(Number(binN));
      const p = Number(binP);
      const k = Math.floor(Number(binK));
      if (!(n >= 1 && n <= 1000 && p >= 0 && p <= 1 && k >= 0 && k <= n)) {
        return { error: 'Require 1 ≤ n ≤ 1000, 0 ≤ p ≤ 1, and 0 ≤ k ≤ n.' };
      }
      const exact = binomialPmf(n, p, k);
      let le = 0;
      for (let i = 0; i <= k; i++) le += binomialPmf(n, p, i);
      const lt = le - exact;
      const ge = Math.max(0, 1 - lt);
      const gt = Math.max(0, 1 - le);
      return { exact, le, lt, ge, gt, mean: n * p, variance: n * p * (1 - p) };
    } else {
      const N = Math.floor(Number(hypPop));
      const K = Math.floor(Number(hypSucc));
      const n = Math.floor(Number(hypDraw));
      const k = Math.floor(Number(hypK));
      if (!(N >= 1 && N <= 2000 && K >= 0 && K <= N && n >= 0 && n <= N && k >= 0 && k <= n)) {
        return { error: 'Require 1 ≤ N ≤ 2000, 0 ≤ K ≤ N, 0 ≤ n ≤ N, and 0 ≤ k ≤ n.' };
      }
      const exact = hypergeomPmf(N, K, n, k);
      let le = 0;
      for (let i = 0; i <= k; i++) le += hypergeomPmf(N, K, n, i);
      const lt = le - exact;
      const ge = Math.max(0, 1 - lt);
      const gt = Math.max(0, 1 - le);
      const mean = (n * K) / N;
      const variance = N > 1 ? (n * (K / N) * ((N - K) / N) * (N - n)) / (N - 1) : 0;
      return { exact, le, lt, ge, gt, mean, variance };
    }
  }, [probModel, binN, binP, binK, hypPop, hypSucc, hypDraw, hypK]);

  const diceSum = rolls.reduce((a, b) => a + b, 0) + modifier;

  return (
    <div className="space-y-5">
      {/* Mode Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'dice', label: '2.5D Polyhedral Dice (d4–d100)' },
            { id: 'integers', label: 'Random Integers' },
            { id: 'coin', label: 'Coin Flipper' },
            { id: 'probability', label: 'Binomial & Hypergeometric' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              soundEngine.playPop(1.05);
              setTab(t.id);
            }}
            className={`toy-btn px-3.5 py-2 text-xs sm:text-sm ${
              tab === t.id ? 'toy-btn-primary' : 'toy-btn-cream'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dice' && (
        <div className="space-y-5">
          {/* Die Shape Selector */}
          <div className="toy-panel p-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              {DIE_FACES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setDieType(d);
                  }}
                  className={`toy-btn px-4 py-2.5 font-mono text-sm font-bold ${
                    dieType === d ? 'toy-btn-gold' : 'toy-btn-cream'
                  }`}
                >
                  d{d}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-bold text-[#6E4928] mb-1">
                  Dice Count (1–20)
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={diceCount}
                  onChange={(e) => setDiceCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                  className="toy-input w-28 font-mono font-bold py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6E4928] mb-1">Modifier (±)</label>
                <input
                  type="number"
                  value={modifier}
                  onChange={(e) => setModifier(Number(e.target.value) || 0)}
                  className="toy-input w-28 font-mono font-bold py-2"
                />
              </div>
              <button
                type="button"
                onClick={rollDice}
                className="toy-btn-primary px-7 py-2.5 text-base"
              >
                <Dices className="w-5 h-5" />
                Roll {diceCount}d{dieType}
                {modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ''}
              </button>
            </div>
          </div>

          {/* Rolled 2.5D Polyhedral Dice Tray */}
          <div className="waffle-recess rounded-3xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-center gap-4">
              {rolls.map((val, idx) => {
                const isCrit = val === dieType;
                const isFumble = val === 1;
                return (
                  <motion.div
                    key={`${rollSeq}-${idx}`}
                    initial={{ scale: 0.5, rotate: -35, y: -18 }}
                    animate={{ scale: 1, rotate: 0, y: 0 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 18, delay: idx * 0.03 }}
                    className={`w-20 h-20 rounded-2xl border-[3px] border-b-[7px] flex flex-col items-center justify-center shadow-toy ${
                      isCrit
                        ? 'bg-gradient-to-b from-[#FEF08A] to-[#F59E0B] border-[#92400E] text-[#4A2104]'
                        : isFumble
                        ? 'bg-gradient-to-b from-[#FEE2E2] to-[#FCA5A5] border-[#991B1B] text-[#7F1D1D]'
                        : 'bg-gradient-to-b from-[#FF6B6B] to-[#DC2626] border-[#7F1D1D] text-white'
                    }`}
                  >
                    <span className="font-mono font-extrabold text-2xl leading-none">{val}</span>
                    <span className="font-mono text-[10px] opacity-80 mt-1">d{dieType}</span>
                  </motion.div>
                );
              })}
            </div>

            <div className="text-center font-mono">
              <div className="text-xs font-sans font-bold text-[#7A5433]">Total Roll</div>
              <div className="text-4xl font-extrabold text-[#3B2314]">{diceSum}</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'integers' && (
        <div className="space-y-4">
          <div className="toy-panel p-5 flex flex-wrap items-end gap-3.5">
            <div>
              <label className="block text-xs font-bold text-[#6E4928] mb-1">Min</label>
              <input
                type="number"
                value={intMin}
                onChange={(e) => setIntMin(e.target.value)}
                className="toy-input w-28 font-mono font-bold py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6E4928] mb-1">Max</label>
              <input
                type="number"
                value={intMax}
                onChange={(e) => setIntMax(e.target.value)}
                className="toy-input w-28 font-mono font-bold py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6E4928] mb-1">Count</label>
              <input
                type="number"
                min={1}
                max={500}
                value={intQty}
                onChange={(e) => setIntQty(e.target.value)}
                className="toy-input w-24 font-mono font-bold py-2"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-[#3B2314] py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={noRepeat}
                onChange={(e) => setNoRepeat(e.target.checked)}
                className="w-4 h-4 accent-[#EF4444]"
              />
              No Repeats
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-[#3B2314] py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sortOut}
                onChange={(e) => setSortOut(e.target.checked)}
                className="w-4 h-4 accent-[#EF4444]"
              />
              Sort Ascending
            </label>
            <button type="button" onClick={generateInts} className="toy-btn-primary px-5 py-2.5 text-sm">
              <RefreshCw className="w-4 h-4" /> Generate
            </button>
          </div>

          {intErr ? (
            <div className="rounded-xl bg-[#FEE2E2] border border-[#EF4444] p-3.5 text-xs font-bold text-[#991B1B]">
              {intErr}
            </div>
          ) : (
            <div className="toy-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#7A5433]">
                  Generated {genNums.length} Cryptographic Random Numbers
                </span>
                <CopyButton text={genNums.join(', ')} label="Copy All" />
              </div>
              <div className="flex flex-wrap gap-2">
                {genNums.map((n, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 rounded-xl bg-[#FFF8EB] border-2 border-[#DEC098] font-mono font-bold text-sm text-[#3B2314]"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'coin' && (
        <div className="toy-panel p-8 text-center space-y-5">
          <motion.div
            key={coinFlips.seq}
            initial={{ rotateY: 0, scale: 0.8, y: -24 }}
            animate={{ rotateY: 720, scale: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
            onClick={flipCoin}
            className="w-36 h-36 mx-auto rounded-full bg-gradient-to-br from-[#FEF08A] via-[#FBBF24] to-[#D97706] border-[4px] border-b-[8px] border-[#92400E] flex flex-col items-center justify-center shadow-toy-lg cursor-pointer select-none"
          >
            <span className="font-display font-bold text-2xl text-[#4A2104]">{coinSide}</span>
            <span className="text-[10px] font-bold text-[#78350F] mt-0.5">Tap to flip</span>
          </motion.div>

          <button type="button" onClick={flipCoin} className="toy-btn-gold px-7 py-3 text-base">
            Flip Coin!
          </button>

          <div className="flex justify-center gap-6 font-mono text-sm font-bold text-[#5C3415]">
            <span>Heads: {coinFlips.heads}</span>
            <span>Tails: {coinFlips.tails}</span>
            <span>
              Heads %:{' '}
              {((coinFlips.heads / Math.max(1, coinFlips.heads + coinFlips.tails)) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {tab === 'probability' && (
        <div className="space-y-4">
          <div className="toy-panel p-5 space-y-4">
            <div className="inline-flex rounded-xl bg-[#F3DFC1] p-1 border border-[#D4AA78]">
              {(['binomial', 'hypergeometric'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setProbModel(m)}
                  className={`px-3.5 py-1 rounded-lg font-display font-bold text-xs capitalize cursor-pointer ${
                    probModel === m ? 'bg-[#EF4444] text-white' : 'text-[#6E4928]'
                  }`}
                >
                  {m === 'binomial'
                    ? 'Binomial B(n, p) — With Replacement'
                    : 'Hypergeometric (N, K, n) — Without Replacement'}
                </button>
              ))}
            </div>

            {probModel === 'binomial' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6E4928] mb-1">Trials (n)</label>
                  <input
                    type="number"
                    value={binN}
                    onChange={(e) => setBinN(e.target.value)}
                    className="toy-input font-mono font-bold py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6E4928] mb-1">
                    Success Probability p (0–1)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={binP}
                    onChange={(e) => setBinP(e.target.value)}
                    className="toy-input font-mono font-bold py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6E4928] mb-1">
                    Target Successes (k)
                  </label>
                  <input
                    type="number"
                    value={binK}
                    onChange={(e) => setBinK(e.target.value)}
                    className="toy-input font-mono font-bold py-2"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6E4928] mb-1">
                    Population Size (N)
                  </label>
                  <input
                    type="number"
                    value={hypPop}
                    onChange={(e) => setHypPop(e.target.value)}
                    className="toy-input font-mono font-bold py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6E4928] mb-1">
                    Successes in Pop (K)
                  </label>
                  <input
                    type="number"
                    value={hypSucc}
                    onChange={(e) => setHypSucc(e.target.value)}
                    className="toy-input font-mono font-bold py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6E4928] mb-1">
                    Draws / Sample (n)
                  </label>
                  <input
                    type="number"
                    value={hypDraw}
                    onChange={(e) => setHypDraw(e.target.value)}
                    className="toy-input font-mono font-bold py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6E4928] mb-1">
                    Observed Successes (k)
                  </label>
                  <input
                    type="number"
                    value={hypK}
                    onChange={(e) => setHypK(e.target.value)}
                    className="toy-input font-mono font-bold py-2"
                  />
                </div>
              </div>
            )}
          </div>

          {'error' in probStats ? (
            <div className="rounded-xl bg-[#FEE2E2] border border-[#EF4444] p-3.5 text-xs font-bold text-[#991B1B]">
              {probStats.error}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {[
                { label: 'Exact P(X = k)', val: probStats.exact },
                { label: 'Cumulative P(X ≤ k)', val: probStats.le },
                { label: 'Strict P(X < k)', val: probStats.lt },
                { label: 'At Least P(X ≥ k)', val: probStats.ge },
                { label: 'Greater P(X > k)', val: probStats.gt },
              ].map((item) => (
                <div key={item.label} className="toy-card p-4">
                  <div className="text-xs font-bold text-[#7A5433]">{item.label}</div>
                  <div className="font-mono font-bold text-xl text-[#DC2626] mt-0.5">
                    {(item.val * 100).toFixed(4)}%
                  </div>
                  <div className="font-mono text-[11px] text-[#6E4928]">{item.val.toFixed(6)}</div>
                </div>
              ))}
              <div className="toy-card p-4 bg-[#FFFBEB] border-[#FCD34D]">
                <div className="text-xs font-bold text-[#92400E]">Mean E[X] &amp; Std Dev σ</div>
                <div className="font-mono font-bold text-lg text-[#3B2314] mt-0.5">
                  μ = {probStats.mean.toFixed(4)}
                </div>
                <div className="font-mono text-xs text-[#6E4928]">
                  σ = {Math.sqrt(probStats.variance).toFixed(4)} (Var = {probStats.variance.toFixed(4)})
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
