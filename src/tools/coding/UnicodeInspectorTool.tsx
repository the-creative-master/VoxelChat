import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Binary, Eye, EyeOff, Hash, Languages, ScanSearch, ShieldAlert } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, Segmented, EmptyHint, StatChip } from './shared';

/* --------------------------- HTML entity table --------------------------- */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  bull: '•', middot: '·', deg: '°', plusmn: '±', times: '×', divide: '÷', frac12: '½', frac14: '¼', frac34: '¾',
  sup2: '²', sup3: '³', micro: 'µ', para: '¶', sect: '§', dagger: '†', Dagger: '‡', permil: '‰', prime: '′', Prime: '″',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', lArr: '⇐', rArr: '⇒', hArr: '⇔',
  le: '≤', ge: '≥', ne: '≠', asymp: '≈', equiv: '≡', infin: '∞', sum: '∑', prod: '∏', radic: '√', part: '∂',
  int: '∫', nabla: '∇', isin: '∈', notin: '∉', cap: '∩', cup: '∪', sub: '⊂', sup: '⊃', sube: '⊆', supe: '⊇',
  forall: '∀', exist: '∃', empty: '∅', and: '∧', or: '∨', not: '¬', there4: '∴', ang: '∠', perp: '⊥',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι',
  kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
  upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  euro: '€', pound: '£', yen: '¥', cent: '¢', curren: '¤', dollar: '$',
  star: '☆', starf: '★', hearts: '♥', spades: '♠', clubs: '♣', diams: '♦', check: '✓', cross: '✗',
  emsp: '\u2003', ensp: '\u2002', thinsp: '\u2009', zwnj: '\u200C', zwj: '\u200D', lrm: '\u200E', rlm: '\u200F',
};

/* ------------------------------ detection ------------------------------ */

interface CharInfo {
  char: string;
  cp: number;
  codePoints: string[];
  name: string;
  category: string;
  utf8: string;
  utf16: string;
  isInvisible: boolean;
}

const INVISIBLE = new Set([0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0xfeff, 0x00ad, 0x2060, 0x180e, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);

const CATEGORY_HINTS: [number, number, string][] = [
  [0x0000, 0x001f, 'Control'],
  [0x0020, 0x002f, 'ASCII punctuation'],
  [0x0030, 0x0039, 'Digit'],
  [0x003a, 0x0040, 'ASCII punctuation'],
  [0x0041, 0x005a, 'Uppercase letter'],
  [0x005b, 0x0060, 'ASCII punctuation'],
  [0x0061, 0x007a, 'Lowercase letter'],
  [0x007b, 0x007e, 'ASCII punctuation'],
  [0x00a0, 0x00bf, 'Latin-1 symbol'],
  [0x00c0, 0x024f, 'Latin letter'],
  [0x0250, 0x02af, 'IPA extension'],
  [0x0300, 0x036f, 'Combining mark'],
  [0x0370, 0x03ff, 'Greek'],
  [0x0400, 0x04ff, 'Cyrillic'],
  [0x0590, 0x05ff, 'Hebrew'],
  [0x0600, 0x06ff, 'Arabic'],
  [0x0900, 0x097f, 'Devanagari'],
  [0x0e00, 0x0e7f, 'Thai'],
  [0x1e00, 0x1eff, 'Latin extended additional'],
  [0x2000, 0x206f, 'General punctuation'],
  [0x2070, 0x209f, 'Superscript / subscript'],
  [0x20a0, 0x20cf, 'Currency symbol'],
  [0x2100, 0x214f, 'Letterlike symbol'],
  [0x2150, 0x218f, 'Number form'],
  [0x2190, 0x21ff, 'Arrow'],
  [0x2200, 0x22ff, 'Mathematical operator'],
  [0x2300, 0x23ff, 'Technical symbol'],
  [0x2500, 0x257f, 'Box drawing'],
  [0x25a0, 0x25ff, 'Geometric shape'],
  [0x2600, 0x26ff, 'Miscellaneous symbol'],
  [0x2700, 0x27bf, 'Dingbat'],
  [0x3000, 0x303f, 'CJK punctuation'],
  [0x3040, 0x309f, 'Hiragana'],
  [0x30a0, 0x30ff, 'Katakana'],
  [0x4e00, 0x9fff, 'CJK unified ideograph'],
  [0xac00, 0xd7af, 'Hangul syllable'],
  [0xe000, 0xf8ff, 'Private use'],
  [0x1f300, 0x1f5ff, 'Emoji pictograph'],
  [0x1f600, 0x1f64f, 'Emoji emoticon'],
  [0x1f680, 0x1f6ff, 'Emoji transport'],
  [0x1f900, 0x1f9ff, 'Emoji supplemental'],
];

function describeCodePoint(cp: number): string {
  for (const [lo, hi, label] of CATEGORY_HINTS) if (cp >= lo && cp <= hi) return label;
  return 'Unassigned / other';
}

function toHex(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, '0');
}

function utf8Hex(cp: number): string {
  const bytes = new TextEncoder().encode(String.fromCodePoint(cp));
  return Array.from(bytes).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function utf16Hex(cp: number): string {
  const out: string[] = [];
  const units = String.fromCodePoint(cp).split('');
  for (const ch of units) {
    const unit = ch.charCodeAt(0);
    out.push(unit.toString(16).toUpperCase().padStart(4, '0'));
  }
  if (cp > 0xffff) {
    // recompute surrogate pair explicitly for clarity
    const v = cp - 0x10000;
    const hi = 0xd800 + (v >> 10);
    const lo = 0xdc00 + (v & 0x3ff);
    return `${hi.toString(16).toUpperCase().padStart(4, '0')} ${lo.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out.join(' ');
}

function nameOf(char: string, cp: number): string {
  const named = Object.entries(NAMED_ENTITIES).find(([, v]) => v === char)?.[0];
  if (cp === 0x20) return 'SPACE';
  if (cp === 0x09) return 'CHARACTER TABULATION (tab)';
  if (cp === 0x0a) return 'LINE FEED (newline)';
  if (cp === 0x0d) return 'CARRIAGE RETURN';
  if (INVISIBLE.has(cp)) return 'INVISIBLE FORMAT CHARACTER';
  if (named) return `HTML entity &${named};`;
  if (cp >= 0x1f300 && cp <= 0x1faff) return 'EMOJI';
  return describeCodePoint(cp);
}

function analyseGraphemes(text: string): CharInfo[] {
  const out: CharInfo[] = [];
  // iterate by code point, grouping combining marks with their base
  const chars = Array.from(text);
  for (const char of chars) {
    const cp = char.codePointAt(0) ?? 0;
    out.push({
      char,
      cp,
      codePoints: [String(cp), `0x${cp.toString(16).toUpperCase()}`, `U+${toHex(cp)}`, `&#${cp};`, `&#x${cp.toString(16).toUpperCase()};`],
      name: nameOf(char, cp),
      category: describeCodePoint(cp),
      utf8: utf8Hex(cp),
      utf16: utf16Hex(cp),
      isInvisible: INVISIBLE.has(cp) || cp < 0x20 || cp === 0x7f,
    });
  }
  return out;
}

/* ------------------------------ entity codec ------------------------------ */

function decodeEntities(text: string): { result: string; count: number } {
  let count = 0;
  const result = text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const cp = parseInt(body.slice(2), 16);
      if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff) { count++; return String.fromCodePoint(cp); }
      return match;
    }
    if (body.startsWith('#')) {
      const cp = parseInt(body.slice(1), 10);
      if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff) { count++; return String.fromCodePoint(cp); }
      return match;
    }
    const found = NAMED_ENTITIES[body];
    if (found !== undefined) { count++; return found; }
    return match;
  });
  return { result, count };
}

function encodeEntities(text: string, mode: 'named' | 'decimal' | 'hex'): string {
  const reverse = new Map<string, string>();
  for (const [name, value] of Object.entries(NAMED_ENTITIES)) {
    if (!reverse.has(value)) reverse.set(value, name);
  }
  let out = '';
  for (const char of Array.from(text)) {
    const cp = char.codePointAt(0) ?? 0;
    if (char === '&') { out += '&amp;'; continue; }
    if (char === '<') { out += '&lt;'; continue; }
    if (char === '>') { out += '&gt;'; continue; }
    if (cp < 128 && cp >= 32) { out += char; continue; }
    if (mode === 'named' && reverse.has(char)) { out += `&${reverse.get(char)};`; continue; }
    if (mode === 'hex') { out += `&#x${cp.toString(16).toUpperCase()};`; continue; }
    out += `&#${cp};`;
  }
  return out;
}

/* ------------------------------ component ------------------------------ */

type Tab = 'entities' | 'inspect';

const SAMPLE_TEXT = 'Café menus cost €5 — “naïve” jalapeños 🥞\u200B and a zero-width space hides here.';

const CONFUSABLES: { look: string; actual: string; note: string }[] = [
  { look: 'a', actual: 'а', note: 'Latin a vs Cyrillic а (U+0430) — a classic homoglyph swap' },
  { look: 'e', actual: 'е', note: 'Latin e vs Cyrillic е (U+0435)' },
  { look: 'o', actual: 'о', note: 'Latin o vs Cyrillic о (U+043E)' },
  { look: 'p', actual: 'р', note: 'Latin p vs Cyrillic р (U+0440)' },
  { look: 'c', actual: 'с', note: 'Latin c vs Cyrillic с (U+0441)' },
  { look: ' ', actual: '\u00A0', note: 'Space vs no-break space (U+00A0)' },
  { look: '-', actual: '‐', note: 'Hyphen-minus vs Unicode hyphen (U+2010)' },
  { look: "'", actual: '’', note: 'Straight vs curly apostrophe (U+2019)' },
];

export const UnicodeInspectorTool: React.FC = () => {
  const [tab, setTab] = useState<Tab>('entities');
  const [entityInput, setEntityInput] = useState('<p>Caf&eacute; &amp; cr&#232;me&nbsp;&mdash; &#x1F95E; pancakes</p>');
  const [entityMode, setEntityMode] = useState<'decode' | 'encode'>('decode');
  const [encodeStyle, setEncodeStyle] = useState<'named' | 'decimal' | 'hex'>('named');

  const [inspectText, setInspectText] = useState('Café 🥞\u200B');
  const [showInvisible, setShowInvisible] = useState(true);
  const [entityFilter, setEntityFilter] = useState('');

  const decoded = useMemo(() => (entityMode === 'decode' ? decodeEntities(entityInput) : { result: entityInput, count: 0 }), [entityInput, entityMode]);
  const encoded = useMemo(() => (entityMode === 'encode' ? encodeEntities(entityInput, encodeStyle) : entityInput), [entityInput, entityMode, encodeStyle]);
  const entityOutput = entityMode === 'decode' ? decoded.result : encoded;

  const chars = useMemo(() => analyseGraphemes(inspectText), [inspectText]);
  const invisibleChars = useMemo(() => chars.filter((c) => c.isInvisible), [chars]);

  const totals = useMemo(() => {
    const codePoints = chars.length;
    const utf16Units = inspectText.length;
    const utf8Bytes = new TextEncoder().encode(inspectText).length;
    const bmp = chars.filter((c) => c.cp <= 0xffff).length;
    const astral = codePoints - bmp;
    return { codePoints, utf16Units, utf8Bytes, bmp, astral };
  }, [chars, inspectText]);

  const filteredEntities = useMemo(() => {
    const q = entityFilter.trim().toLowerCase();
    const entries = Object.entries(NAMED_ENTITIES);
    if (!q) return entries.slice(0, 120);
    return entries.filter(([name, value]) => name.toLowerCase().includes(q) || value.toLowerCase().includes(q)).slice(0, 200);
  }, [entityFilter]);

  const swap = () => {
    soundEngine.playClick();
    setEntityInput(entityOutput);
  };

  return (
    <div className="space-y-3">
      <div className="toy-card p-2.5 flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={(id) => { soundEngine.playClick(); setTab(id as Tab); }}
          options={[
            { id: 'entities', label: 'HTML entities', icon: <Languages className="w-3 h-3" /> },
            { id: 'inspect', label: 'Character inspector', icon: <ScanSearch className="w-3 h-3" /> },
          ]}
        />
        <span className="text-[10px] text-[#A98768]">
          {tab === 'entities' ? `${Object.keys(NAMED_ENTITIES).length} named entities in the local table` : 'Code points, UTF-8 bytes and invisible characters'}
        </span>
      </div>

      {tab === 'entities' && (
        <div className="space-y-3">
          <div className="toy-card p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={entityMode}
                onChange={(id) => { soundEngine.playClick(); setEntityMode(id as 'decode' | 'encode'); }}
                options={[{ id: 'decode', label: 'Decode → text' }, { id: 'encode', label: 'Text → entities' }]}
              />
              {entityMode === 'encode' && (
                <Segmented
                  value={encodeStyle}
                  onChange={(id) => { soundEngine.playClick(); setEncodeStyle(id as 'named' | 'decimal' | 'hex'); }}
                  options={[{ id: 'named', label: 'Named' }, { id: 'decimal', label: 'Decimal' }, { id: 'hex', label: 'Hex' }]}
                />
              )}
              <div className="flex-1" />
              <button type="button" onClick={() => { setEntityInput(SAMPLE_TEXT); soundEngine.playPop(1.1); }} className="toy-btn-cream px-2 py-1 text-[10px]">Load sample</button>
              <button type="button" onClick={swap} className="toy-btn-cream px-2 py-1 text-[10px]"><ArrowLeftRight className="w-3 h-3" /> Use output</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[10.5px] font-bold text-[#6B4423] mb-0.5">
                  {entityMode === 'decode' ? 'Escaped input' : 'Plain text input'}
                </span>
                <textarea
                  value={entityInput}
                  onChange={(e) => setEntityInput(e.target.value)}
                  spellCheck={false}
                  className="toy-input w-full h-32 font-mono text-[11.5px] resize-y"
                  aria-label="Entity input"
                />
              </label>
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10.5px] font-bold text-[#6B4423]">
                    {entityMode === 'decode' ? 'Decoded text' : 'Escaped output'}
                  </span>
                  <div className="flex items-center gap-1">
                    {entityMode === 'decode' && <StatChip label="replaced" value={decoded.count} tone="mint" />}
                    <CopyButton text={entityOutput} label="" />
                  </div>
                </div>
                <div className="rounded-xl border-2 border-[#DEC098] bg-[#FFFDF9] p-2 h-32 overflow-auto">
                  <p className="font-mono text-[11.5px] text-[#3B2314] break-all whitespace-pre-wrap">{entityOutput || <span className="text-[#C4A88C]">Output appears here…</span>}</p>
                </div>
              </div>
            </div>
            {entityMode === 'decode' && decoded.count === 0 && entityInput.includes('&') && (
              <p className="flex items-center gap-1 text-[10px] text-[#B45309]">
                <AlertTriangle className="w-3 h-3" /> No recognised entities found. Unknown names are left untouched.
              </p>
            )}
          </div>

          <Panel
            title="Entity reference"
            icon={<Hash className="w-3.5 h-3.5" />}
            actions={
              <input
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                placeholder="Filter by name or character…"
                aria-label="Filter entities"
                className="toy-input py-0.5 px-2 text-[10px] w-48"
              />
            }
          >
            <div className="max-h-72 overflow-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
              {filteredEntities.map(([name, value]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => { setEntityInput((prev) => (entityMode === 'decode' ? prev : '') + `&${name};`); soundEngine.playClick(); }}
                  title={`&${name}; → ${value}`}
                  className="flex items-center gap-1.5 rounded-lg border border-[#E2C6A2] bg-white hover:bg-[#FEF3C7] px-1.5 py-1 text-left transition-colors"
                >
                  <span className="w-5 text-center text-sm text-[#3B2314] shrink-0">{value === '\u00A0' ? '␣' : value}</span>
                  <span className="font-mono text-[9.5px] text-[#7A5535] truncate">&amp;{name};</span>
                </button>
              ))}
            </div>
            {filteredEntities.length === 0 && <EmptyHint>No entity matches “{entityFilter}”.</EmptyHint>}
          </Panel>
        </div>
      )}

      {tab === 'inspect' && (
        <div className="space-y-3">
          <div className="toy-card p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10.5px] font-bold text-[#6B4423]">Text to inspect</span>
              <button type="button" onClick={() => { setInspectText(SAMPLE_TEXT); soundEngine.playPop(1.1); }} className="toy-btn-cream px-2 py-1 text-[10px]">Sample with zero-width</button>
              <button type="button" onClick={() => { setInspectText(inspectText.replace(/[\u200B-\u200F\uFEFF\u00AD]/g, '')); soundEngine.playPop(1.16); }} className="toy-btn-cream px-2 py-1 text-[10px]">
                <ShieldAlert className="w-3 h-3" /> Strip invisibles
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => { soundEngine.playClick(); setShowInvisible((v) => !v); }}
                className={`toy-pill text-[10px] ${showInvisible ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#14532D]' : 'bg-white border-[#D4AA78] text-[#7A5535]'}`}
              >
                {showInvisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Show invisible markers
              </button>
            </div>
            <textarea
              value={inspectText}
              onChange={(e) => setInspectText(e.target.value)}
              spellCheck={false}
              className="toy-input w-full h-24 font-mono text-xs resize-y"
              aria-label="Text to inspect"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <StatChip label="code points" value={totals.codePoints} tone="cream" />
              <StatChip label="UTF-16 units" value={totals.utf16Units} tone="cream" />
              <StatChip label="UTF-8 bytes" value={totals.utf8Bytes} tone="cream" />
              <StatChip label="BMP" value={totals.bmp} tone="cream" />
              <StatChip label="astral" value={totals.astral} tone="gold" />
              <StatChip label="invisible" value={invisibleChars.length} tone={invisibleChars.length ? 'red' : 'mint'} />
              <div className="flex-1" />
              <CopyButton text={inspectText} label="Copy text" />
            </div>
            {invisibleChars.length > 0 && (
              <div className="flex items-start gap-1.5 rounded-lg bg-[#FEF2F2] border-2 border-[#FCA5A5] px-2 py-1">
                <AlertTriangle className="w-3.5 h-3.5 text-[#B91C1C] shrink-0 mt-0.5" />
                <p className="text-[10px] text-[#7F1D1D]">
                  {invisibleChars.length} hidden character{invisibleChars.length === 1 ? '' : 's'} detected:
                  {' '}{invisibleChars.slice(0, 6).map((c) => `U+${toHex(c.cp)}`).join(', ')}
                  {invisibleChars.length > 6 ? ` +${invisibleChars.length - 6} more` : ''}. These can break equality checks or smuggle text.
                </p>
              </div>
            )}
          </div>

          <Panel title={`${chars.length} characters`} icon={<Binary className="w-3.5 h-3.5" />}>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-[10.5px] border-collapse">
                <thead className="sticky top-0 bg-[#FFF3DC] z-10">
                  <tr className="text-left text-[#8A6748]">
                    <th className="px-1.5 py-1 font-bold">#</th>
                    <th className="px-1.5 py-1 font-bold">Glyph</th>
                    <th className="px-1.5 py-1 font-bold">Code point</th>
                    <th className="px-1.5 py-1 font-bold">Name / category</th>
                    <th className="px-1.5 py-1 font-bold">UTF-8</th>
                    <th className="px-1.5 py-1 font-bold">UTF-16</th>
                    <th className="px-1 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {chars.map((c, idx) => (
                    <tr key={`${c.cp}-${idx}`} className={idx % 2 ? 'bg-[#FFFDF9]' : 'bg-white'}>
                      <td className="px-1.5 py-0.5 text-[#C4A88C]">{idx + 1}</td>
                      <td className="px-1.5 py-0.5">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#FFF3DC] border border-[#E2C6A2] text-sm text-[#3B2314]">
                          {c.isInvisible && showInvisible ? <span className="text-[8px] font-bold text-[#B91C1C]">ZW</span> : c.char === ' ' ? '␣' : c.char}
                        </span>
                      </td>
                      <td className="px-1.5 py-0.5 font-mono text-[#3B2314]">U+{toHex(c.cp)}</td>
                      <td className="px-1.5 py-0.5 text-[#6B4423]">
                        <span className="block truncate">{c.name}</span>
                        <span className="block text-[9px] text-[#A98768]">{c.category}</span>
                      </td>
                      <td className="px-1.5 py-0.5 font-mono text-[9.5px] text-[#7A5535]">{c.utf8}</td>
                      <td className="px-1.5 py-0.5 font-mono text-[9.5px] text-[#7A5535]">{c.utf16}</td>
                      <td className="px-1 py-0.5"><CopyButton text={c.char} label="" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {chars.length === 0 && <EmptyHint>Type or paste text above to inspect it.</EmptyHint>}
          </Panel>

          <Panel title="Homoglyph cheat sheet" icon={<ShieldAlert className="w-3.5 h-3.5" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {CONFUSABLES.map((item) => (
                <div key={item.note} className="rounded-lg border border-[#E2C6A2] bg-white px-2 py-1">
                  <p className="font-mono text-[11px] text-[#3B2314]">
                    “{item.look}” vs “{item.actual}”
                  </p>
                  <p className="text-[9.5px] text-[#8A6748]">{item.note}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};

export default UnicodeInspectorTool;
