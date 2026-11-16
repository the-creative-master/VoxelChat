import React, { useMemo, useState } from 'react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

interface RomanToken {
  letters: string;
  vinculum: boolean;
  value: number;
  cumulative: number;
}

const STANDARD_PAIRS: ReadonlyArray<[number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

const VINCULUM_PAIRS: ReadonlyArray<[number, string]> = [
  [1_000_000, 'M'],
  [900_000, 'CM'],
  [500_000, 'D'],
  [400_000, 'CD'],
  [100_000, 'C'],
  [90_000, 'XC'],
  [50_000, 'L'],
  [40_000, 'XL'],
  [10_000, 'X'],
  [9_000, 'IX'],
  [5_000, 'V'],
  [4_000, 'IV'],
];

export function arabicToVinculumRoman(input: number): {
  vinculumPart: string;
  standardPart: string;
  unicodeText: string;
  tokens: RomanToken[];
} | null {
  if (!Number.isInteger(input) || input < 1 || input > 3_999_999) return null;

  let rem = input;
  let vinculumPart = '';
  let standardPart = '';
  let running = 0;
  const tokens: RomanToken[] = [];

  if (rem >= 4000) {
    for (const [val, sym] of VINCULUM_PAIRS) {
      while (rem >= val) {
        vinculumPart += sym;
        rem -= val;
        running += val;
        tokens.push({ letters: sym, vinculum: true, value: val, cumulative: running });
      }
    }
  }

  for (const [val, sym] of STANDARD_PAIRS) {
    while (rem >= val) {
      standardPart += sym;
      rem -= val;
      running += val;
      tokens.push({ letters: sym, vinculum: false, value: val, cumulative: running });
    }
  }

  // Unicode combining overline U+0305 on every character of vinculumPart for rich text copy
  const unicodeVinculum = vinculumPart
    .split('')
    .map((ch) => `${ch}\u0305`)
    .join('');

  return {
    vinculumPart,
    standardPart,
    unicodeText: unicodeVinculum + standardPart,
    tokens,
  };
}

const SINGLE_VALS: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

/**
 * Parses Roman numerals (including Vinculum via combining overline U+0305 / U+0304 OR (IV) grouping)
 * back to Arabic integers 1..3,999,999 with full validation.
 */
function parseVinculumRoman(raw: string): { value: number; canonical: ReturnType<typeof arabicToVinculumRoman>; warning?: string } | { error: string } {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!cleaned) return { error: 'Enter a Roman numeral above.' };

  const atoms: Array<{ ch: string; vinc: boolean }> = [];
  let inParen = false;

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === '(') {
      if (inParen) return { error: 'Nested parentheses are not allowed.' };
      inParen = true;
      continue;
    }
    if (c === ')') {
      if (!inParen) return { error: 'Unmatched closing parenthesis.' };
      inParen = false;
      continue;
    }
    if (c === '\u0305' || c === '\u0304') {
      if (atoms.length > 0) atoms[atoms.length - 1].vinc = true;
      continue;
    }
    if (!(c in SINGLE_VALS)) {
      return {
        error: `Invalid character "${c}". Use I, V, X, L, C, D, M (and Vinculum buttons or parentheses like (IV) for ×1,000).`,
      };
    }
    let hasComb = false;
    while (i + 1 < cleaned.length && (cleaned[i + 1] === '\u0305' || cleaned[i + 1] === '\u0304')) {
      hasComb = true;
      i++;
    }
    atoms.push({ ch: c, vinc: inParen || hasComb });
  }

  if (inParen) return { error: 'Unclosed parenthesis in Vinculum group.' };
  if (atoms.length === 0) return { error: 'Enter at least one Roman numeral symbol.' };

  const atomVal = (idx: number) => {
    const a = atoms[idx];
    const base = SINGLE_VALS[a.ch];
    // Note: I̅ = 1,000 (allowed in subtractive I̅V̅ = 4,000 or I̅X̅ = 9,000)
    return a.vinc ? base * 1000 : base;
  };

  let total = 0;
  for (let i = 0; i < atoms.length; i++) {
    const cur = atomVal(i);
    const next = i + 1 < atoms.length ? atomVal(i + 1) : 0;
    if (cur < next && atoms[i].vinc === atoms[i + 1].vinc) {
      total += next - cur;
      i++;
    } else {
      total += cur;
    }
  }

  if (total < 1 || total > 3_999_999) {
    return { error: `Parsed value ${total.toLocaleString()} is outside supported range (1 to 3,999,999).` };
  }

  const canonical = arabicToVinculumRoman(total);
  const inputVinc = atoms.filter((a) => a.vinc).map((a) => a.ch).join('');
  const inputStd = atoms.filter((a) => !a.vinc).map((a) => a.ch).join('');
  const isCanonical =
    canonical &&
    canonical.vinculumPart === inputVinc &&
    canonical.standardPart === inputStd;

  return {
    value: total,
    canonical,
    warning: isCanonical
      ? undefined
      : 'Non-standard numeral form detected — normalized canonical form shown below.',
  };
}

const VinculumDisplay: React.FC<{
  vinculumPart: string;
  standardPart: string;
  className?: string;
}> = ({ vinculumPart, standardPart, className = '' }) => (
  <span className={`font-mono font-bold tracking-wider inline-flex items-baseline flex-wrap ${className}`}>
    {vinculumPart && <span className="vinculum-bar text-[#B91C1C]">{vinculumPart}</span>}
    {standardPart && <span className="text-[#3B2314]">{standardPart}</span>}
  </span>
);

export default function RomanNumeralsTool() {
  const [arabicInput, setArabicInput] = useState('1999999');
  const [romanInput, setRomanInput] = useState('M\u0305C\u0305M\u0305X\u0305C\u0305I\u0305X\u0305CMXCIX');
  const [lastEdited, setLastEdited] = useState<'arabic' | 'roman'>('arabic');

  const handleArabicChange = (val: string) => {
    setArabicInput(val);
    setLastEdited('arabic');
    const num = Number.parseInt(val.replace(/,/g, '').trim(), 10);
    const conv = arabicToVinculumRoman(num);
    if (conv) {
      setRomanInput(conv.unicodeText);
    }
  };

  const handleRomanChange = (val: string) => {
    setRomanInput(val);
    setLastEdited('roman');
    const parsed = parseVinculumRoman(val);
    if (!('error' in parsed)) {
      setArabicInput(String(parsed.value));
    }
  };

  const appendRomanKey = (ch: string, vinculum: boolean) => {
    soundEngine.playClick();
    const token = vinculum ? `${ch}\u0305` : ch;
    handleRomanChange(romanInput + token);
  };

  const result = useMemo(() => {
    if (lastEdited === 'arabic') {
      const cleaned = arabicInput.replace(/,/g, '').trim();
      if (!cleaned) return { error: 'Type an integer from 1 to 3,999,999.' };
      if (!/^\d+$/.test(cleaned)) return { error: 'Enter a positive whole integer (1 to 3,999,999).' };
      const num = Number.parseInt(cleaned, 10);
      if (num < 1 || num > 3_999_999) {
        return { error: 'Value must be between 1 and 3,999,999.' };
      }
      const conv = arabicToVinculumRoman(num)!;
      return { arabic: num, conv, warning: undefined };
    } else {
      const parsed = parseVinculumRoman(romanInput);
      if ('error' in parsed) return { error: parsed.error };
      return { arabic: parsed.value, conv: parsed.canonical!, warning: parsed.warning };
    }
  }, [arabicInput, romanInput, lastEdited]);

  const examples = [
    { n: 42, label: '42' },
    { n: 1999, label: '1,999' },
    { n: 2026, label: '2,026' },
    { n: 4000, label: '4,000 (Vinculum)' },
    { n: 58420, label: '58,420' },
    { n: 1999999, label: '1,999,999' },
    { n: 3999999, label: '3,999,999 (Max)' },
  ];

  return (
    <div className="space-y-5">
      {/* Bidirectional Input Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Arabic Integer Input */}
        <div className="toy-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-display font-bold text-base text-[#3B2314]">
              Arabic Integer (1 – 3,999,999)
            </label>
            {!('error' in result) && <CopyButton text={String(result.arabic)} />}
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={arabicInput}
            onChange={(e) => handleArabicChange(e.target.value)}
            placeholder="e.g. 4000 or 1999999"
            className="toy-input font-mono font-bold text-xl py-3"
          />
          <div className="flex flex-wrap gap-1.5">
            {examples.map((ex) => (
              <button
                key={ex.n}
                type="button"
                onClick={() => {
                  soundEngine.playPop(1.06);
                  handleArabicChange(String(ex.n));
                }}
                className="px-2.5 py-1 rounded-lg bg-[#FFFDF9] hover:bg-[#FEF3C7] border border-[#D4AA78] font-mono text-[11px] font-semibold text-[#5C3415] cursor-pointer"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Roman + Vinculum Input */}
        <div className="toy-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-display font-bold text-base text-[#3B2314]">
              Roman Numeral (with Vinculum)
            </label>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setRomanInput('');
                setLastEdited('roman');
              }}
              className="text-xs font-bold text-[#991B1B] hover:underline cursor-pointer"
            >
              Clear
            </button>
          </div>
          <input
            type="text"
            value={romanInput}
            onChange={(e) => handleRomanChange(e.target.value)}
            placeholder="e.g. MCMXCIX or (IV) or tap Vinculum keys"
            className="toy-input font-mono font-bold text-xl py-3"
          />

          {/* Tactile Standard & Vinculum ×1,000 Keypads */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-7 gap-1.5">
              {['I', 'V', 'X', 'L', 'C', 'D', 'M'].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => appendRomanKey(ch, false)}
                  className="toy-btn-cream py-1.5 font-mono text-xs font-bold"
                >
                  {ch}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {['I', 'V', 'X', 'L', 'C', 'D', 'M'].map((ch) => (
                <button
                  key={`v-${ch}`}
                  type="button"
                  onClick={() => appendRomanKey(ch, true)}
                  title={`Vinculum ${ch} (×1,000 = ${(SINGLE_VALS[ch] * 1000).toLocaleString()})`}
                  className="toy-btn bg-[#FEF2F2] hover:bg-[#FEE2E2] border-[#EF4444] text-[#991B1B] py-1.5 font-mono text-xs font-bold"
                >
                  <span className="border-t-2 border-[#991B1B] leading-none pt-0.5">{ch}</span>
                </button>
              ))}
            </div>
            <p className="text-[10.5px] text-[#7A5433]">
              Tip: Red overlined keys multiply a symbol by 1,000 (Vinculum). You can also type{' '}
              <code className="bg-[#F5E6CE] px-1 rounded">(IV)</code> for 4,000.
            </p>
          </div>
        </div>
      </div>

      {/* Rendered Vinculum Showcase Banner */}
      {'error' in result ? (
        <div className="rounded-2xl bg-[#FEE2E2] border-2 border-[#EF4444] p-4 text-sm font-semibold text-[#991B1B]">
          {result.error}
        </div>
      ) : (
        <>
          <div className="toy-card p-6 bg-gradient-to-br from-[#FFFDF9] to-[#FFF7E8]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="text-xs font-bold text-[#8B5A2B] uppercase tracking-wider">
                Rendered Roman Numeral {result.conv.vinculumPart ? '(with Vinculum ×1,000 Bar)' : ''}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton text={result.conv.unicodeText} label="Copy Roman" />
                {result.conv.vinculumPart && (
                  <CopyButton
                    text={`(${result.conv.vinculumPart})${result.conv.standardPart}`}
                    label="Copy ASCII (V)"
                  />
                )}
              </div>
            </div>

            <div className="py-3 flex flex-wrap items-baseline justify-between gap-4">
              <VinculumDisplay
                vinculumPart={result.conv.vinculumPart}
                standardPart={result.conv.standardPart}
                className="text-3xl sm:text-5xl"
              />
              <span className="font-mono font-bold text-2xl sm:text-3xl text-[#78350F]">
                = {result.arabic.toLocaleString('en-US')}
              </span>
            </div>

            {result.warning && (
              <div className="mt-2 text-xs font-semibold text-[#B45309] bg-[#FEF3C7] border border-[#F59E0B] rounded-xl px-3 py-1.5">
                {result.warning}
              </div>
            )}
          </div>

          {/* Interactive Place-Value Breakdown Table */}
          <div className="toy-panel p-5">
            <h3 className="font-display font-bold text-base text-[#3B2314] mb-3">
              Place-Value Breakdown ({result.conv.tokens.length} Numerals)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#DEC098] text-[#7A5433]">
                    <th className="py-2 px-3 font-display">Symbol</th>
                    <th className="py-2 px-3 font-display">Notation</th>
                    <th className="py-2 px-3 font-display text-right">Value</th>
                    <th className="py-2 px-3 font-display text-right">Running Sum</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.conv.tokens.map((tok, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-[#EEDAC0] hover:bg-[#FFFDF9] transition-colors"
                    >
                      <td className="py-2.5 px-3 font-bold text-base">
                        {tok.vinculum ? (
                          <span className="vinculum-bar text-[#B91C1C]">{tok.letters}</span>
                        ) : (
                          <span className="text-[#3B2314]">{tok.letters}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-xs">
                        {tok.vinculum ? (
                          <span className="px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#991B1B] font-bold">
                            Vinculum ({tok.letters} × 1,000)
                          </span>
                        ) : tok.letters.length === 2 ? (
                          <span className="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#78350F] font-semibold">
                            Subtractive pair
                          </span>
                        ) : (
                          <span className="text-[#6E4928]">Standard additive</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#15803D]">
                        +{tok.value.toLocaleString('en-US')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#3B2314]">
                        {tok.cumulative.toLocaleString('en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
