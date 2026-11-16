import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Braces, Copy, Download, Table2 } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { downloadBlob } from '../../utils/storage';
import { Panel, StatChip, EmptyHint, ErrorBanner } from '../coding/shared';
import { GhostButton, ToggleRow } from './shared';

/* =========================================================================
   CSV ↔ JSON ↔ Table Viewer
   A small RFC-4180 parser (quoted fields, escaped quotes, CRLF) so real
   exports work, plus type guessing and a paginated table preview.
   ========================================================================= */

type Delimiter = ',' | ';' | '\t' | '|';

interface ParsedCsv {
  headers: string[];
  rows: string[][];
  error: string | null;
}

const parseDelimited = (text: string, delimiter: string): ParsedCsv => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/^\uFEFF/, '');

  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (inQuotes) return { headers: [], rows: [], error: 'Unclosed quote — check that every " has a partner.' };
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [], error: null };

  const headers = nonEmpty[0].map((h, idx) => h.trim() || `column_${idx + 1}`);
  const width = headers.length;
  const body = nonEmpty.slice(1).map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push('');
    return copy.slice(0, width);
  });
  return { headers, rows: body, error: null };
};

const toCsvCell = (v: unknown, delimiter: string): string => {
  const s = v === null || v === undefined ? '' : String(v);
  void delimiter;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/** Guess number / boolean / null so JSON output looks like real data. */
const coerce = (raw: string, guess: boolean): unknown => {
  if (!guess) return raw;
  const s = raw.trim();
  if (s === '') return raw === '' ? '' : raw;
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  if (/^null$/i.test(s)) return null;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s) && s.length < 16) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return raw;
};

const csvToJson = (parsed: ParsedCsv, guess: boolean, arrayOfArrays: boolean, pretty: boolean): string => {
  if (arrayOfArrays) {
    const arr = [parsed.headers, ...parsed.rows];
    return JSON.stringify(arr, null, pretty ? 2 : 0);
  }
  const objects = parsed.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    parsed.headers.forEach((h, i) => {
      obj[h] = coerce(row[i] ?? '', guess);
    });
    return obj;
  });
  return JSON.stringify(objects, null, pretty ? 2 : 0);
};

const flattenValue = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

interface JsonTable {
  headers: string[];
  rows: string[][];
  error: string | null;
  shape: string;
}

const jsonToTable = (text: string): JsonTable => {
  const empty = { headers: [], rows: [], error: null, shape: '' };
  if (!text.trim()) return empty;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ...empty, error: (e as Error).message };
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return { ...empty, error: 'The array is empty.' };
    const first = data[0];
    if (Array.isArray(first)) {
      const headers = (first as unknown[]).map((_, i) => `col_${i + 1}`);
      const rows = (data as unknown[][]).map((r) => r.map(flattenValue));
      return { headers, rows, error: null, shape: `${rows.length} rows × ${headers.length} columns` };
    }
    if (typeof first === 'object' && first !== null) {
      const keySet = new Set<string>();
      for (const item of data) {
        if (typeof item === 'object' && item !== null) Object.keys(item).forEach((k) => keySet.add(k));
      }
      const headers = [...keySet];
      const rows = (data as Record<string, unknown>[]).map((item) => headers.map((h) => flattenValue(item?.[h])));
      return { headers, rows, error: null, shape: `${rows.length} objects × ${headers.length} keys` };
    }
    return {
      headers: ['value'],
      rows: (data as unknown[]).map((v) => [flattenValue(v)]),
      error: null,
      shape: `${data.length} scalar values`,
    };
  }

  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data as Record<string, unknown>);
    const allObjects = entries.every(([, v]) => typeof v === 'object' && v !== null && !Array.isArray(v));
    if (allObjects && entries.length > 0) {
      const headers = entries.map(([k]) => k);
      const rows = entries.map(([, v]) => headers.map((h) => flattenValue((v as Record<string, unknown>)[h])));
      return { headers, rows, error: null, shape: `${entries.length} records` };
    }
    const keySet = new Set<string>(['key']);
    for (const [, v] of entries) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        Object.keys(v).forEach((k) => keySet.add(k));
      }
    }
    const headers = [...keySet];
    const rows = entries.map(([k, v]) =>
      headers.map((h) =>
        h === 'key' ? k : typeof v === 'object' && v !== null ? flattenValue((v as Record<string, unknown>)[h]) : ''
      )
    );
    return { headers, rows, error: null, shape: `${entries.length} top-level keys` };
  }

  return { headers: ['value'], rows: [[String(data)]], error: null, shape: 'single value' };
};

const tableToCsv = (table: JsonTable, delimiter: string): string =>
  [table.headers.map((h) => toCsvCell(h, delimiter)).join(delimiter)]
    .concat(table.rows.map((r) => r.map((c) => toCsvCell(c, delimiter)).join(delimiter)))
    .join('\n');

const SAMPLE_CSV = `name,role,age,active,joined
Ada Lovelace,Engineer,36,true,1843-01-01
Grace Hopper,Admiral,85,true,1944-06-02
Alan Turing,Mathematician,41,false,1936-05-28
"Katherine Johnson, PhD",Computer,101,true,1953-06-03`;

const SAMPLE_JSON = `[
  { "city": "Sharjah", "temp": 34, "humid": true },
  { "city": "Dubai", "temp": 36, "humid": true },
  { "city": "Muscat", "temp": 31, "humid": false }
]`;

const DELIMS: { id: Delimiter; label: string }[] = [
  { id: ',', label: 'Comma ,' },
  { id: ';', label: 'Semicolon ;' },
  { id: '\t', label: 'Tab' },
  { id: '|', label: 'Pipe |' },
];

export const CsvJsonTableTool: React.FC = () => {
  const [mode, setMode] = useState<'csv' | 'json'>('csv');
  const [input, setInput] = useState(SAMPLE_CSV);
  const [delimiter, setDelimiter] = useState<Delimiter>(',');
  const [guessTypes, setGuessTypes] = useState(true);
  const [pretty, setPretty] = useState(true);
  const [arrayOfArrays, setArrayOfArrays] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const parsed = useMemo(
    () => (mode === 'csv' ? parseDelimited(input, delimiter) : { headers: [], rows: [], error: null }),
    [mode, input, delimiter]
  );
  const jsonTable = useMemo(() => (mode === 'json' ? jsonToTable(input) : null), [mode, input]);

  const table: JsonTable =
    mode === 'csv'
      ? { headers: parsed.headers, rows: parsed.rows, error: parsed.error, shape: '' }
      : jsonTable ?? { headers: [], rows: [], error: null, shape: '' };

  const jsonOut = useMemo(
    () => (mode === 'csv' ? csvToJson(parsed, guessTypes, arrayOfArrays, pretty) : ''),
    [mode, parsed, guessTypes, arrayOfArrays, pretty]
  );

  const csvOut = useMemo(() => (mode === 'json' && jsonTable ? tableToCsv(jsonTable, delimiter) : ''), [mode, jsonTable, delimiter]);

  const error = mode === 'csv' ? parsed.error : jsonTable?.error ?? null;
  const totalPages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = table.rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-3">
      <Panel
        title="Converter"
        icon={<ArrowLeftRight className="h-4 w-4" />}
        actions={
          <div className="inline-flex rounded-lg border-2 border-[#BFDBFE] bg-[#EFF6FF] p-0.5">
            {[
              { id: 'csv' as const, label: 'CSV → JSON', icon: <Table2 className="h-3 w-3" /> },
              { id: 'json' as const, label: 'JSON → CSV', icon: <Braces className="h-3 w-3" /> },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setMode(t.id);
                  setPage(0);
                  setInput(t.id === 'csv' ? SAMPLE_CSV : SAMPLE_JSON);
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
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setPage(0);
          }}
          rows={9}
          spellCheck={false}
          className="w-full resize-y rounded-lg border-2 border-[#BFDBFE] bg-white p-2.5 font-mono text-[12px] leading-relaxed text-[#1E293B] outline-none focus:border-[#3B82F6]"
          placeholder={mode === 'csv' ? 'Paste CSV…' : 'Paste a JSON array or object…'}
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <GhostButton onClick={() => setInput(mode === 'csv' ? SAMPLE_CSV : SAMPLE_JSON)}>Sample</GhostButton>
          <GhostButton onClick={() => setInput('')} disabled={!input}>
            Clear
          </GhostButton>
          {mode === 'csv' && (
            <>
              <span className="ml-1 text-[10px] font-bold uppercase text-[#64748B]">Delimiter</span>
              {DELIMS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDelimiter(d.id)}
                  aria-pressed={delimiter === d.id}
                  className={`rounded-md border-2 px-2 py-1 font-mono text-[10px] font-bold transition ${
                    delimiter === d.id
                      ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                      : 'border-[#BFDBFE] bg-white text-[#1E3A8A]'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </>
          )}
        </div>
        {error && (
          <div className="mt-2">
            <ErrorBanner message={error} />
          </div>
        )}
      </Panel>

      {!error && table.headers.length > 0 && (
        <>
          <Panel
            title={`Table preview${jsonTable?.shape ? ` — ${jsonTable.shape}` : ''}`}
            icon={<Table2 className="h-4 w-4" />}
            actions={
              <div className="flex gap-1.5">
                <StatChip label="rows" value={table.rows.length} />
                <StatChip label="cols" value={table.headers.length} tone="mint" />
              </div>
            }
          >
            <div className="overflow-auto rounded-lg border-2 border-[#DBEAFE]">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead className="bg-[#EFF6FF]">
                  <tr>
                    <th className="w-8 border-b border-[#DBEAFE] px-2 py-1.5 font-mono text-[9.5px] text-[#94A3B8]">#</th>
                    {table.headers.map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap border-b border-[#DBEAFE] px-2 py-1.5 font-bold text-[#1E3A8A]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, ri) => (
                    <tr key={ri} className="odd:bg-white even:bg-[#FBFDFF]">
                      <td className="px-2 py-1 font-mono text-[9.5px] text-[#94A3B8]">
                        {currentPage * PAGE_SIZE + ri + 1}
                      </td>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="max-w-[18rem] truncate px-2 py-1 font-mono text-[#1E293B]"
                          title={cell}
                        >
                          {cell === '' ? <span className="text-[#CBD5E1]">—</span> : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-2 flex items-center justify-between">
                <GhostButton onClick={() => setPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>
                  ← Prev
                </GhostButton>
                <span className="font-mono text-[10.5px] text-[#64748B]">
                  Page {currentPage + 1} / {totalPages}
                </span>
                <GhostButton
                  onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
                  disabled={currentPage >= totalPages - 1}
                >
                  Next →
                </GhostButton>
              </div>
            )}
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title={mode === 'csv' ? 'JSON output' : 'CSV output'}
              icon={<Braces className="h-4 w-4" />}
              actions={
                <div className="flex gap-1.5">
                  <CopyButton text={mode === 'csv' ? jsonOut : csvOut} label="Copy" size="sm" />
                  <button
                    type="button"
                    onClick={() =>
                      downloadBlob(
                        new Blob([mode === 'csv' ? jsonOut : csvOut], {
                          type: mode === 'csv' ? 'application/json' : 'text/csv;charset=utf-8',
                        }),
                        mode === 'csv' ? 'converted.json' : 'converted.csv'
                      )
                    }
                    className="toy-btn-cream px-2 py-1.5 text-[10.5px]"
                  >
                    <Download className="h-3 w-3" /> Save
                  </button>
                </div>
              }
            >
              <div
                className="max-h-72 min-h-[8rem] overflow-auto rounded-lg border-2 border-[#86EFAC] bg-[#F0FDF4] p-2.5 font-mono text-[11px] leading-relaxed text-[#14532D]"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {mode === 'csv' ? jsonOut : csvOut}
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-[#64748B]">
                {(mode === 'csv' ? jsonOut : csvOut).length.toLocaleString()} characters
              </p>
            </Panel>

            <Panel title="Options" icon={<Copy className="h-4 w-4" />}>
              <div className="space-y-2">
                {mode === 'csv' ? (
                  <>
                    <ToggleRow
                      label="Detect numbers & booleans"
                      hint="“36” becomes 36, “true” becomes true."
                      checked={guessTypes}
                      onChange={setGuessTypes}
                    />
                    <ToggleRow
                      label="Pretty-print JSON"
                      hint="Indent with two spaces. Turn off for the smallest file."
                      checked={pretty}
                      onChange={setPretty}
                    />
                    <ToggleRow
                      label="Array of arrays"
                      hint="Include the header row and emit [[…],[…]] instead of objects."
                      checked={arrayOfArrays}
                      onChange={setArrayOfArrays}
                    />
                  </>
                ) : (
                  <>
                    <ToggleRow
                      label="Quote when needed"
                      hint="Fields containing commas, quotes or newlines get wrapped in quotes."
                      checked
                      onChange={() => {}}
                    />
                    <p className="rounded-lg border-2 border-[#DBEAFE] bg-[#F8FAFF] px-2.5 py-2 text-[10.5px] leading-relaxed text-[#64748B]">
                      Nested objects are flattened to a single cell using JSON. Arrays of objects become rows; a single
                      object becomes a key/value table.
                    </p>
                  </>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}

      {!error && table.headers.length === 0 && input.trim() !== '' && (
        <EmptyHint>Nothing to preview yet — the parser needs at least one row.</EmptyHint>
      )}
    </div>
  );
};

export default CsvJsonTableTool;
