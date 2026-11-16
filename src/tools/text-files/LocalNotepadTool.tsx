import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, FilePlus2, NotebookPen, Save, Search, Trash2 } from 'lucide-react';
import { soundEngine } from '../../utils/soundEngine';
import { downloadBlob, readLocalJson, writeLocalJson } from '../../utils/storage';
import { Panel, StatChip } from '../coding/shared';
import { GhostButton, ToggleRow } from './shared';

/* =========================================================================
   Notepad with Auto-Save
   Multi-note pad persisted to localStorage on every keystroke (debounced),
   with a dirty indicator, word wrap toggle, in-note search and .txt export.
   ========================================================================= */

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

const STORAGE_KEY = 'bsu:notepad:v1';

const newNote = (n: number): Note => ({
  id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title: `Untitled note ${n}`,
  body: '',
  updatedAt: Date.now(),
});

const loadNotes = (): Note[] => {
  const saved = readLocalJson<Note[]>(STORAGE_KEY, []);
  if (Array.isArray(saved) && saved.length > 0 && typeof saved[0]?.id === 'string') return saved;
  return [newNote(1)];
};

const fmtWhen = (ts: number): string => {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const LocalNotepadTool: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [activeId, setActiveId] = useState<string>(() => notes[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [wrap, setWrap] = useState(true);
  const [saved, setSaved] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<number>(() => Date.now());
  const saveTimer = useRef<number | null>(null);

  const active = notes.find((n) => n.id === activeId) ?? notes[0];

  /* ------------------------------ persistence ----------------------------- */

  const persist = useCallback((next: Note[]) => {
    writeLocalJson(STORAGE_KEY, next);
    setSaved(true);
    setLastSavedAt(Date.now());
  }, []);

  const scheduleSave = useCallback(
    (next: Note[]) => {
      setSaved(false);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => persist(next), 600);
    },
    [persist]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  // Flush to storage when the tab goes away, so nothing is lost.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        writeLocalJson(STORAGE_KEY, notes);
      }
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [notes]);

  /* -------------------------------- actions ------------------------------- */

  const updateActive = (patch: Partial<Note>) => {
    if (!active) return;
    const next = notes.map((n) =>
      n.id === active.id ? { ...n, ...patch, updatedAt: Date.now() } : n
    );
    setNotes(next);
    scheduleSave(next);
  };

  const addNote = () => {
    const note = newNote(notes.length + 1);
    const next = [note, ...notes];
    setNotes(next);
    setActiveId(note.id);
    persist(next);
    soundEngine.playPop(1.12);
  };

  const deleteNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    if (next.length === 0) {
      const fresh = newNote(1);
      setNotes([fresh]);
      setActiveId(fresh.id);
      persist([fresh]);
      return;
    }
    setNotes(next);
    if (activeId === id) setActiveId(next[0].id);
    persist(next);
    soundEngine.playPop(0.9);
  };

  const duplicateNote = () => {
    if (!active) return;
    const dup: Note = {
      ...active,
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: `${active.title} (copy)`,
      updatedAt: Date.now(),
    };
    const next = [dup, ...notes];
    setNotes(next);
    setActiveId(dup.id);
    persist(next);
    soundEngine.playPop(1.1);
  };

  /* -------------------------------- derived ------------------------------- */

  const stats = useMemo(() => {
    const body = active?.body ?? '';
    return {
      words: (body.match(/[\p{L}\p{N}’'-]+/gu) ?? []).length,
      chars: Array.from(body).length,
      lines: body ? body.split(/\r?\n/).length : 0,
    };
  }, [active]);

  const matches = useMemo(() => {
    if (!query.trim() || !active) return 0;
    try {
      return (active.body.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) ?? []).length;
    } catch {
      return 0;
    }
  }, [query, active]);

  if (!active) return null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[15rem_1fr]">
        {/* notes rail */}
        <Panel
          title={`Notes (${notes.length})`}
          icon={<NotebookPen className="h-4 w-4" />}
          actions={
            <button
              type="button"
              onClick={addNote}
              title="New note"
              className="rounded-md border-2 border-[#1E40AF] bg-[#3B82F6] p-1 text-white"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
            </button>
          }
        >
          <ul className="max-h-[26rem] space-y-1 overflow-auto">
            {notes.map((n) => {
              const on = n.id === active.id;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(n.id);
                      soundEngine.playPop(1.04);
                    }}
                    aria-pressed={on}
                    className={`w-full rounded-lg border-2 px-2 py-1.5 text-left transition ${
                      on
                        ? 'border-[#3B82F6] bg-[#EFF6FF]'
                        : 'border-transparent bg-[#FBFDFF] hover:border-[#DBEAFE]'
                    }`}
                  >
                    <span className="block truncate font-display text-[11.5px] font-bold text-[#1E3A8A]">
                      {n.title || 'Untitled'}
                    </span>
                    <span className="block truncate text-[10px] text-[#64748B]">
                      {fmtWhen(n.updatedAt)} · {(n.body.match(/[\p{L}\p{N}’'-]+/gu) ?? []).length} words
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* editor */}
        <Panel
          title="Editor"
          icon={<NotebookPen className="h-4 w-4" />}
          actions={
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  saved ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEF9C3] text-[#A16207]'
                }`}
                title={saved ? `Saved ${fmtWhen(lastSavedAt)}` : 'Saving…'}
              >
                {saved ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3 animate-pulse" />}
                {saved ? 'Saved' : 'Saving'}
              </span>
              <StatChip label="words" value={stats.words} />
            </div>
          }
        >
          <input
            value={active.title}
            onChange={(e) => updateActive({ title: e.target.value })}
            placeholder="Note title"
            aria-label="Note title"
            className="w-full rounded-lg border-2 border-[#BFDBFE] bg-white px-2.5 py-1.5 font-display text-sm font-bold text-[#1E3A8A] outline-none focus:border-[#3B82F6]"
          />
          <textarea
            value={active.body}
            onChange={(e) => updateActive({ body: e.target.value })}
            rows={16}
            spellCheck
            wrap={wrap ? 'soft' : 'off'}
            placeholder="Start typing — everything is saved on this device as you go. Nothing is uploaded."
            className="mt-2 w-full resize-y rounded-lg border-2 border-[#BFDBFE] bg-white p-3 font-mono text-[12.5px] leading-relaxed text-[#1E293B] outline-none focus:border-[#3B82F6]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <GhostButton onClick={duplicateNote}>
              <FilePlus2 className="h-3.5 w-3.5" /> Duplicate
            </GhostButton>
            <GhostButton
              onClick={() =>
                downloadBlob(
                  new Blob([active.body], { type: 'text/plain;charset=utf-8' }),
                  `${(active.title || 'note').replace(/[^\w\d -]+/g, '') || 'note'}.txt`
                )
              }
              disabled={!active.body}
            >
              <Download className="h-3.5 w-3.5" /> Export .txt
            </GhostButton>
            <GhostButton onClick={() => deleteNote(active.id)} title="Delete this note">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </GhostButton>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <label className="flex items-center gap-1 rounded-md border-2 border-[#BFDBFE] bg-white px-1.5 py-1">
                <Search className="h-3 w-3 text-[#64748B]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find in note"
                  aria-label="Find in note"
                  className="w-24 bg-transparent font-mono text-[10.5px] text-[#1E3A8A] outline-none"
                />
                {query && (
                  <span className="font-mono text-[9.5px] font-bold text-[#1E40AF]">{matches}</span>
                )}
              </label>
              <ToggleRow label="Wrap" checked={wrap} onChange={setWrap} />
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] font-semibold text-[#64748B]">
            <span>{stats.chars} characters</span>
            <span>·</span>
            <span>{stats.lines} lines</span>
            <span>·</span>
            <span>last edit {fmtWhen(active.updatedAt)}</span>
            <span>·</span>
            <span className="text-[#15803D]">stored in this browser only</span>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default LocalNotepadTool;
