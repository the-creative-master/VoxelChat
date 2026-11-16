import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold, Braces, Code2, Columns2, Download, Eye, FileText, Heading1, Heading2, Italic,
  Link2, List, ListOrdered, Minus, Quote, Table2, Type,
} from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { downloadBlob } from '../../utils/storage';
import { Panel, Segmented, StatChip } from './shared';

/* ---------------------------- sample document ---------------------------- */

const SAMPLE = [
  '# BiteSizedUtilities',
  '',
  'A tiny, offline toolbox that lives in your browser. **No uploads**, no accounts, no ads.',
  '',
  '## Why it exists',
  '',
  'Most "free" utilities are a text box wired to somebody else\'s server. Here the work happens in your own tab:',
  '',
  '- Every tool runs completely client-side',
  '- Favourites are stored in `IndexedDB`',
  '- There is nothing to sign up for',
  '',
  '> If a tool cannot work offline, it does not ship.',
  '',
  '### A quick table',
  '',
  '| Tool | Input | Output |',
  '| --- | --- | --- |',
  '| Hash generator | text or file | MD5 to SHA-512 |',
  '| Regex tester | pattern + flags | matches & groups |',
  '| JWT decoder | token | header, claims, signature |',
  '',
  '### Code sample',
  '',
  '```ts',
  'export function double(n: number): number {',
  '  return n * 2;',
  '}',
  '```',
  '',
  'Inline maths like $e^{i\\pi} + 1 = 0$ renders through KaTeX, and so does a block:',
  '',
  '$$',
  '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}',
  '$$',
  '',
  '1. Pick a cupboard from the kitchen',
  '2. Pin the tools you love',
  '3. Press Ctrl/Cmd + K for the command palette',
  '',
  '---',
  '',
  'Made with butter and WebCrypto.',
].join('\n');

/* ------------------------------ markdown ------------------------------ */

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

async function renderMarkdown(source: string): Promise<string> {
  const { marked } = await import('marked');
  let text = source;
  const blockMath: string[] = [];
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) => {
    blockMath.push(expr.trim());
    return `\n\n@@BLOCKMATH${blockMath.length - 1}@@\n\n`;
  });
  const inlineMath: string[] = [];
  text = text.replace(/(?<!\\)\$([^$\n]+?)\$/g, (_m, expr: string) => {
    inlineMath.push(expr.trim());
    return `@@INLINEMATH${inlineMath.length - 1}@@`;
  });
  let html = marked.parse(text, { gfm: true, breaks: false }) as string;
  if (blockMath.length || inlineMath.length) {
    const katex = await import('katex');
    html = html.replace(/@@BLOCKMATH(\d+)@@/g, (_m, i: string) => {
      try {
        return `<div class="bsu-math-block">${katex.renderToString(blockMath[Number(i)], { displayMode: true, throwOnError: false, strict: false })}</div>`;
      } catch {
        return `<pre>${blockMath[Number(i)]}</pre>`;
      }
    });
    html = html.replace(/@@INLINEMATH(\d+)@@/g, (_m, i: string) => {
      try {
        return katex.renderToString(inlineMath[Number(i)], { displayMode: false, throwOnError: false, strict: false });
      } catch {
        return inlineMath[Number(i)];
      }
    });
  }
  return sanitizeHtml(html);
}

interface TableState {
  rows: number;
  cols: number;
  headers: string[];
  cells: string[][];
}

function buildTable(state: TableState): string {
  const esc = (v: string) => v.replace(/\|/g, '\\|');
  const header = `| ${state.headers.map(esc).join(' | ')} |`;
  const divider = `| ${state.headers.map(() => '---').join(' | ')} |`;
  const body = state.cells.map((row) => `| ${row.map(esc).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

type View = 'split' | 'editor' | 'preview';

export const MarkdownEditorTool: React.FC = () => {
  const [source, setSource] = useState<string>(SAMPLE);
  const [view, setView] = useState<View>('split');
  const [html, setHtml] = useState<string>('');
  const [tableOpen, setTableOpen] = useState(false);
  const [table, setTable] = useState<TableState>({
    rows: 3,
    cols: 3,
    headers: ['Column A', 'Column B', 'Column C'],
    cells: Array.from({ length: 3 }, () => ['', '', '']),
  });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(() => {
      void renderMarkdown(source).then((next) => {
        if (!cancelled) setHtml(next);
      }).catch(() => { if (!cancelled) setHtml('<p>Markdown renderer failed to load.</p>'); });
    }, 120);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [source]);

  const stats = useMemo(() => {
    const words = source.trim() ? source.trim().split(/\s+/).length : 0;
    const chars = source.length;
    const charsNoSpace = source.replace(/\s/g, '').length;
    const lines = source.split('\n').length;
    const paragraphs = source.split(/\n\s*\n/).filter((p) => p.trim()).length;
    const headings = (source.match(/^#{1,6}\s/gm) ?? []).length;
    const links = (source.match(/\[[^\]]*\]\([^)]*\)/g) ?? []).length;
    const readMinutes = Math.max(1, Math.round(words / 220));
    return { words, chars, charsNoSpace, lines, paragraphs, headings, links, readMinutes };
  }, [source]);

  const insert = useCallback((before: string, after = '', placeholder = 'text') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = source.slice(start, end) || placeholder;
    const next = `${source.slice(0, start)}${before}${selected}${after}${source.slice(end)}`;
    setSource(next);
    soundEngine.playClick();
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  }, [source]);

  const insertBlock = useCallback((text: string) => {
    const el = textareaRef.current;
    const at = el ? el.selectionStart : source.length;
    const prefix = source.slice(0, at);
    const needsNewline = prefix.length > 0 && !prefix.endsWith('\n\n');
    const glue = needsNewline ? (prefix.endsWith('\n') ? '\n' : '\n\n') : '';
    const next = `${prefix}${glue}${text}\n\n${source.slice(at)}`;
    setSource(next);
    soundEngine.playClick();
  }, [source]);

  const toolbar = [
    { icon: <Bold className="w-3.5 h-3.5" />, label: 'Bold', run: () => insert('**', '**', 'bold text') },
    { icon: <Italic className="w-3.5 h-3.5" />, label: 'Italic', run: () => insert('_', '_', 'italic text') },
    { icon: <Heading1 className="w-3.5 h-3.5" />, label: 'Heading 1', run: () => insertBlock('# Heading') },
    { icon: <Heading2 className="w-3.5 h-3.5" />, label: 'Heading 2', run: () => insertBlock('## Heading') },
    { icon: <Link2 className="w-3.5 h-3.5" />, label: 'Link', run: () => insert('[', '](https://example.com)', 'link text') },
    { icon: <Code2 className="w-3.5 h-3.5" />, label: 'Inline code', run: () => insert('`', '`', 'code') },
    { icon: <Braces className="w-3.5 h-3.5" />, label: 'Code block', run: () => insertBlock('```ts\n// code here\n```') },
    { icon: <List className="w-3.5 h-3.5" />, label: 'Bullet list', run: () => insertBlock('- first\n- second\n- third') },
    { icon: <ListOrdered className="w-3.5 h-3.5" />, label: 'Numbered list', run: () => insertBlock('1. first\n2. second\n3. third') },
    { icon: <Quote className="w-3.5 h-3.5" />, label: 'Blockquote', run: () => insertBlock('> A quote worth keeping.') },
    { icon: <Minus className="w-3.5 h-3.5" />, label: 'Horizontal rule', run: () => insertBlock('---') },
    { icon: <Type className="w-3.5 h-3.5" />, label: 'Math block', run: () => insertBlock('$$\nE = mc^2\n$$') },
  ];

  const applyTable = () => {
    insertBlock(buildTable(table));
    setTableOpen(false);
    soundEngine.playPop(1.12);
  };

  const updateTableSize = (rows: number, cols: number) => {
    setTable((prev) => {
      const headers = Array.from({ length: cols }, (_, c) => prev.headers[c] ?? `Column ${String.fromCharCode(65 + c)}`);
      const cells = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => prev.cells[r]?.[c] ?? '')
      );
      return { ...prev, rows, cols, headers, cells };
    });
  };

  const exportHtml = () => {
    const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Markdown export</title>
<style>
  body { max-width: 46rem; margin: 2rem auto; padding: 0 1rem; font-family: -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.65; color: #2b2b2b; }
  pre { background: #1f150e; color: #fdf3e1; padding: 1rem; border-radius: .75rem; overflow: auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: .5rem .75rem; text-align: left; }
  blockquote { border-left: 4px solid #f59e0b; margin: 1rem 0; padding: .5rem 1rem; background: #fff6e3; }
  img { max-width: 100%; }
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
</head>
<body>
${html}
</body>
</html>`;
    downloadBlob(new Blob([doc], { type: 'text/html' }), 'document.html');
    soundEngine.playPop(1.15);
  };

  return (
    <div className="space-y-3">
      <div className="toy-card p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {toolbar.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.run}
              title={item.label}
              aria-label={item.label}
              className="toy-btn bg-[#FFFDF8] hover:bg-[#FEF3C7] border-[#D4AA78] text-[#4A2506] p-1.5"
            >
              {item.icon}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { soundEngine.playClick(); setTableOpen((v) => !v); }}
            title="Insert table"
            aria-label="Insert table"
            className={`toy-btn p-1.5 ${tableOpen ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-[#FFFDF8] hover:bg-[#FEF3C7] border-[#D4AA78] text-[#4A2506]'}`}
          >
            <Table2 className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1" />
          <Segmented
            value={view}
            onChange={(id) => { soundEngine.playClick(); setView(id as View); }}
            options={[
              { id: 'editor', label: 'Write', icon: <FileText className="w-3 h-3" /> },
              { id: 'split', label: 'Split', icon: <Columns2 className="w-3 h-3" /> },
              { id: 'preview', label: 'Preview', icon: <Eye className="w-3 h-3" /> },
            ]}
          />
        </div>

        {tableOpen && (
          <div className="rounded-xl border-2 border-[#E2C6A2] bg-[#FFF8EB] p-2 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[10.5px] font-bold text-[#6B4423] flex items-center gap-1">
                Rows
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={table.rows}
                  onChange={(e) => updateTableSize(Math.max(1, Math.min(12, Number(e.target.value) || 1)), table.cols)}
                  className="toy-input w-14 py-0.5 px-1.5 font-mono text-[11px]"
                />
              </label>
              <label className="text-[10.5px] font-bold text-[#6B4423] flex items-center gap-1">
                Columns
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={table.cols}
                  onChange={(e) => updateTableSize(table.rows, Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                  className="toy-input w-14 py-0.5 px-1.5 font-mono text-[11px]"
                />
              </label>
              <div className="flex-1" />
              <button type="button" onClick={applyTable} className="toy-btn-mint px-2 py-1 text-[10px]">Insert table</button>
            </div>
            <div className="overflow-auto max-h-44">
              <table className="w-full text-[10.5px]">
                <thead>
                  <tr>
                    {table.headers.map((h, c) => (
                      <th key={c} className="p-0.5">
                        <input
                          value={h}
                          onChange={(e) => setTable((prev) => ({ ...prev, headers: prev.headers.map((x, i) => (i === c ? e.target.value : x)) }))}
                          className="toy-input w-full py-0.5 px-1 font-bold text-[10px]"
                          aria-label={`Header ${c + 1}`}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.cells.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} className="p-0.5">
                          <input
                            value={cell}
                            onChange={(e) => setTable((prev) => ({
                              ...prev,
                              cells: prev.cells.map((rr, ri) => (ri === r ? rr.map((x, ci) => (ci === c ? e.target.value : x)) : rr)),
                            }))}
                            className="toy-input w-full py-0.5 px-1 text-[10px]"
                            aria-label={`Row ${r + 1} column ${c + 1}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => { setSource(SAMPLE); soundEngine.playPop(1.1); }} className="toy-btn-cream px-2 py-1 text-[10px]">Load sample</button>
          <button type="button" onClick={() => { setSource(''); soundEngine.playClick(); }} className="toy-btn-cream px-2 py-1 text-[10px]">Clear</button>
          <div className="flex-1" />
          <CopyButton text={source} label="Copy markdown" />
          <button type="button" onClick={() => { downloadBlob(new Blob([source], { type: 'text/markdown' }), 'document.md'); soundEngine.playPop(1.15); }} className="toy-btn-cream px-2 py-1 text-[10px]">
            <Download className="w-3 h-3" /> .md
          </button>
          <button type="button" onClick={exportHtml} className="toy-btn-cream px-2 py-1 text-[10px]">
            <Download className="w-3 h-3" /> .html
          </button>
        </div>
      </div>

      <div className={`grid gap-2.5 ${view === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {view !== 'preview' && (
          <Panel title="Markdown" icon={<FileText className="w-3.5 h-3.5" />} actions={<span className="text-[10px] text-[#A98768]">GFM + KaTeX</span>}>
            <textarea
              ref={textareaRef}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              spellCheck={false}
              aria-label="Markdown source"
              className="w-full h-[28rem] resize-y rounded-lg border-2 border-[#DEC098] bg-[#FFFDF9] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#3B2314] focus:outline-none focus:border-[#D97706]"
            />
          </Panel>
        )}
        {view !== 'editor' && (
          <Panel title="Preview" icon={<Eye className="w-3.5 h-3.5" />} actions={<CopyButton text={html} label="Copy HTML" />}>
            <div
              ref={previewRef}
              className="bsu-markdown h-[28rem] overflow-auto rounded-lg border-2 border-[#E2C6A2] bg-white p-3"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </Panel>
        )}
      </div>

      <div className="toy-card p-2 flex flex-wrap items-center gap-1.5">
        <StatChip label="words" value={stats.words} tone="cream" />
        <StatChip label="characters" value={stats.chars} tone="cream" />
        <StatChip label="no spaces" value={stats.charsNoSpace} tone="cream" />
        <StatChip label="lines" value={stats.lines} tone="cream" />
        <StatChip label="paragraphs" value={stats.paragraphs} tone="cream" />
        <StatChip label="headings" value={stats.headings} tone="gold" />
        <StatChip label="links" value={stats.links} tone="gold" />
        <StatChip label="read" value={`${stats.readMinutes} min`} tone="mint" />
        <div className="flex-1" />
        <p className="text-[10px] text-[#A98768]">
          Raw HTML is stripped of scripts and event handlers before rendering.
        </p>
      </div>
    </div>
  );
};

export default MarkdownEditorTool;
