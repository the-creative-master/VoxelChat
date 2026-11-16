import { useCallback, useMemo, useState } from 'react';
import { Braces, Check, FileJson2, GitCompareArrows, ListTree, Minimize2, Sparkles, Wand2, ArrowLeftRight } from 'lucide-react';
import yaml from 'js-yaml';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, Segmented, ErrorBanner, EmptyHint } from './shared';

type Format = 'json' | 'yaml' | 'toml';
type Mode = 'format' | 'tree' | 'convert';

interface ParseIssue {
  message: string;
  line?: number;
  column?: number;
}

const SAMPLE = `{
  "project": "BiteSizedUtilities",
  "version": "1.0.0",
  "localOnly": true,
  "cupboards": [
    { "number": 1, "name": "Math & Numbers", "tools": 15 },
    { "number": 2, "name": "Coding & Developing", "tools": 15 }
  ],
  "artStyle": {
    "wall": "#FFF8EB",
    "grid": "#F3DFC1",
    "pocket": "#E6C79C",
    "bevels": { "border": 2, "bottom": 6 }
  },
  "tags": ["offline", "privacy-first", "no-paywall"],
  "author": null
}`;

/* --------------------------- helpers --------------------------- */

function lineColFromOffset(text: string, offset: number): { line: number; column: number } {
  const upTo = text.slice(0, Math.max(0, offset));
  const lines = upTo.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function parseJsonWithPosition(text: string): { value: unknown; error?: ParseIssue } {
  try {
    return { value: JSON.parse(text) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const posMatch = /position (\d+)/i.exec(message);
    const lineColMatch = /line (\d+) column (\d+)/i.exec(message);
    if (lineColMatch) return { value: null, error: { message, line: Number(lineColMatch[1]), column: Number(lineColMatch[2]) } };
    if (posMatch) {
      const { line, column } = lineColFromOffset(text, Number(posMatch[1]));
      return { value: null, error: { message, line, column } };
    }
    return { value: null, error: { message } };
  }
}

function parseYaml(text: string): { value: unknown; error?: ParseIssue } {
  try {
    return { value: yaml.load(text) };
  } catch (err) {
    const e = err as { message?: string; mark?: { line: number; column: number } };
    return {
      value: null,
      error: { message: e.message ?? 'Invalid YAML', line: e.mark ? e.mark.line + 1 : undefined, column: e.mark ? e.mark.column + 1 : undefined },
    };
  }
}

function parseTomlText(text: string): { value: unknown; error?: ParseIssue } {
  try {
    return { value: parseToml(text) };
  } catch (err) {
    const e = err as { message?: string; line?: number; column?: number };
    return { value: null, error: { message: e.message ?? 'Invalid TOML', line: e.line, column: e.column } };
  }
}

function parseByFormat(text: string, format: Format): { value: unknown; error?: ParseIssue } {
  if (!text.trim()) return { value: null, error: { message: 'Input is empty' } };
  if (format === 'json') return parseJsonWithPosition(text);
  if (format === 'yaml') return parseYaml(text);
  return parseTomlText(text);
}

/** Normalizes objects to a plain JSON-safe structure for conversion. */
function toPlain(value: unknown): unknown {
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    value.forEach((v, k) => { out[String(k)] = toPlain(v); });
    return out;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

function serialize(value: unknown, format: Format, indent: number): string {
  const plain = toPlain(value);
  if (format === 'json') return JSON.stringify(plain, null, indent);
  if (format === 'yaml') return yaml.dump(plain, { indent, lineWidth: 100, noRefs: true, sortKeys: false });
  return stringifyToml(plain as Record<string, never>);
}

function minifyJson(text: string): string {
  return JSON.stringify(JSON.parse(text));
}

function countNodes(value: unknown): { keys: number; arrays: number; leaves: number; depth: number } {
  let keys = 0;
  let arrays = 0;
  let leaves = 0;
  let maxDepth = 0;
  const walk = (node: unknown, depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    if (Array.isArray(node)) {
      arrays++;
      node.forEach((n) => walk(n, depth + 1));
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node)) {
        keys++;
        walk(v, depth + 1);
      }
    } else {
      leaves++;
    }
  };
  walk(value, 1);
  return { keys, arrays, leaves, depth: maxDepth };
}

/* --------------------------- tree view --------------------------- */

const TreeNode: React.FC<{ label: string; value: unknown; depth: number; defaultOpen?: boolean }> = ({ label, value, depth, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen && depth < 3);
  const isArray = Array.isArray(value);
  const isObject = !isArray && value !== null && typeof value === 'object';
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : isObject
      ? Object.entries(value as Record<string, unknown>)
      : [];

  const renderLeaf = (v: unknown) => {
    if (v === null) return <span className="text-[#B45309] italic">null</span>;
    if (typeof v === 'string') return <span className="text-[#15803D]">"{v}"</span>;
    if (typeof v === 'number') return <span className="text-[#1D4ED8]">{v}</span>;
    if (typeof v === 'boolean') return <span className="text-[#7C3AED] font-bold">{String(v)}</span>;
    return <span className="text-[#6B4423]">{String(v)}</span>;
  };

  if (!isArray && !isObject) {
    return (
      <div className="flex items-start gap-1.5 py-0.5 font-mono text-[11px]" style={{ paddingLeft: depth * 12 }}>
        <span className="text-[#8B5A2B] shrink-0">{label}:</span>
        <span className="break-all">{renderLeaf(value)}</span>
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 py-0.5 font-mono text-[11px] text-left hover:bg-[#F7EAD5] rounded px-1 -ml-1 w-full"
      >
        <span className="text-[#A98768] w-2.5 shrink-0">{open ? '▾' : '▸'}</span>
        <span className="text-[#8B5A2B] font-bold">{label}</span>
        <span className="text-[#A98768]">
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {open && (
        <div className="border-l border-dashed border-[#E6C79C] ml-1.5">
          {entries.map(([k, v]) => (
            <TreeNode key={k} label={isArray ? `[${k}]` : k} value={v} depth={depth + 1} defaultOpen={defaultOpen} />
          ))}
          {entries.length === 0 && <p className="pl-3 text-[10px] text-[#A98768] italic">{isArray ? 'empty array' : 'empty object'}</p>}
        </div>
      )}
    </div>
  );
};

/* --------------------------- component --------------------------- */

export const JsonYamlFormatterTool: React.FC = () => {
  const [input, setInput] = useState(SAMPLE);
  const [inputFormat, setInputFormat] = useState<Format>('json');
  const [outputFormat, setOutputFormat] = useState<Format>('json');
  const [indent, setIndent] = useState(2);
  const [mode, setMode] = useState<Mode>('format');
  const [treeSource, setTreeSource] = useState<'input' | 'output'>('input');

  const parsedInput = useMemo(() => parseByFormat(input, inputFormat), [input, inputFormat]);
  const stats = useMemo(() => (parsedInput.value !== null ? countNodes(toPlain(parsedInput.value)) : null), [parsedInput.value]);

  const output = useMemo(() => {
    if (parsedInput.error) return '';
    try {
      return serialize(parsedInput.value, outputFormat, indent);
    } catch (err) {
      return `Serialization error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }, [parsedInput, outputFormat, indent]);

  const outputParse = useMemo(() => (output && !parsedInput.error ? parseByFormat(output, outputFormat) : { value: null }), [output, outputFormat, parsedInput.error]);

  const applyFormatted = useCallback(() => {
    if (parsedInput.error || !output) return;
    soundEngine.playPop(1.12);
    setInput(output);
    setInputFormat(outputFormat);
  }, [parsedInput.error, output, outputFormat]);

  const handleMinify = useCallback(() => {
    if (parsedInput.error) return;
    soundEngine.playClick();
    if (inputFormat !== 'json') {
      const converted = serialize(parsedInput.value, 'json', 0);
      setInput(converted);
      setInputFormat('json');
      return;
    }
    try {
      setInput(minifyJson(input));
    } catch {
      /* parse guard already covers this */
    }
  }, [input, inputFormat, parsedInput]);

  const swapFormats = useCallback(() => {
    soundEngine.playPop(1.05);
    setInputFormat(outputFormat);
    setOutputFormat(inputFormat);
    if (output) setInput(output);
  }, [inputFormat, outputFormat, output]);

  const treeValue = treeSource === 'input' ? parsedInput.value : outputParse.value;
  const treeLabel = treeSource === 'input' ? inputFormat : outputFormat;

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="toy-card p-2.5 flex flex-wrap items-center gap-2">
        <Segmented
          value={mode}
          onChange={(id) => { soundEngine.playClick(); setMode(id as Mode); }}
          options={[
            { id: 'format', label: 'Format', icon: <Wand2 className="w-3 h-3" /> },
            { id: 'tree', label: 'Tree', icon: <ListTree className="w-3 h-3" /> },
            { id: 'convert', label: 'Convert', icon: <ArrowLeftRight className="w-3 h-3" /> },
          ]}
        />
        <div className="h-5 w-px bg-[#E2C6A2]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-[#6B4423]">In</span>
          <Segmented
            value={inputFormat}
            onChange={(id) => { soundEngine.playClick(); setInputFormat(id as Format); }}
            options={[
              { id: 'json', label: 'JSON' },
              { id: 'yaml', label: 'YAML' },
              { id: 'toml', label: 'TOML' },
            ]}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-[#6B4423]">Out</span>
          <Segmented
            value={outputFormat}
            onChange={(id) => { soundEngine.playClick(); setOutputFormat(id as Format); }}
            options={[
              { id: 'json', label: 'JSON' },
              { id: 'yaml', label: 'YAML' },
              { id: 'toml', label: 'TOML' },
            ]}
          />
        </div>
        <button type="button" onClick={swapFormats} className="toy-btn-cream px-2 py-1 text-[11px]" title="Swap input and output formats">
          <GitCompareArrows className="w-3.5 h-3.5" /> Swap
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-[#6B4423]">Indent</span>
          <Segmented
            value={String(indent)}
            onChange={(id) => { soundEngine.playClick(); setIndent(Number(id)); }}
            options={[
              { id: '2', label: '2' },
              { id: '4', label: '4' },
              { id: '0', label: '0' },
            ]}
          />
        </div>
        <div className="flex-1" />
        <button type="button" onClick={handleMinify} disabled={!!parsedInput.error} className="toy-btn-cream px-2.5 py-1 text-[11px]">
          <Minimize2 className="w-3.5 h-3.5" /> Minify
        </button>
        <button type="button" onClick={applyFormatted} disabled={!!parsedInput.error} className="toy-btn-mint px-2.5 py-1 text-[11px]">
          <Sparkles className="w-3.5 h-3.5" /> Beautify
        </button>
        <button type="button" onClick={() => { soundEngine.playClick(); setInput(SAMPLE); setInputFormat('json'); }} className="toy-btn-cream px-2.5 py-1 text-[11px]">
          <FileJson2 className="w-3.5 h-3.5" /> Sample
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* input */}
        <Panel
          title={`Input · ${inputFormat.toUpperCase()}`}
          icon={<Braces className="w-3.5 h-3.5" />}
          actions={
            <div className="flex items-center gap-1.5">
              {!parsedInput.error ? (
                <span className="toy-pill bg-[#DCFCE7] border-[#16A34A] text-[#14532D] text-[10px]">
                  <Check className="w-3 h-3" /> Valid
                </span>
              ) : (
                <span className="toy-pill bg-[#FEE2E2] border-[#EF4444] text-[#7F1D1D] text-[10px]">Invalid</span>
              )}
              <CopyButton text={input} />
            </div>
          }
        >
          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); }}
            spellCheck={false}
            aria-label={`${inputFormat} input`}
            className="w-full h-[19rem] rounded-lg bg-[#FFFDF9] border-2 border-[#DEC098] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#3B2314] focus:outline-none focus:border-[#D97706] resize-none"
            placeholder={`Paste ${inputFormat.toUpperCase()} here…`}
          />
          <div className="mt-2 space-y-2">
            {parsedInput.error && (
              <ErrorBanner
                message={`${parsedInput.error.message}${parsedInput.error.line !== undefined ? `  ·  line ${parsedInput.error.line}, column ${parsedInput.error.column ?? '?'}` : ''}`}
              />
            )}
            {stats && (
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423]">{stats.keys} keys</span>
                <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423]">{stats.arrays} arrays</span>
                <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423]">{stats.leaves} leaves</span>
                <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423]">depth {stats.depth}</span>
              </div>
            )}
          </div>
        </Panel>

        {/* output / tree */}
        <Panel
          title={mode === 'tree' ? `Tree · ${treeLabel.toUpperCase()}` : `Output · ${outputFormat.toUpperCase()}`}
          icon={mode === 'tree' ? <ListTree className="w-3.5 h-3.5" /> : <Braces className="w-3.5 h-3.5" />}
          actions={
            <div className="flex items-center gap-1.5">
              {mode === 'tree' && (
                <Segmented
                  value={treeSource}
                  onChange={(id) => { soundEngine.playClick(); setTreeSource(id as 'input' | 'output'); }}
                  options={[
                    { id: 'input', label: 'In' },
                    { id: 'output', label: 'Out' },
                  ]}
                />
              )}
              <CopyButton text={mode === 'tree' ? JSON.stringify(toPlain(treeValue), null, 2) : output} />
            </div>
          }
        >
          {mode === 'tree' ? (
            <div className="h-[19rem] overflow-auto rounded-lg bg-[#FFFDF9] border-2 border-[#DEC098] p-2">
              {treeValue === null || treeValue === undefined ? (
                <EmptyHint>Nothing to show — fix the input errors first.</EmptyHint>
              ) : (
                <TreeNode label="root" value={toPlain(treeValue)} depth={0} />
              )}
            </div>
          ) : (
            <>
              <textarea
                value={output}
                readOnly
                spellCheck={false}
                aria-label={`${outputFormat} output`}
                className="w-full h-[19rem] rounded-lg bg-[#F7FDF9] border-2 border-[#A7D8B9] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#14532D] focus:outline-none resize-none"
                placeholder="Formatted output appears here…"
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423]">{output ? output.split('\n').length : 0} lines</span>
                <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423]">{output.length} chars</span>
                {mode === 'convert' && !parsedInput.error && (
                  <span className="toy-pill bg-[#F0FDF4] border-[#86EFAC] text-[#14532D]">
                    <ArrowLeftRight className="w-3 h-3" /> {inputFormat.toUpperCase()} → {outputFormat.toUpperCase()}
                  </span>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default JsonYamlFormatterTool;
