import React, { useMemo, useState } from 'react';
import { CameraOff, Download, Eye, EyeOff, Fingerprint, MapPin, ShieldCheck, Trash2 } from 'lucide-react';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, StatChip, EmptyHint, ErrorBanner } from '../coding/shared';
import {
  canvasToBlob,
  DropZone,
  humanBytes,
  imageToCanvas,
  loadImageFile,
  PrimaryButton,
  saveBlob,
  ToggleRow,
  baseName,
  fileExt,
} from './pdfShared';

/* =========================================================================
   EXIF Stripper & Inspector
   A compact TIFF/EXIF reader (works on JPEG APP1 segments and PNG eXIf),
   plus a guaranteed-clean re-encode that drops every metadata block.
   ========================================================================= */

interface ExifTag {
  tag: number;
  name: string;
  value: string;
  group: 'camera' | 'exposure' | 'gps' | 'date' | 'other';
}

const TAG_NAMES: Record<number, { name: string; group: ExifTag['group'] }> = {
  0x010f: { name: 'Make', group: 'camera' },
  0x0110: { name: 'Model', group: 'camera' },
  0x0112: { name: 'Orientation', group: 'camera' },
  0x011a: { name: 'XResolution', group: 'camera' },
  0x011b: { name: 'YResolution', group: 'camera' },
  0x0131: { name: 'Software', group: 'camera' },
  0x0132: { name: 'DateTime', group: 'date' },
  0x8769: { name: 'ExifIFDPointer', group: 'other' },
  0x9003: { name: 'DateTimeOriginal', group: 'date' },
  0x9004: { name: 'DateTimeDigitized', group: 'date' },
  0x829a: { name: 'ExposureTime', group: 'exposure' },
  0x829d: { name: 'FNumber', group: 'exposure' },
  0x8827: { name: 'ISOSpeedRatings', group: 'exposure' },
  0x9201: { name: 'ShutterSpeedValue', group: 'exposure' },
  0x9202: { name: 'ApertureValue', group: 'exposure' },
  0x9209: { name: 'Flash', group: 'exposure' },
  0x920a: { name: 'FocalLength', group: 'exposure' },
  0xa002: { name: 'PixelXDimension', group: 'camera' },
  0xa003: { name: 'PixelYDimension', group: 'camera' },
  0xa434: { name: 'LensModel', group: 'camera' },
  0x9286: { name: 'UserComment', group: 'other' },
  0x010e: { name: 'ImageDescription', group: 'other' },
  0x013b: { name: 'Artist', group: 'other' },
  0x8298: { name: 'Copyright', group: 'other' },
  0x0001: { name: 'GPSLatitudeRef', group: 'gps' },
  0x0002: { name: 'GPSLatitude', group: 'gps' },
  0x0003: { name: 'GPSLongitudeRef', group: 'gps' },
  0x0004: { name: 'GPSLongitude', group: 'gps' },
  0x0005: { name: 'GPSAltitudeRef', group: 'gps' },
  0x0006: { name: 'GPSAltitude', group: 'gps' },
  0x0007: { name: 'GPSTimeStamp', group: 'gps' },
  0x001d: { name: 'GPSDateStamp', group: 'gps' },
};

const GPS_TAGS = new Set([0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006, 0x0007, 0x001d]);

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

/** Parse a TIFF block (the payload of an APP1 "Exif\0\0" segment). */
const parseTiff = (buf: DataView, start: number, length: number): ExifTag[] => {
  const tags: ExifTag[] = [];
  if (length < 8) return tags;
  const byteOrder = buf.getUint16(start);
  const little = byteOrder === 0x4949;
  const readU16 = (off: number) => buf.getUint16(off, little);
  const readU32 = (off: number) => buf.getUint32(off, little);

  if (readU16(start + 2) !== 0x002a) return tags;
  const ifd0Offset = readU32(start + 4);
  const visited = new Set<number>();

  const readIfd = (ifdOffset: number, isGps: boolean) => {
    const base = start + ifdOffset;
    if (base + 2 > start + length || visited.has(ifdOffset)) return;
    visited.add(ifdOffset);
    const count = readU16(base);

    for (let i = 0; i < count; i++) {
      const entry = base + 2 + i * 12;
      if (entry + 12 > start + length) break;
      const tag = readU16(entry);
      const type = readU16(entry + 2);
      const num = readU32(entry + 4);
      const size = (TYPE_SIZES[type] ?? 1) * num;
      const valueOffset = size > 4 ? start + readU32(entry + 8) : entry + 8;
      if (valueOffset < 0 || valueOffset + size > start + length) continue;

      let value = '';
      if (type === 2) {
        let s = '';
        for (let k = 0; k < num; k++) {
          const code = buf.getUint8(valueOffset + k);
          if (code === 0) break;
          s += String.fromCharCode(code);
        }
        value = s.trim();
      } else if (type === 3) {
        const vals: number[] = [];
        for (let k = 0; k < Math.min(num, 4); k++) vals.push(readU16(valueOffset + k * 2));
        value = vals.join(', ');
      } else if (type === 4) {
        const vals: number[] = [];
        for (let k = 0; k < Math.min(num, 4); k++) vals.push(readU32(valueOffset + k * 4));
        value = vals.join(', ');
      } else if (type === 5 && num >= 1) {
        const nume = readU32(valueOffset);
        const deno = readU32(valueOffset + 4) || 1;
        value = nume === 0 ? '0' : deno === 1 ? String(nume) : `${(nume / deno).toFixed(2)} (${nume}/${deno})`;
      } else if (type === 10 && num >= 2) {
        const nume = buf.getInt32(valueOffset, little);
        const deno = buf.getInt32(valueOffset + 4, little) || 1;
        value = `${(nume / deno).toFixed(2)}`;
      } else {
        value = `[${num} value${num === 1 ? '' : 's'}]`;
      }

      const meta = TAG_NAMES[tag];
      if (!meta) continue;
      if (meta.name === 'ExifIFDPointer') {
        readIfd(readU32(entry + 8), false);
        continue;
      }
      if (isGps && !GPS_TAGS.has(tag)) continue;
      if (!value) continue;
      tags.push({ tag, name: meta.name, value, group: isGps ? 'gps' : meta.group });
    }

    // GPS IFD pointer lives at 0x8825 in IFD0
    for (let i = 0; i < count; i++) {
      const entry = base + 2 + i * 12;
      if (entry + 12 > start + length) break;
      if (readU16(entry) === 0x8825) {
        const gpsOffset = readU32(entry + 8);
        if (gpsOffset) readIfd(gpsOffset, true);
      }
    }
  };

  readIfd(ifd0Offset, false);
  return tags;
};

const hasExifHeader = (bytes: Uint8Array, offset: number) =>
  bytes[offset] === 0x45 && bytes[offset + 1] === 0x78 && bytes[offset + 2] === 0x69 && bytes[offset + 3] === 0x66;

const readExif = (buffer: ArrayBuffer): { tags: ExifTag[]; format: string } => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // JPEG: walk markers looking for APP1/Exif
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 4) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const segLen = view.getUint16(i + 2);
      if (marker === 0xe1 && hasExifHeader(bytes, i + 4)) {
        return { tags: parseTiff(view, i + 10, segLen - 8), format: 'JPEG' };
      }
      if (marker === 0xda) break;
      i += 2 + segLen;
    }
    return { tags: [], format: 'JPEG' };
  }

  // PNG: eXIf chunk
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    let i = 8;
    while (i + 8 < bytes.length) {
      const len = view.getUint32(i);
      const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
      if (type === 'eXIf') return { tags: parseTiff(view, i + 8, len), format: 'PNG' };
      if (type === 'IEND') break;
      i += 12 + len;
    }
    return { tags: [], format: 'PNG' };
  }

  if (view.byteLength > 12 && hasExifHeader(bytes, 6)) {
    return { tags: [], format: 'TIFF' };
  }

  return { tags: [], format: fileExt('file') === 'webp' ? 'WEBP' : 'unknown' };
};

const gpsDecimal = (tags: ExifTag[]): { lat: number; lon: number } | null => {
  const latDms = tags.find((t) => t.name === 'GPSLatitude');
  const lonDms = tags.find((t) => t.name === 'GPSLongitude');
  const latRef = tags.find((t) => t.name === 'GPSLatitudeRef')?.value ?? 'N';
  const lonRef = tags.find((t) => t.name === 'GPSLongitudeRef')?.value ?? 'E';
  if (!latDms || !lonDms) return null;
  const toDeg = (s: string) => {
    const nums = s
      .replace(/\([^)]*\)/g, '')
      .split(',')
      .map((p) => parseFloat(p.trim()))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return NaN;
    const [d = 0, m = 0, sec = 0] = nums;
    return d + m / 60 + sec / 3600;
  };
  const lat = toDeg(latDms.value) * (latRef.toUpperCase().startsWith('S') ? -1 : 1);
  const lon = toDeg(lonDms.value) * (lonRef.toUpperCase().startsWith('W') ? -1 : 1);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
};

const GROUP_LABEL: Record<ExifTag['group'], string> = {
  camera: 'Camera',
  exposure: 'Exposure',
  gps: 'Location (GPS)',
  date: 'Dates',
  other: 'Other',
};

interface Inspected {
  name: string;
  size: number;
  width: number;
  height: number;
  format: string;
  tags: ExifTag[];
  gps: { lat: number; lon: number } | null;
}

export const ExifStripperTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<Inspected | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleaned, setCleaned] = useState<{ blob: Blob; url: string } | null>(null);
  const [quality, setQuality] = useState(95);
  const [format, setFormat] = useState<'keep' | 'jpg' | 'png' | 'webp'>('keep');
  const [showRaw, setShowRaw] = useState(false);

  const inspect = async (f: File) => {
    setBusy(true);
    setError(null);
    setCleaned(null);
    try {
      const buffer = await f.arrayBuffer();
      const [parsed, img] = await Promise.all([Promise.resolve(readExif(buffer)), loadImageFile(f)]);
      const result: Inspected = {
        name: f.name,
        size: f.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        format: parsed.format,
        tags: parsed.tags,
        gps: gpsDecimal(parsed.tags),
      };
      setFile(f);
      setInfo(result);
      setPreview(URL.createObjectURL(f));
      soundEngine.playPop(1.1);
    } catch (e) {
      setError(`Could not inspect that file — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const strip = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const img = await loadImageFile(file);
      const ext = fileExt(file.name);
      const outExt = format === 'keep' ? (ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg') : format;
      const mime = outExt === 'png' ? 'image/png' : outExt === 'webp' ? 'image/webp' : 'image/jpeg';
      const canvas = imageToCanvas(img, img.naturalWidth, img.naturalHeight, mime === 'image/jpeg' ? '#ffffff' : undefined);
      // toBlob writes a fresh container with no EXIF/XMP/IPTC carried over
      const blob = await canvasToBlob(canvas, mime, quality / 100);
      if (cleaned) URL.revokeObjectURL(cleaned.url);
      setCleaned({ blob, url: URL.createObjectURL(blob) });
      soundEngine.playSuccess();
    } catch (e) {
      setError(`Could not clean that image — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    if (!info) return [];
    const map = new Map<ExifTag['group'], ExifTag[]>();
    for (const t of info.tags) {
      const arr = map.get(t.group) ?? [];
      arr.push(t);
      map.set(t.group, arr);
    }
    return [...map.entries()];
  }, [info]);

  const outName = info
    ? `${baseName(info.name)}-clean.${format === 'keep' ? (fileExt(info.name) === 'png' ? 'png' : 'jpg') : format}`
    : 'clean.jpg';

  const saving = cleaned && info ? ((info.size - cleaned.blob.size) / info.size) * 100 : 0;

  return (
    <div className="space-y-3">
      <Panel
        title="Image"
        icon={<Fingerprint className="h-4 w-4" />}
        actions={
          info && (
            <div className="flex flex-wrap gap-1.5">
              <StatChip label="format" value={info.format} />
              <StatChip label="size" value={humanBytes(info.size)} />
              <StatChip
                label="metadata"
                value={info.tags.length ? `${info.tags.length} tags` : 'none'}
                tone={info.tags.length ? 'red' : 'mint'}
              />
            </div>
          )
        }
      >
        <DropZone
          accept="image/*"
          onFiles={(files) => files[0] && inspect(files[0])}
          label={busy ? 'Reading…' : 'Drop a photo to inspect its metadata'}
          hint="JPEG, PNG, WEBP · the file is read in memory and never uploaded"
        />
        {error && (
          <div className="mt-2">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}
      </Panel>

      {info && (
        <>
          <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
            <Panel title="Preview" icon={<Eye className="h-4 w-4" />}>
              <div className="overflow-hidden rounded-lg border-2 border-[#BFDBFE] bg-[#0F172A]">
                <img src={preview} alt={info.name} className="block max-h-72 w-full object-contain" />
              </div>
              <p className="mt-1.5 truncate font-mono text-[10.5px] font-bold text-[#1E3A8A]" title={info.name}>
                {info.name}
              </p>
              <p className="font-mono text-[10px] text-[#64748B]">
                {info.width} × {info.height} · {humanBytes(info.size)}
              </p>
              {info.gps && (
                <div className="mt-2 rounded-lg border-2 border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-2">
                  <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#B91C1C]">
                    <MapPin className="h-3 w-3" /> This photo carries GPS coordinates
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] font-bold text-[#7F1D1D]">
                    {info.gps.lat.toFixed(6)}, {info.gps.lon.toFixed(6)}
                  </p>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${info.gps.lat}&mlon=${info.gps.lon}#map=15/${info.gps.lat}/${info.gps.lon}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-block text-[10px] font-bold text-[#B91C1C] underline decoration-dotted"
                  >
                    Show on OpenStreetMap
                  </a>
                </div>
              )}
            </Panel>

            <Panel
              title="Metadata"
              icon={info.tags.length ? <Eye className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
              actions={
                <button
                  type="button"
                  onClick={() => setShowRaw(!showRaw)}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-[#2563EB]"
                >
                  {showRaw ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showRaw ? 'Hide raw' : 'Show raw'}
                </button>
              }
            >
              {info.tags.length === 0 ? (
                <div className="flex flex-col items-center gap-1 rounded-lg border-2 border-dashed border-[#86EFAC] bg-[#F0FDF4] px-3 py-6 text-center">
                  <ShieldCheck className="h-7 w-7 text-[#15803D]" />
                  <p className="font-display text-sm font-bold text-[#15803D]">No EXIF metadata found</p>
                  <p className="text-[10.5px] font-semibold text-[#4D7C5E]">
                    Good news — nothing to strip. Screenshots and exported PNGs usually look like this.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {grouped.map(([group, tags]) => (
                    <div key={group}>
                      <p className={`mb-1 text-[9.5px] font-bold uppercase tracking-wider ${group === 'gps' ? 'text-[#B91C1C]' : 'text-[#64748B]'}`}>
                        {GROUP_LABEL[group]}
                      </p>
                      <div className="space-y-0.5">
                        {tags.map((t, i) => (
                          <div
                            key={`${t.tag}-${i}`}
                            className={`flex items-start gap-2 rounded px-1.5 py-0.5 ${
                              group === 'gps' ? 'bg-[#FEF2F2]' : 'even:bg-[#F8FAFF]'
                            }`}
                          >
                            <span className="w-28 shrink-0 truncate font-mono text-[10px] font-bold text-[#1E3A8A]" title={t.name}>
                              {t.name}
                            </span>
                            <span className="min-w-0 flex-1 break-words font-mono text-[10px] text-[#334155]">{t.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {showRaw && (
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-[#0F172A] p-2 font-mono text-[9.5px] leading-relaxed text-[#BBF7D0]">
                  {info.tags.map((t) => `0x${t.tag.toString(16).padStart(4, '0')} ${t.name} = ${t.value}`).join('\n') ||
                    '(no tags)'}
                </pre>
              )}
            </Panel>
          </div>

          <Panel
            title="Strip & clean"
            icon={<Trash2 className="h-4 w-4" />}
            actions={
              <div className="flex gap-1.5">
                {[
                  { id: 'keep' as const, label: 'Keep format' },
                  { id: 'jpg' as const, label: 'JPG' },
                  { id: 'png' as const, label: 'PNG' },
                  { id: 'webp' as const, label: 'WEBP' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id)}
                    aria-pressed={format === f.id}
                    className={`rounded-md border-2 px-2 py-0.5 text-[10px] font-bold ${
                      format === f.id
                        ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                        : 'border-[#BFDBFE] bg-white text-[#1E3A8A]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="grid gap-2.5 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="max-w-xs">
                <ToggleRow
                  label="Re-encode through canvas"
                  hint="Guarantees a clean container: EXIF, GPS, XMP, ICC private chunks and comments are all dropped"
                  checked
                  onChange={() => {}}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#BFDBFE] bg-white px-2 py-1">
                  <span className="text-[10px] font-bold text-[#1E3A8A]">Quality</span>
                  <input
                    type="range"
                    min={60}
                    max={100}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-20 accent-[#3B82F6]"
                  />
                  <span className="font-mono text-[10px] text-[#1E40AF]">{quality}</span>
                </label>
                <PrimaryButton onClick={strip} busy={busy} icon={<Trash2 className="h-4 w-4" />}>
                  Strip metadata
                </PrimaryButton>
              </div>
            </div>

            {cleaned && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border-2 border-[#86EFAC] bg-[#F0FDF4] px-2.5 py-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#15803D]" />
                <span className="text-[10.5px] font-bold text-[#15803D]">
                  Clean copy ready · {humanBytes(cleaned.blob.size)}
                  {saving !== 0 ? ` (${saving > 0 ? '−' : '+'}${Math.abs(saving).toFixed(0)}% vs original)` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => saveBlob(cleaned.blob, outName)}
                  className="toy-btn bg-[#10B981] border-[#065F46] ml-auto text-white px-3 py-1.5 text-[11px]"
                >
                  <Download className="h-3.5 w-3.5" /> Download clean copy
                </button>
              </div>
            )}
            {!cleaned && (
              <EmptyHint>
                Stripping re-encodes the image, so the result is guaranteed to carry no metadata — but JPEG re-encoding
                is slightly lossy. Use PNG output if you need a bit-exact pixel copy.
              </EmptyHint>
            )}
          </Panel>
        </>
      )}

      {!info && !busy && (
        <Panel title="How metadata leaks">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { t: 'GPS', d: 'Latitude and longitude pinpoint where a photo was taken, often to a few metres.' },
              { t: 'Device', d: 'Make, model and serial numbers identify the exact phone or camera.' },
              { t: 'Timestamps', d: 'Original capture dates reveal travel and work patterns.' },
            ].map((c) => (
              <div key={c.t} className="rounded-lg border-2 border-[#DBEAFE] bg-[#F8FAFF] px-2.5 py-2">
                <p className="text-[10.5px] font-bold text-[#1E3A8A]">{c.t}</p>
                <p className="text-[10px] leading-relaxed text-[#475569]">{c.d}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
};

export default ExifStripperTool;
