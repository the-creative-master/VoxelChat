import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, FileUp, Fingerprint, RefreshCw, ShieldCheck, ShieldX, X, Cpu, Binary } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, Segmented, ErrorBanner, EmptyHint, StatChip } from './shared';

/* ----------------------------- pure JS MD5 ----------------------------- */

function md5(input: Uint8Array): string {
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

  const originalLength = input.length;
  const bitLen = originalLength * 8;
  const withOne = originalLength + 1;
  const paddedLen = (((withOne + 8) + 63) & ~63);
  const padded = new Uint8Array(paddedLen);
  padded.set(input);
  padded[originalLength] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 4294967296), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const rotl = (x: number, c: number) => ((x << c) | (x >>> (32 - c))) >>> 0;

  for (let offset = 0; offset < paddedLen; offset += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(offset + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const tmp = D;
      D = C;
      C = B;
      B = (B + rotl((A + F + K[i] + M[g]) >>> 0, s[i])) >>> 0;
      A = tmp;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const toHexLE = (n: number) => {
    let hex = '';
    for (let i = 0; i < 4; i++) hex += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return hex;
  };
  return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
}

async function sha(algo: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512', data: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest(algo, data as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* -------------------------------- tool -------------------------------- */

type InputMode = 'text' | 'file';

interface HashRow { name: string; value: string; bits: number }

export const HashGeneratorTool: React.FC = () => {
  const [mode, setMode] = useState<InputMode>('text');
  const [text, setText] = useState('BiteSizedUtilities — waffle-fresh hashing, zero uploads.');
  const [fileData, setFileData] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(null);
  const [expected, setExpected] = useState('');
  const [hashes, setHashes] = useState<HashRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');

  const compute = useCallback(async () => {
    const bytes = mode === 'file' ? fileData?.bytes : new TextEncoder().encode(text);
    if (!bytes) {
      setHashes([]);
      return;
    }
    setBusy(true);
    try {
      const [sha1, sha256, sha384, sha512] = await Promise.all([
        sha('SHA-1', bytes),
        sha('SHA-256', bytes),
        sha('SHA-384', bytes),
        sha('SHA-512', bytes),
      ]);
      setHashes([
        { name: 'MD5', value: md5(bytes), bits: 128 },
        { name: 'SHA-1', value: sha1, bits: 160 },
        { name: 'SHA-256', value: sha256, bits: 256 },
        { name: 'SHA-384', value: sha384, bits: 384 },
        { name: 'SHA-512', value: sha512, bits: 512 },
      ]);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [mode, text, fileData]);

  useEffect(() => {
    void compute();
  }, [compute]);

  const handleFile = async (file: File) => {
    setFileError('');
    if (file.size > 64 * 1024 * 1024) {
      setFileError('Files above 64 MiB are skipped to keep the tab responsive.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      setFileData({ name: file.name, size: file.size, bytes: new Uint8Array(buffer) });
      soundEngine.playSuccess();
    } catch {
      setFileError('Could not read that file.');
    }
  };

  const matchResult = useMemo(() => {
    const clean = expected.trim().toLowerCase();
    if (!clean) return null;
    const found = hashes.find((h) => h.value.toLowerCase() === clean);
    if (found) return { ok: true as const, algorithm: found.name };
    const prefixMatch = hashes.find((h) => h.value.toLowerCase().startsWith(clean.slice(0, 8)));
    return { ok: false as const, nearMiss: prefixMatch?.name };
  }, [expected, hashes]);

  const byteLength = mode === 'file' ? fileData?.size ?? 0 : new TextEncoder().encode(text).length;

  return (
    <div className="space-y-3">
      <div className="toy-card p-2.5 flex flex-wrap items-center gap-2">
        <Segmented
          value={mode}
          onChange={(id) => { soundEngine.playClick(); setMode(id as InputMode); }}
          options={[
            { id: 'text', label: 'Text', icon: <Binary className="w-3 h-3" /> },
            { id: 'file', label: 'File', icon: <FileUp className="w-3 h-3" /> },
          ]}
        />
        <span className="text-[10px] text-[#A98768]">
          {mode === 'text' ? 'UTF-8 encoded before hashing' : 'Read locally with the File API — the bytes never leave this tab'}
        </span>
        <div className="flex-1" />
        <StatChip label="bytes" value={byteLength} tone="cream" />
        <button type="button" onClick={() => void compute()} disabled={busy} className="toy-btn-cream px-2.5 py-1 text-[10.5px]">
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Recompute
        </button>
      </div>

      {mode === 'text' ? (
        <Panel title="Input text" icon={<Fingerprint className="w-3.5 h-3.5" />} actions={<CopyButton text={text} />}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            aria-label="Text to hash"
            className="w-full h-28 rounded-lg bg-[#FFFDF9] border-2 border-[#DEC098] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#3B2314] focus:outline-none focus:border-[#D97706] resize-none"
          />
        </Panel>
      ) : (
        <Panel title="File digest" icon={<FileUp className="w-3.5 h-3.5" />}>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) void handleFile(file); }}
            className="rounded-xl border-2 border-dashed border-[#D9B68C] bg-[#FFF8EB] p-5 text-center"
          >
            <FileUp className="w-7 h-7 text-[#C98A4B] mx-auto mb-1.5" />
            <p className="text-xs font-bold text-[#6B4423]">Drop a file to fingerprint it</p>
            <p className="text-[10.5px] text-[#A98768] mb-2">Up to 64 MiB · streamed into memory only</p>
            <label className="toy-btn-mint px-3 py-1.5 text-[11px] cursor-pointer inline-flex">
              Choose file
              <input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFile(file); e.target.value = ''; }} />
            </label>
          </div>
          {fileError && <div className="mt-2"><ErrorBanner message={fileError} /></div>}
          {fileData && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatChip label="file" value={fileData.name} tone="cream" />
              <StatChip label="size" value={`${(fileData.size / 1024).toFixed(1)} KiB`} tone="gold" />
              <button type="button" onClick={() => { setFileData(null); soundEngine.playClick(); }} className="toy-pill bg-[#FEE2E2] border-[#FCA5A5] text-[#7F1D1D]">
                <X className="w-3 h-3" /> Remove
              </button>
            </div>
          )}
        </Panel>
      )}

      <Panel
        title="Digests"
        icon={<Cpu className="w-3.5 h-3.5" />}
        actions={
          <CopyButton
            text={hashes.map((h) => `${h.name}: ${h.value}`).join('\n')}
            label="Copy all"
          />
        }
      >
        <div className="space-y-1.5">
          {hashes.map((h) => {
            const isMatch = expected.trim() && expected.trim().toLowerCase() === h.value.toLowerCase();
            return (
              <div
                key={h.name}
                className={`rounded-lg border-2 px-2.5 py-1.5 ${isMatch ? 'bg-[#F0FDF4] border-[#16A34A]' : 'bg-[#FFFDF9] border-[#E2C6A2]'}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-[10.5px] font-bold text-[#8B5A2B] w-16">{h.name}</span>
                  <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423] text-[9px]">{h.bits}-bit</span>
                  <div className="flex-1" />
                  {isMatch && <span className="toy-pill bg-[#DCFCE7] border-[#16A34A] text-[#14532D] text-[9px]"><Check className="w-2.5 h-2.5" /> match</span>}
                  <CopyButton text={h.value} label="Copy" />
                </div>
                <code className="block font-mono text-[10.5px] leading-relaxed text-[#3B2314] break-all select-all">{h.value}</code>
              </div>
            );
          })}
          {hashes.length === 0 && !busy && <EmptyHint>Provide text or a file to compute digests.</EmptyHint>}
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Verify a checksum" icon={<ShieldCheck className="w-3.5 h-3.5" />}>
          <input
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            placeholder="Paste an MD5 or SHA digest to compare"
            aria-label="Expected checksum"
            className="toy-input font-mono text-[11px]"
          />
          {matchResult && (
            <div
              className={`mt-2 rounded-lg border-2 px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1.5 ${
                matchResult.ok ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#14532D]' : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#7F1D1D]'
              }`}
            >
              {matchResult.ok ? (
                <><ShieldCheck className="w-3.5 h-3.5" /> Matches the {matchResult.algorithm} digest.</>
              ) : (
                <><ShieldX className="w-3.5 h-3.5" /> No exact match{matchResult.nearMiss ? ` — but the leading hex resembles ${matchResult.nearMiss}.` : '.'}</>
              )}
            </div>
          )}
          <p className="mt-2 text-[10px] text-[#A98768]">
            MD5 is computed by a bundled pure-JS implementation for legacy compatibility. It is insecure for
            passwords and signatures — prefer SHA-256 upwards.
          </p>
        </Panel>

        <Panel title="Quick reference" icon={<Fingerprint className="w-3.5 h-3.5" />}>
          <ul className="space-y-1.5 text-[11px] text-[#6B4423]">
            <li className="flex gap-2">
              <span className="font-mono font-bold text-[#8B5A2B] w-16 shrink-0">MD5</span>
              <span>128-bit · fast, broken for collision resistance, still used by non-security checksums.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono font-bold text-[#8B5A2B] w-16 shrink-0">SHA-1</span>
              <span>160-bit · deprecated for signatures (SHAttered collisions), fine for git-style object IDs.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono font-bold text-[#8B5A2B] w-16 shrink-0">SHA-256</span>
              <span>256-bit · the default choice for integrity checks and content addressing.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono font-bold text-[#8B5A2B] w-16 shrink-0">SHA-384</span>
              <span>384-bit truncated SHA-512 · faster on 64-bit hardware than SHA-256.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono font-bold text-[#8B5A2B] w-16 shrink-0">SHA-512</span>
              <span>512-bit · strongest here; use for large files where throughput matters.</span>
            </li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="toy-pill bg-[#F0FDF4] border-[#86EFAC] text-[#14532D] text-[9.5px]">WebCrypto native</span>
            <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423] text-[9.5px]">zero uploads</span>
            <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423] text-[9.5px]">base64url: {hashes[2] ? toBase64Url(new TextEncoder().encode(hashes[2].value.slice(0, 16))) : '—'}</span>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default HashGeneratorTool;
