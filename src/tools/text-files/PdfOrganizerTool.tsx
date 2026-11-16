import React, { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Combine, Download, FileStack, RotateCw, Scissors, Trash2 } from 'lucide-react';
import { soundEngine } from '../../utils/soundEngine';
import { downloadBlob } from '../../utils/storage';
import { Panel, StatChip, EmptyHint, ErrorBanner } from '../coding/shared';
import { DropZone, GhostButton, PrimaryButton, loadPdfLib, humanBytes, baseName } from './pdfShared';

/* =========================================================================
   PDF Merger / Splitter / Organizer
   Load one or more PDFs, then reorder, rotate, delete and export either a
   merged document or one file per page — all with pdf-lib, all locally.
   ========================================================================= */

interface PageRef {
  uid: string;
  sourceIndex: number;
  sourceName: string;
  pageIndex: number;
  rotation: number;
}

interface SourcePdf {
  index: number;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  size: number;
}

export const PdfOrganizerTool: React.FC = () => {
  const [sources, setSources] = useState<SourcePdf[]>([]);
  const [pages, setPages] = useState<PageRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<'each' | 'range'>('each');
  const [rangeInput, setRangeInput] = useState('1-3, 5');

  const totalSize = useMemo(() => sources.reduce((n, s) => n + s.size, 0), [sources]);

  const addFiles = async (files: File[]) => {
    setError(null);
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
    if (pdfs.length === 0) {
      setError('Those files are not PDFs. Drop .pdf files to organise them.');
      return;
    }
    setBusy(true);
    try {
      const { PDFDocument } = await loadPdfLib();
      const addedSources: SourcePdf[] = [];
      const addedPages: PageRef[] = [];
      let base = sources.length;
      for (const file of pdfs) {
        const buffer = await file.arrayBuffer();
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const count = doc.getPageCount();
        const src: SourcePdf = {
          index: base,
          name: file.name,
          bytes: new Uint8Array(buffer),
          pageCount: count,
          size: file.size,
        };
        addedSources.push(src);
        for (let p = 0; p < count; p++) {
          addedPages.push({
            uid: `p-${base}-${p}-${Math.random().toString(36).slice(2, 6)}`,
            sourceIndex: base,
            sourceName: file.name,
            pageIndex: p,
            rotation: 0,
          });
        }
        base += 1;
      }
      setSources((s) => [...s, ...addedSources]);
      setPages((p) => [...p, ...addedPages]);
      soundEngine.playSuccess();
      if (addedSources.some((s) => s.pageCount === 0)) {
        setError('One of those PDFs has no readable pages.');
      }
    } catch (e) {
      setError(
        `Could not read that PDF — ${(e as Error).message}. Password-protected PDFs must be unlocked first.`
      );
    } finally {
      setBusy(false);
    }
  };

  const movePage = (from: number, to: number) => {
    if (to < 0 || to >= pages.length) return;
    const next = [...pages];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setPages(next);
    soundEngine.playPop(1.04);
  };

  const rotatePage = (uid: string) => {
    setPages((p) =>
      p.map((page) => (page.uid === uid ? { ...page, rotation: (page.rotation + 90) % 360 } : page))
    );
    soundEngine.playPop(1.02);
  };

  const deletePage = (uid: string) => {
    setPages((p) => p.filter((page) => page.uid !== uid));
    soundEngine.playPop(0.9);
  };

  const resetAll = () => {
    setSources([]);
    setPages([]);
    setError(null);
  };

  const exportMerged = async () => {
    if (pages.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { PDFDocument, degrees } = await loadPdfLib();
      const out = await PDFDocument.create();
      const loadedDocs = new Map<number, Awaited<ReturnType<typeof PDFDocument.load>>>();
      for (const src of sources) loadedDocs.set(src.index, await PDFDocument.load(src.bytes, { ignoreEncryption: true }));

      for (const ref of pages) {
        const doc = loadedDocs.get(ref.sourceIndex);
        if (!doc) continue;
        const [copied] = await out.copyPages(doc, [ref.pageIndex]);
        if (ref.rotation) {
          const current = copied.getRotation().angle;
          copied.setRotation(degrees((current + ref.rotation) % 360));
        }
        out.addPage(copied);
      }
      out.setProducer('BiteSized Utilities');
      out.setCreator('BiteSized Utilities — PDF Organizer');
      const bytes = await out.save();
      downloadBlob(
        new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
        `organised-${new Date().toISOString().slice(0, 10)}.pdf`
      );
      soundEngine.playSuccess();
    } catch (e) {
      setError(`Export failed — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const parseRange = (input: string, max: number): number[] => {
    const out = new Set<number>();
    for (const part of input.split(',')) {
      const token = part.trim();
      if (!token) continue;
      const m = token.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        const a = Math.max(1, Math.min(max, parseInt(m[1], 10)));
        const b = Math.max(1, Math.min(max, parseInt(m[2], 10)));
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i - 1);
        continue;
      }
      const single = parseInt(token, 10);
      if (!Number.isNaN(single) && single >= 1 && single <= max) out.add(single - 1);
    }
    return [...out].sort((a, b) => a - b);
  };

  const exportSplit = async () => {
    if (pages.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { PDFDocument, degrees } = await loadPdfLib();
      const loadedDocs = new Map<number, Awaited<ReturnType<typeof PDFDocument.load>>>();
      for (const src of sources) loadedDocs.set(src.index, await PDFDocument.load(src.bytes, { ignoreEncryption: true }));

      const targetPages =
        splitMode === 'each'
          ? pages.map((_, i) => i)
          : parseRange(rangeInput, pages.length);

      if (targetPages.length === 0) {
        setError('That page range is empty. Use numbers like 1-3, 5 within the page count.');
        setBusy(false);
        return;
      }

      // Build one file per requested page, zipped by the browser download loop
      const stamp = new Date().toISOString().slice(0, 10);
      for (const pageIdx of targetPages) {
        const ref = pages[pageIdx];
        if (!ref) continue;
        const doc = loadedDocs.get(ref.sourceIndex);
        if (!doc) continue;
        const single = await PDFDocument.create();
        const [copied] = await single.copyPages(doc, [ref.pageIndex]);
        if (ref.rotation) {
          const current = copied.getRotation().angle;
          copied.setRotation(degrees((current + ref.rotation) % 360));
        }
        single.addPage(copied);
        const bytes = await single.save();
        downloadBlob(
          new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
          `${baseName(ref.sourceName)}-page-${pageIdx + 1}-${stamp}.pdf`
        );
        // Small gap so browsers don't collapse simultaneous downloads
        await new Promise((r) => window.setTimeout(r, 240));
      }
      soundEngine.playSuccess();
    } catch (e) {
      setError(`Split failed — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Panel
        title="PDFs"
        icon={<FileStack className="h-4 w-4" />}
        actions={
          <div className="flex gap-1.5">
            <StatChip label="files" value={sources.length} />
            <StatChip label="pages" value={pages.length} tone="mint" />
            <StatChip label="size" value={humanBytes(totalSize)} />
          </div>
        }
      >
        <DropZone
          accept="application/pdf,.pdf"
          multiple
          onFiles={addFiles}
          label={busy ? 'Reading PDF…' : 'Drop PDFs here, or click to browse'}
          hint="Nothing leaves your device — pages are copied in memory"
        />
        {error && (
          <div className="mt-2">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}
        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] font-bold text-[#64748B]">
              {sources.map((s) => `${s.name} (${s.pageCount}p)`).join(' · ')}
            </span>
            <div className="ml-auto">
              <GhostButton onClick={resetAll}>Clear all</GhostButton>
            </div>
          </div>
        )}
      </Panel>

      {pages.length > 0 ? (
        <>
          <Panel
            title="Page order"
            icon={<Combine className="h-4 w-4" />}
            actions={
              <span className="text-[10px] font-semibold text-[#64748B]">
                rotate ↻ · move ↑↓ · delete ✕
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {pages.map((p, i) => (
                <div
                  key={p.uid}
                  className="flex items-center gap-2 rounded-lg border-2 border-[#BFDBFE] bg-white px-2 py-1.5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#EFF6FF] font-mono text-[10.5px] font-bold text-[#1E40AF]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[11px] font-bold text-[#1E3A8A]">
                      pg {p.pageIndex + 1} of {p.sourceName}
                    </span>
                    <span className="block text-[9.5px] font-semibold text-[#64748B]">
                      {p.rotation ? `rotated ${p.rotation}°` : 'original orientation'}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => movePage(i, i - 1)}
                      disabled={i === 0}
                      aria-label="Move page earlier"
                      className="rounded p-1 text-[#64748B] hover:bg-[#EFF6FF] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => movePage(i, i + 1)}
                      disabled={i === pages.length - 1}
                      aria-label="Move page later"
                      className="rounded p-1 text-[#64748B] hover:bg-[#EFF6FF] disabled:opacity-30"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => rotatePage(p.uid)}
                      aria-label="Rotate page 90°"
                      className="rounded p-1 text-[#2563EB] hover:bg-[#EFF6FF]"
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePage(p.uid)}
                      aria-label="Delete page"
                      className="rounded p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Merge & reorder" icon={<Combine className="h-4 w-4" />}>
              <p className="text-[11px] leading-relaxed text-[#475569]">
                Export every page in the order above as one document. Rotations and deletions are baked in.
              </p>
              <div className="mt-2">
                <PrimaryButton onClick={exportMerged} busy={busy} icon={<Download className="h-4 w-4" />}>
                  Export merged PDF ({pages.length} pages)
                </PrimaryButton>
              </div>
            </Panel>

            <Panel title="Split into pages" icon={<Scissors className="h-4 w-4" />}>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'each' as const, label: 'One file per page' },
                  { id: 'range' as const, label: 'Only a range' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSplitMode(t.id)}
                    aria-pressed={splitMode === t.id}
                    className={`rounded-lg border-2 px-2.5 py-1 text-[10.5px] font-bold transition ${
                      splitMode === t.id
                        ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                        : 'border-[#BFDBFE] bg-white text-[#1E3A8A]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {splitMode === 'range' && (
                <input
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  placeholder="e.g. 1-3, 5, 8-10"
                  aria-label="Page range"
                  className="mt-2 w-full rounded-lg border-2 border-[#BFDBFE] bg-white px-2.5 py-1.5 font-mono text-[11.5px] text-[#1E293B] outline-none focus:border-[#3B82F6]"
                />
              )}
              <div className="mt-2">
                <PrimaryButton onClick={exportSplit} busy={busy} icon={<Scissors className="h-4 w-4" />}>
                  Split & download
                </PrimaryButton>
              </div>
              <EmptyHint>
                Files download one after another — allow multiple downloads if your browser asks.
              </EmptyHint>
            </Panel>
          </div>
        </>
      ) : (
        <EmptyHint>Add one or more PDFs to see every page as a reorderable card.</EmptyHint>
      )}
    </div>
  );
};

export default PdfOrganizerTool;
