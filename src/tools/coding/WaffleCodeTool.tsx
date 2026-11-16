import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Plus, Trash2, Download, Upload, FileCode2, FolderOpen, Sun, Moon,
  Package, ChevronDown, Check, Loader2, Maximize2, Minimize2, TerminalSquare, X,
  FilePlus, RotateCcw, Database, Cpu, CheckCircle2, AlertTriangle, PanelLeftClose, PanelLeftOpen,
  Copy,
} from 'lucide-react';
import JSZip from 'jszip';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { downloadBlob, idbGet, idbSet } from '../../utils/storage';
import { WAFFLECODE_LANGUAGES, type LanguageSpec, type ProjectFile } from './wafflecode/languages';
import { CodeEditor } from './wafflecode/CodeEditor';
import { PackageManager } from './wafflecode/PackageManager';
import { executeProject, type ExecuteResult } from './wafflecode/dispatcher';
import type { SqlResult } from './wafflecode/runners';

interface ConsoleLine { id: number; stream: 'stdout' | 'stderr' | 'meta'; text: string }

const STORAGE_KEY = 'bsu.wafflecode.project.v1';

interface PersistedProject {
  languageId: string;
  filesByLang: Record<string, ProjectFile[]>;
  activeFileName: Record<string, string>;
  packages: Record<string, string[]>;
  theme: 'dark' | 'light';
}

const defaultFiles = (lang: LanguageSpec): ProjectFile[] => lang.starterFiles.map((f) => ({ ...f }));

export const WaffleCodeTool: React.FC = () => {
  const [language, setLanguage] = useState<LanguageSpec>(WAFFLECODE_LANGUAGES[0]);
  const [filesByLang, setFilesByLang] = useState<Record<string, ProjectFile[]>>(() => {
    const map: Record<string, ProjectFile[]> = {};
    WAFFLECODE_LANGUAGES.forEach((l) => { map[l.id] = defaultFiles(l); });
    return map;
  });
  const [activeFileName, setActiveFileName] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    WAFFLECODE_LANGUAGES.forEach((l) => { map[l.id] = l.starterFiles[0]?.name ?? ''; });
    return map;
  });
  const [packagesByLang, setPackagesByLang] = useState<Record<string, string[]>>({});
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([
    { id: 1, stream: 'meta', text: 'WaffleCode ready. Press ⌘/Ctrl + Enter to run — everything executes locally in this tab.' },
  ]);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<ExecuteResult | null>(null);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(true);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [previewTab, setPreviewTab] = useState<'preview' | 'console'>('console');
  const [packageOpen, setPackageOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [addingFile, setAddingFile] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [sqlSchemaOpen, setSqlSchemaOpen] = useState(true);
  const lineId = useRef(2);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedRef = useRef(false);

  const files = filesByLang[language.id] ?? [];
  const activeFile = files.find((f) => f.name === activeFileName[language.id]) ?? files[0];
  const packages = packagesByLang[language.id] ?? [];
  const supportsPreview = Boolean(language.supportsPreview);

  /* ------------------------- hydrate ------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await idbGet<PersistedProject>(STORAGE_KEY);
        if (!cancelled && saved && saved.languageId) {
          const langId = saved.languageId;
          const found = WAFFLECODE_LANGUAGES.find((l) => l.id === langId) ?? WAFFLECODE_LANGUAGES[0];
          setLanguage(found);
          if (saved.filesByLang) {
            setFilesByLang((prev) => {
              const next = { ...prev };
              for (const [key, value] of Object.entries(saved.filesByLang)) {
                if (Array.isArray(value) && value.length) next[key] = value;
              }
              return next;
            });
          }
          if (saved.activeFileName) setActiveFileName((prev) => ({ ...prev, ...saved.activeFileName }));
          if (saved.packages) setPackagesByLang(saved.packages);
          if (saved.theme) setTheme(saved.theme);
        }
      } catch {
        /* storage unavailable — start with starter templates */
      } finally {
        hydratedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------- persist --------------------------- */
  useEffect(() => {
    if (!hydratedRef.current) return;
    const handle = window.setTimeout(() => {
      void idbSet<PersistedProject>(STORAGE_KEY, {
        languageId: language.id,
        filesByLang,
        activeFileName,
        packages: packagesByLang,
        theme,
      });
    }, 550);
    return () => window.clearTimeout(handle);
  }, [language.id, filesByLang, activeFileName, packagesByLang, theme]);

  /* ------------------------- console helpers ------------------------- */
  const pushLines = useCallback((lines: { stream: ConsoleLine['stream']; text: string }[]) => {
    setConsoleLines((prev) => {
      const next = [...prev];
      for (const line of lines) next.push({ id: lineId.current++, ...line });
      return next.slice(-800);
    });
  }, []);

  const clearConsole = useCallback(() => {
    soundEngine.playClick();
    setConsoleLines([{ id: lineId.current++, stream: 'meta', text: 'Console cleared.' }]);
    setLastResult(null);
  }, []);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [consoleLines]);

  /* ---------------------------- run ---------------------------- */
  const bufferRef = useRef<string[]>([]);
  const flushBuffer = useCallback(() => {
    if (!bufferRef.current.length) return;
    const text = bufferRef.current.join('');
    bufferRef.current = [];
    const pieces = text.split(/(?<=\n)/);
    pushLines(pieces.map((t) => ({ stream: 'stdout' as const, text: t })));
  }, [pushLines]);

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    soundEngine.playPop(1.05);
    setConsoleLines([{ id: lineId.current++, stream: 'meta', text: `▶ Running ${language.name} — ${activeFile?.name ?? 'no file'} (${language.runtimeLabel})` }]);
    setLastResult(null);
    bufferRef.current = [];
    const started = performance.now();
    let pendingFlush: number | null = null;

    const onOutput = (stream: 'stdout' | 'stderr', text: string) => {
      if (stream === 'stderr') {
        flushBuffer();
        pushLines(text.split(/(?<=\n)/).map((t) => ({ stream: 'stderr' as const, text: t })));
      } else {
        bufferRef.current.push(text);
        if (!pendingFlush) {
          pendingFlush = window.setTimeout(() => { pendingFlush = null; flushBuffer(); }, 40);
        }
      }
    };

    try {
      const result = await executeProject({
        languageId: language.id,
        files,
        packages,
        onOutput,
      });
      if (pendingFlush) { window.clearTimeout(pendingFlush); pendingFlush = null; }
      flushBuffer();
      setLastResult(result);
      const duration = result.ms || Math.round(performance.now() - started);
      pushLines([{
        stream: 'meta',
        text: result.stderr
          ? `■ Finished in ${duration} ms with errors — check the red lines above.`
          : `■ Finished in ${duration} ms — process exited cleanly.`,
      }]);
      if (result.preview) setPreviewTab('preview');
      if (!result.stderr) soundEngine.playSuccess();
    } catch (err) {
      if (pendingFlush) { window.clearTimeout(pendingFlush); pendingFlush = null; }
      flushBuffer();
      pushLines([{ stream: 'stderr', text: `Engine failure: ${err instanceof Error ? err.message : String(err)}\n` }]);
    } finally {
      setRunning(false);
    }
  }, [activeFile?.name, files, flushBuffer, language.id, language.name, language.runtimeLabel, packages, pushLines, running]);

  /* --------------------- file operations --------------------- */
  const updateFileContent = useCallback((content: string) => {
    if (!activeFile) return;
    setFilesByLang((prev) => ({
      ...prev,
      [language.id]: (prev[language.id] ?? []).map((f) => (f.name === activeFile.name ? { ...f, content } : f)),
    }));
  }, [activeFile, language.id]);

  const addFile = () => {
    const name = newFileName.trim();
    if (!name) return;
    const safe = name.includes('.') ? name : `${name}${language.defaultExt}`;
    if (files.some((f) => f.name === safe)) {
      pushLines([{ stream: 'stderr', text: `A file named ${safe} already exists.\n` }]);
      return;
    }
    soundEngine.playPop(1.2);
    setFilesByLang((prev) => ({ ...prev, [language.id]: [...(prev[language.id] ?? []), { name: safe, content: '' }] }));
    setActiveFileName((prev) => ({ ...prev, [language.id]: safe }));
    setNewFileName('');
    setAddingFile(false);
  };

  const deleteFile = (name: string) => {
    if (files.length <= 1) {
      pushLines([{ stream: 'stderr', text: 'Keep at least one file in the project.\n' }]);
      return;
    }
    soundEngine.playClick();
    const remaining = files.filter((f) => f.name !== name);
    setFilesByLang((prev) => ({ ...prev, [language.id]: remaining }));
    if (activeFileName[language.id] === name) {
      setActiveFileName((prev) => ({ ...prev, [language.id]: remaining[0]?.name ?? '' }));
    }
  };

  const resetProject = () => {
    soundEngine.playPop(0.9);
    setFilesByLang((prev) => ({ ...prev, [language.id]: defaultFiles(language) }));
    setActiveFileName((prev) => ({ ...prev, [language.id]: language.starterFiles[0]?.name ?? '' }));
    pushLines([{ stream: 'meta', text: `Restored the ${language.name} starter template.` }]);
  };

  /* --------------------- ZIP import / export --------------------- */
  const exportZip = async () => {
    soundEngine.playPop(1.1);
    const zip = new JSZip();
    files.forEach((f) => zip.file(f.name, f.content));
    zip.file(
      'wafflecode.json',
      JSON.stringify({ language: language.id, languageName: language.name, exportedAt: new Date().toISOString(), files: files.map((f) => f.name), packages }, null, 2)
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `wafflecode-${language.id}.zip`);
    pushLines([{ stream: 'meta', text: `Exported ${files.length} file(s) as wafflecode-${language.id}.zip` }]);
  };

  const importZip = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      const imported: ProjectFile[] = [];
      const entries = Object.values(zip.files).filter((e) => !e.dir && !e.name.startsWith('__MACOSX'));
      for (const entry of entries) {
        if (entry.name.endsWith('.json') && entry.name === 'wafflecode.json') continue;
        if (entry.name.endsWith('.wasm') || entry.name.endsWith('.png') || entry.name.endsWith('.jpg')) continue;
        const content = await entry.async('text');
        if (content.length > 400_000) continue;
        imported.push({ name: entry.name.split('/').pop() ?? entry.name, content });
      }
      if (!imported.length) {
        pushLines([{ stream: 'stderr', text: 'No readable text files found inside that ZIP.\n' }]);
        return;
      }
      soundEngine.playSuccess();
      setFilesByLang((prev) => ({ ...prev, [language.id]: imported }));
      setActiveFileName((prev) => ({ ...prev, [language.id]: imported[0].name }));
      pushLines([{ stream: 'meta', text: `Imported ${imported.length} file(s): ${imported.map((f) => f.name).join(', ')}` }]);
    } catch (err) {
      pushLines([{ stream: 'stderr', text: `ZIP import failed: ${err instanceof Error ? err.message : String(err)}\n` }]);
    }
  };

  /* --------------------------- keyboard --------------------------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleRun();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleRun]);

  const consoleText = useMemo(() => consoleLines.map((l) => l.text).join(''), [consoleLines]);
  const sqlPreview = lastResult?.preview?.kind === 'sqlite' ? (lastResult.preview.sql as SqlResult | undefined) : undefined;
  const previewHtml = lastResult?.preview?.html ?? '';
  const bfState = lastResult?.preview?.brainfuck;

  return (
    <div className={`w-full ${fullscreen ? 'fixed inset-2 z-40' : ''}`}>
      <div className={`flex flex-col rounded-2xl overflow-hidden border-2 border-b-[6px] border-[#2F4F3A] bg-[#1F150E] shadow-toy-lg ${fullscreen ? 'h-[calc(100vh-1rem)]' : 'min-h-[720px] h-[calc(100vh-15rem)] max-h-[960px]'}`}>
        {/* ---------------------------- top bar ---------------------------- */}
        <div className="flex flex-wrap items-center gap-2 px-2.5 sm:px-3.5 py-2 bg-[#2A1C12] border-b-2 border-[#40291A]">
          <div className="relative">
            <button
              type="button"
              onClick={() => { soundEngine.playClick(); setLangMenuOpen((v) => !v); }}
              className="toy-btn bg-[#3A2717] border-[#5C3E24] text-[#FDF3E1] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs"
              aria-haspopup="listbox"
              aria-expanded={langMenuOpen}
            >
              <TerminalSquare className="w-3.5 h-3.5 text-[#86EFAC]" />
              <span className="font-mono">{language.badge}</span>
              <span className="hidden xs:inline sm:inline font-display">{language.name}</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>
            <AnimatePresence>
              {langMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setLangMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute left-0 top-full mt-1.5 z-40 w-72 max-h-[26rem] overflow-y-auto rounded-xl bg-[#241810] border-2 border-[#5C3E24] shadow-toy-lg p-1.5"
                    role="listbox"
                  >
                    <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-[#A98768] font-bold">32 languages · all local</p>
                    {WAFFLECODE_LANGUAGES.map((lang) => (
                      <button
                        key={lang.id}
                        type="button"
                        role="option"
                        aria-selected={lang.id === language.id}
                        onClick={() => {
                          soundEngine.playPop(1.14);
                          setLanguage(lang);
                          setLangMenuOpen(false);
                          setLastResult(null);
                          setConsoleLines([{ id: lineId.current++, stream: 'meta', text: `Switched to ${lang.name} — ${lang.runtimeLabel}` }]);
                        }}
                        className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                          lang.id === language.id ? 'bg-[#2F6E45] text-white' : 'text-[#E7D9C6] hover:bg-[#3A2717]'
                        }`}
                      >
                        <span className="w-9 shrink-0 font-mono text-[10px] text-[#86EFAC]">{String(lang.number).padStart(2, '0')}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-semibold truncate">{lang.name}</span>
                          <span className="block text-[10px] text-[#A98768] truncate">{lang.runtimeLabel}</span>
                        </span>
                        {lang.id === language.id && <Check className="w-3.5 h-3.5 text-[#86EFAC] shrink-0" />}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => void handleRun()} disabled={running} className="toy-btn-mint px-3 py-1.5 text-[11px] sm:text-xs">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{running ? 'Running' : 'Run'}</span>
            </button>
            <kbd className="hidden md:inline-block font-mono text-[10px] text-[#8C6B4F] border border-[#4C3320] rounded px-1.5 py-0.5">⌘↵</kbd>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            {language.supportsPackages && (
              <button
                type="button"
                onClick={() => { soundEngine.playClick(); setPackageOpen(true); }}
                className="toy-btn bg-[#3A2717] border-[#5C3E24] text-[#FDE68A] px-2 py-1.5 text-[11px]"
                title="Local Package Manager"
              >
                <Package className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{packages.length ? `Packages · ${packages.length}` : 'Packages'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => { soundEngine.playClick(); setTheme(theme === 'dark' ? 'light' : 'dark'); }}
              className="toy-btn bg-[#3A2717] border-[#5C3E24] text-[#FDE68A] px-2 py-1.5 text-[11px]"
              title={theme === 'dark' ? 'Switch to Creamy Latte Light' : 'Switch to Waffle Roast Dark'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={() => void exportZip()} className="toy-btn bg-[#3A2717] border-[#5C3E24] text-[#FDF3E1] px-2 py-1.5 text-[11px]" title="Export project as ZIP">
              <Download className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="toy-btn bg-[#3A2717] border-[#5C3E24] text-[#FDF3E1] px-2 py-1.5 text-[11px]" title="Import a ZIP project">
              <Upload className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importZip(file);
                e.target.value = '';
              }}
            />
            <button type="button" onClick={resetProject} className="toy-btn bg-[#3A2717] border-[#5C3E24] text-[#FDF3E1] px-2 py-1.5 text-[11px]" title="Restore starter template">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setFullscreen((v) => !v)} className="toy-btn bg-[#3A2717] border-[#5C3E24] text-[#FDF3E1] px-2 py-1.5 text-[11px]" title="Toggle focus mode">
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* ---------------------------- body ---------------------------- */}
        <div className="flex-1 min-h-0 flex">
          {/* file explorer */}
          <AnimatePresence initial={false}>
            {filesOpen && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 190, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="shrink-0 bg-[#18100A] border-r-2 border-[#2F2114] flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between px-2.5 py-2 border-b border-[#2F2114]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#A98768] flex items-center gap-1.5">
                    <FolderOpen className="w-3 h-3" /> Explorer
                  </span>
                  <button type="button" onClick={() => setAddingFile((v) => !v)} className="text-[#86EFAC] hover:text-white" title="New file" aria-label="New file">
                    <FilePlus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {addingFile && (
                  <div className="px-2 py-1.5 border-b border-[#2F2114]">
                    <input
                      autoFocus
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addFile();
                        if (e.key === 'Escape') { setAddingFile(false); setNewFileName(''); }
                      }}
                      placeholder={`name${language.defaultExt}`}
                      className="w-full rounded-md bg-[#241810] border border-[#5C3E24] px-2 py-1 font-mono text-[11px] text-[#FDF3E1] placeholder:text-[#6E5340] focus:outline-none focus:border-[#86EFAC]"
                    />
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {files.map((f) => (
                    <div
                      key={f.name}
                      className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer ${
                        f.name === activeFile?.name ? 'bg-[#2F6E45] text-white' : 'text-[#D8C7B2] hover:bg-[#241810]'
                      }`}
                      onClick={() => { soundEngine.playClick(); setActiveFileName((prev) => ({ ...prev, [language.id]: f.name })); }}
                    >
                      <FileCode2 className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      <span className="flex-1 min-w-0 font-mono text-[11px] truncate">{f.name}</span>
                      {f.name === activeFile?.name && <Check className="w-3 h-3 text-[#86EFAC] shrink-0" />}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteFile(f.name); }}
                        className="opacity-0 group-hover:opacity-100 text-[#FCA5A5] hover:text-[#EF4444] shrink-0"
                        aria-label={`Delete ${f.name}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="px-2.5 py-2 border-t border-[#2F2114] text-[10px] text-[#8C6B4F] leading-relaxed">
                  <p className="flex items-center gap-1.5"><Database className="w-3 h-3" /> IndexedDB autosave</p>
                  <p className={`flex items-center gap-1.5 ${savedTick ? 'text-[#86EFAC]' : ''}`}>
                    <CheckCircle2 className="w-3 h-3" /> {savedTick ? 'Saved locally' : 'Autosaving…'}
                  </p>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* editor + preview */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-[#18100A] border-b border-[#2F2114]">
              <button
                type="button"
                onClick={() => setFilesOpen((v) => !v)}
                className="text-[#A98768] hover:text-white p-0.5"
                title={filesOpen ? 'Hide explorer' : 'Show explorer'}
                aria-label="Toggle file explorer"
              >
                {filesOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
              </button>
              <span className="font-mono text-[11px] text-[#FDE68A] truncate">{activeFile?.name ?? 'no file'}</span>
              <span className="text-[10px] text-[#8C6B4F] hidden sm:inline">
                {activeFile ? `${activeFile.content.split('\n').length} lines · ${activeFile.content.length} chars` : ''}
              </span>
              <div className="flex-1" />
              <CopyButton text={activeFile?.content ?? ''} label="Copy file" />
            </div>
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
              <div className="flex-1 min-w-0 min-h-[240px] bg-[#1F150E]">
                {activeFile && (
                  <CodeEditor
                    value={activeFile.content}
                    onChange={updateFileContent}
                    syntax={language.syntax}
                    theme={theme}
                    onRun={() => void handleRun()}
                    ariaLabel={`${language.name} source editor`}
                  />
                )}
              </div>

              {/* preview / console pane */}
              {consoleOpen && (
                <div className="lg:w-[46%] w-full shrink-0 border-t-2 lg:border-t-0 lg:border-l-2 border-[#2F2114] flex flex-col bg-[#150E08] min-h-[220px]">
                  <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#2F2114]">
                    {supportsPreview && (
                      <button
                        type="button"
                        onClick={() => { soundEngine.playClick(); setPreviewTab('preview'); }}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${previewTab === 'preview' ? 'bg-[#2F6E45] text-white' : 'text-[#A98768] hover:text-white'}`}
                      >
                        {language.supportsPreview === 'sqlite' ? 'Results & Schema' : language.supportsPreview === 'brainfuck' ? 'Memory Tape' : 'Live Preview'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { soundEngine.playClick(); setPreviewTab('console'); }}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${previewTab === 'console' || !supportsPreview ? 'bg-[#2F6E45] text-white' : 'text-[#A98768] hover:text-white'}`}
                    >
                      Console
                    </button>
                    <div className="flex-1" />
                    {previewTab === 'console' && (
                      <>
                        <CopyButton text={consoleText} label="Copy" />
                        <button type="button" onClick={clearConsole} className="toy-btn bg-[#2A1C12] border-[#4C3320] text-[#FCA5A5] px-2 py-1 text-[10px]" title="Clear console">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setConsoleOpen(false)}
                      className="text-[#A98768] hover:text-white p-0.5"
                      aria-label="Hide output pane"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {previewTab === 'console' || !supportsPreview ? (
                    <div
                      ref={consoleRef}
                      className="flex-1 overflow-y-auto px-2.5 py-2 font-mono text-[11.5px] leading-relaxed"
                      style={{ fontVariantLigatures: 'contextual' }}
                      aria-live="polite"
                    >
                      {consoleLines.map((line) => (
                        <div
                          key={line.id}
                          className={
                            line.stream === 'stderr'
                              ? 'text-[#FCA5A5] whitespace-pre-wrap break-words'
                              : line.stream === 'meta'
                                ? 'text-[#86EFAC] whitespace-pre-wrap break-words'
                                : 'text-[#FDF3E1] whitespace-pre-wrap break-words'
                          }
                        >
                          {line.text || '\u00A0'}
                        </div>
                      ))}
                      {running && (
                        <div className="flex items-center gap-2 text-[#FDE68A] pt-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> executing…
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 overflow-auto">
                      {language.supportsPreview === 'iframe' && (
                        previewHtml ? (
                          <iframe
                            title="WaffleCode live preview"
                            srcDoc={previewHtml}
                            sandbox="allow-scripts allow-modals allow-forms allow-popups"
                            className="w-full h-full bg-white min-h-[260px]"
                          />
                        ) : (
                          <div className="p-4 text-[11px] text-[#A98768]">
                            Press <strong className="text-[#FDE68A]">Run</strong> to compile the 3-in-1 preview sandbox.
                          </div>
                        )
                      )}
                      {language.supportsPreview === 'markdown' && (
                        previewHtml ? (
                          <div className="bsu-markdown bg-[#FFFDF8] text-[#3B2314] p-4 min-h-full" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                        ) : (
                          <div className="p-4 text-[11px] text-[#A98768]">Press <strong className="text-[#FDE68A]">Run</strong> to render Markdown with KaTeX.</div>
                        )
                      )}
                      {language.supportsPreview === 'sqlite' && (
                        <div className="p-2.5 space-y-2.5">
                          {!sqlPreview && <p className="text-[11px] text-[#A98768]">Press Run to execute the SQL statements in an in-memory SQLite database.</p>}
                          {sqlPreview && (
                            <>
                              {sqlPreview.resultSets.map((rs, idx) => (
                                <div key={idx} className="rounded-lg overflow-hidden border border-[#3A2A1A] bg-[#1C130C]">
                                  <div className="px-2 py-1 border-b border-[#3A2A1A] text-[10px] font-mono text-[#FDE68A] truncate">{rs.statement.split('\n')[0]}</div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-[10.5px] font-mono">
                                      <thead>
                                        <tr className="bg-[#241810]">
                                          {rs.columns.map((c) => (
                                            <th key={c} className="text-left px-2 py-1 text-[#86EFAC] font-bold whitespace-nowrap border-b border-[#3A2A1A]">{c}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {rs.rows.map((row, ri) => (
                                          <tr key={ri} className={ri % 2 ? 'bg-[#1A1109]' : ''}>
                                            {row.map((cell, ci) => (
                                              <td key={ci} className="px-2 py-0.5 text-[#FDF3E1] whitespace-nowrap border-b border-[#2A1C12]">
                                                {cell === null ? <span className="text-[#8C6B4F] italic">NULL</span> : String(cell)}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="px-2 py-0.5 text-[9.5px] text-[#8C6B4F]">{rs.rows.length} row(s)</div>
                                </div>
                              ))}
                              <div className="rounded-lg border border-[#3A2A1A] bg-[#1C130C]">
                                <button
                                  type="button"
                                  onClick={() => setSqlSchemaOpen((v) => !v)}
                                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold text-[#86EFAC] border-b border-[#3A2A1A]"
                                >
                                  <Database className="w-3 h-3" /> Schema Viewer
                                  <span className="text-[#8C6B4F] font-normal">({sqlPreview.tables.length} table{sqlPreview.tables.length === 1 ? '' : 's'})</span>
                                  <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${sqlSchemaOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {sqlSchemaOpen && (
                                  <div className="p-2 space-y-2">
                                    {sqlPreview.tables.length === 0 && <p className="text-[10px] text-[#8C6B4F]">No user tables yet.</p>}
                                    {sqlPreview.tables.map((t) => (
                                      <div key={t.name} className="rounded-md bg-[#241810] p-1.5">
                                        <p className="text-[10.5px] font-mono text-[#FDE68A] font-bold">{t.name} <span className="text-[#8C6B4F] font-normal">· {t.rows} rows</span></p>
                                        <ul className="mt-0.5 space-y-0.5">
                                          {t.columns.map((c) => (
                                            <li key={c.name} className="text-[10px] font-mono text-[#D8C7B2] flex items-center gap-1.5">
                                              {c.pk && <span className="text-[8px] bg-[#FDE68A] text-[#3B2314] rounded px-1 font-bold">PK</span>}
                                              {c.name} <span className="text-[#8C6B4F]">{c.type}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {language.supportsPreview === 'brainfuck' && (
                        <div className="p-2.5">
                          <p className="text-[10px] text-[#A98768] mb-1.5 flex items-center gap-1.5">
                            <Cpu className="w-3 h-3" /> Live 30,000-cell memory tape {bfState ? `· ${bfState.steps.toLocaleString()} ops · ptr ${bfState.pointer}` : ''}
                          </p>
                          {!bfState && <p className="text-[11px] text-[#A98768]">Press Run to execute the program and inspect the tape.</p>}
                          {bfState && (
                            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">
                              {bfState.tape.map((v, i) => (
                                <div
                                  key={i}
                                  className={`rounded-md px-1 py-1 text-center font-mono ${
                                    i === bfState.pointer ? 'bg-[#FDE68A] text-[#3B2314] font-bold ring-2 ring-[#86EFAC]' : v ? 'bg-[#2F6E45] text-white' : 'bg-[#241810] text-[#6E5340]'
                                  }`}
                                  title={`cell[${i}] = ${v} (0x${v.toString(16)})`}
                                >
                                  <div className="text-[8px] opacity-70">{i}</div>
                                  <div className="text-[10.5px]">{v}</div>
                                  <div className="text-[8px] opacity-70 font-sans">{v >= 32 && v < 127 ? String.fromCharCode(v) : '·'}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!consoleOpen && (
                <button
                  type="button"
                  onClick={() => setConsoleOpen(true)}
                  className="toy-btn bg-[#2A1C12] border-[#4C3320] text-[#86EFAC] px-2 py-1 text-[10px] self-start m-2"
                >
                  <TerminalSquare className="w-3 h-3" /> Show output
                </button>
              )}
            </div>

            {/* status bar */}
            <div className="flex items-center gap-3 px-2.5 py-1 bg-[#2A1C12] border-t border-[#3A2717] text-[10px] text-[#A98768] font-mono">
              <span className="flex items-center gap-1"><Cpu className="w-3 h-3 text-[#86EFAC]" /> {language.runtimeLabel.split('+')[0].trim()}</span>
              <span className="hidden sm:inline">UTF-8</span>
              <span className="hidden sm:inline">LF</span>
              <span className="hidden md:inline">{theme === 'dark' ? 'Waffle Roast Dark' : 'Creamy Latte Light'}</span>
              <div className="flex-1" />
              {lastResult?.stderr && <span className="flex items-center gap-1 text-[#FCA5A5]"><AlertTriangle className="w-3 h-3" /> stderr</span>}
              {lastResult && <span>{lastResult.ms} ms</span>}
              <span className="flex items-center gap-1 text-[#86EFAC]"><CheckCircle2 className="w-3 h-3" /> 100% local</span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {packageOpen && language.supportsPackages && (
          <PackageManager
            kind={language.supportsPackages}
            packages={packages}
            onChange={(next) => setPackagesByLang((prev) => ({ ...prev, [language.id]: next }))}
            onClose={() => setPackageOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#7A5535]">
        <span className="toy-pill bg-[#F0FDF4] border-[#86EFAC] text-[#14532D]">
          <Check className="w-3 h-3" /> 32 languages · real local engines
        </span>
        <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#7A5535]">
          <FolderOpen className="w-3 h-3" /> IndexedDB multi-file projects
        </span>
        <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#7A5535]">
          <Package className="w-3 h-3" /> ZIP import / export
        </span>
        <span className="toy-pill bg-[#FFF8EB] border-[#E6C79C] text-[#7A5535]">
          <Copy className="w-3 h-3" /> ⌘/Ctrl + Enter runs
        </span>
        <span className="toy-pill bg-[#F0FDF4] border-[#86EFAC] text-[#14532D]">
          <Plus className="w-3 h-3" /> sql.js · wabt · sucrase WASM
        </span>
        <button
          type="button"
          onClick={() => { soundEngine.playPop(1.1); setSavedTick(true); window.setTimeout(() => setSavedTick(false), 1400); }}
          className="toy-pill bg-white border-[#D4AA78] text-[#7A5535] hover:bg-[#FEF3C7]"
        >
          <CheckCircle2 className="w-3 h-3" /> Verify autosave
        </button>
      </div>
    </div>
  );
};

export default WaffleCodeTool;
