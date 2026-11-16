import React, { useMemo, useState } from 'react';
import { ArrowDownAZ, Download, FileArchive, Fingerprint, Hash, ListOrdered, Tags, Undo2 } from 'lucide-react';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, StatChip, EmptyHint, ErrorBanner } from '../coding/shared';
import {
  DropZone,
  GhostButton,
  humanBytes,
  PrimaryButton,
  saveBlob,
  ToggleRow,
  zipFiles,
  baseName,
  fileExt,
} from './pdfShared';

/* =========================================================================
   Batch File Renamer & ZIP Packer
   Build a name template with tokens, watch the preview update live, then
   pack the renamed copies into one ZIP — originals are untouched.
   ========================================================================= */

const TOKENS = [
  { token: '{name}', label: 'Original name' },
  { token: '{n}', label: 'Counter' },
  { token: '{ext}', label: 'Extension' },
  { token: '{date}', label: 'Today (YYYY-MM-DD)' },
  { token: '{time}', label: 'Time (HHMM)' },
  { token: '{rand}', label: 'Random 4 chars' },
  { token: '{upper}', label: 'UPPERCASE all' },
  { token: '{lower}', label: 'lowercase all' },
];

type SortMode = 'name' | 'name-desc' | 'size' | 'type' | 'modified';

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'name', label: 'Name A→Z' },
  { id: 'name-desc', label: 'Name Z→A' },
  { id: 'size', label: 'Smallest first' },
  { id: 'type', label: 'By type' },
  { id: 'modified', label: 'Newest first' },
];

const pad = (n: number, width: number) => String(n).padStart(width, '0');

const sanitise = (name: string) =>
  name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

const randomChars = (n = 4) =>
  Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

const buildName = (
  file: File,
  index: number,
  template: string,
  opts: { start: number; pad: number; lower: boolean; keepExt: boolean; stripSpaces: boolean }
): string => {
  const ext = fileExt(file.name);
  const now = new Date();
  const stem = template
    .replace(/\{name\}/g, baseName(file.name))
    .replace(/\{n\}/g, pad(index + opts.start, opts.pad))
    .replace(/\{ext\}/g, ext)
    .replace(/\{date\}/g, now.toISOString().slice(0, 10))
    .replace(/\{time\}/g, `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}`)
    .replace(/\{rand\}/g, randomChars())
    .replace(/\{upper\}/g, baseName(file.name).toUpperCase())
    .replace(/\{lower\}/g, baseName(file.name).toLowerCase());

  let finalStem = stem;
  if (opts.lower) finalStem = finalStem.toLowerCase();
  if (opts.stripSpaces) finalStem = finalStem.replace(/\s+/g, '_');
  const base = sanitise(finalStem) || 'file';
  return opts.keepExt && ext ? `${base}.${ext}` : base;
};

const sortFiles = (files: File[], mode: SortMode): File[] => {
  const copy = [...files];
  switch (mode) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    case 'name-desc':
      return copy.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    case 'size':
      return copy.sort((a, b) => a.size - b.size);
    case 'type':
      return copy.sort((a, b) => fileExt(a.name).localeCompare(fileExt(b.name)) || a.name.localeCompare(b.name));
    case 'modified':
      return copy.sort((a, b) => b.lastModified - a.lastModified);
    default:
      return copy;
  }
};

export const BatchFileRenamerTool: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [template, setTemplate] = useState('{name}-{n}');
  const [start, setStart] = useState(1);
  const [padWidth, setPadWidth] = useState(2);
  const [lower, setLower] = useState(false);
  const [keepExt, setKeepExt] = useState(true);
  const [stripSpaces, setStripSpaces] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [newFolder, setNewFolder] = useState('');
  const [removeOriginal, setRemoveOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const sorted = useMemo(() => sortFiles(files, sortMode), [files, sortMode]);

  const preview = useMemo(
    () =>
      sorted.map((file, i) => {
        const next = buildName(file, i, template, {
          start,
          pad: padWidth,
          lower,
          keepExt,
          stripSpaces,
        });
        const folder = newFolder.trim() ? `${newFolder.trim().replace(/\/+$/, '')}/` : '';
        return { file, next: `${folder}${next}`, changed: next !== file.name };
      }),
    [sorted, template, start, padWidth, lower, keepExt, stripSpaces, newFolder]
  );

  const collisions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of preview) seen.set(p.next.toLowerCase(), (seen.get(p.next.toLowerCase()) ?? 0) + 1);
    return [...seen.values()].filter((n) => n > 1).length;
  }, [preview]);

  const totalBytes = useMemo(() => files.reduce((n, f) => n + f.size, 0), [files]);
  const changedCount = preview.filter((p) => p.changed).length;

  const pack = async () => {
    if (files.length === 0) return;
    if (collisions > 0) {
      setError('Two files would end up with the same name. Add {n} to the template or change the counter.');
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const entries = await Promise.all(
        preview.map(async (p) => ({ name: p.next, blob: p.file as Blob }))
      );
      const zipName = newFolder.trim()
        ? `${newFolder.trim().replace(/[/\s]+/g, '-')}-pack.zip`
        : `renamed-files-${new Date().toISOString().slice(0, 10)}.zip`;
      const blob = await zipFiles(entries);
      saveBlob(blob, zipName);
      setDone(`${entries.length} files packed as ${zipName} (${humanBytes(blob.size)})`);
      if (removeOriginal) setFiles([]);
      soundEngine.playSuccess();
    } catch (e) {
      setError(`Packing failed — ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Panel
        title="Files"
        icon={<FileArchive className="h-4 w-4" />}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <StatChip label="files" value={files.length} />
            <StatChip label="total" value={humanBytes(totalBytes)} />
            <StatChip label="renamed" value={changedCount} tone={changedCount ? 'mint' : 'cream'} />
          </div>
        }
      >
        <DropZone
          multiple
          onFiles={(incoming) => {
            setFiles((cur) => [...cur, ...incoming]);
            setDone(null);
            setError(null);
          }}
          label="Drop any files here, or click to browse"
          hint="Photos, PDFs, documents, archives — anything you can put in a ZIP"
        />
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-[#64748B]">Sort</span>
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSortMode(s.id)}
                aria-pressed={sortMode === s.id}
                className={`rounded-md border-2 px-2 py-0.5 text-[10px] font-bold transition ${
                  sortMode === s.id
                    ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                    : 'border-[#BFDBFE] bg-white text-[#1E3A8A]'
                }`}
              >
                {s.label}
              </button>
            ))}
            <div className="ml-auto">
              <GhostButton onClick={() => setFiles([])}>
                <Undo2 className="h-3.5 w-3.5" /> Clear queue
              </GhostButton>
            </div>
          </div>
        )}
        {error && (
          <div className="mt-2">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}
        {done && (
          <p className="mt-2 rounded-lg border-2 border-[#86EFAC] bg-[#F0FDF4] px-2.5 py-1.5 text-[10.5px] font-bold text-[#15803D]">
            {done}
          </p>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Rename pattern" icon={<Tags className="h-4 w-4" />}>
          <input
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            spellCheck={false}
            aria-label="Filename template"
            className="w-full rounded-lg border-2 border-[#BFDBFE] bg-white px-2.5 py-2 font-mono text-[12.5px] text-[#1E293B] outline-none focus:border-[#3B82F6]"
            placeholder="{name}-{n}"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {TOKENS.map((t) => (
              <button
                key={t.token}
                type="button"
                title={t.label}
                onClick={() => {
                  setTemplate((cur) => (cur ? `${cur}${t.token}` : t.token));
                  soundEngine.playPop(1.04);
                }}
                className="rounded-md border border-[#BFDBFE] bg-[#F8FAFF] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-[#1E40AF] hover:border-[#3B82F6]"
              >
                {t.token}
              </button>
            ))}
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10.5px] font-bold text-[#1E3A8A]">Counter starts at</span>
              <input
                type="number"
                min={0}
                value={start}
                onChange={(e) => setStart(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full rounded-lg border-2 border-[#BFDBFE] bg-white px-2 py-1 font-mono text-[11.5px] text-[#1E293B] outline-none focus:border-[#3B82F6]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10.5px] font-bold text-[#1E3A8A]">Zero-pad width</span>
              <input
                type="number"
                min={1}
                max={6}
                value={padWidth}
                onChange={(e) => setPadWidth(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))}
                className="w-full rounded-lg border-2 border-[#BFDBFE] bg-white px-2 py-1 font-mono text-[11.5px] text-[#1E293B] outline-none focus:border-[#3B82F6]"
              />
            </label>
          </div>

          <div className="mt-2 grid gap-1.5">
            <ToggleRow label="keep extension" hint="Append the original .ext automatically" checked={keepExt} onChange={setKeepExt} />
            <ToggleRow label="lowercase names" hint="Handy for web assets" checked={lower} onChange={setLower} />
            <ToggleRow label="spaces → underscores" hint="Avoid %20 in URLs" checked={stripSpaces} onChange={setStripSpaces} />
          </div>
        </Panel>

        <Panel title="Pack into ZIP" icon={<ArrowDownAZ className="h-4 w-4" />}>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold text-[#1E3A8A]">Folder inside the ZIP (optional)</span>
            <input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              placeholder="e.g. holiday-photos"
              className="w-full rounded-lg border-2 border-[#BFDBFE] bg-white px-2.5 py-1.5 font-mono text-[11.5px] text-[#1E293B] outline-none focus:border-[#3B82F6]"
            />
          </label>
          <div className="mt-2 grid gap-1.5">
            <ToggleRow
              label="Clear queue after packing"
              hint="Keeps the browser tidy once the ZIP has downloaded"
              checked={removeOriginal}
              onChange={setRemoveOriginal}
            />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <PrimaryButton
              onClick={pack}
              busy={busy}
              disabled={files.length === 0}
              icon={<Download className="h-4 w-4" />}
            >
              {busy ? 'Packing…' : `Download renamed ZIP (${files.length})`}
            </PrimaryButton>
            {collisions > 0 && (
              <span className="text-[10.5px] font-bold text-[#B45309]">
                {collisions} name clash{collisions === 1 ? '' : 'es'} — add {'{n}'}
              </span>
            )}
          </div>

          <div className="mt-2 rounded-lg border-2 border-[#DBEAFE] bg-[#F8FAFF] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
              <ListOrdered className="h-3 w-3" /> How it works
            </p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-[#475569]">
              Renaming happens inside the ZIP only — the files on your disk keep their original names, so nothing can
              break. The archive is built in memory with JSZip.
            </p>
          </div>
          {files.length === 0 && <EmptyHint>Queue some files to see the preview table.</EmptyHint>}
        </Panel>
      </div>

      {files.length > 0 && (
        <Panel
          title={`Preview — ${preview.length} files`}
          icon={<Hash className="h-4 w-4" />}
          actions={
            preview[0] && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#64748B]">
                <Fingerprint className="h-3 w-3" />
                {preview[0].next} …
              </span>
            )
          }
        >
          <div className="max-h-80 overflow-auto rounded-lg border-2 border-[#DBEAFE]">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 bg-[#EFF6FF]">
                <tr>
                  <th className="border-b border-[#DBEAFE] px-2 py-1.5 font-bold text-[#1E3A8A]">Original</th>
                  <th className="border-b border-[#DBEAFE] px-2 py-1.5 font-bold text-[#1E3A8A]">New name</th>
                  <th className="w-20 border-b border-[#DBEAFE] px-2 py-1.5 text-right font-bold text-[#1E3A8A]">Size</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={`${p.file.name}-${i}`} className="odd:bg-white even:bg-[#FBFDFF]">
                    <td className="max-w-[16rem] truncate px-2 py-1 font-mono text-[#64748B]" title={p.file.name}>
                      {p.file.name}
                    </td>
                    <td
                      className={`max-w-[18rem] truncate px-2 py-1 font-mono font-bold ${
                        p.changed ? 'text-[#1E40AF]' : 'text-[#94A3B8]'
                      }`}
                      title={p.next}
                    >
                      {p.next}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[10px] text-[#64748B]">
                      {humanBytes(p.file.size)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
};

export default BatchFileRenamerTool;
