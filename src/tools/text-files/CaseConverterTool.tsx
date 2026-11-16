import React, { useMemo, useState } from 'react';
import { CaseSensitive, Copy, Eraser, Sparkles, Wand2 } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { downloadBlob } from '../../utils/storage';
import { Panel, EmptyHint, StatChip } from '../coding/shared';
import { GhostButton, PrimaryButton } from './shared';

/* =========================================================================
   Case Converter & Cleaner — 10 cases + whitespace / punctuation surgery.
   Pure string transforms, no network, no dependencies.
   ========================================================================= */

type CaseId =
  | 'sentence'
  | 'lower'
  | 'upper'
  | 'title'
  | 'capital'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'dot'
  | 'toggle';

const CASES: { id: CaseId; label: string; sample: string; help: string }[] = [
  { id: 'sentence', label: 'Sentence case', sample: 'The quick brown fox', help: 'First letter of each sentence capitalised' },
  { id: 'lower', label: 'lowercase', sample: 'the quick brown fox', help: 'Everything down' },
  { id: 'upper', label: 'UPPERCASE', sample: 'THE QUICK BROWN FOX', help: 'Everything up' },
  { id: 'title', label: 'Title Case', sample: 'The Quick Brown Fox', help: 'Every word capitalised (small words skipped)' },
  { id: 'capital', label: 'Capitalise Words', sample: 'The Quick Brown Fox', help: 'Every word capitalised, no exceptions' },
  { id: 'camel', label: 'camelCase', sample: 'theQuickBrownFox', help: 'For JavaScript identifiers' },
  { id: 'pascal', label: 'PascalCase', sample: 'TheQuickBrownFox', help: 'For class / component names' },
  { id: 'snake', label: 'snake_case', sample: 'the_quick_brown_fox', help: 'Database column style' },
  { id: 'kebab', label: 'kebab-case', sample: 'the-quick-brown-fox', help: 'URL slug style' },
  { id: 'constant', label: 'CONSTANT_CASE', sample: 'THE_QUICK_BROWN_FOX', help: 'Environment variables' },
  { id: 'dot', label: 'dot.case', sample: 'the.quick.brown.fox', help: 'Config keys' },
  { id: 'toggle', label: 'tOGGLE cASE', sample: 'tHE qUICK bROWN fOX', help: 'Swap every letter' },
];

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'up', 'via', 'vs', 'with', 'from',
]);

const WORDS_RE = /[\p{L}\p{N}]+/gu;

const splitWords = (text: string): string[] => {
  // Handle both human text and already-cased identifiers (camelCase, snake_case…)
  const cleaned = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-./\\]+/g, ' ');
  return cleaned.match(WORDS_RE) ?? [];
};

const sentenceCase = (t: string) =>
  t
    .toLowerCase()
    .replace(/(^\s*[a-z])|([.!?]\s+[a-z])|(\n\s*[a-z])/g, (m) => m.toUpperCase());

const titleCase = (t: string) =>
  t
    .toLowerCase()
    .split(/(\s+)/)
    .map((tok, i, arr) => {
      if (/^\s+$/.test(tok) || tok === '') return tok;
      const bare = tok.replace(/[^\p{L}\p{N}']/gu, '');
      const isEdge = i === 0 || i === arr.length - 1;
      if (!isEdge && SMALL_WORDS.has(bare.toLowerCase())) return tok;
      return tok.replace(/[\p{L}\p{N}]/u, (c) => c.toUpperCase());
    })
    .join('');

const capWords = (t: string) => t.replace(/(^|[\s\-_/([{"'])([\p{L}])/gu, (_m, p, c: string) => p + c.toUpperCase());

const toCase = (text: string, id: CaseId): string => {
  const words = splitWords(text);
  switch (id) {
    case 'sentence':
      return sentenceCase(text);
    case 'lower':
      return text.toLowerCase();
    case 'upper':
      return text.toUpperCase();
    case 'title':
      return titleCase(text);
    case 'capital':
      return capWords(text);
    case 'camel':
      return words
        .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join('');
    case 'pascal':
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    case 'snake':
      return words.map((w) => w.toLowerCase()).join('_');
    case 'kebab':
      return words.map((w) => w.toLowerCase()).join('-');
    case 'constant':
      return words.map((w) => w.toUpperCase()).join('_');
    case 'dot':
      return words.map((w) => w.toLowerCase()).join('.');
    case 'toggle':
      return text.replace(/\p{L}/gu, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
    default:
      return text;
  }
};

interface CleanOpts {
  trim: boolean;
  collapse: boolean;
  blankLines: boolean;
  smartQuotes: boolean;
  stripPunct: boolean;
  stripNumbers: boolean;
  stripDiacritics: boolean;
  stripHtml: boolean;
}

const CLEANERS: { key: keyof CleanOpts; label: string; hint: string }[] = [
  { key: 'trim', label: 'Trim spaces & tabs', hint: 'Remove trailing whitespace on each line, trim the ends' },
  { key: 'collapse', label: 'Collapse runs of spaces', hint: 'Double + spaces become one' },
  { key: 'blankLines', label: 'Remove blank lines', hint: 'Delete empty lines entirely' },
  { key: 'smartQuotes', label: 'Straighten curly quotes', hint: '“smart” → "straight", em dash → hyphen' },
  { key: 'stripHtml', label: 'Strip HTML tags', hint: 'Remove <tags> and decode common entities' },
  { key: 'stripDiacritics', label: 'Remove accents', hint: 'café → cafe, naïve → naive' },
  { key: 'stripPunct', label: 'Strip punctuation', hint: 'Keep letters, digits, spaces & newlines' },
  { key: 'stripNumbers', label: 'Strip digits', hint: 'Remove 0–9 from the text' },
];

const DEFAULTS: CleanOpts = {
  trim: true,
  collapse: true,
  blankLines: true,
  smartQuotes: false,
  stripPunct: false,
  stripNumbers: false,
  stripDiacritics: false,
  stripHtml: false,
};

const applyClean = (text: string, o: CleanOpts): string => {
  let t = text;
  if (o.stripHtml) {
    t = t
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }
  if (o.smartQuotes) {
    t = t
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u00A0/g, ' ');
  }
  if (o.stripDiacritics) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (o.stripPunct) t = t.replace(/[^\p{L}\p{N}\s]/gu, '');
  if (o.stripNumbers) t = t.replace(/\d/g, '');
  const lines = t.split(/\r?\n/).map((line) => {
    let l = line;
    if (o.trim) l = l.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, '');
    if (o.collapse) l = l.replace(/[ \t]{2,}/g, ' ');
    return l;
  });
  t = lines.join('\n');
  if (o.blankLines) t = t.replace(/\n{2,}/g, '\n');
  if (o.trim) t = t.replace(/^\s+|\s+$/g, '');
  return t;
};

const SAMPLE = `  Hello   there,   friend!
This    line has    too many spaces.

This one is fine.
“Smart quotes” and an em—dash — café naïve résumé
<p>A stray HTML <b>tag</b> &amp; an entity</p>`;

export const CaseConverterTool: React.FC = () => {
  const [input, setInput] = useState(SAMPLE);
  const [active, setActive] = useState<CaseId>('title');
  const [clean, setClean] = useState<CleanOpts>(DEFAULTS);
  const [step, setStep] = useState<'clean-then-case' | 'case-then-clean'>('clean-then-case');

  const cleaned = useMemo(() => applyClean(input, clean), [input, clean]);
  const output = useMemo(
    () => (step === 'clean-then-case' ? toCase(cleaned, active) : applyClean(toCase(input, active), clean)),
    [cleaned, input, active, clean, step]
  );

  const changed = output !== input;

  return (
    <div className="space-y-3">
      <Panel
        title="Pick a case"
        icon={<CaseSensitive className="h-4 w-4" />}
        actions={
          <div className="flex items-center gap-1.5">
            <StatChip label="in" value={`${input.length} ch`} />
            <StatChip label="out" value={`${output.length} ch`} tone="mint" />
          </div>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {CASES.map((c) => {
            const on = active === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setActive(c.id);
                  soundEngine.playPop(1.06);
                }}
                title={c.help}
                aria-pressed={on}
                className={`rounded-lg border-2 border-b-[4px] px-2.5 py-1.5 text-left transition active:translate-y-[2px] active:border-b-2 ${
                  on
                    ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                    : 'border-[#BFDBFE] bg-white text-[#1E3A8A] hover:border-[#3B82F6]'
                }`}
              >
                <span className="block font-display text-[11.5px] font-bold leading-tight">{c.label}</span>
                <span className={`block font-mono text-[9.5px] ${on ? 'text-white/75' : 'text-[#64748B]'}`}>
                  {c.sample}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Your text" icon={<Wand2 className="h-4 w-4" />}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            rows={12}
            className="w-full resize-y rounded-lg border-2 border-[#BFDBFE] bg-white p-2.5 font-mono text-[12px] leading-relaxed text-[#1E293B] outline-none focus:border-[#3B82F6]"
            placeholder="Paste text, a title, a variable name…"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <GhostButton onClick={() => setInput('')} disabled={!input}>
              <Eraser className="h-3.5 w-3.5" /> Clear
            </GhostButton>
            <GhostButton onClick={() => setInput(SAMPLE)}>
              <Sparkles className="h-3.5 w-3.5" /> Load sample
            </GhostButton>
            <span className="ml-auto text-[10.5px] font-semibold text-[#64748B]">
              {input.split(/\r?\n/).length} lines · {splitWords(input).length} words
            </span>
          </div>
        </Panel>

        <Panel
          title={`Result — ${CASES.find((c) => c.id === active)?.label}`}
          icon={<Copy className="h-4 w-4" />}
          actions={<CopyButton text={output} label="Copy result" size="sm" />}
        >
          <div
            className="min-h-[13rem] w-full overflow-auto rounded-lg border-2 border-[#86EFAC] bg-[#F0FDF4] p-2.5 font-mono text-[12px] leading-relaxed text-[#14532D]"
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {output || <span className="italic text-[#64748B]">Nothing to transform yet</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <PrimaryButton
              onClick={() => {
                setInput(output);
                soundEngine.playSuccess();
              }}
              disabled={!changed}
            >
              Use as input
            </PrimaryButton>
            <GhostButton
              onClick={() =>
                downloadBlob(new Blob([output], { type: 'text/plain;charset=utf-8' }), 'converted-text.txt')
              }
              disabled={!output}
            >
              <Copy className="h-3.5 w-3.5" /> Save .txt
            </GhostButton>
            <div className="ml-auto">
              <GhostButton
                onClick={() => setStep(step === 'clean-then-case' ? 'case-then-clean' : 'clean-then-case')}
                title="Choose which operation runs first"
              >
                Order: {step === 'clean-then-case' ? 'clean → case' : 'case → clean'}
              </GhostButton>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Cleaner"
        icon={<Eraser className="h-4 w-4" />}
        actions={
          <GhostButton onClick={() => setClean(DEFAULTS)}>
            Reset
          </GhostButton>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CLEANERS.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-start gap-2 rounded-lg border-2 border-[#DBEAFE] bg-[#F8FAFF] px-2.5 py-2"
            >
              <input
                type="checkbox"
                checked={clean[c.key]}
                onChange={(e) => setClean({ ...clean, [c.key]: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-[#3B82F6]"
              />
              <span>
                <span className="block text-[11px] font-bold text-[#1E3A8A]">{c.label}</span>
                <span className="block text-[10px] leading-snug text-[#64748B]">{c.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {cleaned !== input && (
          <p className="mt-2 text-[10.5px] font-semibold text-[#15803D]">
            Cleaning removes {input.length - cleaned.length} characters.
          </p>
        )}
        {!Object.values(clean).some(Boolean) && <EmptyHint>No cleaners selected — output matches input exactly.</EmptyHint>}
      </Panel>
    </div>
  );
};

export default CaseConverterTool;
