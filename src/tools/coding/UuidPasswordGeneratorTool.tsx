import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Fingerprint, KeyRound, RefreshCw, Shuffle, Sparkles, Trash2 } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { copyToClipboard } from '../../utils/storage';
import { Panel, Segmented, EmptyHint, StatChip } from './shared';

/* ------------------------------ ID generators ------------------------------ */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function uuidV4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uuidV7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const now = BigInt(Date.now());
  // 48-bit big-endian timestamp
  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((now >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ulid(): string {
  const time = BigInt(Date.now());
  let timeStr = '';
  let t = time;
  for (let i = 0; i < 10; i++) {
    timeStr = CROCKFORD[Number(t % 32n)] + timeStr;
    t /= 32n;
  }
  const random = crypto.getRandomValues(new Uint8Array(16));
  let randStr = '';
  for (let i = 0; i < 16; i++) randStr += CROCKFORD[random[i] % 32];
  return timeStr + randStr;
}

const NANO_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
function nanoId(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes).map((b) => NANO_ALPHABET[b % NANO_ALPHABET.length]).join('');
}

function randomInt(max: number): number {
  // rejection sampling for unbiased results
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

/* ------------------------------ passwords ------------------------------ */

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~',
  ambiguous: 'Il1O0o',
};

interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
  requireEach: boolean;
}

function buildAlphabet(opts: PasswordOptions): string {
  let alphabet = '';
  if (opts.lower) alphabet += SETS.lower;
  if (opts.upper) alphabet += SETS.upper;
  if (opts.digits) alphabet += SETS.digits;
  if (opts.symbols) alphabet += SETS.symbols;
  if (opts.excludeAmbiguous) {
    alphabet = Array.from(alphabet).filter((c) => !SETS.ambiguous.includes(c)).join('');
  }
  return alphabet || SETS.lower;
}

function generatePassword(opts: PasswordOptions): string {
  const alphabet = buildAlphabet(opts);
  const length = Math.max(4, Math.min(128, opts.length));
  const chars: string[] = [];
  if (opts.requireEach) {
    const groups: string[] = [];
    if (opts.lower) groups.push(SETS.lower);
    if (opts.upper) groups.push(SETS.upper);
    if (opts.digits) groups.push(SETS.digits);
    if (opts.symbols) groups.push(SETS.symbols);
    for (const group of groups) {
      const filtered = opts.excludeAmbiguous ? Array.from(group).filter((c) => !SETS.ambiguous.includes(c)) : Array.from(group);
      if (filtered.length && chars.length < length) chars.push(filtered[randomInt(filtered.length)]);
    }
  }
  while (chars.length < length) chars.push(alphabet[randomInt(alphabet.length)]);
  // uniform Fisher–Yates shuffle using crypto randomness
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function entropyBits(alphabetSize: number, length: number): number {
  if (alphabetSize <= 1) return 0;
  return Math.log2(alphabetSize) * length;
}

function strengthLabel(bits: number): { label: string; tone: 'red' | 'gold' | 'mint'; note: string } {
  if (bits < 45) return { label: 'Weak', tone: 'red', note: 'Crackable in hours with modern GPUs.' };
  if (bits < 70) return { label: 'Reasonable', tone: 'gold', note: 'Fine for low-value accounts with rate limiting.' };
  if (bits < 100) return { label: 'Strong', tone: 'mint', note: 'Good for personal accounts and API tokens.' };
  return { label: 'Excellent', tone: 'mint', note: 'Well beyond brute-force reach with current hardware.' };
}

/* ------------------------------- component ------------------------------- */

type Tab = 'uuid' | 'password';
type IdKind = 'v4' | 'v7' | 'ulid' | 'nanoid';

export const UuidPasswordGeneratorTool: React.FC = () => {
  const [tab, setTab] = useState<Tab>('uuid');

  /* ids */
  const [idKind, setIdKind] = useState<IdKind>('v4');
  const [count, setCount] = useState(10);
  const [ids, setIds] = useState<string[]>([]);
  const [upperCase, setUpperCase] = useState(false);
  const [braces, setBraces] = useState(false);

  /* passwords */
  const [passwordCount, setPasswordCount] = useState(5);
  const [options, setOptions] = useState<PasswordOptions>({
    length: 20, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false, requireEach: true,
  });
  const [passwords, setPasswords] = useState<string[]>([]);
  const [reveal, setReveal] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);

  const makeIds = useCallback(() => {
    const n = Math.max(1, Math.min(500, count));
    const out: string[] = [];
    const seen = new Set<string>();
    let guard = 0;
    while (out.length < n && guard++ < n * 20) {
      let value: string;
      switch (idKind) {
        case 'v4': value = uuidV4(); break;
        case 'v7': value = uuidV7(); break;
        case 'ulid': value = ulid(); break;
        default: value = nanoId(); break;
      }
      if (seen.has(value)) continue;
      seen.add(value);
      if (upperCase) value = value.toUpperCase();
      if (braces && idKind !== 'ulid' && idKind !== 'nanoid') value = `{${value}}`;
      out.push(value);
    }
    setIds(out);
    soundEngine.playPop(1.1);
  }, [count, idKind, upperCase, braces]);

  const makePasswords = useCallback(() => {
    const n = Math.max(1, Math.min(500, passwordCount));
    const out: string[] = [];
    const seen = new Set<string>();
    let guard = 0;
    while (out.length < n && guard++ < n * 20) {
      const pw = generatePassword(options);
      if (seen.has(pw)) continue;
      seen.add(pw);
      out.push(pw);
    }
    setPasswords(out);
    soundEngine.playPop(1.1);
  }, [passwordCount, options]);

  useEffect(() => { makeIds(); /* initial fill */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { makePasswords(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alphabetSize = useMemo(() => {
    let size = 0;
    if (options.lower) size += 26;
    if (options.upper) size += 26;
    if (options.digits) size += 10;
    if (options.symbols) size += SETS.symbols.length;
    if (options.excludeAmbiguous) size -= Math.min(size, 5);
    return Math.max(size, 1);
  }, [options]);

  const bits = entropyBits(alphabetSize, options.length);
  const strength = strengthLabel(bits);

  const idExplanation = useMemo(() => {
    switch (idKind) {
      case 'v4': return 'UUID v4 — 122 bits of CSPRNG randomness with version/variant bits set. Universal, sortable nowhere.';
      case 'v7': return 'UUID v7 — 48-bit Unix millisecond prefix followed by randomness, so IDs sort by creation time.';
      case 'ulid': return 'ULID — 48-bit timestamp + 80 random bits encoded in Crockford base32 (26 chars, lexicographically sortable).';
      default: return 'NanoID — 21 characters from a 64-symbol alphabet (~126 bits) using the URL-safe default alphabet.';
    }
  }, [idKind]);

  const copyAllIds = async () => {
    const ok = await copyToClipboard(ids.join('\n'));
    if (ok) {
      soundEngine.playPop(1.2);
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1500);
    }
  };

  return (
    <div className="space-y-3">
      <Segmented
        value={tab}
        onChange={(id) => { soundEngine.playClick(); setTab(id as Tab); }}
        options={[
          { id: 'uuid', label: 'UUID / ULID / NanoID', icon: <Fingerprint className="w-3 h-3" /> },
          { id: 'password', label: 'Passwords', icon: <KeyRound className="w-3 h-3" /> },
        ]}
      />

      {tab === 'uuid' && (
        <div className="space-y-3">
          <div className="toy-card p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={idKind}
                onChange={(id) => { soundEngine.playClick(); setIdKind(id as IdKind); }}
                options={[
                  { id: 'v4', label: 'UUID v4' },
                  { id: 'v7', label: 'UUID v7' },
                  { id: 'ulid', label: 'ULID' },
                  { id: 'nanoid', label: 'NanoID' },
                ]}
              />
              <button
                type="button"
                onClick={() => { soundEngine.playClick(); setUpperCase((v) => !v); }}
                aria-pressed={upperCase}
                className={`toy-btn px-2 py-1 text-[10.5px] ${upperCase ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-[#FFFDF8] border-[#D4AA78] text-[#7A5535]'}`}
              >
                UPPERCASE
              </button>
              <button
                type="button"
                onClick={() => { soundEngine.playClick(); setBraces((v) => !v); }}
                aria-pressed={braces}
                className={`toy-btn px-2 py-1 text-[10.5px] ${braces ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-[#FFFDF8] border-[#D4AA78] text-[#7A5535]'}`}
              >
                {'{…}'} braces
              </button>
              <div className="flex-1" />
              <label className="flex items-center gap-1.5 text-[10.5px] text-[#6B4423] font-bold">
                Count
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  className="toy-input w-16 py-1 px-2 font-mono text-[11px]"
                  aria-label="Number of IDs"
                />
              </label>
              <button type="button" onClick={makeIds} className="toy-btn-mint px-3 py-1 text-[10.5px]">
                <RefreshCw className="w-3.5 h-3.5" /> Generate
              </button>
            </div>
            <p className="text-[10.5px] text-[#8A6748]">{idExplanation}</p>
          </div>

          <Panel
            title={`${ids.length} ${idKind === 'ulid' ? 'ULIDs' : idKind === 'nanoid' ? 'NanoIDs' : 'UUIDs'}`}
            icon={<Fingerprint className="w-3.5 h-3.5" />}
            actions={
              <div className="flex items-center gap-1.5">
                <StatChip label="unique" value={new Set(ids).size === ids.length ? 'yes' : 'no'} tone="mint" />
                <button type="button" onClick={() => void copyAllIds()} className="toy-btn-cream px-2 py-1 text-[10px]">
                  {copiedAll ? <Check className="w-3 h-3 text-[#16A34A]" /> : <Copy className="w-3 h-3" />}
                  {copiedAll ? 'Copied!' : 'Copy all'}
                </button>
              </div>
            }
          >
            <div className="max-h-[20rem] overflow-auto rounded-lg border-2 border-[#E2C6A2]">
              {ids.map((id, idx) => (
                <div
                  key={`${id}-${idx}`}
                  className={`flex items-center gap-2 px-2 py-1 font-mono text-[11px] ${idx % 2 ? 'bg-[#FFFDF9]' : 'bg-white'}`}
                >
                  <span className="w-7 shrink-0 text-right text-[#C4A88C] text-[10px] select-none">{idx + 1}</span>
                  <span className="flex-1 break-all text-[#3B2314] select-all">{id}</span>
                  <CopyButton text={id} label="" />
                </div>
              ))}
              {ids.length === 0 && <div className="p-3"><EmptyHint>Press Generate to mint IDs.</EmptyHint></div>}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'password' && (
        <div className="space-y-3">
          <div className="toy-card p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[10.5px] font-bold text-[#6B4423]">
                Length
                <input
                  type="range"
                  min={8}
                  max={64}
                  value={options.length}
                  onChange={(e) => setOptions((o) => ({ ...o, length: Number(e.target.value) }))}
                  className="w-32 accent-[#16A34A]"
                  aria-label="Password length"
                />
                <span className="font-mono text-[11px] text-[#3B2314] w-6 text-center">{options.length}</span>
              </label>
              {([
                ['lower', 'a-z'],
                ['upper', 'A-Z'],
                ['digits', '0-9'],
                ['symbols', '!@#'],
                ['excludeAmbiguous', 'no Il1O0o'],
                ['requireEach', 'require each set'],
              ] as [keyof PasswordOptions, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { soundEngine.playClick(); setOptions((o) => ({ ...o, [key]: !o[key] })); }}
                  aria-pressed={Boolean(options[key])}
                  className={`toy-btn px-2 py-1 text-[10.5px] ${
                    options[key] ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-[#FFFDF8] border-[#D4AA78] text-[#7A5535]'
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="flex-1" />
              <label className="flex items-center gap-1.5 text-[10.5px] text-[#6B4423] font-bold">
                Count
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={passwordCount}
                  onChange={(e) => setPasswordCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  className="toy-input w-16 py-1 px-2 font-mono text-[11px]"
                  aria-label="Number of passwords"
                />
              </label>
              <button type="button" onClick={makePasswords} className="toy-btn-mint px-3 py-1 text-[10.5px]">
                <Shuffle className="w-3.5 h-3.5" /> Generate
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[12rem]">
                <div className="flex items-center justify-between text-[10px] text-[#8A6748] mb-0.5">
                  <span className="font-bold">Entropy</span>
                  <span className="font-mono">{bits.toFixed(1)} bits</span>
                </div>
                <div className="h-2.5 rounded-full bg-[#F0E2CE] overflow-hidden border border-[#E2C6A2]" role="meter" aria-valuemin={0} aria-valuemax={128} aria-valuenow={Math.min(128, Math.round(bits))} aria-label="Password entropy">
                  <div
                    className={`h-full transition-all ${
                      strength.tone === 'red' ? 'bg-[#EF4444]' : strength.tone === 'gold' ? 'bg-[#F59E0B]' : 'bg-[#22C55E]'
                    }`}
                    style={{ width: `${Math.min(100, (bits / 128) * 100)}%` }}
                  />
                </div>
              </div>
              <span className={`toy-pill text-[10px] ${
                strength.tone === 'red' ? 'bg-[#FEF2F2] border-[#FCA5A5] text-[#7F1D1D]'
                  : strength.tone === 'gold' ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#78350F]'
                    : 'bg-[#F0FDF4] border-[#86EFAC] text-[#14532D]'
              }`}>
                <Sparkles className="w-3 h-3" /> {strength.label}
              </span>
              <span className="text-[10px] text-[#A98768]">{strength.note} Alphabet: {alphabetSize} symbols.</span>
            </div>
          </div>

          <Panel
            title={`${passwords.length} password${passwords.length === 1 ? '' : 's'}`}
            icon={<KeyRound className="w-3.5 h-3.5" />}
            actions={
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => { soundEngine.playClick(); setReveal((v) => !v); }} className="toy-btn-cream px-2 py-1 text-[10px]">
                  {reveal ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {reveal ? 'Hide' : 'Reveal'}
                </button>
                <CopyButton text={passwords.join('\n')} label="Copy all" />
              </div>
            }
          >
            <div className="max-h-[22rem] overflow-auto rounded-lg border-2 border-[#E2C6A2]">
              {passwords.map((pw, idx) => (
                <div key={`${pw}-${idx}`} className={`flex items-center gap-2 px-2 py-1 font-mono text-[11px] ${idx % 2 ? 'bg-[#FFFDF9]' : 'bg-white'}`}>
                  <span className="w-7 shrink-0 text-right text-[#C4A88C] text-[10px] select-none">{idx + 1}</span>
                  <span className="flex-1 break-all text-[#3B2314] select-all">{reveal ? pw : '•'.repeat(pw.length)}</span>
                  <span className="text-[9px] text-[#A98768] shrink-0">{Math.round(entropyBits(alphabetSize, pw.length))} b</span>
                  <CopyButton text={pw} label="" />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-[#A98768]">
                Fisher–Yates shuffle driven by crypto.getRandomValues with rejection sampling — no modulo bias.
              </p>
              <button
                type="button"
                onClick={() => { setPasswords([]); soundEngine.playClick(); }}
                className="toy-pill bg-[#FEE2E2] border-[#FCA5A5] text-[#7F1D1D]"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};

export default UuidPasswordGeneratorTool;
