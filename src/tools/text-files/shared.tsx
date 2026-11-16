import React, { useCallback, useRef, useState } from 'react';
import { Download, FileUp, Loader2, Trash2 } from 'lucide-react';
import { downloadBlob } from '../../utils/storage';
import { soundEngine } from '../../utils/soundEngine';

/* =========================================================================
   Shared kit for Cupboard 3 — Text & Files.
   Every helper here runs entirely in the browser: ArrayBuffers in, Blobs out.
   ========================================================================= */

export const fileExt = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
};

export const baseName = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i === -1 ? name : name.slice(0, i);
};

export const stripExt = baseName;

export const humanBytes = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / Math.pow(1024, i);
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
};

export const readAsArrayBuffer = (file: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsArrayBuffer(file);
  });

export const readAsText = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsText(file);
  });

export const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('Cannot read file'));
    r.readAsDataURL(file);
  });

export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be decoded as an image'));
    img.src = src;
  });

export const loadImageFile = async (file: Blob): Promise<HTMLImageElement> =>
  loadImage(await readAsDataUrl(file));

/** Draw an image to a canvas at a target size / scale, returning the canvas. */
export const imageToCanvas = (
  img: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  width: number,
  height: number,
  background?: string
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return canvas;
};

export const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('This browser refused to encode that image'))),
      type,
      quality
    );
  });

export const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  svg: 'image/svg+xml',
  html: 'text/html',
};

export const isImageFile = (f: File): boolean =>
  f.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(fileExt(f.name));

export const saveBlob = (blob: Blob, filename: string) => {
  downloadBlob(blob, filename);
  soundEngine.playSuccess();
};

/* ------------------------------- UI atoms -------------------------------- */

export const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
  hint?: string;
}> = ({ label, value, min, max, step = 1, suffix = '', onChange, disabled, hint }) => (
  <label className={`block ${disabled ? 'opacity-50' : ''}`}>
    <span className="mb-1 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-bold text-[#1E3A8A]">{label}</span>
      <span className="font-mono text-[11px] font-bold text-[#1E40AF]">
        {value}
        {suffix}
      </span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#DBEAFE] accent-[#3B82F6] disabled:cursor-not-allowed"
    />
    {hint && <span className="mt-0.5 block text-[10px] font-medium text-[#64748B]">{hint}</span>}
  </label>
);

export const ToggleRow: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <label className="flex cursor-pointer items-start gap-2 rounded-lg border-2 border-[#DBEAFE] bg-[#F8FAFF] px-2.5 py-2">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 h-4 w-4 accent-[#3B82F6]"
    />
    <span className="min-w-0">
      <span className="block text-[11px] font-bold text-[#1E3A8A]">{label}</span>
      {hint && <span className="block text-[10px] leading-snug text-[#64748B]">{hint}</span>}
    </span>
  </label>
);

export const PrimaryButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; icon?: React.ReactNode }
> = ({ children, busy, icon, className = '', disabled, ...rest }) => (
  <button
    type="button"
    {...rest}
    disabled={disabled || busy}
    className={`toy-btn bg-[#3B82F6] border-[#1E40AF] text-white px-3.5 py-2 text-xs sm:text-sm
                disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    {children}
  </button>
);

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className = '',
  ...rest
}) => (
  <button
    type="button"
    {...rest}
    className={`toy-btn-cream px-3 py-2 text-xs disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);

export const DownloadButton: React.FC<{
  blob: Blob | null;
  filename: string;
  label?: string;
}> = ({ blob, filename, label = 'Download' }) => (
  <button
    type="button"
    disabled={!blob}
    onClick={() => blob && saveBlob(blob, filename)}
    className="toy-btn bg-[#10B981] border-[#065F46] text-white px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
  >
    <Download className="h-3.5 w-3.5" />
    {label}
  </button>
);

/* ------------------------------ Drop zone -------------------------------- */

interface DropZoneProps {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  compact?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  accept,
  multiple,
  onFiles,
  label,
  hint,
  icon,
  compact,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const files = Array.from(list);
      soundEngine.playPop(1.1);
      onFiles(files);
    },
    [onFiles]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={label}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-center transition
        ${compact ? 'px-3 py-4' : 'px-4 py-8'}
        ${
          over
            ? 'border-[#3B82F6] bg-[#DBEAFE]'
            : 'border-[#93C5FD] bg-[#F8FAFF] hover:border-[#3B82F6] hover:bg-[#EFF6FF]'
        }`}
    >
      <span className="text-[#2563EB]">
        {icon ?? <FileUp className={compact ? 'h-5 w-5' : 'h-7 w-7'} strokeWidth={2.2} />}
      </span>
      <span className="font-display text-xs font-bold text-[#1E3A8A] sm:text-sm">{label}</span>
      {hint && <span className="text-[10.5px] font-medium text-[#64748B]">{hint}</span>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
    </div>
  );
};

/* ------------------------- shared file list strip ------------------------- */

export const FileChip: React.FC<{
  name: string;
  meta?: string;
  onRemove?: () => void;
  thumb?: string;
}> = ({ name, meta, onRemove, thumb }) => (
  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border-2 border-[#DBEAFE] bg-white px-2 py-1 text-[11px]">
    {thumb ? (
      <img src={thumb} alt="" className="h-5 w-5 rounded border border-[#BFDBFE] object-cover" />
    ) : null}
    <span className="max-w-[16rem] truncate font-bold text-[#1E3A8A]">{name}</span>
    {meta && <span className="shrink-0 font-mono text-[10px] text-[#64748B]">{meta}</span>}
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="shrink-0 text-[#94A3B8] hover:text-[#DC2626]"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    )}
  </span>
);

/** Simple download-all-as-zip helper built on jszip. */
export const zipFiles = async (entries: { name: string; blob: Blob }[]): Promise<Blob> => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const e of entries) zip.file(e.name, e.blob);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
};

export const ProgressBar: React.FC<{ value: number; tone?: 'blue' | 'green' }> = ({
  value,
  tone = 'blue',
}) => (
  <div className="h-2.5 w-full overflow-hidden rounded-full border border-[#DBEAFE] bg-[#EFF6FF]">
    <div
      className={`h-full rounded-full transition-all duration-200 ${
        tone === 'green'
          ? 'bg-gradient-to-r from-[#34D399] to-[#10B981]'
          : 'bg-gradient-to-r from-[#60A5FA] to-[#2563EB]'
      }`}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    />
  </div>
);
