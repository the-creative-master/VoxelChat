import React, { useRef, useState } from 'react';
import { Copy, Download, Loader2, ScanText, Sparkles, Wand2 } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { downloadBlob } from '../../utils/storage';
import { Panel, StatChip, EmptyHint, ErrorBanner } from '../coding/shared';
import {
  DropZone,
  GhostButton,
  humanBytes,
  loadImageFile,
  PrimaryButton,
  ProgressBar,
} from './pdfShared';

/* =========================================================================
   OCR Extractor
   tesseract.js is loaded from a CDN on first use, so it is not part of the
   bundle and never blocks page load. If the network is unavailable the tool
   says so in plain language rather than hanging.
   ========================================================================= */

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const LANGS = [
  { code: 'eng', label: 'English' },
  { code: 'ara', label: 'Arabic' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'spa', label: 'Spanish' },
  { code: 'hin', label: 'Hindi' },
  { code: 'chi_sim', label: 'Chinese (simplified)' },
];

interface TesseractWorker {
  recognize: (image: File | Blob | string) => Promise<{
    data: { text: string; confidence: number; words?: { text: string; confidence: number }[] };
  }>;
  terminate: () => Promise<void>;
}

interface TesseractGlobal {
  createWorker: (
    lang: string,
    oem?: number,
    options?: { logger?: (m: { status: string; progress: number }) => void }
  ) => Promise<TesseractWorker>;
}

let loadPromise: Promise<TesseractGlobal> | null = null;

const loadTesseract = (): Promise<TesseractGlobal> => {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { Tesseract?: TesseractGlobal };
    if (w.Tesseract) {
      resolve(w.Tesseract);
      return;
    }
    const script = document.createElement('script');
    script.src = TESSERACT_CDN;
    script.async = true;
    script.onload = () => {
      const t = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
      if (t) resolve(t);
      else reject(new Error('The OCR engine loaded but did not register itself.'));
    };
    script.onerror = () =>
      reject(
        new Error(
          'Could not download the OCR engine. Connect to the internet once to cache it, then this works offline.'
        )
      );
    document.head.appendChild(script);
  });
  return loadPromise;
};

const SAMPLE_NOTE =
  'OCR needs a clear, high-contrast image. Screenshots of documents or photos of printed pages work best;';

export const OcrExtractorTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [text, setText] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState('eng');
  const workerRef = useRef<TesseractWorker | null>(null);

  const pickFile = (f: File) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setText('');
    setConfidence(null);
    setError(null);
    setDownloaded(false);
    soundEngine.playPop(1.1);
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    setStatus('Preparing image…');
    try {
      const img = await loadImageFile(file);
      const Tesseract = await loadTesseract();
      setDownloaded(true);

      // Upscale small images — tesseract likes at least ~1000px on the short side
      const minSide = 1000;
      const scale = Math.max(1, minSide / Math.min(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D is unavailable');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // grayscale + mild contrast stretch helps most photographs of text
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < px.length; i += 4) {
        const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        px[i] = g;
        px[i + 1] = g;
        px[i + 2] = g;
        if (g < min) min = g;
        if (g > max) max = g;
      }
      const range = Math.max(1, max - min);
      for (let i = 0; i < px.length; i += 4) {
        const boosted = ((px[i] - min) / range) * 255;
        px[i] = boosted;
        px[i + 1] = boosted;
        px[i + 2] = boosted;
      }
      ctx.putImageData(data, 0, 0);

      setStatus('Recognising text…');
      const worker = await Tesseract.createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          } else if (m.status) {
            setStatus(m.status.replace(/_/g, ' '));
          }
        },
      });
      workerRef.current = worker;
      const result = await worker.recognize(canvas.toDataURL('image/png'));
      const clean = result.data.text.replace(/[ \t]+\n/g, '\n').trim();
      setText(clean);
      setConfidence(Math.round(result.data.confidence));
      setProgress(100);
      setStatus('Done');
      soundEngine.playSuccess();
      await worker.terminate();
      workerRef.current = null;
    } catch (e) {
      setError((e as Error).message);
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const wordCount = (text.match(/[\p{L}\p{N}’'-]+/gu) ?? []).length;

  return (
    <div className="space-y-3">
      <Panel
        title="Image"
        icon={<ScanText className="h-4 w-4" />}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <StatChip label="engine" value={downloaded ? 'cached' : 'on demand'} tone={downloaded ? 'mint' : 'cream'} />
            {confidence !== null && <StatChip label="confidence" value={`${confidence}%`} tone={confidence > 80 ? 'mint' : 'gold'} />}
          </div>
        }
      >
        <DropZone
          accept="image/*"
          onFiles={(files) => files[0] && pickFile(files[0])}
          label={file ? file.name : 'Drop a screenshot or photo of text'}
          hint="English by default — pick another language below for better accuracy"
          icon={<ScanText className="h-7 w-7" strokeWidth={2.2} />}
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase text-[#64748B]">Language</span>
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              aria-pressed={lang === l.code}
              className={`rounded-md border-2 px-2 py-0.5 text-[10px] font-bold transition ${
                lang === l.code
                  ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                  : 'border-[#BFDBFE] bg-white text-[#1E3A8A]'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        {error && (
          <div className="mt-2">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Source image" icon={<ScanText className="h-4 w-4" />}>
          {preview ? (
            <>
              <div className="overflow-hidden rounded-lg border-2 border-[#BFDBFE] bg-[#0F172A]">
                <img src={preview} alt={file?.name ?? 'Source'} className="block max-h-80 w-full object-contain" />
              </div>
              <p className="mt-1.5 truncate font-mono text-[10.5px] font-bold text-[#1E3A8A]">{file?.name}</p>
              <p className="font-mono text-[10px] text-[#64748B]">{file ? humanBytes(file.size) : ''}</p>
            </>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-[#93C5FD] bg-[#F8FAFF] text-[10.5px] font-semibold text-[#64748B]">
              No image selected
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <PrimaryButton
              onClick={run}
              busy={busy}
              disabled={!file}
              icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            >
              {busy ? 'Extracting…' : 'Extract text'}
            </PrimaryButton>
            {file && !busy && (
              <GhostButton onClick={() => pickFile(file)}>Re-run</GhostButton>
            )}
          </div>
          {busy && (
            <div className="mt-2">
              <div className="mb-1 flex justify-between text-[10px] font-bold text-[#1E3A8A]">
                <span className="capitalize">{status}</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <ProgressBar value={progress} />
            </div>
          )}
          <EmptyHint>
            The first run downloads a ~4 MB engine plus a language pack from jsDelivr. After that the browser caches
            it, so later runs are instant and work offline.
          </EmptyHint>
        </Panel>

        <Panel
          title="Extracted text"
          icon={<Wand2 className="h-4 w-4" />}
          actions={
            <div className="flex gap-1.5">
              <StatChip label="words" value={wordCount} />
              <CopyButton text={text} label="Copy" size="sm" />
            </div>
          }
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={15}
            spellCheck={false}
            placeholder="Recognised text will appear here — you can edit it before copying."
            className="w-full resize-y rounded-lg border-2 border-[#BFDBFE] bg-white p-2.5 font-mono text-[12px] leading-relaxed text-[#1E293B] outline-none focus:border-[#3B82F6]"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <GhostButton
              onClick={() => setText(text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim())}
              disabled={!text}
            >
              Tidy whitespace
            </GhostButton>
            <GhostButton onClick={() => setText('')} disabled={!text}>
              Clear
            </GhostButton>
            <GhostButton
              onClick={() =>
                downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'extracted-text.txt')
              }
              disabled={!text}
            >
              <Download className="h-3.5 w-3.5" /> Save .txt
            </GhostButton>
            {confidence !== null && (
              <span className="ml-auto self-center text-[10px] font-semibold text-[#64748B]">
                engine confidence {confidence}% · {text.length} characters
              </span>
            )}
          </div>
          {!text && !busy && (
            <EmptyHint>
              Tip: screenshots and flat scans outperform angled phone photos. Crop tightly to the text and turn the page
              upright first.
            </EmptyHint>
          )}
          {text && (
            <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-[#15803D]">
              <Copy className="h-3 w-3" /> {SAMPLE_NOTE}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default OcrExtractorTool;
