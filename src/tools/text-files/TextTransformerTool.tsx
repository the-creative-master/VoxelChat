import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Copy, Regex, Replace, Sparkles } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { downloadBlob } from '../../utils/storage';
import { Panel, StatChip, EmptyHint, ErrorBanner } from '../coding/shared';
import { GhostButton, PrimaryButton, ToggleRow } from './shared';

/* =========================================================================
   Find & Replace + Regex Transformer
   Literal or regex replacement, case options, capture-group templates ($1),
   live match highlighting and per-match preview.
   ========================================================================= */

interface Preset {
  id: string;
  label: string;
  find: string;
  replace: string;
  flags: string;
  hint: string;
}

const PRESETS: Preset[] = [
  {
    id: 'emails-anonymise',
    label: 'Anonymise emails',
    find: '[\\w.+-]+@[\\w-]+\\.[\\w.]+',
    replace: '[email redacted]',
    flags: 'gi',
    hint: 'Swap every address for a placeholder',
  },
  {
    id: 'urls-strip',
    label: 'Strip URLs',
    find: 'https?://\\S+',
    replace: '',
    flags: 'gi',
    hint: 'Remove links from pasted text',
  },
  {
    id: 'phone-dashes',
    label: 'Format phone numbers',
    find: '(\\d{3})(\\d{3})(\\d{4})',
    replace: '($1) $2-$3',
    flags: 'g',
    hint: 'Group digits into (555) 123-4567',
  },
  {
    id: 'dates-iso',
    label: 'Dates → ISO',
    find: '(\\d{1,2})/(\\d{1,2})/(\\d{4})',
    replace: '$3-$1-$2',
    flags: 'g',
    hint: 'US dates become sortable YYYY-MM-DD',
  },
  {
    id: 'space-collapse',
    label: 'Collapse whitespace',
    find: '\\s{2,}',
    replace: ' ',
    flags: 'g',
    hint: 'Runs of spaces and tabs become one space',
  },
  {
    id: 'html-strip',
    label: 'Strip HTML tags',
    find: '<[^>]*>',
    replace: '',
    flags: 'g',
    hint: 'Leave the text, drop the markup',
  },
  {
    id: 'numbers-commas',
    label: 'Add thousands commas',
    find: '\\b(\\d)(\\d{3})\\b',
    replace: '$1,$2',
    flags: 'g',
    hint: '1000 → 1,000',
  },
  {
    id: 'double-word',
    label: 'Fix doubled words',
    find: '\\b(\\w+)(\\s+)\\1\\b',
    replace: '$1',
    flags: 'gi',
    hint: '“the the” → “the”',
  },
];

const FLAG_LIST: { flag: string; label: string; hint: string }[] = [
  { flag: 'g', label: 'g', hint: 'Global — replace every match' },
  { flag: 'i', label: 'i', hint: 'Case-insensitive' },
  { flag: 'm', label: 'm', hint: 'Multi-line (^ and $ per line)' },
  { flag: 's', label: 's', hint: 'Dot matches newlines too' },
  { flag: 'u', label: 'u', hint: 'Full Unicode support' },
];

interface Result {
  output: string;
  count: number;
  matches: RegExpExecArray[];
  error: string | null;
}

const runReplace = (
  text: string,
  find: string,
  replace: string,
  flags: string,
  literal: boolean
): Result => {
  if (!find) return { output: text, count: 0, matches: [], error: null };
  try {
    const source = literal ? find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : find;
    const re = new RegExp(source, flags.includes('g') ? flags : `${flags}g`);
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(text)) !== null) {
      matches.push(m);
      if (m[0] === '') re.lastIndex += 1; // avoid infinite loop on empty matches
      if (++guard > 200_000) break;
    }
    // Rebuild with the replacement so capture groups work exactly like String.replace
    const replaceRe = new RegExp(source, flags.includes('g') ? flags : `${flags}g`);
    const output = text.replace(replaceRe, replace);
    return { output, count: matches.length, matches, error: null };
  } catch (e) {
    return { output: text, count: 0, matches: [], error: (e as Error).message };
  }
};

const escapeLiteral = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SAMPLE = `Contact us at hello@example.com or support@example.org.
Our site is https://example.com/help and the docs live at http://docs.example.com.

Order 1000 shipped on 3/14/2024 for $2500.
The the package arrived early — call 5551234567 if anything is missing.`;

export const TextTransformerTool: React.FC = () => {
  const [text, setText] = useState(SAMPLE);
  const [find, setFind] = useState('[\\w.+-]+@[\\w-]+\\.[\\w.]+');
  const [replace, setReplace] = useState('[email redacted]');
  const [flags, setFlags] = useState('gi');
  const [literal, setLiteral] = useState(false);
  const [highlight, setHighlight] = useState(true);

  const result = useMemo(
    () => runReplace(text, find, replace, flags, literal),
    [text, find, replace, flags, literal]
  );

  const toggleFlag = (f: string) => {
    setFlags((cur) => (cur.includes(f) ? cur.replace(f, '') : cur + f));
    soundEngine.playPop(1.05);
  };

  const highlighted = useMemo(() => {
    if (!highlight || !find || result.error) return null;
    let pattern: string;
    try {
      pattern = literal ? escapeLiteral(find) : find;
    } catch {
      return null;
    }
    const parts: { text: string; hit: boolean }[] = [];
    try {
      const re = new RegExp(pattern || '(?!)', flags.includes('g') ? flags : `${flags}g`);
      let last = 0;
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) parts.push({ text: text.slice(last, m.index), hit: false });
        parts.push({ text: m[0] || ' ', hit: true });
        last = m.index + m[0].length;
        if (m[0] === '') re.lastIndex += 1;
        if (++guard > 5000) break;
      }
      if (last < text.length) parts.push({ text: text.slice(last), hit: false });
      return parts;
    } catch {
      return null;
    }
  }, [text, find, flags, literal, highlight, result.error]);

  return (
    <div className="space-y-3">
      <Panel
        title="Find & replace"
        icon={<Replace className="h-4 w-4" />}
        actions={<StatChip label="matches" value={result.count} tone={result.count ? 'mint' : 'cream'} />}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-[#1E3A8A]">
              Find {literal ? <span className="font-normal text-[#64748B]">(literal text)</span> : <span className="font-normal text-[#64748B]">(regular expression)</span>}
            </span>
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              spellCheck={false}
              className={`w-full rounded-lg border-2 bg-white px-2.5 py-1.5 font-mono text-[12.5px] text-[#1E293B] outline-none focus:border-[#3B82F6] ${
                result.error ? 'border-[#FCA5A5]' : 'border-[#BFDBFE]'
              }`}
              placeholder={literal ? 'plain text to find' : 'e.g. \\d{3}-\\d{4}'}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-[#1E3A8A]">
              Replace with <span className="font-normal text-[#64748B]">($1 = capture group)</span>
            </span>
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              spellCheck={false}
              className="w-full rounded-lg border-2 border-[#BFDBFE] bg-white px-2.5 py-1.5 font-mono text-[12.5px] text-[#1E293B] outline-none focus:border-[#3B82F6]"
              placeholder="leave empty to delete"
            />
          </label>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-[#64748B]">Flags</span>
          {FLAG_LIST.map((f) => {
            const on = flags.includes(f.flag);
            return (
              <button
                key={f.flag}
                type="button"
                onClick={() => toggleFlag(f.flag)}
                title={f.hint}
                aria-pressed={on}
                className={`h-7 w-7 rounded-md border-2 font-mono text-[11px] font-bold transition ${
                  on
                    ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                    : 'border-[#BFDBFE] bg-white text-[#1E3A8A] hover:border-[#3B82F6]'
                }`}
              >
                {f.label}
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-[#DBEAFE]" />
          <button
            type="button"
            onClick={() => setLiteral(!literal)}
            aria-pressed={literal}
            className={`inline-flex items-center gap-1 rounded-md border-2 px-2 py-1 text-[10.5px] font-bold transition ${
              literal
                ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                : 'border-[#BFDBFE] bg-white text-[#1E3A8A]'
            }`}
          >
            <ArrowLeftRight className="h-3 w-3" />
            {literal ? 'Literal' : 'Regex'}
          </button>
          <button
            type="button"
            onClick={() => setHighlight(!highlight)}
            aria-pressed={highlight}
            className={`rounded-md border-2 px-2 py-1 text-[10.5px] font-bold transition ${
              highlight
                ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]'
                : 'border-[#DBEAFE] bg-white text-[#64748B]'
            }`}
          >
            Highlight
          </button>
        </div>

        {result.error && (
          <div className="mt-2">
            <ErrorBanner message={`Invalid pattern — ${result.error}`} />
          </div>
        )}
      </Panel>

      <Panel title="Presets" icon={<Sparkles className="h-4 w-4" />}>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.hint}
              onClick={() => {
                setFind(p.find);
                setReplace(p.replace);
                setFlags(p.flags);
                setLiteral(false);
                soundEngine.playPop(1.1);
              }}
              className="rounded-lg border-2 border-b-[4px] border-[#BFDBFE] bg-white px-2.5 py-1.5 text-left transition hover:border-[#3B82F6] active:translate-y-[2px] active:border-b-2"
            >
              <span className="block font-display text-[11px] font-bold text-[#1E3A8A]">{p.label}</span>
              <span className="block font-mono text-[9.5px] text-[#64748B]">
                {p.find.length > 26 ? `${p.find.slice(0, 25)}…` : p.find} → {p.replace || '∅'}
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Input"
          icon={<Regex className="h-4 w-4" />}
          actions={<StatChip label="chars" value={text.length} />}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={11}
            spellCheck={false}
            className="w-full resize-y rounded-lg border-2 border-[#BFDBFE] bg-white p-2.5 font-mono text-[12px] leading-relaxed text-[#1E293B] outline-none focus:border-[#3B82F6]"
            placeholder="Paste text to search…"
          />
          {highlighted && (
            <div
              className="mt-2 max-h-40 overflow-auto rounded-lg border border-[#DBEAFE] bg-[#F8FAFF] p-2 text-[11.5px] leading-relaxed text-[#334155]"
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {highlighted.map((part, i) =>
                part.hit ? (
                  <mark key={i} className="rounded bg-[#FDE68A] px-0.5 text-[#78350F]">
                    {part.text}
                  </mark>
                ) : (
                  <span key={i}>{part.text}</span>
                )
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <GhostButton onClick={() => setText(SAMPLE)}>Sample</GhostButton>
            <GhostButton onClick={() => setText('')} disabled={!text}>
              Clear
            </GhostButton>
          </div>
        </Panel>

        <Panel
          title={`Output — ${result.count} replacement${result.count === 1 ? '' : 's'}`}
          icon={<Copy className="h-4 w-4" />}
          actions={<CopyButton text={result.output} label="Copy" size="sm" />}
        >
          <div
            className="min-h-[13rem] w-full overflow-auto rounded-lg border-2 border-[#86EFAC] bg-[#F0FDF4] p-2.5 font-mono text-[12px] leading-relaxed text-[#14532D]"
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {result.output || <span className="italic text-[#64748B]">Output appears here</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <PrimaryButton
              onClick={() => {
                setText(result.output);
                soundEngine.playSuccess();
              }}
              disabled={result.count === 0}
            >
              Apply & continue
            </PrimaryButton>
            <GhostButton
              onClick={() =>
                downloadBlob(
                  new Blob([result.output], { type: 'text/plain;charset=utf-8' }),
                  'transformed-text.txt'
                )
              }
              disabled={!result.output}
            >
              Save .txt
            </GhostButton>
          </div>

          {result.matches.length > 0 && (
            <div className="mt-2.5 border-t border-[#DBEAFE] pt-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                First matches
              </p>
              <div className="max-h-32 space-y-0.5 overflow-auto font-mono text-[10.5px]">
                {result.matches.slice(0, 40).map((m, i) => (
                  <div key={i} className="flex gap-2 rounded bg-[#F8FAFF] px-1.5 py-0.5">
                    <span className="text-[#94A3B8]">@{m.index}</span>
                    <span className="truncate font-bold text-[#B45309]">{m[0] || '(empty)'}</span>
                    {m.length > 1 && (
                      <span className="truncate text-[#64748B]">[{m.slice(1).join(', ')}]</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.count === 0 && find && !result.error && (
            <div className="mt-2 flex items-start gap-1.5 text-[10.5px] font-semibold text-[#92400E]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              No matches. Try the <span className="font-mono">i</span> flag for case-insensitive or drop{' '}
              <span className="font-mono">u</span> if the pattern uses escapes your browser reads literally.
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Tips">
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow
            label="Regex cheatsheet"
            hint="\\d digit · \\w word char · \\s space · . any char · * 0+ · + 1+ · ? 0/1 · {n,m} range · [abc] set · \\b boundary · (?=…) lookahead"
            checked
            onChange={() => {}}
          />
          <div className="rounded-lg border-2 border-[#DBEAFE] bg-[#F8FAFF] px-2.5 py-2">
            <p className="text-[10.5px] font-bold text-[#1E3A8A]">Capture groups in the replacement</p>
            <p className="font-mono text-[10.5px] leading-relaxed text-[#64748B]">
              $1 first group · $2 second · $&amp; whole match · $` before · $' after · $$ literal $
            </p>
          </div>
        </div>
        {!find && <EmptyHint>Type a search term to see live matches.</EmptyHint>}
      </Panel>
    </div>
  );
};

export default TextTransformerTool;
