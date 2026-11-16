import { useMemo, useState } from 'react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

type BitWidth = 8 | 16 | 32;
type BitOp = 'AND' | 'OR' | 'XOR' | 'NOT' | '<<' | '>>';

function maskForWidth(width: BitWidth): bigint {
  return (1n << BigInt(width)) - 1n;
}

function toSigned(unsignedVal: bigint, width: BitWidth): bigint {
  const signBit = 1n << BigInt(width - 1);
  return (unsignedVal & signBit) !== 0n ? unsignedVal - (1n << BigInt(width)) : unsignedVal;
}

function groupBinary(val: bigint, width: BitWidth): string {
  const s = (val & maskForWidth(width)).toString(2).padStart(width, '0');
  return s.replace(/(.{4})/g, '$1 ').trim();
}

export default function BaseConverterTool() {
  const [width, setWidth] = useState<BitWidth>(16);
  const [value, setValue] = useState<bigint>(255n);
  const [parseErr, setParseErr] = useState<string | null>(null);

  // Bitwise operations unit
  const [opA, setOpA] = useState('170');
  const [opB, setOpB] = useState('204');
  const [bitOp, setBitOp] = useState<BitOp>('XOR');

  const masked = value & maskForWidth(width);
  const signedVal = toSigned(masked, width);

  const handleBaseEdit = (raw: string, radix: 2 | 8 | 10 | 16) => {
    const clean = raw.replace(/[\s_]/g, '').trim();
    if (!clean) {
      setValue(0n);
      setParseErr(null);
      return;
    }
    try {
      let parsed: bigint;
      if (radix === 10) {
        if (!/^-?\d+$/.test(clean)) throw new Error('Decimal digits 0–9 only');
        parsed = BigInt(clean);
      } else if (radix === 2) {
        const s = clean.replace(/^0b/i, '');
        if (!/^[01]+$/.test(s)) throw new Error('Binary digits 0 or 1 only');
        parsed = BigInt(`0b${s}`);
      } else if (radix === 16) {
        const s = clean.replace(/^0x/i, '');
        if (!/^[0-9a-f]+$/i.test(s)) throw new Error('Hex digits 0–9 and A–F only');
        parsed = BigInt(`0x${s}`);
      } else {
        const s = clean.replace(/^0o/i, '');
        if (!/^[0-7]+$/.test(s)) throw new Error('Octal digits 0–7 only');
        parsed = BigInt(`0o${s}`);
      }
      setValue(parsed & maskForWidth(width));
      setParseErr(null);
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : 'Invalid number');
    }
  };

  const toggleBit = (bitIndex: number) => {
    soundEngine.playClick();
    setValue((prev) => (prev ^ (1n << BigInt(bitIndex))) & maskForWidth(width));
  };

  const parseFlexInt = (s: string): bigint | null => {
    const c = s.trim().replace(/[\s_]/g, '');
    if (!c) return 0n;
    try {
      return BigInt(c);
    } catch {
      return null;
    }
  };

  const bitwiseRes = useMemo(() => {
    const mask = maskForWidth(width);
    const aRaw = parseFlexInt(opA);
    const bRaw = parseFlexInt(opB);
    if (aRaw === null || (bitOp !== 'NOT' && bRaw === null)) return null;
    const a = aRaw & mask;
    const b = (bRaw ?? 0n) & mask;
    let out = 0n;
    if (bitOp === 'AND') out = a & b;
    else if (bitOp === 'OR') out = a | b;
    else if (bitOp === 'XOR') out = a ^ b;
    else if (bitOp === 'NOT') out = (~a) & mask;
    else if (bitOp === '<<') {
      const sh = b > BigInt(width) ? BigInt(width) : b;
      out = (a << sh) & mask;
    } else if (bitOp === '>>') {
      const sh = b > BigInt(width) ? BigInt(width) : b;
      out = a >> sh;
    }
    return { a, b, out };
  }, [opA, opB, bitOp, width]);

  const bitIndices = Array.from({ length: width }, (_, i) => width - 1 - i);

  return (
    <div className="space-y-6">
      {/* Bit Width Selector & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-[#F6E6CC] p-1 border-2 border-[#DEC098]">
          {([8, 16, 32] as BitWidth[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => {
                soundEngine.playPop(1.05);
                setWidth(w);
                setValue((v) => v & maskForWidth(w));
              }}
              className={`px-3.5 py-1.5 rounded-lg font-mono font-bold text-xs sm:text-sm cursor-pointer ${
                width === w ? 'bg-[#EF4444] text-white' : 'text-[#6E4928]'
              }`}
            >
              {w}-bit
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setValue((v) => (~v) & maskForWidth(width));
            }}
            className="toy-btn-cream px-3 py-1.5 text-xs font-mono"
          >
            ~ Invert
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setValue((v) => (v << 1n) & maskForWidth(width));
            }}
            className="toy-btn-cream px-3 py-1.5 text-xs font-mono"
          >
            &lt;&lt; 1
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setValue((v) => (v & maskForWidth(width)) >> 1n);
            }}
            className="toy-btn-cream px-3 py-1.5 text-xs font-mono"
          >
            &gt;&gt; 1
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setValue(0n);
            }}
            className="toy-btn-cream px-3 py-1.5 text-xs font-mono"
          >
            Zero
          </button>
        </div>
      </div>

      {/* Live 4-Way Synchronized Base Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            label: 'Decimal (Base 10 — Unsigned)',
            sub: `Signed ${width}-bit Two's Complement: ${signedVal.toString(10)}`,
            radix: 10 as const,
            display: masked.toString(10),
            copy: masked.toString(10),
          },
          {
            label: 'Hexadecimal (Base 16)',
            sub: `0x${masked.toString(16).toUpperCase().padStart(width / 4, '0')}`,
            radix: 16 as const,
            display: masked.toString(16).toUpperCase(),
            copy: `0x${masked.toString(16).toUpperCase()}`,
          },
          {
            label: 'Binary (Base 2)',
            sub: `Grouped: ${groupBinary(masked, width)}`,
            radix: 2 as const,
            display: masked.toString(2),
            copy: masked.toString(2).padStart(width, '0'),
          },
          {
            label: 'Octal (Base 8)',
            sub: `0o${masked.toString(8)}`,
            radix: 8 as const,
            display: masked.toString(8),
            copy: `0o${masked.toString(8)}`,
          },
        ].map((field) => (
          <div key={field.radix} className="toy-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-display font-bold text-[#3B2314]">{field.label}</label>
              <CopyButton text={field.copy} />
            </div>
            <input
              type="text"
              value={field.display}
              onChange={(e) => handleBaseEdit(e.target.value, field.radix)}
              className="toy-input font-mono font-bold text-base py-2"
            />
            <div className="font-mono text-[11px] text-[#7A5433] break-all">{field.sub}</div>
          </div>
        ))}
      </div>

      {parseErr && (
        <div className="rounded-xl bg-[#FEE2E2] border border-[#EF4444] px-3.5 py-2 text-xs font-semibold text-[#991B1B]">
          {parseErr}
        </div>
      )}

      {/* Interactive Bit-Flipping Toggles */}
      <div className="toy-panel p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-[#3B2314]">
            Interactive {width}-Bit Register (Click Any Bit to Flip)
          </h3>
          <span className="font-mono text-xs font-bold text-[#8B5A2B]">MSB → LSB</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {bitIndices.map((bitIdx) => {
            const isOn = ((masked >> BigInt(bitIdx)) & 1n) === 1n;
            const nibbleBreak = bitIdx % 4 === 0 && bitIdx !== 0;
            return (
              <button
                key={bitIdx}
                type="button"
                onClick={() => toggleBit(bitIdx)}
                className={`flex flex-col items-center justify-center w-9 h-12 rounded-xl border-2 border-b-[4px] font-mono transition-all active:translate-y-[2px] cursor-pointer ${
                  nibbleBreak ? 'mr-2.5' : ''
                } ${
                  isOn
                    ? 'bg-[#EF4444] border-[#991B1B] text-white'
                    : 'bg-[#FFFDF9] border-[#D4AA78] text-[#6E4928]'
                }`}
              >
                <span className="text-sm font-extrabold leading-none">{isOn ? '1' : '0'}</span>
                <span className={`text-[9px] mt-1 ${isOn ? 'text-[#FEE2E2]' : 'text-[#A07855]'}`}>
                  b{bitIdx}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bitwise Operations Unit */}
      <div className="toy-panel p-5 space-y-4">
        <h3 className="font-display font-bold text-base text-[#3B2314]">
          Bitwise Logic &amp; Shift Calculator ({width}-bit)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#7A5433] mb-1">
              Operand A (dec, 0xFF, 0b1010)
            </label>
            <input
              type="text"
              value={opA}
              onChange={(e) => setOpA(e.target.value)}
              className="toy-input font-mono font-bold py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#7A5433] mb-1">Operation</label>
            <div className="grid grid-cols-6 gap-1">
              {(['AND', 'OR', 'XOR', 'NOT', '<<', '>>'] as BitOp[]).map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setBitOp(op);
                  }}
                  className={`py-2 rounded-lg font-mono text-xs font-bold border-2 cursor-pointer ${
                    bitOp === op
                      ? 'bg-[#EF4444] border-[#991B1B] text-white'
                      : 'bg-[#FFFDF9] border-[#D4AA78] text-[#4A2506]'
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#7A5433] mb-1">
              {bitOp === '<<' || bitOp === '>>' ? 'Shift Bits' : 'Operand B'}
            </label>
            <input
              type="text"
              disabled={bitOp === 'NOT'}
              value={opB}
              onChange={(e) => setOpB(e.target.value)}
              className="toy-input font-mono font-bold py-2 text-sm disabled:opacity-45"
            />
          </div>
        </div>

        {bitwiseRes && (
          <div className="rounded-xl bg-[#241A13] text-[#FDF3E1] p-4 font-mono text-xs sm:text-sm space-y-1 overflow-x-auto">
            <div>
              <span className="text-[#D4AA78] inline-block w-14">A:</span>
              <span>{groupBinary(bitwiseRes.a, width)}</span>
              <span className="text-[#A98768] ml-3">
                ({bitwiseRes.a.toString(10)} / 0x{bitwiseRes.a.toString(16).toUpperCase()})
              </span>
            </div>
            {bitOp !== 'NOT' && (
              <div>
                <span className="text-[#D4AA78] inline-block w-14">{bitOp} B:</span>
                <span>{groupBinary(bitwiseRes.b, width)}</span>
                <span className="text-[#A98768] ml-3">
                  ({bitwiseRes.b.toString(10)} / 0x{bitwiseRes.b.toString(16).toUpperCase()})
                </span>
              </div>
            )}
            <div className="border-t border-[#5C3A1E] pt-1.5 text-[#FDE047] font-bold">
              <span className="inline-block w-14">= OUT:</span>
              <span>{groupBinary(bitwiseRes.out, width)}</span>
              <span className="text-[#86EFAC] ml-3">
                (Dec: {bitwiseRes.out.toString(10)} • Hex: 0x
                {bitwiseRes.out.toString(16).toUpperCase()} • Oct: 0o{bitwiseRes.out.toString(8)})
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
