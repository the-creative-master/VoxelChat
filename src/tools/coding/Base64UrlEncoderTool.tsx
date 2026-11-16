import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Binary, FileImage, FileUp, Link2, Trash2, Braces, Check, AlertTriangle } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, Segmented, ErrorBanner, EmptyHint, StatChip } from './shared';

/* --------------------------- UTF-8 safe base64 --------------------------- */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(text: string, urlSafe: boolean): string {
  let out = bytesToBase64(new TextEncoder().encode(text));
  if (urlSafe) out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return out;
}

function decodeBase64(text: string): string {
  const cleaned = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4);
  const bytes = base64ToBytes(padded);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

/* ------------------------------ URL helpers ------------------------------ */

function encodeComponent(text: string, mode: 'component' | 'uri'): string {
  return mode === 'component' ? encodeURIComponent(text) : encodeURI(text);
}

function decodeComponent(text: string, mode: 'component' | 'uri'): string {
  return mode === 'component' ? decodeURIComponent(text) : decodeURI(text);
}

interface QueryParam { key: string; value: string; enabled: boolean }

function parseQuery(text: string): QueryParam[] {
  const trimmed = text.trim().replace(/^[?#]/, '');
  if (!trimmed) return [];
  return trimmed.split('&').filter(Boolean).map((pair) => {
    const eq = pair.indexOf('=');
    if (eq < 0) return { key: safeDecode(pair), value: '', enabled: true };
    return { key: safeDecode(pair.slice(0, eq)), value: safeDecode(pair.slice(eq + 1)), enabled: true };
  });
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

function buildQuery(params: QueryParam[]): string {
  return params
    .filter((p) => p.enabled && (p.key || p.value))
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
}

/* ------------------------------- tool ------------------------------- */

type Base64Mode = 'encode' | 'decode';

export const Base64UrlEncoderTool: React.FC = () => {
  const [b64Mode, setB64Mode] = useState<Base64Mode>('encode');
  const [b64Input, setB64Input] = useState('WaffleCode — 100% local, no uploads. ✓');
  const [urlSafe, setUrlSafe] = useState(false);
  const [activePanel, setActivePanel] = useState<'base64' | 'url' | 'file'>('base64');

  /* URL state */
  const [urlInput, setUrlInput] = useState('https://example.com/search?q=waffle kitchen&tag=offline&tag=privacy');
  const [urlEncodingMode, setUrlEncodingMode] = useState<'component' | 'uri'>('component');
  const [params, setParams] = useState<QueryParam[]>(() => parseQuery('https://example.com/search?q=waffle kitchen&tag=offline&tag=privacy'));

  /* File state */
  const [dataUri, setDataUri] = useState('');
  const [fileMeta, setFileMeta] = useState<{ name: string; type: string; size: number } | null>(null);
  const [fileError, setFileError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const b64Output = useMemo(() => {
    if (!b64Input) return { text: '', error: '' };
    try {
      if (b64Mode === 'encode') return { text: encodeBase64(b64Input, urlSafe), error: '' };
      return { text: decodeBase64(b64Input), error: '' };
    } catch (err) {
      return { text: '', error: err instanceof Error ? err.message : String(err) };
    }
  }, [b64Input, b64Mode, urlSafe]);

  const urlEncoded = useMemo(() => {
    try {
      return { text: encodeComponent(urlInput, urlEncodingMode), error: '' };
    } catch (err) {
      return { text: '', error: err instanceof Error ? err.message : String(err) };
    }
  }, [urlInput, urlEncodingMode]);

  const urlDecoded = useMemo(() => {
    try {
      return { text: decodeComponent(urlInput, urlEncodingMode), error: '' };
    } catch (err) {
      return { text: '', error: err instanceof Error ? err.message : String(err) };
    }
  }, [urlInput, urlEncodingMode]);

  const queryString = useMemo(() => buildQuery(params), [params]);

  const swapB64 = useCallback(() => {
    soundEngine.playPop(1.1);
    const next = b64Output.text;
    if (!next) return;
    setB64Input(next);
    setB64Mode(b64Mode === 'encode' ? 'decode' : 'encode');
  }, [b64Output.text, b64Mode]);

  const handleFile = useCallback((file: File) => {
    setFileError('');
    if (file.size > 4 * 1024 * 1024) {
      setFileError('This file is larger than 4 MiB. Data URIs of that size can crash a browser tab — pick something smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      setDataUri(result);
      setFileMeta({ name: file.name, type: file.type || 'application/octet-stream', size: file.size });
      soundEngine.playSuccess();
    };
    reader.onerror = () => setFileError('Could not read that file.');
    reader.readAsDataURL(file);
  }, []);

  const isImage = fileMeta?.type.startsWith('image/');

  return (
    <div className="space-y-3">
      <Segmented
        value={activePanel}
        onChange={(id) => { soundEngine.playClick(); setActivePanel(id as 'base64' | 'url' | 'file'); }}
        options={[
          { id: 'base64', label: 'Base64', icon: <Binary className="w-3 h-3" /> },
          { id: 'url', label: 'URL & query', icon: <Link2 className="w-3 h-3" /> },
          { id: 'file', label: 'File → Data URI', icon: <FileImage className="w-3 h-3" /> },
        ]}
      />

      {activePanel === 'base64' && (
        <div className="space-y-3">
          <div className="toy-card p-2.5 flex flex-wrap items-center gap-2">
            <Segmented
              value={b64Mode}
              onChange={(id) => { soundEngine.playClick(); setB64Mode(id as Base64Mode); }}
              options={[
                { id: 'encode', label: 'Encode' },
                { id: 'decode', label: 'Decode' },
              ]}
            />
            <button
              type="button"
              onClick={() => { soundEngine.playClick(); setUrlSafe((v) => !v); }}
              aria-pressed={urlSafe}
              className={`toy-btn px-2.5 py-1 text-[10.5px] ${urlSafe ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-[#FFFDF8] border-[#D4AA78] text-[#7A5535]'}`}
              title="Use the URL-safe alphabet (+/ → -_) and strip padding"
            >
              base64url alphabet
            </button>
            <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423] text-[10px]">UTF-8 aware</span>
            <div className="flex-1" />
            <button type="button" onClick={swapB64} className="toy-btn-gold px-2.5 py-1 text-[10.5px]">
              <ArrowLeftRight className="w-3.5 h-3.5" /> Swap
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Panel
              title={b64Mode === 'encode' ? 'Plain text' : 'Base64 input'}
              icon={<Braces className="w-3.5 h-3.5" />}
              actions={<CopyButton text={b64Input} />}
            >
              <textarea
                value={b64Input}
                onChange={(e) => setB64Input(e.target.value)}
                spellCheck={false}
                aria-label="Base64 input"
                className="w-full h-56 rounded-lg bg-[#FFFDF9] border-2 border-[#DEC098] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#3B2314] focus:outline-none focus:border-[#D97706] resize-none"
                placeholder={b64Mode === 'encode' ? 'Type or paste UTF-8 text…' : 'Paste Base64 or base64url…'}
              />
              <p className="mt-1.5 text-[10px] text-[#A98768]">
                {new TextEncoder().encode(b64Input).length} bytes · {Array.from(b64Input).length} code points
              </p>
            </Panel>
            <Panel
              title={b64Mode === 'encode' ? 'Base64 output' : 'Decoded UTF-8'}
              icon={<Binary className="w-3.5 h-3.5" />}
              actions={
                <div className="flex items-center gap-1.5">
                  <StatChip label="len" value={b64Output.text.length} tone="mint" />
                  <CopyButton text={b64Output.text} />
                </div>
              }
            >
              {b64Output.error ? (
                <div className="space-y-2">
                  <ErrorBanner message={b64Output.error} />
                  <EmptyHint>Base64 input must use the standard or URL-safe alphabet and be correctly padded.</EmptyHint>
                </div>
              ) : (
                <textarea
                  value={b64Output.text}
                  readOnly
                  spellCheck={false}
                  aria-label="Base64 output"
                  className="w-full h-56 rounded-lg bg-[#F7FDF9] border-2 border-[#A7D8B9] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#14532D] focus:outline-none resize-none"
                  placeholder="Converted value appears here…"
                />
              )}
              {!b64Output.error && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423]">
                    {urlSafe ? 'base64url (no padding)' : 'standard base64'}
                  </span>
                  <span className="toy-pill bg-[#F0FDF4] border-[#86EFAC] text-[#14532D]">
                    <Check className="w-3 h-3" /> round-trip safe
                  </span>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {activePanel === 'url' && (
        <div className="space-y-3">
          <div className="toy-card p-2.5 flex flex-wrap items-center gap-2">
            <Segmented
              value={urlEncodingMode}
              onChange={(id) => { soundEngine.playClick(); setUrlEncodingMode(id as 'component' | 'uri'); }}
              options={[
                { id: 'component', label: 'encodeURIComponent' },
                { id: 'uri', label: 'encodeURI' },
              ]}
            />
            <span className="text-[10px] text-[#A98768]">
              {urlEncodingMode === 'component' ? 'Escapes / ? : @ & = + $ , #' : 'Keeps URL structure characters intact'}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => { soundEngine.playPop(1.1); setUrlInput(urlEncoded.text); }}
              className="toy-btn-mint px-2 py-1 text-[10.5px]"
            >
              Encode ↑
            </button>
            <button
              type="button"
              onClick={() => { soundEngine.playPop(1.05); setUrlInput(urlDecoded.text); }}
              className="toy-btn-cream px-2 py-1 text-[10.5px]"
            >
              Decode ↓
            </button>
          </div>

          <Panel title="URL / text" icon={<Link2 className="w-3.5 h-3.5" />} actions={<CopyButton text={urlInput} />}>
            <textarea
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setParams(parseQuery(e.target.value.split('?')[1] ?? '')); }}
              spellCheck={false}
              aria-label="URL input"
              className="w-full h-24 rounded-lg bg-[#FFFDF9] border-2 border-[#DEC098] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#3B2314] focus:outline-none focus:border-[#D97706] resize-none"
            />
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Panel title="Encoded" icon={<Braces className="w-3.5 h-3.5" />} actions={<CopyButton text={urlEncoded.text} />}>
              {urlEncoded.error ? <ErrorBanner message={urlEncoded.error} /> : (
                <textarea
                  value={urlEncoded.text}
                  readOnly
                  className="w-full h-24 rounded-lg bg-[#F7FDF9] border-2 border-[#A7D8B9] p-2.5 font-mono text-[11.5px] break-all text-[#14532D] focus:outline-none resize-none"
                  aria-label="URL encoded output"
                />
              )}
            </Panel>
            <Panel title="Decoded" icon={<Braces className="w-3.5 h-3.5" />} actions={<CopyButton text={urlDecoded.text} />}>
              {urlDecoded.error ? <ErrorBanner message={urlDecoded.error} /> : (
                <textarea
                  value={urlDecoded.text}
                  readOnly
                  className="w-full h-24 rounded-lg bg-[#FFFDF9] border-2 border-[#DEC098] p-2.5 font-mono text-[11.5px] break-all text-[#3B2314] focus:outline-none resize-none"
                  aria-label="URL decoded output"
                />
              )}
            </Panel>
          </div>

          <Panel
            title="Query string builder"
            icon={<Link2 className="w-3.5 h-3.5" />}
            actions={<CopyButton text={queryString} label="Copy query" />}
          >
            <div className="space-y-1.5">
              {params.map((param, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={param.enabled}
                    onChange={(e) => setParams((prev) => prev.map((p, i) => (i === idx ? { ...p, enabled: e.target.checked } : p)))}
                    aria-label={`Enable parameter ${idx + 1}`}
                    className="w-3.5 h-3.5 accent-[#16A34A]"
                  />
                  <input
                    value={param.key}
                    onChange={(e) => setParams((prev) => prev.map((p, i) => (i === idx ? { ...p, key: e.target.value } : p)))}
                    placeholder="key"
                    className="toy-input flex-1 font-mono text-[11px] py-1"
                    aria-label={`Parameter ${idx + 1} key`}
                  />
                  <span className="text-[#A98768] font-mono">=</span>
                  <input
                    value={param.value}
                    onChange={(e) => setParams((prev) => prev.map((p, i) => (i === idx ? { ...p, value: e.target.value } : p)))}
                    placeholder="value"
                    className="toy-input flex-1 font-mono text-[11px] py-1"
                    aria-label={`Parameter ${idx + 1} value`}
                  />
                  <button
                    type="button"
                    onClick={() => { soundEngine.playClick(); setParams((prev) => prev.filter((_, i) => i !== idx)); }}
                    className="text-[#B91C1C] hover:text-[#7F1D1D]"
                    aria-label={`Remove parameter ${idx + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => { soundEngine.playPop(1.15); setParams((prev) => [...prev, { key: '', value: '', enabled: true }]); }}
                className="toy-btn-cream px-2 py-1 text-[10.5px]"
              >
                + Add parameter
              </button>
            </div>
            <div className="mt-2 rounded-lg bg-[#FFF8EB] border-2 border-[#E6C79C] p-2">
              <code className="text-[11px] font-mono text-[#6B4423] break-all">{queryString ? `?${queryString}` : '(empty query string)'}</code>
            </div>
          </Panel>
        </div>
      )}

      {activePanel === 'file' && (
        <div className="space-y-3">
          <Panel title="File → Data URI" icon={<FileImage className="w-3.5 h-3.5" />}>
            <div
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) handleFile(file); }}
              className="rounded-xl border-2 border-dashed border-[#D9B68C] bg-[#FFF8EB] p-6 text-center"
            >
              <FileUp className="w-8 h-8 text-[#C98A4B] mx-auto mb-2" />
              <p className="text-xs font-bold text-[#6B4423] mb-1">Drop an image or file here</p>
              <p className="text-[10.5px] text-[#A98768] mb-3">Files stay in your browser — nothing is uploaded. Maximum 4 MiB.</p>
              <button type="button" onClick={() => fileRef.current?.click()} className="toy-btn-mint px-3 py-1.5 text-[11px]">
                Choose file
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ''; }}
              />
            </div>
            {fileError && <div className="mt-2"><ErrorBanner message={fileError} /></div>}
            {fileMeta && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <StatChip label="file" value={fileMeta.name} tone="cream" />
                <StatChip label="type" value={fileMeta.type} tone="gold" />
                <StatChip label="size" value={formatBytes(fileMeta.size)} tone="mint" />
                <StatChip label="data URI" value={formatBytes(dataUri.length)} tone="cream" />
                <button type="button" onClick={() => { setDataUri(''); setFileMeta(null); soundEngine.playClick(); }} className="toy-pill bg-[#FEE2E2] border-[#FCA5A5] text-[#7F1D1D]">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              </div>
            )}
          </Panel>

          {dataUri && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {isImage && (
                <Panel title="Image preview" icon={<FileImage className="w-3.5 h-3.5" />}>
                  <div className="rounded-lg border-2 border-[#E2C6A2] bg-[#FFF8EB] p-2 flex items-center justify-center min-h-[10rem]">
                    <img src={dataUri} alt={`Preview of ${fileMeta?.name ?? 'uploaded file'}`} className="max-h-64 max-w-full rounded object-contain" />
                  </div>
                </Panel>
              )}
              <Panel title="Data URI" icon={<Binary className="w-3.5 h-3.5" />} actions={<CopyButton text={dataUri} label="Copy data URI" />}>
                <textarea
                  value={dataUri}
                  readOnly
                  className="w-full h-40 rounded-lg bg-[#F7FDF9] border-2 border-[#A7D8B9] p-2.5 font-mono text-[10.5px] leading-relaxed break-all text-[#14532D] focus:outline-none resize-none"
                  aria-label="Data URI output"
                />
                <p className="mt-1.5 text-[10px] text-[#A98768] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Embedding large data URIs increases HTML size by ~33%.
                </p>
              </Panel>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Base64UrlEncoderTool;
