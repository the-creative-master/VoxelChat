import React, { useMemo, useState } from 'react';
import { Copy, Sparkles, Wand2 } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, StatChip, EmptyHint } from '../coding/shared';
import { GhostButton, Slider } from './shared';

/* =========================================================================
   Crazy Text Filters — zalgo, flipped, vapourwave, fraktur, script,
   double-struck, monospace, circled, small caps, superscript & friends.
   All transformations are pure Unicode arithmetic.
   ========================================================================= */

const FLIP_MAP: Record<string, string> = (() => {
  const pairs =
    'abcdefghijklmnopqrstuvwxyz' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + '0123456789' +
    '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
  const flipped =
    'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz' +
    '∀ꓭƆᗡƎℲ⅁HIſꓘ˥WNOԀΌᴚS⊥∩ΛMX⅄Z' +
    '0ƖᄅƐㄣϛ9ㄥ86' +
    '¡,پ#$%⅋,)(*+‘-˙/ :;<=>¿@][ʌ‾`{|}\\~';
  const map: Record<string, string> = {};
  for (let i = 0; i < pairs.length; i++) map[pairs[i]] = flipped[i] ?? pairs[i];
  return map;
})();

const flipText = (t: string) =>
  Array.from(t)
    .map((c) => FLIP_MAP[c] ?? c)
    .reverse()
    .join('');

const VAPOR = ['ａ', 'ｂ', 'ｃ', 'ｄ', 'ｅ', 'ｆ', 'ｇ', 'ｈ', 'ｉ', 'ｊ', 'ｋ', 'ｌ', 'ｍ', 'ｎ', 'ｏ', 'ｐ', 'ｑ', 'ｒ', 'ｓ', 'ｔ', 'ｕ', 'ｖ', 'ｗ', 'ｘ', 'ｙ', 'ｚ'];

const vaporwave = (t: string) =>
  Array.from(t.toLowerCase())
    .map((c) => {
      const i = c.charCodeAt(0) - 97;
      const mapped = i >= 0 && i < 26 ? VAPOR[i] : c;
      return mapped === ' ' ? '　' : mapped;
    })
    .join('');

const MATH_BOLD = { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce };
const MATH_ITALIC = { upper: 0x1d434, lower: 0x1d44e };
const DOUBLE_STRUCK = { upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8 };
const SCRIPT = { upper: 0x1d49c, lower: 0x1d4b6 };
const MONO = { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 };
const SANS = { upper: 0x1d5a0, lower: 0x1d5ba, digit: 0x1d7e2 };

/** Greek/Cyrillic look-alikes give a much more convincing "fraktur" than the
 *  sparse Mathematical Fraktur block, which has holes at C/H/I/R/Z. */
const FRAKTUR_FALLBACK: Record<string, string> = {
  C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ',
  c: '𝔠', h: '𝔥', i: '𝔦', r: '𝔯', z: '𝔷',
};

const mapBlocks = (
  t: string,
  upper: number,
  lower: number,
  digit?: number,
  fallback?: Record<string, string>
) =>
  Array.from(t)
    .map((c) => {
      if (fallback && fallback[c]) return fallback[c];
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(upper + (code - 65));
      if (code >= 97 && code <= 122) return String.fromCodePoint(lower + (code - 97));
      if (digit && code >= 48 && code <= 57) return String.fromCodePoint(digit + (code - 48));
      return c;
    })
    .join('');

const FRAKTUR_UPPER = 0x1d504;
const FRAKTUR_LOWER = 0x1d51e;

const SUPER_MAP: Record<string, string> = {
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ',
  n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
};

const SUB_MAP: Record<string, string> = {
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ',
  s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
};

const SMALL_CAPS_MAP: Record<string, string> = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
  n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

const CIRCLED = (t: string) =>
  Array.from(t)
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(0x24b6 + code - 65);
      if (code >= 97 && code <= 122) return String.fromCodePoint(0x24d0 + code - 97);
      if (code >= 49 && code <= 57) return String.fromCodePoint(0x2460 + code - 49);
      return c;
    })
    .join('');

const NEGATIVE_CIRCLED = (t: string) =>
  Array.from(t)
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(0x1f150 + code - 65);
      if (code >= 97 && code <= 122) return String.fromCodePoint(0x1f150 + code - 97);
      return c;
    })
    .join('');

/** Combining diacritics stacked above/below — the classic "zalgo" effect. */
const ZALGO_UP = ['\u0300', '\u0301', '\u0302', '\u0303', '\u0304', '\u0306', '\u0307', '\u0308', '\u0309', '\u030A', '\u030B', '\u030C', '\u0310', '\u0312', '\u0313', '\u033D', '\u0342', '\u0344'];
const ZALGO_DOWN = ['\u0316', '\u0317', '\u0318', '\u0319', '\u031C', '\u031D', '\u031E', '\u031F', '\u0320', '\u0324', '\u0325', '\u0326', '\u0329', '\u032A', '\u032B', '\u032C', '\u032D', '\u032E'];
const ZALGO_MID = ['\u0315', '\u031B', '\u0340', '\u0341', '\u0358', '\u0321', '\u0322', '\u0327', '\u0328', '\u0334', '\u0335', '\u0336', '\u034F'];

const zalgo = (t: string, intensity: number) => {
  const pick = (arr: string[], n: number) =>
    Array.from({ length: n }, () => arr[Math.floor(Math.random() * arr.length)]).join('');
  return Array.from(t)
    .map((c) => {
      if (/\s/.test(c)) return c;
      const level = Math.max(1, Math.round(intensity));
      return c + pick(ZALGO_UP, level) + pick(ZALGO_MID, Math.max(0, level - 1)) + pick(ZALGO_DOWN, level);
    })
    .join('');
};

const SPARKLE = (t: string) =>
  Array.from(t)
    .map((c) => (c === ' ' ? ' ⋆｡°✩ ' : `✨${c}✨`))
    .join('');

const STRIKE = (t: string) => Array.from(t).map((c) => (c === ' ' ? ' ' : c + '\u0336')).join('');
const UNDERLINE = (t: string) => Array.from(t).map((c) => (c === ' ' ? ' ' : c + '\u0332')).join('');
const SLASH = (t: string) => Array.from(t).map((c) => (c === ' ' ? ' ' : c + '\u0338')).join('');

type FilterId =
  | 'zalgo' | 'flip' | 'vaporwave' | 'fraktur' | 'script' | 'bold' | 'italic'
  | 'double' | 'mono' | 'sans' | 'circled' | 'negative' | 'super' | 'sub'
  | 'smallcaps' | 'strike' | 'underline' | 'slash' | 'sparkle';

const FILTERS: { id: FilterId; label: string; sample: string; group: string }[] = [
  { id: 'zalgo', label: 'Zalgo', sample: 'H̸̡̪̯ͨ͊̽̅̾e̬̪̹̙͒̈́̈́͒c̰̯̟̭̔̈́͒͝o̘̗͚̥̞͌̃m̢̻̗͕̜̓͌͝e̦̥̘͔̝̿͑̌̚s̹̘̼̭̓̔', group: 'Chaos' },
  { id: 'flip', label: 'Upside down', sample: 'sǝɯoɔǝH', group: 'Chaos' },
  { id: 'sparkle', label: 'Sparkles', sample: '✨H✨✨i✨ ✨✨', group: 'Chaos' },
  { id: 'vaporwave', label: 'Vaporwave', sample: 'Ｈｅｌｌｏ', group: 'Aesthetic' },
  { id: 'fraktur', label: 'Fraktur', sample: 'ℌ𝔢𝔩𝔩𝔬', group: 'Aesthetic' },
  { id: 'script', label: 'Script', sample: 'ℋℯ𝓁𝓁ℴ', group: 'Aesthetic' },
  { id: 'bold', label: 'Bold', sample: '𝐇𝐞𝐥𝐥𝐨', group: 'Weight' },
  { id: 'italic', label: 'Italic', sample: '𝐻𝑒𝑙𝑙𝑜', group: 'Weight' },
  { id: 'mono', label: 'Monospace', sample: '𝙷𝚎𝚕𝚕𝚘', group: 'Weight' },
  { id: 'sans', label: 'Sans', sample: '𝖧𝖾𝗅𝗅𝗈', group: 'Weight' },
  { id: 'double', label: 'Double-struck', sample: 'ℍ𝕖𝕝𝕝𝕠', group: 'Weight' },
  { id: 'circled', label: 'Circled', sample: 'Ⓗⓔⓛⓛⓞ', group: 'Shapes' },
  { id: 'negative', label: 'Negative circles', sample: '🅷🅴🅻🅻🅾', group: 'Shapes' },
  { id: 'super', label: 'Superscript', sample: 'ᴴᵉˡˡᵒ', group: 'Shapes' },
  { id: 'sub', label: 'Subscript', sample: 'ₕₑₗₗₒ', group: 'Shapes' },
  { id: 'smallcaps', label: 'Small caps', sample: 'ʜᴇʟʟᴏ', group: 'Shapes' },
  { id: 'strike', label: 'Strikethrough', sample: 'H̶e̶l̶l̶o̶', group: 'Lines' },
  { id: 'underline', label: 'Underline', sample: 'H̲e̲l̲l̲o̲', group: 'Lines' },
  { id: 'slash', label: 'Slash-through', sample: 'H̸e̸l̸l̸o̸', group: 'Lines' },
];

const GROUPS = ['Chaos', 'Aesthetic', 'Weight', 'Shapes', 'Lines'];

const applyFilter = (t: string, f: FilterId, zalgoLevel: number): string => {
  switch (f) {
    case 'zalgo': return zalgo(t, zalgoLevel);
    case 'flip': return flipText(t);
    case 'vaporwave': return vaporwave(t);
    case 'fraktur': return mapBlocks(t, FRAKTUR_UPPER, FRAKTUR_LOWER, undefined, FRAKTUR_FALLBACK);
    case 'script': return mapBlocks(t, SCRIPT.upper, SCRIPT.lower);
    case 'bold': return mapBlocks(t, MATH_BOLD.upper, MATH_BOLD.lower, MATH_BOLD.digit);
    case 'italic': return mapBlocks(t, MATH_ITALIC.upper, MATH_ITALIC.lower);
    case 'mono': return mapBlocks(t, MONO.upper, MONO.lower, MONO.digit);
    case 'sans': return mapBlocks(t, SANS.upper, SANS.lower, SANS.digit);
    case 'double': return mapBlocks(t, DOUBLE_STRUCK.upper, DOUBLE_STRUCK.lower, DOUBLE_STRUCK.digit);
    case 'circled': return CIRCLED(t);
    case 'negative': return NEGATIVE_CIRCLED(t);
    case 'super': return Array.from(t).map((c) => SUPER_MAP[c] ?? SUPER_MAP[c.toLowerCase()] ?? c).join('');
    case 'sub': return Array.from(t).map((c) => SUB_MAP[c] ?? SUB_MAP[c.toLowerCase()] ?? c).join('');
    case 'smallcaps': return Array.from(t).map((c) => SMALL_CAPS_MAP[c.toLowerCase()] ?? c).join('');
    case 'strike': return STRIKE(t);
    case 'underline': return UNDERLINE(t);
    case 'slash': return SLASH(t);
    case 'sparkle': return SPARKLE(t);
    default: return t;
  }
};

const DEMO = 'Hello friend';

export const CrazyTextFilters: React.FC = () => {
  const [input, setInput] = useState(DEMO);
  const [active, setActive] = useState<FilterId>('fraktur');
  const [zalgoLevel, setZalgoLevel] = useState(3);
  const [seed, setSeed] = useState(0);

  const output = useMemo(
    () => applyFilter(input, active, zalgoLevel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, active, zalgoLevel, seed]
  );

  const activeFilter = FILTERS.find((f) => f.id === active)!;

  return (
    <div className="space-y-3">
      <Panel
        title="Your text"
        icon={<Wand2 className="h-4 w-4" />}
        actions={<StatChip label="chars" value={input.length} />}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type something to mangle…"
          className="w-full rounded-lg border-2 border-[#BFDBFE] bg-white px-3 py-2 font-mono text-sm text-[#1E293B] outline-none focus:border-[#3B82F6]"
        />
        {active === 'zalgo' && (
          <div className="mt-2.5 max-w-xs">
            <Slider
              label="Zalgo intensity"
              value={zalgoLevel}
              min={1}
              max={8}
              onChange={setZalgoLevel}
              hint="Higher stacks more combining marks (and can look wild)"
            />
          </div>
        )}
      </Panel>

      <Panel
        title="Filters"
        icon={<Sparkles className="h-4 w-4" />}
        actions={
          <GhostButton onClick={() => setSeed((s) => s + 1)} title="Re-roll random filters">
            🎲 Re-roll
          </GhostButton>
        }
      >
        <div className="space-y-2.5">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#64748B]">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.filter((f) => f.group === group).map((f) => {
                  const on = active === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setActive(f.id);
                        soundEngine.playPop(1.05);
                      }}
                      aria-pressed={on}
                      className={`rounded-lg border-2 border-b-[4px] px-3 py-1.5 transition active:translate-y-[2px] active:border-b-2 ${
                        on
                          ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                          : 'border-[#BFDBFE] bg-white text-[#1E3A8A] hover:border-[#3B82F6]'
                      }`}
                    >
                      <span className="block text-left font-display text-[11.5px] font-bold leading-tight">{f.label}</span>
                      <span className={`block truncate text-left text-[11px] ${on ? 'text-white/85' : 'text-[#64748B]'}`}>
                        {f.sample}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title={`Output — ${activeFilter.label}`}
        icon={<Copy className="h-4 w-4" />}
        actions={<CopyButton text={output} label="Copy" size="sm" />}
      >
        <div
          className="min-h-[7rem] w-full select-all overflow-auto rounded-lg border-2 border-[#86EFAC] bg-[#F0FDF4] p-3 text-lg leading-loose text-[#14532D]"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {output || <span className="text-sm italic text-[#64748B]">Nothing to mangle yet</span>}
        </div>
        {output.length > 1 && (
          <EmptyHint>
            {input.length} in → {Array.from(output).length} characters out. If a glyph shows as a box, that font simply
            lacks the glyph — the text still copies correctly.
          </EmptyHint>
        )}
      </Panel>
    </div>
  );
};

export default CrazyTextFilters;
