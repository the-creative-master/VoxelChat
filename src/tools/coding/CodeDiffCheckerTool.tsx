import { useMemo, useState } from 'react';
import { diffLines, diffWordsWithSpace, diffChars, type Change } from 'diff';
import { GitCompareArrows, Columns2, Rows3, Plus, Minus, Equal, CaseSensitive } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, Segmented, EmptyHint, StatChip } from './shared';

type ViewMode = 'side' | 'unified';
type Granularity = 'line' | 'word' | 'char';

const LEFT_SAMPLE = `// utils/format.ts — before
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return "$" + dollars.toFixed(2);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/ /g, "-");
}

export const TAX_RATE = 0.08;`;

const RIGHT_SAMPLE = `// utils/format.ts — after
export function formatPrice(cents: number, currency = "USD"): string {
  const dollars = cents / 100;
  const symbol = currency === "EUR" ? "€" : "$";
  return symbol + dollars.toFixed(2);
}

export function slugify(text: string, separator = "-"): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(separator + "+", "g"), separator);
}

export const TAX_RATE = 0.0825;
export const CURRENCIES = ["USD", "EUR", "GBP"] as const;`;

interface DiffRow {
  type: 'added' | 'removed' | 'same';
  text: string;
  leftNo: number | null;
  rightNo: number | null;
  inline?: { text: string; type: 'added' | 'removed' | 'same' }[];
}

function buildRows(changes: Change[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let leftNo = 1;
  let rightNo = 1;
  for (const change of changes) {
    const lines = change.value.replace(/\n$/, '').split('\n');
    for (const line of lines) {
      if (change.added) {
        rows.push({ type: 'added', text: line, leftNo: null, rightNo: rightNo++ });
      } else if (change.removed) {
        rows.push({ type: 'removed', text: line, leftNo: leftNo++, rightNo: null });
      } else {
        rows.push({ type: 'same', text: line, leftNo: leftNo++, rightNo: rightNo++ });
      }
    }
  }
  return rows;
}

const WordDiff: React.FC<{ before: string; after: string }> = ({ before, after }) => {
  const parts = useMemo(() => diffWordsWithSpace(before, after), [before, after]);
  return (
    <span className="font-mono">
      {parts.map((p, i) =>
        p.added ? (
          <span key={i} className="bg-[#DCFCE7] text-[#14532D] rounded px-0.5">{p.value}</span>
        ) : p.removed ? (
          <span key={i} className="bg-[#FEE2E2] text-[#7F1D1D] line-through rounded px-0.5">{p.value}</span>
        ) : (
          <span key={i} className="text-[#5C4030]">{p.value}</span>
        )
      )}
    </span>
  );
};

export const CodeDiffCheckerTool: React.FC = () => {
  const [left, setLeft] = useState(LEFT_SAMPLE);
  const [right, setRight] = useState(RIGHT_SAMPLE);
  const [viewMode, setViewMode] = useState<ViewMode>('side');
  const [granularity, setGranularity] = useState<Granularity>('line');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);

  const normalizedLeft = useMemo(() => {
    let text = left;
    if (ignoreCase) text = text.toLowerCase();
    if (ignoreWhitespace) text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
    return text;
  }, [left, ignoreCase, ignoreWhitespace]);

  const normalizedRight = useMemo(() => {
    let text = right;
    if (ignoreCase) text = text.toLowerCase();
    if (ignoreWhitespace) text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
    return text;
  }, [right, ignoreCase, ignoreWhitespace]);

  const changes = useMemo<Change[]>(() => {
    if (granularity === 'word') return diffWordsWithSpace(normalizedLeft, normalizedRight);
    if (granularity === 'char') return diffChars(normalizedLeft, normalizedRight);
    return diffLines(normalizedLeft, normalizedRight);
  }, [normalizedLeft, normalizedRight, granularity]);

  const rows = useMemo(() => buildRows(changes), [changes]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    let same = 0;
    for (const row of rows) {
      if (row.type === 'added') added++;
      else if (row.type === 'removed') removed++;
      else same++;
    }
    return { added, removed, same, total: rows.length };
  }, [rows]);

  const leftOnlyRows = useMemo(() => rows.filter((r) => r.type !== 'added'), [rows]);
  const rightOnlyRows = useMemo(() => rows.filter((r) => r.type !== 'removed'), [rows]);

  const changed = stats.added > 0 || stats.removed > 0;

  return (
    <div className="space-y-3">
      <div className="toy-card p-2.5 flex flex-wrap items-center gap-2">
        <Segmented
          value={viewMode}
          onChange={(id) => { soundEngine.playClick(); setViewMode(id as ViewMode); }}
          options={[
            { id: 'side', label: 'Side by side', icon: <Columns2 className="w-3 h-3" /> },
            { id: 'unified', label: 'Unified', icon: <Rows3 className="w-3 h-3" /> },
          ]}
        />
        <div className="h-5 w-px bg-[#E2C6A2]" />
        <Segmented
          value={granularity}
          onChange={(id) => { soundEngine.playClick(); setGranularity(id as Granularity); }}
          options={[
            { id: 'line', label: 'Lines' },
            { id: 'word', label: 'Words' },
            { id: 'char', label: 'Chars' },
          ]}
        />
        <div className="h-5 w-px bg-[#E2C6A2]" />
        <button
          type="button"
          onClick={() => { soundEngine.playClick(); setIgnoreCase((v) => !v); }}
          aria-pressed={ignoreCase}
          className={`toy-btn px-2 py-1 text-[10.5px] ${ignoreCase ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-[#FFFDF8] border-[#D4AA78] text-[#7A5535]'}`}
        >
          <CaseSensitive className="w-3.5 h-3.5" /> Ignore case
        </button>
        <button
          type="button"
          onClick={() => { soundEngine.playClick(); setIgnoreWhitespace((v) => !v); }}
          aria-pressed={ignoreWhitespace}
          className={`toy-btn px-2 py-1 text-[10.5px] ${ignoreWhitespace ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-[#FFFDF8] border-[#D4AA78] text-[#7A5535]'}`}
        >
          Ignore whitespace
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => { soundEngine.playPop(1.1); setLeft(LEFT_SAMPLE); setRight(RIGHT_SAMPLE); }}
          className="toy-btn-cream px-2 py-1 text-[10.5px]"
        >
          <GitCompareArrows className="w-3.5 h-3.5" /> Load sample
        </button>
        <button
          type="button"
          onClick={() => { soundEngine.playClick(); setLeft(right); }}
          className="toy-btn-cream px-2 py-1 text-[10.5px]"
        >
          Copy → left
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatChip label="added" value={`+${stats.added}`} tone="mint" />
        <StatChip label="removed" value={`−${stats.removed}`} tone="red" />
        <StatChip label="unchanged" value={stats.same} tone="cream" />
        <StatChip label="total" value={stats.total} tone="gold" />
        {!changed && <StatChip label="result" value="identical" tone="mint" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel
          title="Original"
          icon={<Minus className="w-3.5 h-3.5 text-[#B91C1C]" />}
          actions={<CopyButton text={left} />}
        >
          <textarea
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            spellCheck={false}
            aria-label="Original text"
            className="w-full h-44 rounded-lg bg-[#FFFDF9] border-2 border-[#E7B4B4] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#3B2314] focus:outline-none focus:border-[#DC2626] resize-none"
            placeholder="Paste the original text…"
          />
        </Panel>
        <Panel
          title="Changed"
          icon={<Plus className="w-3.5 h-3.5 text-[#15803D]" />}
          actions={<CopyButton text={right} />}
        >
          <textarea
            value={right}
            onChange={(e) => setRight(e.target.value)}
            spellCheck={false}
            aria-label="Changed text"
            className="w-full h-44 rounded-lg bg-[#F7FDF9] border-2 border-[#A7D8B9] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#14532D] focus:outline-none focus:border-[#16A34A] resize-none"
            placeholder="Paste the changed text…"
          />
        </Panel>
      </div>

      <Panel
        title="Diff result"
        icon={<GitCompareArrows className="w-3.5 h-3.5" />}
        actions={
          <div className="flex items-center gap-1.5">
            <Equal className="w-3.5 h-3.5 text-[#A98768]" />
            <span className="text-[10px] text-[#A98768]">{granularity === 'line' ? 'line-level' : granularity === 'word' ? 'word-level' : 'character-level'}</span>
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyHint>Start typing in either side to see the differences.</EmptyHint>
        ) : viewMode === 'side' ? (
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border-2 border-[#E2C6A2]">
            <div className="border-r-2 border-[#E2C6A2] min-w-0">
              <div className="bg-[#F7EAD5] px-2 py-1 text-[10px] font-bold text-[#6B4423] border-b border-[#E2C6A2]">Original</div>
              <div className="max-h-[22rem] overflow-auto font-mono text-[11px] leading-relaxed">
                {leftOnlyRows.map((row, i) => (
                  <div key={i} className={`flex gap-1.5 px-1.5 py-0.5 ${row.type === 'removed' ? 'bg-[#FEE2E2]' : ''}`}>
                    <span className="w-6 shrink-0 text-right text-[#C4A88C] select-none">{row.leftNo ?? ''}</span>
                    <span className={`flex-1 whitespace-pre-wrap break-all ${row.type === 'removed' ? 'text-[#7F1D1D]' : 'text-[#5C4030]'}`}>
                      {row.type === 'removed' && granularity !== 'line' ? (
                        <WordDiff before={row.text} after="" />
                      ) : (
                        row.text || '\u00A0'
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <div className="bg-[#F7EAD5] px-2 py-1 text-[10px] font-bold text-[#6B4423] border-b border-[#E2C6A2]">Changed</div>
              <div className="max-h-[22rem] overflow-auto font-mono text-[11px] leading-relaxed">
                {rightOnlyRows.map((row, i) => (
                  <div key={i} className={`flex gap-1.5 px-1.5 py-0.5 ${row.type === 'added' ? 'bg-[#DCFCE7]' : ''}`}>
                    <span className="w-6 shrink-0 text-right text-[#C4A88C] select-none">{row.rightNo ?? ''}</span>
                    <span className={`flex-1 whitespace-pre-wrap break-all ${row.type === 'added' ? 'text-[#14532D]' : 'text-[#5C4030]'}`}>
                      {row.type === 'added' && granularity !== 'line' ? (
                        <WordDiff before="" after={row.text} />
                      ) : (
                        row.text || '\u00A0'
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-h-[24rem] overflow-auto rounded-lg border-2 border-[#E2C6A2] font-mono text-[11px] leading-relaxed">
            {rows.map((row, i) => (
              <div
                key={i}
                className={`flex items-start gap-1.5 px-1.5 py-0.5 ${
                  row.type === 'added' ? 'bg-[#DCFCE7]' : row.type === 'removed' ? 'bg-[#FEE2E2]' : ''
                }`}
              >
                <span className={`w-3 shrink-0 font-bold ${
                  row.type === 'added' ? 'text-[#15803D]' : row.type === 'removed' ? 'text-[#B91C1C]' : 'text-[#C4A88C]'
                }`}>
                  {row.type === 'added' ? '+' : row.type === 'removed' ? '−' : ' '}
                </span>
                <span className="w-6 shrink-0 text-right text-[#C4A88C] select-none">{row.leftNo ?? ''}</span>
                <span className="w-6 shrink-0 text-right text-[#C4A88C] select-none">{row.rightNo ?? ''}</span>
                <span className={`flex-1 whitespace-pre-wrap break-all ${
                  row.type === 'added' ? 'text-[#14532D]' : row.type === 'removed' ? 'text-[#7F1D1D]' : 'text-[#5C4030]'
                }`}>
                  {row.text || '\u00A0'}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[10px] text-[#A98768]">
            Myer's diff algorithm · {granularity} granularity · {ignoreCase ? 'case-insensitive' : 'case-sensitive'}
          </p>
          <CopyButton text={rows.map((r) => `${r.type === 'added' ? '+' : r.type === 'removed' ? '-' : ' '} ${r.text}`).join('\n')} label="Export diff" />
        </div>
      </Panel>
    </div>
  );
};

export default CodeDiffCheckerTool;
