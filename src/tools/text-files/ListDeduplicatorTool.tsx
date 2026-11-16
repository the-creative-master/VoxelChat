import React, { useMemo, useState } from 'react';
import { ArrowDownAZ, BarChart3, ListFilter, ListOrdered, Trash2, Users } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { downloadBlob } from '../../utils/storage';
import { Panel, StatChip, EmptyHint } from '../coding/shared';
import { GhostButton, Slider, ToggleRow } from './shared';

/* =========================================================================
   Duplicate Line & Word Frequency Analyzer
   Two workloads in one bench: clean a line list, or measure word frequency.
   ========================================================================= */

type SortMode = 'none' | 'alpha' | 'alpha-desc' | 'length' | 'freq' | 'freq-desc';

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'none', label: 'Original order' },
  { id: 'alpha', label: 'A → Z' },
  { id: 'alpha-desc', label: 'Z → A' },
  { id: 'length', label: 'Shortest first' },
  { id: 'freq', label: 'Rarest first' },
  { id: 'freq-desc', label: 'Most frequent' },
];

interface LineResult {
  kept: string[];
  removed: { line: string; count: number }[];
  emptyRemoved: number;
}

const dedupeLines = (
  text: string,
  opts: { caseSensitive: boolean; trim: boolean; dropEmpty: boolean }
): LineResult => {
  const raw = text.split(/\r?\n/);
  const seen = new Map<string, number>();
  const kept: string[] = [];
  const order: string[] = [];
  let emptyRemoved = 0;

  for (const original of raw) {
    const line = opts.trim ? original.trim() : original;
    if (opts.dropEmpty && line === '') {
      if (opts.trim || original !== '') emptyRemoved += 1;
      continue;
    }
    const key = opts.caseSensitive ? line : line.toLowerCase();
    const count = seen.get(key) ?? 0;
    if (count === 0) {
      kept.push(line);
      order.push(key);
    }
    seen.set(key, count + 1);
  }

  const removed = order
    .map((key, i) => ({ line: kept[i], count: seen.get(key) ?? 1 }))
    .filter((r) => r.count > 1)
    .sort((a, b) => b.count - a.count);

  return { kept, removed, emptyRemoved };
};

interface WordFreq {
  word: string;
  count: number;
  percent: number;
}

const wordFrequency = (text: string, minLen: number, caseSensitive: boolean, limit: number) => {
  const tokens = text.match(/[\p{L}\p{N}’'-]+/gu) ?? [];
  const map = new Map<string, { label: string; count: number }>();
  let total = 0;
  for (const raw of tokens) {
    if (raw.length < minLen) continue;
    const key = caseSensitive ? raw : raw.toLowerCase();
    const entry = map.get(key);
    if (entry) entry.count += 1;
    else map.set(key, { label: key, count: 1 });
    total += 1;
  }
  const rows: WordFreq[] = [...map.values()]
    .map(({ label, count }) => ({ word: label, count, percent: total ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
  return { rows, total, unique: map.size };
};

const SAMPLE = `apple
Banana
apple
cherry
banana
APPLE
date
cherry
elderberry
apple
banana
fig`;

const SAMPLE_PROSE = `The quick brown fox jumps over the lazy dog. The dog was not amused, and the fox knew it.
A quick fox is a lucky fox, but the lazy dog always gets the last laugh.`;

const applySort = (lines: string[], mode: SortMode, freq: Map<string, number>, caseSensitive: boolean) => {
  if (mode === 'none') return lines;
  const copy = [...lines];
  if (mode === 'alpha') return copy.sort((a, b) => a.localeCompare(b));
  if (mode === 'alpha-desc') return copy.sort((a, b) => b.localeCompare(a));
  if (mode === 'length') return copy.sort((a, b) => a.length - b.length || a.localeCompare(b));
  const keyOf = (s: string) => (caseSensitive ? s : s.toLowerCase());
  if (mode === 'freq-desc') return copy.sort((a, b) => (freq.get(keyOf(b)) ?? 0) - (freq.get(keyOf(a)) ?? 0));
  return copy.sort((a, b) => (freq.get(keyOf(a)) ?? 0) - (freq.get(keyOf(b)) ?? 0));
};

export const ListDeduplicatorTool: React.FC = () => {
  const [mode, setMode] = useState<'lines' | 'words'>('lines');
  const [text, setText] = useState(SAMPLE);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [trim, setTrim] = useState(true);
  const [dropEmpty, setDropEmpty] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('none');
  const [minLen, setMinLen] = useState(3);
  const [limit, setLimit] = useState(30);

  const lineResult = useMemo(
    () => dedupeLines(text, { caseSensitive, trim, dropEmpty }),
    [text, caseSensitive, trim, dropEmpty]
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const line of text.split(/\r?\n/)) {
      const key = caseSensitive ? line : line.toLowerCase();
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [text, caseSensitive]);

  const outputLines = useMemo(
    () => applySort(lineResult.kept, sortMode, counts, caseSensitive),
    [lineResult.kept, sortMode, counts, caseSensitive]
  );

  const wordResult = useMemo(
    () => wordFrequency(text, minLen, caseSensitive, limit),
    [text, minLen, caseSensitive, limit]
  );

  const outputText = outputLines.join('\n');
  const totalLines = text ? text.split(/\r?\n/).length : 0;
  const dupesRemoved = totalLines - lineResult.kept.length;

  return (
    <div className="space-y-3">
      <Panel
        title="Analyzer"
        icon={<ListFilter className="h-4 w-4" />}
        actions={
          <div className="inline-flex rounded-lg border-2 border-[#BFDBFE] bg-[#EFF6FF] p-0.5">
            {[
              { id: 'lines' as const, label: 'Lines', icon: <ListOrdered className="h-3 w-3" /> },
              { id: 'words' as const, label: 'Words', icon: <BarChart3 className="h-3 w-3" /> },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setMode(t.id);
                  soundEngine.playPop(1.05);
                }}
                aria-pressed={mode === t.id}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                  mode === t.id ? 'bg-white text-[#1E3A8A] shadow-sm' : 'text-[#64748B] hover:text-[#1E3A8A]'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={11}
          spellCheck={false}
          className="w-full resize-y rounded-lg border-2 border-[#BFDBFE] bg-white p-2.5 font-mono text-[12px] leading-relaxed text-[#1E293B] outline-none focus:border-[#3B82F6]"
          placeholder={mode === 'lines' ? 'One entry per line…' : 'Paste prose to measure word frequency…'}
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <GhostButton onClick={() => setText(mode === 'lines' ? SAMPLE : SAMPLE_PROSE)}>Sample</GhostButton>
          <GhostButton onClick={() => setText('')} disabled={!text}>
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </GhostButton>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <StatChip label="lines" value={totalLines} />
            <StatChip label="kept" value={lineResult.kept.length} tone="mint" />
            <StatChip label="removed" value={Math.max(0, dupesRemoved)} tone={dupesRemoved > 0 ? 'red' : 'cream'} />
          </div>
        </div>
      </Panel>

      {mode === 'lines' ? (
        <>
          <Panel title="Clean-up options" icon={<Users className="h-4 w-4" />}>
            <div className="grid gap-2 sm:grid-cols-3">
              <ToggleRow
                label="Case sensitive"
                hint="Treat “Apple” and “apple” as different"
                checked={caseSensitive}
                onChange={setCaseSensitive}
              />
              <ToggleRow
                label="Trim whitespace"
                hint="Ignore leading / trailing spaces per line"
                checked={trim}
                onChange={setTrim}
              />
              <ToggleRow
                label="Drop empty lines"
                hint="Remove blank entries entirely"
                checked={dropEmpty}
                onChange={setDropEmpty}
              />
            </div>
            <div className="mt-2.5">
              <span className="mb-1 block text-[11px] font-bold text-[#1E3A8A]">Order</span>
              <div className="flex flex-wrap gap-1.5">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSortMode(s.id)}
                    aria-pressed={sortMode === s.id}
                    className={`rounded-lg border-2 px-2.5 py-1 text-[10.5px] font-bold transition ${
                      sortMode === s.id
                        ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                        : 'border-[#BFDBFE] bg-white text-[#1E3A8A] hover:border-[#3B82F6]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title={`Unique list (${outputLines.length})`}
              icon={<ArrowDownAZ className="h-4 w-4" />}
              actions={<CopyButton text={outputText} label="Copy" size="sm" />}
            >
              <div
                className="max-h-80 min-h-[10rem] overflow-auto rounded-lg border-2 border-[#86EFAC] bg-[#F0FDF4] p-2.5 font-mono text-[12px] leading-relaxed text-[#14532D]"
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {outputText || <span className="italic text-[#64748B]">No unique lines yet</span>}
              </div>
              <div className="mt-2">
                <GhostButton
                  onClick={() =>
                    downloadBlob(new Blob([outputText], { type: 'text/plain;charset=utf-8' }), 'unique-lines.txt')
                  }
                  disabled={!outputText}
                >
                  Save .txt
                </GhostButton>
              </div>
            </Panel>

            <Panel
              title={`Duplicates found (${lineResult.removed.length})`}
              icon={<BarChart3 className="h-4 w-4" />}
            >
              {lineResult.removed.length === 0 ? (
                <EmptyHint>No repeated lines — the list is already clean.</EmptyHint>
              ) : (
                <div className="max-h-80 space-y-1 overflow-auto">
                  {lineResult.removed.map((r, i) => (
                    <div
                      key={`${r.line}-${i}`}
                      className="flex items-center gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-2 py-1"
                    >
                      <span className="rounded-full bg-[#F59E0B] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white">
                        ×{r.count}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#78350F]">{r.line}</span>
                    </div>
                  ))}
                </div>
              )}
              {lineResult.emptyRemoved > 0 && (
                <p className="mt-2 text-[10.5px] font-semibold text-[#64748B]">
                  {lineResult.emptyRemoved} blank line{lineResult.emptyRemoved === 1 ? '' : 's'} dropped.
                </p>
              )}
            </Panel>
          </div>
        </>
      ) : (
        <>
          <Panel title="Word frequency settings" icon={<BarChart3 className="h-4 w-4" />}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Slider label="Minimum word length" value={minLen} min={1} max={10} onChange={setMinLen} />
              <Slider label="Rows shown" value={limit} min={5} max={100} step={5} onChange={setLimit} />
              <ToggleRow
                label="Case sensitive"
                hint="Keep “The” and “the” apart"
                checked={caseSensitive}
                onChange={setCaseSensitive}
              />
            </div>
          </Panel>

          <Panel
            title={`Top ${Math.min(limit, wordResult.rows.length)} of ${wordResult.unique} unique words`}
            icon={<BarChart3 className="h-4 w-4" />}
            actions={
              <div className="flex gap-1.5">
                <StatChip label="tokens" value={wordResult.total} />
                <CopyButton
                  text={wordResult.rows.map((r) => `${r.word}\t${r.count}\t${r.percent.toFixed(2)}%`).join('\n')}
                  label="Copy TSV"
                  size="sm"
                />
              </div>
            }
          >
            {wordResult.rows.length === 0 ? (
              <EmptyHint>No words long enough — lower the minimum length or paste more text.</EmptyHint>
            ) : (
              <div className="space-y-1">
                {wordResult.rows.map((r, i) => (
                  <div key={r.word} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-right font-mono text-[10px] text-[#94A3B8]">{i + 1}</span>
                    <span className="w-32 shrink-0 truncate font-mono text-[11px] font-bold text-[#1E3A8A]">
                      {r.word}
                    </span>
                    <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-[#EFF6FF]">
                      <div
                        className="h-full rounded-full bg-[#3B82F6]/70"
                        style={{ width: `${Math.max(2, (r.count / wordResult.rows[0].count) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-[10.5px] text-[#1E3A8A]">×{r.count}</span>
                    <span className="w-12 shrink-0 text-right font-mono text-[10.5px] text-[#64748B]">
                      {r.percent.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
};

export default ListDeduplicatorTool;
