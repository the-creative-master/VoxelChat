import React, { useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  Images,
  Loader2,
  Sparkles,
  X,
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
  loadPdfLib,
  PrimaryButton,
  renderPdfToCanvases,
  saveBlob,
  ProgressBar,
  Slider,
  ToggleRow,
  zipFiles,
  baseName,
} from './pdfShared';

/* =========================================================================
   Universal File & Batch Photo Converter  ★ star tool
   PDF → PNG/JPG/WEBP at 72–600 DPI, image → image, images → PDF, and any
   batch → ZIP. Everything runs in this tab.
   ========================================================================= */

type OutFormat = 'png' | 'jpg' | 'webp' | 'pdf';

const FORMAT_LABEL: Record<OutFormat, string> = {
  png: 'PNG',
  jpg: 'JPG',
  webp: 'WEBP',
  pdf: 'PDF',
};

const MIME: Record<Exclude<OutFormat, 'pdf'>, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

interface ConvertedFile {
  id: string;
  name: string;
  blob: Blob;
  previewUrl?: string;
  sourceName: string;
  kind: 'image' | 'pdf';
}

const DPI_OPTIONS = [72, 150, 300, 600];

export const UniversalConverterTool: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<OutFormat>('png');
  const [dpi, setDpi] = useState(300);
  const [quality, setQuality] = useState(92);
  const [resizeWidth, setResizeWidth] = useState(0); // 0 = keep original
  const [whiteBg, setWhiteBg] = useState(true);
  const [packZip, setPackZip] = useState(true);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [results, setResults] = useState<ConvertedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const pdfCount = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')).length;
  const imgCount = files.filter(isImageFile).length;
  const totalBytes = files.reduce((n, f) => n + f.size, 0);

  const outputBytes = useMemo(() => results.reduce((n, r) => n + r.blob.size, 0), [results]);

  const addFiles = (incoming: File[]) => {
    const accepted = incoming.filter(
      (f) => isImageFile(f) || f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (accepted.length === 0) {
      setError('Only images (PNG, JPG, WEBP, GIF, BMP) and PDFs can be converted.');
      return;
    }
    setError(null);
    setFiles((cur) => [...cur, ...accepted]);
    soundEngine.playPop(1.1);
  };

  const appendLog = (line: string) => setLog((l) => [...l.slice(-60), line]);

  const run = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setResults([]);
    setLog([]);

    const collected: ConvertedFile[] = [];
    const stamp = new Date().toISOString().slice(0, 10);

    try {
      /* ------------------------------ images → image ----------------------------- */
      const images = files.filter(isImageFile);
      const pdfs = files.filter((f) => !isImageFile(f));

      if (format !== 'pdf') {
        const totalUnits = images.length + pdfs.length;
        let done = 0;

        for (const file of images) {
          setProgress({ done, total: totalUnits, label: `Converting ${file.name}` });
          const img = await loadImageFile(file);
          const targetW = resizeWidth > 0 ? resizeWidth : img.naturalWidth;
          const targetH = Math.round((targetW / img.naturalWidth) * img.naturalHeight);
          const needsBackground = whiteBg || format === 'jpg';
          const canvas = imageToCanvas(img, targetW, targetH, needsBackground ? '#ffffff' : undefined);
          const blob = await canvasToBlob(canvas, MIME[format], quality / 100);
          const name = `${baseName(file.name)}.${format}`;
          collected.push({
            id: `${file.name}-${collected.length}`,
            name,
            blob,
            previewUrl: canvas.toDataURL('image/jpeg', 0.35),
            sourceName: file.name,
            kind: 'image',
          });
          appendLog(`${file.name} → ${name} (${humanBytes(blob.size)})`);
          done += 1;
          setProgress({ done, total: totalUnits, label: `${done}/${totalUnits} pages & photos` });
          await new Promise((r) => window.setTimeout(r, 0));
        }

        /* ------------------------------- PDF → images ------------------------------ */
        for (const file of pdfs) {
          setProgress({ done, total: totalUnits, label: `Rendering ${file.name} at ${dpi} DPI` });
          const buffer = await file.arrayBuffer();
          const pages = await renderPdfToCanvases(buffer, dpi, {
            onProgress: (d, t) =>
              setProgress({
                done,
                total: totalUnits,
                label: `${file.name} — page ${d} of ${t} at ${dpi} DPI`,
              }),
          });
          for (const page of pages) {
            let canvas = page.canvas;
            if (resizeWidth > 0 && canvas.width > resizeWidth) {
              const ratio = resizeWidth / canvas.width;
              canvas = imageToCanvas(canvas, resizeWidth, Math.round(canvas.height * ratio), whiteBg || format === 'jpg' ? '#ffffff' : undefined);
            }
            const blob = await canvasToBlob(canvas, MIME[format], quality / 100);
            const name = `${baseName(file.name)}-p${String(page.pageNumber).padStart(2, '0')}.${format}`;
            collected.push({
              id: `${file.name}-p${page.pageNumber}`,
              name,
              blob,
              previewUrl: canvas.toDataURL('image/jpeg', 0.35),
              sourceName: file.name,
              kind: 'pdf',
            });
            appendLog(`${file.name} p${page.pageNumber} → ${name} (${humanBytes(blob.size)})`);
          }
          done += 1;
          setProgress({ done, total: totalUnits, label: `${done}/${totalUnits} sources done` });
        }
      } else {
        /* ------------------------------ images → PDF ------------------------------- */
        const { PDFDocument } = await loadPdfLib();
        const doc = await PDFDocument.create();
        let done = 0;

        for (const file of images) {
          setProgress({ done, total: images.length, label: `Adding ${file.name}` });
          const img = await loadImageFile(file);
          const targetW = resizeWidth > 0 ? resizeWidth : img.naturalWidth;
          const targetH = Math.round((targetW / img.naturalWidth) * img.naturalHeight);
          const canvas = imageToCanvas(img, targetW, targetH, whiteBg ? '#ffffff' : undefined);
          const jpegBytes = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', quality / 100)).arrayBuffer());
          const embedded = await doc.embedJpg(jpegBytes);
          const pageWidth = 595.28; // A4 width in points
          const pageHeight = (embedded.height / embedded.width) * pageWidth;
          const page = doc.addPage([pageWidth, pageHeight]);
          page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
          done += 1;
          setProgress({ done, total: images.length, label: `${done}/${images.length} photos` });
        }

        for (const file of pdfs) {
          setProgress({ done, total: files.length, label: `Appending ${file.name}` });
          const buffer = await file.arrayBuffer();
          const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
          const copied = await doc.copyPages(src, src.getPageIndices());
          copied.forEach((p) => doc.addPage(p));
          done += 1;
        }

        doc.setTitle('BiteSized Utilities image pack');
        doc.setProducer('BiteSized Utilities');
        const bytes = await doc.save();
        const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
        collected.push({
          id: 'pdf-out',
          name: `photo-pack-${stamp}.pdf`,
          blob,
          sourceName: `${images.length} photos`,
          kind: 'image',
        });
        appendLog(`Merged ${images.length} photo${images.length === 1 ? '' : 's'} → PDF (${humanBytes(blob.size)})`);
      }

      setResults(collected);
      soundEngine.playSuccess();
      if (collected.length === 0) setError('Nothing came out — check that the input files are valid.');
    } catch (e) {
      setError(`Conversion stopped — ${(e as Error).message}`);
      if (collected.length > 0) setResults(collected);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const downloadAll = async () => {
    if (results.length === 0) return;
    if (results.length === 1 && !packZip) {
      saveBlob(results[0].blob, results[0].name);
      return;
    }
    const zip = await zipFiles(results.map((r) => ({ name: r.name, blob: r.blob })));
    saveBlob(zip, `bitesized-converted-${new Date().toISOString().slice(0, 10)}.zip`);
  };

  const cleanUp = () => {
    results.forEach((r) => {
      if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
    });
    setResults([]);
    setLog([]);
  };

  return (
    <div className="space-y-3">
      <Panel
        title="Universal File & Batch Photo Converter"
        icon={<Sparkles className="h-4 w-4" />}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <StatChip label="files" value={files.length} />
            <StatChip label="in" value={humanBytes(totalBytes)} />
            {results.length > 0 && <StatChip label="out" value={humanBytes(outputBytes)} tone="mint" />}
          </div>
        }
      >
        <DropZone
          multiple
          accept="image/*,application/pdf,.pdf"
          onFiles={addFiles}
          label={busy ? 'Working…' : 'Drop PDFs and photos here, or click to browse'}
          hint="PNG · JPG · WEBP · GIF · BMP · PDF — as many as you like"
          icon={<Images className="h-7 w-7" strokeWidth={2.2} />}
        />

        {files.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <FileChip
                key={`${f.name}-${i}`}
                name={f.name}
                meta={humanBytes(f.size)}
                onRemove={() => setFiles((cur) => cur.filter((_, idx) => idx !== i))}
              />
            ))}
            <button
              type="button"
              onClick={() => setFiles([])}
              className="inline-flex items-center gap-1 rounded-lg border-2 border-[#FCA5A5] bg-[#FEF2F2] px-2 py-1 text-[10.5px] font-bold text-[#B91C1C]"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          </div>
        )}

        {files.length > 0 && (
          <p className="mt-1.5 text-[10.5px] font-semibold text-[#64748B]">
            {imgCount} photo{imgCount === 1 ? '' : 's'} · {pdfCount} PDF{pdfCount === 1 ? '' : 's'}
            {format !== 'pdf' && pdfCount > 0 ? ` · every PDF page renders at ${dpi} DPI` : ''}
          </p>
        )}

        {error && (
          <div className="mt-2">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Output format" icon={<FileImage className="h-4 w-4" />}>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(FORMAT_LABEL) as OutFormat[]).map((f) => {
              const on = format === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFormat(f);
                    soundEngine.playPop(1.05);
                  }}
                  aria-pressed={on}
                  className={`rounded-lg border-2 border-b-[4px] px-3 py-1.5 font-display text-[11.5px] font-bold transition active:translate-y-[2px] active:border-b-2 ${
                    on
                      ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                      : 'border-[#BFDBFE] bg-white text-[#1E3A8A] hover:border-[#3B82F6]'
                  }`}
                >
                  {FORMAT_LABEL[f]}
                  {f === 'pdf' ? <span className="ml-1 text-[9px] opacity-80">images → PDF</span> : null}
                </button>
              );
            })}
          </div>

          {format === 'pdf' ? (
            <div className="mt-2 rounded-lg border-2 border-[#DBEAFE] bg-[#F8FAFF] px-2.5 py-2 text-[10.5px] leading-relaxed text-[#475569]">
              Every photo becomes a full-bleed page (A4 width, height follows the photo). PDFs in the queue are
              appended after the photos, keeping their original pages.
            </div>
          ) : (
            <div className="mt-2.5">
              <span className="mb-1 block text-[11px] font-bold text-[#1E3A8A]">
                PDF render resolution
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DPI_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDpi(d)}
                    aria-pressed={dpi === d}
                    className={`rounded-lg border-2 px-2.5 py-1 font-mono text-[10.5px] font-bold transition ${
                      dpi === d
                        ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                        : 'border-[#BFDBFE] bg-white text-[#1E3A8A]'
                    }`}
                  >
                    {d} DPI
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[9.5px] font-medium text-[#64748B]">
                A4 at 600 DPI is 4960 × 7016 px — expect large files and a longer render.
              </p>
            </div>
          )}
        </Panel>

        <Panel title="Quality & size" icon={<FileText className="h-4 w-4" />}>
          <div className="space-y-2.5">
            {format !== 'pdf' && format !== 'png' && (
              <Slider
                label="Quality"
                value={quality}
                min={30}
                max={100}
                suffix="%"
                onChange={setQuality}
                hint="Lower means smaller files with more visible artifacts"
              />
            )}
            {format === 'png' && <EmptyHint>PNG is lossless — quality stays fixed at 100%.</EmptyHint>}
            <Slider
              label="Resize longest side"
              value={resizeWidth}
              min={0}
              max={4000}
              step={100}
              onChange={setResizeWidth}
              hint={resizeWidth === 0 ? '0 = keep original dimensions' : `Output width: ${resizeWidth}px`}
            />
            <div className="grid gap-1.5">
              <ToggleRow
                label="Flatten onto white"
                hint="JPEG has no transparency — this avoids black backgrounds"
                checked={whiteBg}
                onChange={setWhiteBg}
              />
              <ToggleRow
                label="Bundle results into a ZIP"
                hint="One download instead of dozens"
                checked={packZip}
                onChange={setPackZip}
              />
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Convert"
        icon={<Archive className="h-4 w-4" />}
        actions={
          results.length > 0 ? (
            <GhostButton onClick={cleanUp}>
              <X className="h-3.5 w-3.5" /> Clear results
            </GhostButton>
          ) : undefined
        }
      >
        {progress && (
          <div className="mb-2.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold text-[#1E3A8A]">{progress.label}</span>
              <span className="font-mono text-[10px] text-[#64748B]">
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
            icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          >
            {busy ? 'Converting…' : `Convert ${files.length || ''} file${files.length === 1 ? '' : 's'}`}
          </PrimaryButton>

          {results.length > 0 && (
            <button
              type="button"
              onClick={downloadAll}
              className="toy-btn bg-[#10B981] border-[#065F46] text-white px-3.5 py-2 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              {results.length > 1 && packZip ? `Download ZIP (${results.length})` : 'Download result'}
            </button>
          )}

          {results.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#15803D]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {results.length} file{results.length === 1 ? '' : 's'} ready · {humanBytes(outputBytes)}
            </span>
          )}
        </div>

        {results.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {results.map((r) => (
              <li
                key={r.id}
                className="overflow-hidden rounded-lg border-2 border-[#BFDBFE] bg-white"
              >
                <div className="flex h-20 items-center justify-center overflow-hidden bg-[#F8FAFF]">
                  {r.previewUrl ? (
                    <img src={r.previewUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <FileText className="h-7 w-7 text-[#93C5FD]" />
                  )}
                </div>
                <div className="p-1.5">
                  <p className="truncate font-mono text-[9.5px] font-bold text-[#1E3A8A]" title={r.name}>
                    {r.name}
                  </p>
                  <div className="mt-0.5 flex items-center justify-between gap-1">
                    <span className="font-mono text-[9px] text-[#64748B]">{humanBytes(r.blob.size)}</span>
                    <button
                      type="button"
                      onClick={() => saveBlob(r.blob, r.name)}
                      className="rounded p-0.5 text-[#2563EB] hover:bg-[#EFF6FF]"
                      aria-label={`Download ${r.name}`}
                    >
                      <Download className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {busy && <EmptyHint>Rendering PDF pages is CPU-bound — 600 DPI on a long document takes a while.</EmptyHint>}
        {results.length === 0 && !busy && <EmptyHint>Add files, pick a format, then hit Convert.</EmptyHint>}
      </Panel>

      {log.length > 0 && (
        <Panel title="Conversion log" icon={<FileText className="h-4 w-4" />}>
          <pre className="max-h-40 overflow-auto rounded-lg bg-[#0F172A] p-2.5 font-mono text-[10px] leading-relaxed text-[#BBF7D0]">
            {log.join('\n')}
          </pre>
        </Panel>
      )}
    </div>
  );
};

export default UniversalConverterTool;
