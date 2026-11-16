import { useMemo, useState } from 'react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

function medianOfSorted(arr: number[]): number {
  const n = arr.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function fmtStat(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return String(Number.parseFloat(n.toFixed(6)));
}

const PRESETS: Record<string, string> = {
  'Exam Scores': '72, 85, 91, 68, 85, 94, 78, 82, 88, 91, 76, 85, 97, 64, 89, 83',
  'Sensor Temps (°C)': '21.4, 21.8, 22.1, 22.0, 21.9, 22.5, 23.1, 22.8, 22.2, 21.7, 22.0, 24.6',
  'Fibonacci (12)': '1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144',
};

export default function StatisticsAnalyzerTool() {
  const [raw, setRaw] = useState(PRESETS['Exam Scores']);
  const [binCount, setBinCount] = useState(6);
  const [hoveredBin, setHoveredBin] = useState<number | null>(null);

  const stats = useMemo(() => {
    const tokens = raw
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const nums = tokens.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return null;

    const sorted = [...nums].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const median = medianOfSorted(sorted);
    const min = sorted[0];
    const max = sorted[count - 1];
    const range = max - min;

    // Mode(s)
    const freq = new Map<number, number>();
    let maxFreq = 0;
    for (const v of sorted) {
      const f = (freq.get(v) ?? 0) + 1;
      freq.set(v, f);
      if (f > maxFreq) maxFreq = f;
    }
    const modes =
      maxFreq > 1
        ? Array.from(freq.entries())
            .filter(([, f]) => f === maxFreq)
            .map(([v]) => v)
        : [];

    // Variance & Standard Deviation (Population & Sample)
    const sqDiffSum = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0);
    const popVariance = sqDiffSum / count;
    const sampleVariance = count > 1 ? sqDiffSum / (count - 1) : Number.NaN;
    const popStd = Math.sqrt(popVariance);
    const sampleStd = count > 1 ? Math.sqrt(sampleVariance) : Number.NaN;

    // Quartiles (Tukey halves method)
    const half = Math.floor(count / 2);
    const lowerHalf = sorted.slice(0, half);
    const upperHalf = count % 2 === 0 ? sorted.slice(half) : sorted.slice(half + 1);
    const q1 = lowerHalf.length ? medianOfSorted(lowerHalf) : sorted[0];
    const q3 = upperHalf.length ? medianOfSorted(upperHalf) : sorted[count - 1];
    const iqr = q3 - q1;

    // Histogram bins
    const bins: Array<{ lo: number; hi: number; count: number }> = [];
    const k = Math.max(2, Math.min(16, binCount));
    const width = range === 0 ? 1 : range / k;
    for (let i = 0; i < k; i++) {
      bins.push({ lo: min + i * width, hi: min + (i + 1) * width, count: 0 });
    }
    for (const v of sorted) {
      const idx = range === 0 ? 0 : Math.min(k - 1, Math.floor((v - min) / width));
      bins[idx].count += 1;
    }
    const maxBin = Math.max(1, ...bins.map((b) => b.count));

    return {
      count,
      sum,
      mean,
      median,
      modes,
      maxFreq,
      min,
      max,
      range,
      popVariance,
      sampleVariance,
      popStd,
      sampleStd,
      q1,
      q3,
      iqr,
      sorted,
      bins,
      maxBin,
    };
  }, [raw, binCount]);

  return (
    <div className="space-y-5">
      {/* Dataset Input */}
      <div className="toy-panel p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="font-display font-bold text-base text-[#3B2314]">
            Dataset (comma, space, or newline separated)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(PRESETS).map(([name, val]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setRaw(val);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#FFFDF9] hover:bg-[#FEF3C7] border border-[#D4AA78] text-xs font-semibold text-[#5C3415] cursor-pointer"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <textarea
          rows={3}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Paste numbers separated by commas, spaces, or newlines..."
          className="toy-input font-mono text-sm"
        />
      </div>

      {!stats ? (
        <div className="toy-card p-6 text-center text-sm text-[#7A5433]">
          Enter at least one valid number above to compute descriptive statistics.
        </div>
      ) : (
        <>
          {/* Stat Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Count (n)', val: String(stats.count) },
              { label: 'Sum (Σx)', val: fmtStat(stats.sum) },
              { label: 'Mean (x̄)', val: fmtStat(stats.mean), accent: true },
              { label: 'Median (Q₂)', val: fmtStat(stats.median), accent: true },
              {
                label: 'Mode',
                val:
                  stats.modes.length > 0
                    ? `${stats.modes.map(fmtStat).join(', ')} (×${stats.maxFreq})`
                    : 'No mode',
                accent: true,
              },
              { label: 'Minimum', val: fmtStat(stats.min) },
              { label: 'Maximum', val: fmtStat(stats.max) },
              { label: 'Range', val: fmtStat(stats.range) },
              { label: 'Sample Std Dev (s)', val: fmtStat(stats.sampleStd) },
              { label: 'Pop. Std Dev (σ)', val: fmtStat(stats.popStd) },
              { label: 'Sample Variance (s²)', val: fmtStat(stats.sampleVariance) },
              { label: 'Pop. Variance (σ²)', val: fmtStat(stats.popVariance) },
              { label: 'Quartile Q₁ (25%)', val: fmtStat(stats.q1) },
              { label: 'Quartile Q₃ (75%)', val: fmtStat(stats.q3) },
              { label: 'IQR (Q₃ − Q₁)', val: fmtStat(stats.iqr) },
            ].map((card) => (
              <div
                key={card.label}
                className={`toy-card p-3.5 ${
                  card.accent ? 'bg-[#FEF2F2] border-[#FCA5A5]' : ''
                }`}
              >
                <div className="text-[11px] font-bold text-[#7A5433]">{card.label}</div>
                <div className="font-mono font-bold text-base sm:text-lg text-[#3B2314] mt-0.5 break-words">
                  {card.val}
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Histogram */}
          <div className="toy-panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-base text-[#3B2314]">
                  Interactive Frequency Histogram
                </h3>
                <p className="text-xs text-[#7A5433]">
                  {hoveredBin !== null && stats.bins[hoveredBin]
                    ? `Bin [${stats.bins[hoveredBin].lo.toFixed(2)} – ${stats.bins[hoveredBin].hi.toFixed(2)}]: ${stats.bins[hoveredBin].count} values (${((stats.bins[hoveredBin].count / stats.count) * 100).toFixed(1)}%)`
                    : 'Hover any bar to inspect bin interval and frequency'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#5C3415]">
                <span>Bins: {binCount}</span>
                <input
                  type="range"
                  min={3}
                  max={14}
                  value={binCount}
                  onChange={(e) => setBinCount(Number(e.target.value))}
                  className="accent-[#EF4444]"
                />
                <CopyButton text={stats.sorted.join(', ')} label="Copy Sorted" />
              </div>
            </div>

            <div className="h-52 rounded-2xl bg-[#FFFDF9] border-2 border-[#E2C6A2] px-4 pt-6 pb-3 flex items-end gap-2">
              {stats.bins.map((b, idx) => {
                const heightPct = (b.count / stats.maxBin) * 100;
                const isHover = hoveredBin === idx;
                return (
                  <div
                    key={idx}
                    onMouseEnter={() => setHoveredBin(idx)}
                    onMouseLeave={() => setHoveredBin(null)}
                    className="flex-1 h-full flex flex-col items-center justify-end gap-1 cursor-pointer"
                  >
                    <span className="font-mono text-[11px] font-bold text-[#5C3415]">
                      {b.count}
                    </span>
                    <div
                      className={`w-full rounded-t-xl border-2 border-b-0 transition-all ${
                        isHover
                          ? 'bg-[#F59E0B] border-[#92400E]'
                          : 'bg-[#EF4444] border-[#991B1B]'
                      }`}
                      style={{ height: `${Math.max(b.count > 0 ? 8 : 2, heightPct)}%` }}
                    />
                    <span className="font-mono text-[10px] text-[#7A5433] truncate max-w-full">
                      {b.lo.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
