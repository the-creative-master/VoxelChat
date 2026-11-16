import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Copy,
  Download,
  Link2,
  QrCode,
  ScanLine,
  Wifi,
  Mail,
  Phone,
  Type,
  ImageUp,
} from 'lucide-react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { soundEngine } from '../../utils/soundEngine';
import { copyToClipboard } from '../../utils/storage';
import { Panel, StatChip, EmptyHint, ErrorBanner } from '../coding/shared';
import { GhostButton, PrimaryButton, loadImage, readAsDataUrl, Slider } from './pdfShared';

/* =========================================================================
   QR / Barcode Studio
   Generates QR codes (text, URL, Wi-Fi, email, phone, SMS, vCard) with real
   error-correction choices, and scans them from the webcam or an image using
   jsQR — all in the browser.
   ========================================================================= */

type PayloadKind = 'text' | 'url' | 'wifi' | 'email' | 'phone' | 'sms' | 'vcard';

const KINDS: { id: PayloadKind; label: string; icon: React.ReactNode }[] = [
  { id: 'text', label: 'Text', icon: <Type className="h-3.5 w-3.5" /> },
  { id: 'url', label: 'Link', icon: <Link2 className="h-3.5 w-3.5" /> },
  { id: 'wifi', label: 'Wi-Fi', icon: <Wifi className="h-3.5 w-3.5" /> },
  { id: 'email', label: 'Email', icon: <Mail className="h-3.5 w-3.5" /> },
  { id: 'phone', label: 'Phone', icon: <Phone className="h-3.5 w-3.5" /> },
  { id: 'sms', label: 'SMS', icon: <Phone className="h-3.5 w-3.5" /> },
  { id: 'vcard', label: 'Contact', icon: <Copy className="h-3.5 w-3.5" /> },
];

const escapeWifi = (s: string) => s.replace(/([\\;,":])/g, '\\$1');

const buildPayload = (
  kind: PayloadKind,
  f: {
    text: string;
    url: string;
    ssid: string;
    password: string;
    encryption: 'WPA' | 'WEP' | 'nopass';
    hidden: boolean;
    email: string;
    subject: string;
    body: string;
    phone: string;
    message: string;
    name: string;
    org: string;
    title: string;
  }
): string => {
  switch (kind) {
    case 'text':
      return f.text;
    case 'url': {
      const u = f.url.trim();
      if (!u) return '';
      return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u) ? u : `https://${u}`;
    }
    case 'wifi':
      return f.ssid
        ? `WIFI:T:${f.encryption};S:${escapeWifi(f.ssid)};${f.encryption !== 'nopass' ? `P:${escapeWifi(f.password)};` : ''}${f.hidden ? 'H:true;' : ''};`
        : '';
    case 'email': {
      if (!f.email) return '';
      const params = [f.subject && `subject=${encodeURIComponent(f.subject)}`, f.body && `body=${encodeURIComponent(f.body)}`]
        .filter(Boolean)
        .join('&');
      return `mailto:${f.email}${params ? `?${params}` : ''}`;
    }
    case 'phone':
      return f.phone ? `tel:${f.phone.replace(/\s+/g, '')}` : '';
    case 'sms':
      return f.phone ? `sms:${f.phone.replace(/\s+/g, '')}${f.message ? `?body=${encodeURIComponent(f.message)}` : ''}` : '';
    case 'vcard':
      return f.name
        ? ['BEGIN:VCARD', 'VERSION:3.0', `FN:${f.name}`, f.org && `ORG:${f.org}`, f.title && `TITLE:${f.title}`, f.phone && `TEL;TYPE=CELL:${f.phone}`, f.email && `EMAIL:${f.email}`, f.url && `URL:${f.url}`, 'END:VCARD']
            .filter(Boolean)
            .join('\n')
        : '';
    default:
      return '';
  }
};

const SAMPLE_TEXT = 'BiteSized Utilities — 200 local tools, no sign-up.';

export const QrBarcodeStudioTool: React.FC = () => {
  const [tab, setTab] = useState<'generate' | 'scan'>('generate');
  const [kind, setKind] = useState<PayloadKind>('text');
  const [fields, setFields] = useState({
    text: SAMPLE_TEXT,
    url: 'bitesizedutilities.vercel.app',
    ssid: 'WaffleKitchen',
    password: 'butter-and-syrup',
    encryption: 'WPA' as 'WPA' | 'WEP' | 'nopass',
    hidden: false,
    email: 'hello@example.com',
    subject: 'Hello from a QR code',
    body: '',
    phone: '+971 50 123 4567',
    message: 'Hi!',
    name: 'Ada Lovelace',
    org: 'Analytical Engines',
    title: 'Mathematician',
  });
  const [size, setSize] = useState(320);
  const [margin, setMargin] = useState(2);
  const [dark, setDark] = useState('#1E293B');
  const [ecLevel, setEcLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  /* scanning state */
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const payload = buildPayload(kind, fields);

  /* ------------------------------ generation ------------------------------ */

  useEffect(() => {
    let cancelled = false;
    if (!payload) {
      setDataUrl('');
      return;
    }
    QRCode.toDataURL(payload, {
      width: Math.round(size),
      margin,
      errorCorrectionLevel: ecLevel,
      color: { dark, light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [payload, size, margin, dark, ecLevel]);

  const downloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${kind}-${Date.now()}.png`;
    a.click();
    soundEngine.playSuccess();
  };

  const copyPayload = async () => {
    const ok = await copyToClipboard(payload);
    if (ok) {
      setCopied(true);
      soundEngine.playPop(1.15);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  /* -------------------------------- scanning ------------------------------- */

  const stopScan = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stopScan, [stopScan]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
    if (found?.data) {
      setScanResult(found.data);
      setScanError(null);
      soundEngine.playSuccess();
      stopScan();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [stopScan]);

  const startScan = async () => {
    setScanError(null);
    setScanResult(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setScanError('This browser does not expose a camera to web pages. Drop a QR image instead.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setScanning(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const err = e as Error;
      setScanError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was blocked. You can allow it in the address bar, or drop an image instead.'
          : `Camera unavailable — ${err.message}`
      );
      stopScan();
    }
  };

  const scanImageFile = async (file: File) => {
    setScanError(null);
    setScanResult(null);
    try {
      const img = await loadImage(await readAsDataUrl(file));
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas is unavailable');
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
      if (found?.data) {
        setScanResult(found.data);
        soundEngine.playSuccess();
      } else {
        setScanError('No QR code detected. Try a sharper, larger or less cropped image.');
      }
    } catch (e) {
      setScanError(`Could not read that image — ${(e as Error).message}`);
    }
  };

  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const field = (label: string, node: React.ReactNode) => (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold text-[#1E3A8A]">{label}</span>
      {node}
    </label>
  );

  const inputCls =
    'w-full rounded-lg border-2 border-[#BFDBFE] bg-white px-2.5 py-1.5 font-mono text-[11.5px] text-[#1E293B] outline-none focus:border-[#3B82F6]';

  return (
    <div className="space-y-3">
      <Panel
        title="QR & barcode studio"
        icon={<QrCode className="h-4 w-4" />}
        actions={
          <div className="inline-flex rounded-lg border-2 border-[#BFDBFE] bg-[#EFF6FF] p-0.5">
            {[
              { id: 'generate' as const, label: 'Generate', icon: <QrCode className="h-3 w-3" /> },
              { id: 'scan' as const, label: 'Scan', icon: <ScanLine className="h-3 w-3" /> },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  if (t.id === 'generate') stopScan();
                  soundEngine.playPop(1.05);
                }}
                aria-pressed={tab === t.id}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                  tab === t.id ? 'bg-white text-[#1E3A8A] shadow-sm' : 'text-[#64748B] hover:text-[#1E3A8A]'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {tab === 'generate' ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => {
                const on = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => {
                      setKind(k.id);
                      soundEngine.playPop(1.05);
                    }}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1 rounded-lg border-2 border-b-[4px] px-2.5 py-1.5 font-display text-[11px] font-bold transition active:translate-y-[2px] active:border-b-2 ${
                      on
                        ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                        : 'border-[#BFDBFE] bg-white text-[#1E3A8A] hover:border-[#3B82F6]'
                    }`}
                  >
                    {k.icon}
                    {k.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {kind === 'text' && (
                <div className="sm:col-span-2">
                  {field('Text', (
                    <textarea
                      value={fields.text}
                      onChange={(e) => set('text', e.target.value)}
                      rows={3}
                      className={`${inputCls} resize-y`}
                      placeholder="Anything you like…"
                    />
                  ))}
                </div>
              )}
              {kind === 'url' && (
                <div className="sm:col-span-2">
                  {field('Website address', (
                    <input value={fields.url} onChange={(e) => set('url', e.target.value)} className={inputCls} placeholder="example.com" />
                  ))}
                </div>
              )}
              {kind === 'wifi' && (
                <>
                  {field('Network name (SSID)', <input value={fields.ssid} onChange={(e) => set('ssid', e.target.value)} className={inputCls} />)}
                  {field('Password', <input value={fields.password} onChange={(e) => set('password', e.target.value)} className={inputCls} />)}
                  <label className="block">
                    <span className="mb-1 block text-[10.5px] font-bold text-[#1E3A8A]">Security</span>
                    <div className="flex gap-1.5">
                      {(['WPA', 'WEP', 'nopass'] as const).map((enc) => (
                        <button
                          key={enc}
                          type="button"
                          onClick={() => set('encryption', enc)}
                          aria-pressed={fields.encryption === enc}
                          className={`rounded-md border-2 px-2 py-1 font-mono text-[10px] font-bold ${
                            fields.encryption === enc
                              ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                              : 'border-[#BFDBFE] bg-white text-[#1E3A8A]'
                          }`}
                        >
                          {enc === 'nopass' ? 'Open' : enc}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="flex items-center gap-1.5 self-end text-[10.5px] font-bold text-[#1E3A8A]">
                    <input type="checkbox" checked={fields.hidden} onChange={(e) => set('hidden', e.target.checked)} className="h-3.5 w-3.5 accent-[#3B82F6]" />
                    Hidden network
                  </label>
                </>
              )}
              {(kind === 'email' || kind === 'vcard') && (
                <>
                  {field('Email', <input value={fields.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />)}
                  {kind === 'email' && field('Subject', <input value={fields.subject} onChange={(e) => set('subject', e.target.value)} className={inputCls} />)}
                  {kind === 'vcard' && field('Full name', <input value={fields.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />)}
                  {kind === 'vcard' && field('Organisation', <input value={fields.org} onChange={(e) => set('org', e.target.value)} className={inputCls} />)}
                  {kind === 'vcard' && field('Job title', <input value={fields.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />)}
                </>
              )}
              {kind === 'email' && (
                <div className="sm:col-span-2">
                  {field('Body', (
                    <textarea value={fields.body} onChange={(e) => set('body', e.target.value)} rows={2} className={`${inputCls} resize-y`} />
                  ))}
                </div>
              )}
              {(kind === 'phone' || kind === 'sms' || kind === 'vcard') &&
                field('Phone', <input value={fields.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />)}
              {kind === 'sms' && field('Message', <input value={fields.message} onChange={(e) => set('message', e.target.value)} className={inputCls} />)}
            </div>

            {error && (
              <div className="mt-2">
                <ErrorBanner message={error} onDismiss={() => setError(null)} />
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] leading-relaxed text-[#475569]">
            Scan a QR code with your camera, or drop a screenshot / photo of one. Decoding happens on this device —
            the camera feed is never uploaded.
          </p>
        )}
      </Panel>

      {tab === 'generate' ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <Panel title="Code" icon={<QrCode className="h-4 w-4" />}>
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#93C5FD] bg-white p-3">
              {dataUrl ? (
                <img src={dataUrl} alt="Generated QR code" className="max-w-full" style={{ width: Math.min(size, 280) }} />
              ) : (
                <div className="flex h-40 w-40 flex-col items-center justify-center gap-1 text-center text-[#93C5FD]">
                  <QrCode className="h-10 w-10" />
                  <span className="text-[10.5px] font-semibold text-[#64748B]">Fill the form to generate</span>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={downloadPng}
                  disabled={!dataUrl}
                  className="toy-btn bg-[#3B82F6] border-[#1E40AF] text-white px-3 py-1.5 text-[11px] disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" /> Download PNG
                </button>
                <GhostButton onClick={copyPayload} disabled={!payload}>
                  {copied ? 'Copied!' : 'Copy payload'}
                </GhostButton>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatChip label="payload" value={`${payload.length} ch`} />
              <StatChip label="EC" value={ecLevel} tone="mint" />
              <StatChip label="type" value={kind} />
            </div>
            {payload && (
              <p className="mt-1.5 break-all rounded-lg bg-[#F8FAFF] px-2 py-1.5 font-mono text-[10px] leading-relaxed text-[#475569]">
                {payload.length > 260 ? `${payload.slice(0, 260)}…` : payload}
              </p>
            )}
            <EmptyHint>
              Barcodes (Code128, EAN) are not generated here — the encoder bundled with the app only covers QR. Keep
              payloads under ~2,950 bytes for version 40.
            </EmptyHint>
          </Panel>

          <Panel title="Appearance" icon={<QrCode className="h-4 w-4" />}>
            <div className="space-y-2.5">
              <Slider label="Size" value={size} min={160} max={1024} step={16} suffix=" px" onChange={setSize} />
              <Slider label="Quiet zone (margin)" value={margin} min={0} max={8} onChange={setMargin} hint="White border around the code — scanners need it" />
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-[#1E3A8A]">Module colour</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {['#1E293B', '#1E3A8A', '#065F46', '#7F1D1D', '#000000'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDark(c)}
                      aria-label={`Use ${c}`}
                      aria-pressed={dark === c}
                      className={`h-7 w-7 rounded-md border-2 ${dark === c ? 'border-[#3B82F6] ring-2 ring-[#BFDBFE]' : 'border-[#DBEAFE]'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={dark}
                    onChange={(e) => setDark(e.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border-2 border-[#DBEAFE] bg-white"
                    aria-label="Custom module colour"
                  />
                </div>
              </label>
              <div>
                <span className="mb-1 block text-[11px] font-bold text-[#1E3A8A]">Error correction</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'L' as const, label: 'L · 7%' },
                    { id: 'M' as const, label: 'M · 15%' },
                    { id: 'Q' as const, label: 'Q · 25%' },
                    { id: 'H' as const, label: 'H · 30%' },
                  ].map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setEcLevel(l.id)}
                      aria-pressed={ecLevel === l.id}
                      title={`Recovers up to ${l.label.split('· ')[1]} damage`}
                      className={`rounded-md border-2 px-2 py-1 font-mono text-[10px] font-bold ${
                        ecLevel === l.id
                          ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                          : 'border-[#BFDBFE] bg-white text-[#1E3A8A]'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[9.5px] font-medium text-[#64748B]">
                  Higher levels survive scratches and logos at the cost of more modules.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel
            title="Camera scanner"
            icon={scanning ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
            actions={scanning ? <StatChip label="status" value="live" tone="mint" /> : undefined}
          >
            <div className="relative overflow-hidden rounded-lg border-2 border-[#BFDBFE] bg-[#0F172A]">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`block w-full ${scanning ? 'opacity-100' : 'opacity-40'}`}
                style={{ maxHeight: 280, objectFit: 'cover' }}
              />
              {scanning && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-32 w-32 rounded-lg border-2 border-[#38BDF8] shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
                </div>
              )}
              {!scanning && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#93C5FD]">
                  <ScanLine className="h-8 w-8" />
                  <span className="text-[10.5px] font-semibold">Camera is off</span>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {!scanning ? (
                <PrimaryButton onClick={startScan} icon={<Camera className="h-4 w-4" />}>
                  Start camera
                </PrimaryButton>
              ) : (
                <GhostButton onClick={stopScan}>
                  <CameraOff className="h-3.5 w-3.5" /> Stop
                </GhostButton>
              )}
              <label className="toy-btn-cream inline-flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs">
                <ImageUp className="h-3.5 w-3.5" /> Scan an image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void scanImageFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {scanError && (
              <div className="mt-2">
                <ErrorBanner message={scanError} onDismiss={() => setScanError(null)} />
              </div>
            )}
          </Panel>

          <Panel
            title="Result"
            icon={<ScanLine className="h-4 w-4" />}
            actions={
              scanResult && (
                <button
                  type="button"
                  onClick={() => {
                    void copyToClipboard(scanResult);
                    soundEngine.playPop(1.15);
                  }}
                  className="toy-btn-cream px-2 py-1.5 text-[10.5px]"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              )
            }
          >
            {scanResult ? (
              <>
                <div className="break-all rounded-lg border-2 border-[#86EFAC] bg-[#F0FDF4] p-2.5 font-mono text-[12px] leading-relaxed text-[#14532D]">
                  {scanResult}
                </div>
                {/^https?:\/\//i.test(scanResult) && (
                  <a
                    href={scanResult}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex items-center gap-1 rounded-lg border-2 border-[#1E40AF] bg-[#3B82F6] px-3 py-1.5 text-[11px] font-bold text-white"
                  >
                    <Link2 className="h-3.5 w-3.5" /> Open link
                  </a>
                )}
                <div className="mt-2">
                  <PrimaryButton
                    onClick={() => {
                      setTab('generate');
                      setKind('text');
                      set('text', scanResult);
                    }}
                    icon={<QrCode className="h-4 w-4" />}
                  >
                    Re-generate as QR
                  </PrimaryButton>
                </div>
              </>
            ) : (
              <EmptyHint>
                Nothing scanned yet. Start the camera and point it at a QR code, or drop a screenshot. Results stay on
                this device.
              </EmptyHint>
            )}
            {dataUrl && tab === 'scan' && null}
          </Panel>
        </div>
      )}
    </div>
  );
};

export default QrBarcodeStudioTool;
