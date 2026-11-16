/* =========================================================================
   PDF helpers for Cupboard 3 — pdf-lib (writing) and pdf.js (rasterising).

   Both libraries are dynamically imported so they only cost bandwidth on the
   tools that actually need them, and pdf.js's worker is pointed at the copy
   bundled by Vite (no CDN, works offline).
   ========================================================================= */

type PdfLibModule = typeof import('pdf-lib');

let pdfLibPromise: Promise<PdfLibModule> | null = null;

export const loadPdfLib = (): Promise<PdfLibModule> => {
  if (!pdfLibPromise) pdfLibPromise = import('pdf-lib');
  return pdfLibPromise;
};

type PdfJsModule = typeof import('pdfjs-dist');

let pdfJsPromise: Promise<PdfJsModule> | null = null;

export const loadPdfJs = async (): Promise<PdfJsModule> => {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      const lib = await import('pdfjs-dist');
      // Vite rewrites this to a hashed asset URL and serves it locally.
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    })();
  }
  return pdfJsPromise;
};

export interface RenderedPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
}

/**
 * Rasterise every page of a PDF at the requested DPI.
 * scale = dpi / 72 because PDF user units are 1/72 inch.
 */
export const renderPdfToCanvases = async (
  bytes: ArrayBuffer | Uint8Array,
  dpi: number,
  options: {
    maxPages?: number;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<RenderedPdfPage[]> => {
  const { getDocument } = await loadPdfJs();
  const data = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;
  const total = Math.min(doc.numPages, options.maxPages ?? doc.numPages);
  const scale = dpi / 72;
  const out: RenderedPdfPage[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable in this browser');
    // White base so transparent PDF backgrounds do not become black in JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    out.push({ pageNumber: i, width: canvas.width, height: canvas.height, canvas });
    options.onProgress?.(i, total);
    page.cleanup();
  }
  await loadingTask.destroy();
  return out;
};

export const getPdfPageCount = async (bytes: ArrayBuffer | Uint8Array): Promise<number> => {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return doc.getPageCount();
};

export {
  DropZone,
  GhostButton,
  PrimaryButton,
  Slider,
  ToggleRow,
  DownloadButton,
  humanBytes,
  baseName,
  fileExt,
  readAsArrayBuffer,
  readAsDataUrl,
  readAsText,
  loadImage,
  loadImageFile,
  imageToCanvas,
  canvasToBlob,
  MIME_BY_EXT,
  isImageFile,
  saveBlob,
  zipFiles,
  FileChip,
  ProgressBar,
} from './shared';
