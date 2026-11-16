import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  ImageDown,
  Link2,
  Link2Off,
  Loader2,
  Maximize2,
  Minimize2,
  MoveHorizontal,
} from 'lucide-react';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, StatChip, EmptyHint, ErrorBanner } from '../coding/shared';
import {
  canvasToBlob,
  DropZone,
  FileChip,
  GhostButton,
  humanBytes,
  imageToCanvas,
  isImageFile,
  loadImageFile,
  PrimaryButton,
  ProgressBar,
  saveBlob,
  Slider,
  ToggleRow,
  zipFiles,
  baseName,
  fileExt,
} from './pdfShared';

/* =========================================================================
   Bulk Image Compressor & Resizer
   Set a max dimension / quality once, then squish a whole folder of photos.
   Includes a draggable before/after comparison for the selected result.
   ========================================================================= */

type Format = 'keep' | 'jpg' | 'webp' | 'png';

interface Done {
  id: string;
  name: string;
  sourceName: string;
  beforeBytes: number;
  afterBytes: number;
  blob: Blob;
  beforeUrl: string;
  afterUrl: string;
  width: number;
  height: number;
  origWidth: number;
  origHeight: number;
}

const FORMATS: { id: Format; label: string }[] = [
  { id: 'keep', label: 'Keep format' },
  { id: 'jpg', label: 'JPG' },
  { id: 'webp', label: 'WEBP' },
  { id: 'png', label: 'PNG' },
];

/* ---------------------------- comparison slider ---------------------------- */

const CompareView: React.FC<{ before: string; after: string }> = ({ before, after }) => {
  const [pos, setPos] = useState(50);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const move = useCallback((clientX: number) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }, []);

  return (
    <div
      ref={boxRef}
      className="relative select-none overflow-hidden rounded-lg border-2 border-[#BFDBFE] bg-[#0F172A]"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        dragging.current = true;
        move(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) move(e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerLeave={() => {
        dragging.current = false;
      }}
    >
      <img src={before} alt="Original" className="block max-h-[22rem] w-full object-contain" draggable={false} />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <img
          src={after}
          alt="Compressed"
          className="block h-full max-h-[22rem] w-full object-contain"
          draggable={false}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.5)]"
        style={{ left: `${pos}%` }}
      >
        <span className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#1E293B] shadow-md">
          <MoveHorizontal className="h-3.5 w-3.5" />
        </span>
      </div>
      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
        ORIGINAL
      </span>
      <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-[#10B981]/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
        COMPRESSED
      </span>
    </div>
  );
};

/* -------------------------------- the tool -------------------------------- */

export const BulkImageCompressorTool: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [maxDim, setMaxDim] = useState(1600);
  const [quality, setQuality] = useState(78);
  const [format, setFormat] = useState<Format>('keep');
  const [lockAspect, setLockAspect] = useState(true);
  const [stripMeta, setStripMeta] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Done[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalIn = useMemo(() => files.reduce((n, f) => n + f.size, 0), [files]);
  const totalOut = useMemo(() => results.reduce((n, r) => n + r.afterBytes, 0), [results]);
  const totalBefore = useMemo(() => results.reduce((n, r) => n + r.beforeBytes, 0), [results]);
  const saving = totalBefore ? ((totalBefore - totalOut) / totalBefore) * 100 : 0;

  const addFiles = (incoming: File[]) => {
    const imgs = incoming.filter(isImageFile);
    if (imgs.length === 0) {
      setError('Drop image files — PNG, JPG, WEBP, GIF or BMP.');
      return;
    }
    setError(null);
    setFiles((cur) => [...cur, ...imgs]);
    soundEngine.playPop(1.1);
  };

  const run = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    results.forEach((r) => {
      URL.revokeObjectURL(r.beforeUrl);
      URL.revokeObjectURL(r.afterUrl);
    });
    setResults([]);

    const out: Done[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ done: i, total: files.length });
        const img = await loadImageFile(file);
        const longest = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = longest > maxDim ? maxDim / longest : 1;
        const w = Math.round(img.naturalWidth * scale);
        const h = lockAspect ? Math.round(img.naturalHeight * scale) : Math.round(img.naturalHeight);

        const outFormat =
          format === 'keep'
            ? (['png', 'jpg', 'jpeg', 'webp'].includes(fileExt(file.name)) ? fileExt(file.name) : 'jpg')
            : format;
        const mime = outFormat === 'png' ? 'image/png' : outFormat === 'webp' ? 'image/webp' : 'image/jpeg';
        const ext = outFormat === 'jpeg' ? 'jpg' : outFormat;

        // JPEG cannot carry alpha, so flatten to white
        const canvas = imageToCanvas(img, w, h, mime === 'image/jpeg' ? '#ffffff' : undefined);
        const blob = await canvasToBlob(canvas, mime, quality / 100);

        out.push({
          id: `${file.name}-${i}`,
          name: `${baseName(file.name)}-compressed.${ext}`,
          sourceName: file.name,
          beforeBytes: file.size,
          afterBytes: blob.size,
          blob,
          beforeUrl: URL.createObjectURL(file),
          afterUrl: URL.createObjectURL(blob),
          width: w,
          height: h,
          origWidth: img.naturalWidth,
          origHeight: img.naturalHeight,
        });
        setProgress({ done: i + 1, total: files.length });
      }
      setResults(out);
      setSelected(out[0]?.id ?? null);
      soundEngine.playSuccess();
    } catch (e) {
      setError(`Compression stopped — ${(e as Error).message}`);
      if (out.length) {
        setResults(out);
        setSelected(out[0]?.id ?? null);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const downloadAll = async () => {
    if (results.length === 0) return;
    if (results.length === 1) {
      saveBlob(results[0].blob, results[0].name);
      return;
    }
    const zip = await zipFiles(results.map((r) => ({ name: r.name, blob: r.blob })));
    saveBlob(zip, `compressed-photos-${new Date().toISOString().slice(0, 10)}.zip`);
  };

  const active = results.find((r) => r.id === selected) ?? results[0];

  return (
    <div className="space-y-3">
      <Panel
        title="Photos"
        icon={<ImageDown className="h-4 w-4" />}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <StatChip label="queued" value={files.length} />
            <StatChip label="in" value={humanBytes(totalIn)} />
            {results.length > 0 && (
              <StatChip
                label="saved"
                value={`${saving.toFixed(0)}%`}
                tone={saving > 0 ? 'mint' : 'red'}
              />
            )}
          </div>
        }
      >
        <DropZone
          multiple
          accept="image/*"
          onFiles={addFiles}
          label={busy ? 'Compressing…' : 'Drop photos here, or click to browse'}
          hint="Batch as many as you like — processed one at a time to stay responsive"
        />
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <FileChip
                key={`${f.name}-${i}`}
                name={f.name}
                meta={humanBytes(f.size)}
                onRemove={() => setFiles((cur) => cur.filter((_, idx) => idx !== i))}
              />
            ))}
            <GhostButton onClick={() => setFiles([])}>Clear all</GhostButton>
          </div>
        )}
        {error && (
          <div className="mt-2">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Compression settings" icon={<Minimize2 className="h-4 w-4" />}>
          <div className="space-y-2.5">
            <Slider
              label="Longest side"
              value={maxDim}
              min={200}
              max={4000}
              step={100}
              suffix=" px"
              onChange={setMaxDim}
              hint="Photos larger than this are scaled down; smaller ones are left alone"
            />
            <Slider
              label="Quality"
              value={quality}
              min={20}
              max={100}
              suffix="%"
              onChange={setQuality}
              hint={quality >= 90 ? 'Near-lossless, bigger files' : quality <= 50 ? 'Aggressive — visible artifacts' : 'A good balance for the web'}
            />
            <div>
              <span className="mb-1 block text-[11px] font-bold text-[#1E3A8A]">Output format</span>
              <div className="flex flex-wrap gap-1.5">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id)}
                    aria-pressed={format === f.id}
                    className={`rounded-lg border-2 px-2.5 py-1 text-[10.5px] font-bold transition ${
                      format === f.id
                        ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                        : 'border-[#BFDBFE] bg-white text-[#1E3A8A]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <ToggleRow
                label="Lock aspect ratio"
                hint="Scale width and height together (recommended)"
                checked={lockAspect}
                onChange={setLockAspect}
              />
              <ToggleRow
                label="Strip metadata"
                hint="Re-encoding through a canvas drops EXIF, GPS and camera data"
                checked={stripMeta}
                onChange={setStripMeta}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Compress" icon={<Maximize2 className="h-4 w-4" />}>
          {progress && (
            <div className="mb-2.5">
              <div className="mb-1 flex justify-between font-mono text-[10px] text-[#64748B]">
                <span>Working…</span>
                <span>
                  {progress.done}/{progress.total}
                </span>
              </div>
              <ProgressBar value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton
              onClick={run}
              busy={busy}
              disabled={files.length === 0}
              icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
            >
              {busy ? 'Compressing…' : `Compress ${files.length || ''} photo${files.length === 1 ? '' : 's'}`}
            </PrimaryButton>
            {results.length > 0 && (
              <button
                type="button"
                onClick={downloadAll}
                className="toy-btn bg-[#10B981] border-[#065F46] text-white px-3.5 py-2 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                {results.length > 1 ? `ZIP (${results.length})` : 'Download'}
              </button>
            )}
          </div>

          {results.length > 0 ? (
            <>
              <div className="mt-2.5 flex items-center justify-between rounded-lg border-2 border-[#86EFAC] bg-[#F0FDF4] px-2.5 py-1.5">
                <span className="text-[10.5px] font-bold text-[#15803D]">
                  {humanBytes(totalBefore)} <ArrowRight className="inline h-3 w-3" /> {humanBytes(totalOut)}
                </span>
                <span className="font-mono text-[11px] font-bold text-[#15803D]">
                  {saving > 0 ? `−${saving.toFixed(1)}%` : 'no saving'}
                </span>
              </div>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                {results.map((r) => {
                  const gain = r.beforeBytes ? ((r.beforeBytes - r.afterBytes) / r.beforeBytes) * 100 : 0;
                  const on = active?.id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(r.id)}
                        aria-pressed={on}
                        className={`flex w-full items-center gap-2 rounded-lg border-2 px-2 py-1 text-left transition ${
                          on ? 'border-[#3B82F6] bg-[#EFF6FF]' : 'border-[#DBEAFE] bg-white hover:border-[#BFDBFE]'
                        }`}
                      >
                        <img src={r.afterUrl} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[10px] font-bold text-[#1E3A8A]">
                            {r.name}
                          </span>
                          <span className="block font-mono text-[9px] text-[#64748B]">
                            {r.origWidth}×{r.origHeight} → {r.width}×{r.height} · {humanBytes(r.afterBytes)}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 font-mono text-[9.5px] font-bold ${
                            gain > 0 ? 'text-[#15803D]' : 'text-[#B45309]'
                          }`}
                        >
                          {gain > 0 ? `−${gain.toFixed(0)}%` : `+${Math.abs(gain).toFixed(0)}%`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            !busy && <EmptyHint>Queue photos, tune the sliders, then compress. Originals are never modified.</EmptyHint>
          )}
        </Panel>
      </div>

      {active && (
        <Panel
          title="Before / after"
          icon={<CheckCircle2 className="h-4 w-4" />}
          actions={
            <div className="flex gap-1.5">
              <span className="font-mono text-[10px] text-[#64748B]">
                drag the handle · {active.width}×{active.height}
              </span>
              <button
                type="button"
                onClick={() => saveBlob(active.blob, active.name)}
                className="toy-btn-cream px-2 py-1.5 text-[10.5px]"
              >
                <Download className="h-3 w-3" /> This one
              </button>
            </div>
          }
        >
          <CompareView before={active.beforeUrl} after={active.afterUrl} />
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px] font-semibold text-[#64748B]">
            <span className="inline-flex items-center gap-1">
              {lockAspect ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
              aspect {lockAspect ? 'locked' : 'free'}
            </span>
            <span>·</span>
            <span>{stripMeta ? 'metadata stripped' : 'metadata may survive re-encode'}</span>
            <span>·</span>
            <span className="font-mono">
              {humanBytes(active.beforeBytes)} → {humanBytes(active.afterBytes)}
            </span>
          </div>
        </Panel>
      )}
    </div>
  );
};

export default BulkImageCompressorTool;
