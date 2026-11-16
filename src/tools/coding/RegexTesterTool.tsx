import { useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Copy, Flag, Regex, Search, Wrench } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, Segmented, ErrorBanner, EmptyHint, StatChip } from './shared';

interface MatchInfo {
  index: number;
  length: number;
  value: string;
  groups: { index: number; value: string | undefined; name?: string }[];
  named: Record<string, string | undefined>;
}

const FLAGS = [
  { id: 'g', label: 'g', desc: 'global — find every match' },
  { id: 'i', label: 'i', desc: 'ignoreCase' },
  { id: 'm', label: 'm', desc: 'multiline — ^$ match line breaks' },
  { id: 's', label: 's', desc: 'dotAll — . matches newlines' },
  { id: 'u', label: 'u', desc: 'unicode' },
  { id: 'y', label: 'y', desc: 'sticky — match at lastIndex only' },
];

const CHEATSHEET: { category: string; items: { token: string; meaning: string }[] }[] = [
  {
    category: 'Character classes',
    items: [
      { token: '.', meaning: 'any character except newline' },
      { token: '\\d', meaning: 'digit 0–9' },
      { token: '\\D', meaning: 'not a digit' },
      { token: '\\w', meaning: 'word char [A-Za-z0-9_]' },
      { token: '\\W', meaning: 'not a word char' },
      { token: '\\s', meaning: 'whitespace' },
      { token: '\\S', meaning: 'not whitespace' },
      { token: '[abc]', meaning: 'any of a, b, c' },
      { token: '[^abc]', meaning: 'none of a, b, c' },
      { token: '[a-z]', meaning: 'range a through z' },
    ],
  },
  {
    category: 'Quantifiers',
    items: [
      { token: '*', meaning: '0 or more' },
      { token: '+', meaning: '1 or more' },
      { token: '?', meaning: '0 or 1 (optional)' },
      { token: '{n}', meaning: 'exactly n' },
      { token: '{n,}', meaning: 'n or more' },
      { token: '{n,m}', meaning: 'between n and m' },
      { token: '*?', meaning: 'lazy: as few as possible' },
    ],
  },
  {
    category: 'Anchors & boundaries',
    items: [
      { token: '^', meaning: 'start of string / line with m' },
      { token: '$', meaning: 'end of string / line with m' },
      { token: '\\b', meaning: 'word boundary' },
      { token: '\\B', meaning: 'not a word boundary' },
    ],
  },
  {
    category: 'Groups & references',
    items: [
      { token: '(…)', meaning: 'capturing group' },
      { token: '(?:…)', meaning: 'non-capturing group' },
      { token: '(?<name>…)', meaning: 'named capture group' },
      { token: '(?=…)', meaning: 'lookahead' },
      { token: '(?!…)', meaning: 'negative lookahead' },
      { token: '(?<=…)', meaning: 'lookbehind' },
      { token: '\\1', meaning: 'backreference to group 1' },
      { token: 'a|b', meaning: 'alternation: a or b' },
    ],
  },
];

const SAMPLE_TEXT = `Order #A-1042 shipped on 2024-03-14 to linnea@example.com.
Order #B-2098 shipped on 2025-11-02 to mateo.cruz@waffle.dev.
Contact: support@biteSizedUtilities.io or call +1 (555) 010-2030.
Invoice totals: $1,240.50 and $89.99 — refund window closes 2026-01-31.`;

const PATTERNS = [
  { name: 'Email', pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}' },
  { name: 'URL', pattern: 'https?:\\/\\/[^\\s"\'<>]+' },
  { name: 'IPv4', pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b' },
  { name: 'ISO date', pattern: '\\d{4}-\\d{2}-\\d{2}' },
  { name: 'Order + total', pattern: '#(?<order>[A-Z]-\\d{4})' },
  { name: 'Phone (US)', pattern: '\\+1 \\(\\d{3}\\) \\d{3}-\\d{4}' },
];

function explainToken(token: string): string {
  const map: Record<string, string> = {
    '\\d': 'digit (0–9)', '\\D': 'non-digit', '\\w': 'word character', '\\W': 'non-word character',
    '\\s': 'whitespace', '\\S': 'non-whitespace', '\\b': 'word boundary', '\\B': 'non-word boundary',
    '^': 'anchor: start of input', '$': 'anchor: end of input', '.': 'any character',
    '*': 'quantifier: 0 or more', '+': 'quantifier: 1 or more', '?': 'quantifier: optional',
    '(': 'capture group open', ')': 'group close', '[': 'character class open', ']': 'character class close',
    '|': 'alternation', '{': 'quantifier open', '}': 'quantifier close', '\\': 'escape',
  };
  return map[token] ?? `literal “${token}”`;
}

function explainPattern(pattern: string): { token: string; meaning: string }[] {
  const out: { token: string; meaning: string }[] = [];
  let i = 0;
  while (i < pattern.length && out.length < 80) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) {
      out.push({ token: pattern.slice(i, i + 2), meaning: explainToken(pattern.slice(i, i + 2)) });
      i += 2;
      continue;
    }
    if (c === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end > 0) {
        out.push({ token: pattern.slice(i, end + 1), meaning: `character class: one of ${pattern.slice(i + 1, end)}` });
        i = end + 1;
        continue;
      }
    }
    if (c === '(') {
      if (pattern.startsWith('(?:', i)) { out.push({ token: '(?:', meaning: 'non-capturing group open' }); i += 3; continue; }
      if (pattern.startsWith('(?<', i) && !pattern.startsWith('(?<=', i) && !pattern.startsWith('(?<!', i)) {
        const close = pattern.indexOf('>', i);
        out.push({ token: pattern.slice(i, close + 1), meaning: 'named capture group open' });
        i = close + 1;
        continue;
      }
      out.push({ token: '(', meaning: 'capture group open' });
      i++;
      continue;
    }
    if (c === '{') {
      const end = pattern.indexOf('}', i);
      if (end > 0) {
        out.push({ token: pattern.slice(i, end + 1), meaning: `repeat ${pattern.slice(i + 1, end)} time(s)` });
        i = end + 1;
        continue;
      }
    }
    if (c === '|') { out.push({ token: '|', meaning: 'OR — match left or right side' }); i++; continue; }
    // literal run
    let j = i;
    while (j < pattern.length && !'\\[](){}|^$.*+?'.includes(pattern[j])) j++;
    if (j > i) {
      out.push({ token: pattern.slice(i, j), meaning: `literal text “${pattern.slice(i, j)}”` });
      i = j;
      continue;
    }
    out.push({ token: c, meaning: explainToken(c) });
    i++;
  }
  return out;
}

export const RegexTesterTool: React.FC = () => {
  const [pattern, setPattern] = useState('(?<user>[A-Za-z0-9._%+-]+)@(?<domain>[A-Za-z0-9.-]+\\.[A-Za-z]{2,})');
  const [flags, setFlags] = useState('g');
  const [testText, setTestText] = useState(SAMPLE_TEXT);
  const [replacement, setReplacement] = useState('$<user> [at] $<domain>');
  const [view, setView] = useState<'matches' | 'replace' | 'explain'>('matches');
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const compiled = useMemo(() => {
    try {
      return { regex: new RegExp(pattern, flags), error: null as string | null };
    } catch (err) {
      return { regex: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [pattern, flags]);

  const matches = useMemo<MatchInfo[]>(() => {
    const regex = compiled.regex;
    if (!regex) return [];
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    const out: MatchInfo[] = [];
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(testText)) !== null && guard++ < 2000) {
      const groups = m.slice(1).map((value, idx) => ({ index: idx + 1, value }));
      const named: Record<string, string | undefined> = {};
      if (m.groups) for (const [k, v] of Object.entries(m.groups)) named[k] = v;
      out.push({ index: m.index, length: m[0].length, value: m[0], groups, named });
      if (m[0].length === 0) re.lastIndex++;
    }
    return out;
  }, [compiled.regex, testText]);

  const replaced = useMemo(() => {
    if (!compiled.regex) return '';
    try {
      const re = new RegExp(compiled.regex.source, compiled.regex.flags.includes('g') ? compiled.regex.flags : compiled.regex.flags + 'g');
      return testText.replace(re, replacement);
    } catch (err) {
      return `Replacement error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }, [compiled.regex, testText, replacement]);

  const highlighted = useMemo(() => {
    if (!compiled.regex) return [{ text: testText, match: false }];
    const regex = new RegExp(compiled.regex.source, compiled.regex.flags.includes('g') ? compiled.regex.flags : compiled.regex.flags + 'g');
    const parts: { text: string; match: boolean }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = regex.exec(testText)) !== null && guard++ < 2000) {
      if (m.index > last) parts.push({ text: testText.slice(last, m.index), match: false });
      parts.push({ text: m[0], match: true });
      last = m.index + m[0].length;
      if (m[0].length === 0) regex.lastIndex++;
    }
    if (last < testText.length) parts.push({ text: testText.slice(last), match: false });
    return parts.length ? parts : [{ text: testText, match: false }];
  }, [compiled.regex, testText]);

  const toggleFlag = (flag: string) => {
    soundEngine.playClick();
    setFlags((prev) => (prev.includes(flag) ? prev.replace(flag, '') : prev + flag));
  };

  const explanation = useMemo(() => explainPattern(pattern), [pattern]);

  return (
    <div className="space-y-3">
      <div className="toy-card p-3 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center gap-1.5 rounded-xl bg-[#FFFDF9] border-2 border-[#DEC098] px-2.5 py-1.5 focus-within:border-[#D97706]">
            <span className="font-mono text-[#A98768] text-sm select-none">/</span>
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              spellCheck={false}
              aria-label="Regular expression pattern"
              className="flex-1 min-w-0 bg-transparent font-mono text-[12.5px] text-[#3B2314] focus:outline-none"
              placeholder="Enter a regular expression…"
            />
            <span className="font-mono text-[#A98768] text-sm select-none">/{flags}</span>
          </div>
          <div className="flex items-center gap-1">
            {FLAGS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFlag(f.id)}
                title={f.desc}
                aria-pressed={flags.includes(f.id)}
                className={`w-7 h-7 rounded-md border-2 border-b-[3px] font-mono text-xs font-bold transition-all ${
                  flags.includes(f.id)
                    ? 'bg-[#22C55E] border-[#166534] text-white'
                    : 'bg-[#FFFDF8] border-[#D9B68C] text-[#8A6748] hover:bg-[#FEF3C7]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Flag className="w-3.5 h-3.5 text-[#8B5A2B]" />
          <span className="text-[10.5px] text-[#8A6748]">Quick patterns:</span>
          {PATTERNS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => { soundEngine.playPop(1.1); setPattern(p.pattern); }}
              className="toy-pill bg-white border-[#D4AA78] text-[#7A5535] hover:bg-[#FEF3C7] text-[10px]"
            >
              {p.name}
            </button>
          ))}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => { soundEngine.playClick(); setTestText(SAMPLE_TEXT); }}
            className="toy-btn-cream px-2 py-1 text-[10px]"
          >
            <Copy className="w-3 h-3" /> Sample text
          </button>
        </div>
        {compiled.error && <ErrorBanner message={compiled.error} />}
      </div>

      <Segmented
        value={view}
        onChange={(id) => { soundEngine.playClick(); setView(id as 'matches' | 'replace' | 'explain'); }}
        options={[
          { id: 'matches', label: `Matches${matches.length ? ` (${matches.length})` : ''}`, icon: <Search className="w-3 h-3" /> },
          { id: 'replace', label: 'Replace', icon: <Wrench className="w-3 h-3" /> },
          { id: 'explain', label: 'Explainer', icon: <BookOpen className="w-3 h-3" /> },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Test string" icon={<Regex className="w-3.5 h-3.5" />} actions={<CopyButton text={testText} />}>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            spellCheck={false}
            aria-label="Test string"
            className="w-full h-40 rounded-lg bg-[#FFFDF9] border-2 border-[#DEC098] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#3B2314] focus:outline-none focus:border-[#D97706] resize-none"
          />
          <div ref={highlightRef} className="mt-2 max-h-40 overflow-auto rounded-lg border-2 border-[#E2C6A2] bg-[#FFF8EB] p-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-words" aria-label="Highlighted matches">
            {highlighted.map((part, i) =>
              part.match ? (
                <mark key={i} className="bg-[#FDE68A] text-[#3B2314] rounded px-0.5 ring-1 ring-[#D97706]">{part.text}</mark>
              ) : (
                <span key={i} className="text-[#5C4030]">{part.text}</span>
              )
            )}
          </div>
        </Panel>

        <Panel
          title={view === 'explain' ? 'Pattern explainer' : view === 'replace' ? 'Replacement' : 'Match table'}
          icon={view === 'explain' ? <BookOpen className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
          actions={
            <div className="flex items-center gap-1.5">
              <StatChip label="matches" value={matches.length} tone={matches.length ? 'mint' : 'cream'} />
              {matches.length > 0 && <CopyButton text={matches.map((m) => m.value).join('\n')} label="Copy all" />}
            </div>
          }
        >
          {view === 'explain' ? (
            <div className="max-h-[22rem] overflow-auto space-y-1">
              {explanation.length === 0 && <EmptyHint>Type a pattern to see it explained token by token.</EmptyHint>}
              {explanation.map((e, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-[#FFF8EB] border border-[#E6C79C] px-2 py-1">
                  <code className="font-mono text-[11px] font-bold text-[#B45309] shrink-0 min-w-[3.5rem]">{e.token}</code>
                  <span className="text-[11px] text-[#6B4423]">{e.meaning}</span>
                </div>
              ))}
            </div>
          ) : view === 'replace' ? (
            <div className="space-y-2">
              <input
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                aria-label="Replacement string"
                className="toy-input font-mono text-[11.5px]"
                placeholder="Replacement ($1, $<name>, $&…)"
              />
              <div className="rounded-lg border-2 border-[#A7D8B9] bg-[#F7FDF9] p-2.5 max-h-[17rem] overflow-auto">
                <pre className="font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-words text-[#14532D]">{replaced}</pre>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#A98768]">
                  Supports $1–$9 groups, $&amp; whole match, $` prefix, $' suffix and $&lt;name&gt; named groups.
                </span>
                <CopyButton text={replaced} label="Copy result" />
              </div>
            </div>
          ) : (
            <div className="max-h-[22rem] overflow-auto">
              {compiled.error && <ErrorBanner message={compiled.error} />}
              {!compiled.error && matches.length === 0 && <EmptyHint>No matches yet — adjust the pattern or test string.</EmptyHint>}
              {matches.length > 0 && (
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#F7EAD5]">
                      <th className="text-left px-2 py-1 font-bold text-[#6B4423] border border-[#E2C6A2] w-8">#</th>
                      <th className="text-left px-2 py-1 font-bold text-[#6B4423] border border-[#E2C6A2]">Match</th>
                      <th className="text-left px-2 py-1 font-bold text-[#6B4423] border border-[#E2C6A2]">Index</th>
                      <th className="text-left px-2 py-1 font-bold text-[#6B4423] border border-[#E2C6A2]">Groups</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.slice(0, 200).map((m, i) => (
                      <tr key={i} className={i % 2 ? 'bg-[#FFFDF9]' : 'bg-white'}>
                        <td className="px-2 py-1 font-mono text-[#A98768] border border-[#E2C6A2]">{i + 1}</td>
                        <td className="px-2 py-1 font-mono text-[#3B2314] border border-[#E2C6A2] break-all max-w-[14rem]">{m.value}</td>
                        <td className="px-2 py-1 font-mono text-[#8B5A2B] border border-[#E2C6A2]">{m.index}</td>
                        <td className="px-2 py-1 border border-[#E2C6A2]">
                          {Object.keys(m.named).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(m.named).map(([k, v]) => (
                                <span key={k} className="toy-pill bg-[#EFF6FF] border-[#93C5FD] text-[#1E3A8A] text-[9.5px] font-mono">
                                  {k}: {v ?? '∅'}
                                </span>
                              ))}
                            </div>
                          ) : m.groups.length ? (
                            <div className="flex flex-wrap gap-1">
                              {m.groups.map((g) => (
                                <span key={g.index} className="toy-pill bg-[#F0FDF4] border-[#86EFAC] text-[#14532D] text-[9.5px] font-mono">
                                  ${g.index}: {g.value ?? '∅'}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#A98768]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Regex cheat sheet" icon={<BookOpen className="w-3.5 h-3.5" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {CHEATSHEET.map((group) => (
            <div key={group.category}>
              <p className="text-[10.5px] font-bold text-[#6B4423] mb-1">{group.category}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.token} className="flex items-baseline gap-1.5 text-[10.5px]">
                    <code className="font-mono font-bold text-[#B45309] shrink-0 min-w-[3.2rem]">{item.token}</code>
                    <span className="text-[#7A5535]">{item.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#A98768]">
          <Check className="w-3 h-3 text-[#16A34A]" /> Patterns execute with the native browser RegExp engine — nothing leaves this tab.
        </div>
      </Panel>
    </div>
  );
};

export default RegexTesterTool;
