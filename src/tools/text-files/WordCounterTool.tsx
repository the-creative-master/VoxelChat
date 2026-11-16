import React, { useMemo, useState } from 'react';
import { BookOpen, Clock, FileText, Hash, Mic, Trash2, TrendingUp } from 'lucide-react';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, StatChip, EmptyHint } from '../coding/shared';
import { GhostButton } from './shared';

/* =========================================================================
   Word / Character / Reading Time Counter
   Counts like an editor does: words, sentences, paragraphs, syllables,
   reading + speaking time at configurable rates, and keyword density.
   ========================================================================= */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'so', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you',
  'he', 'she', 'they', 'we', 'me', 'him', 'her', 'them', 'us', 'my', 'your', 'his', 'their', 'our', 'not', 'no',
  'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'there', 'here', 'what',
  'which', 'who', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'more', 'most', 'some', 'such',
]);

const countSyllables = (word: string): number => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
};

const fmtTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

const fmtNum = (n: number) => n.toLocaleString('en-US');

interface Stats {
  chars: number;
  charsNoSpaces: number;
  words: number;
  uniqueWords: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  syllables: number;
  avgWordLen: number;
  longestWord: string;
  readingTime: number;
  speakingTime: number;
  readability: number;
  topWords: { word: string; count: number; density: number }[];
  topBigrams: { phrase: string; count: number }[];
}

const analyse = (text: string, wpm: number, spm: number, includeStop: boolean): Stats => {
  const trimmed = text.trim();
  const wordMatches = trimmed.match(/[\p{L}\p{N}’'-]+/gu) ?? [];
  const words = wordMatches.map((w) => w.toLowerCase());
  const chars = Array.from(text).length;
  const charsNoSpaces = Array.from(text.replace(/\s/g, '')).length;
  const sentences = trimmed ? (trimmed.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? []).length : 0;
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
  const lines = text ? text.split(/\r?\n/).length : 0;
  const syllables = wordMatches.reduce((n, w) => n + countSyllables(w), 0);

  const freq = new Map<string, number>();
  for (const w of words) {
    if (!w || (w.length < 2 && !includeStop)) continue;
    if (!includeStop && STOP_WORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([word, count]) => ({
      word,
      count,
      density: words.length ? (count / words.length) * 100 : 0,
    }));

  const bi = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (!w1 || !w2) continue;
    if (!includeStop && (STOP_WORDS.has(w1) || STOP_WORDS.has(w2))) continue;
    const key = `${w1} ${w2}`;
    bi.set(key, (bi.get(key) ?? 0) + 1);
  }
  const topBigrams = [...bi.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([phrase, count]) => ({ phrase, count }));

  // Flesch reading ease (higher = easier)
  const w = wordMatches.length || 1;
  const readability =
    206.835 - 1.015 * (w / Math.max(1, sentences)) - 84.6 * (syllables / Math.max(1, w));

  const longestWord = wordMatches.reduce((best, cur) => (cur.length > best.length ? cur : best), '');

  return {
    chars,
    charsNoSpaces,
    words: wordMatches.length,
    uniqueWords: new Set(words).size,
    sentences,
    paragraphs,
    lines,
    syllables,
    avgWordLen: wordMatches.length
      ? wordMatches.reduce((n, x) => n + x.length, 0) / wordMatches.length
      : 0,
    longestWord,
    readingTime: (wordMatches.length / Math.max(1, wpm)) * 60,
    speakingTime: (wordMatches.length / Math.max(1, spm)) * 60,
    readability: Math.max(0, Math.min(100, readability)),
    topWords,
    topBigrams,
  };
};

const easeLabel = (score: number) => {
  if (score >= 80) return { label: 'Very easy', tone: 'bg-[#DCFCE7] text-[#15803D]' };
  if (score >= 60) return { label: 'Plain English', tone: 'bg-[#DCFCE7] text-[#15803D]' };
  if (score >= 50) return { label: 'Fairly hard', tone: 'bg-[#FEF9C3] text-[#A16207]' };
  if (score >= 30) return { label: 'Difficult', tone: 'bg-[#FFEDD5] text-[#C2410C]' };
  return { label: 'Very difficult', tone: 'bg-[#FEE2E2] text-[#B91C1C]' };
};

const SAMPLE = `The kitchen at the end of the lane smelled of butter and cinnamon. Every morning the same ritual: the griddle warmed, the batter rested, and the waffles came out golden and square.

Good tools work the same way. They warm up quietly, they do one job perfectly, and they never ask you to sign in first. That is the whole trick — make the boring parts disappear, then get out of the way.`;

export const WordCounterTool: React.FC = () => {
  const [text, setText] = useState(SAMPLE);
  const [wpm, setWpm] = useState(225);
  const [spm, setSpm] = useState(130);
  const [includeStop, setIncludeStop] = useState(false);

  const stats = useMemo(() => analyse(text, wpm, spm, includeStop), [text, wpm, spm, includeStop]);
  const ease = easeLabel(stats.readability);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Words', value: fmtNum(stats.words), icon: <FileText className="h-3.5 w-3.5" /> },
          { label: 'Characters', value: fmtNum(stats.chars), icon: <Hash className="h-3.5 w-3.5" /> },
          { label: 'Sentences', value: fmtNum(stats.sentences), icon: <BookOpen className="h-3.5 w-3.5" /> },
          { label: 'Paragraphs', value: fmtNum(stats.paragraphs), icon: <FileText className="h-3.5 w-3.5" /> },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border-2 border-b-[5px] border-[#BFDBFE] bg-white px-3 py-2.5"
          >
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
              {s.icon}
              {s.label}
            </span>
            <span className="font-mono text-xl font-bold text-[#1E3A8A]">{s.value}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel
          title="Paste or write"
          icon={<FileText className="h-4 w-4" />}
          actions={
            <div className="flex gap-1.5">
              <GhostButton onClick={() => setText(SAMPLE)} title="Load the sample text">
                Sample
              </GhostButton>
              <GhostButton onClick={() => setText('')} disabled={!text}>
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </GhostButton>
            </div>
          }
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            className="w-full resize-y rounded-lg border-2 border-[#BFDBFE] bg-white p-2.5 font-mono text-[12.5px] leading-relaxed text-[#1E293B] outline-none focus:border-[#3B82F6]"
            placeholder="Paste your draft…"
            spellCheck={false}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatChip label="no spaces" value={fmtNum(stats.charsNoSpaces)} />
            <StatChip label="lines" value={fmtNum(stats.lines)} />
            <StatChip label="unique words" value={fmtNum(stats.uniqueWords)} />
            <StatChip label="avg word" value={`${stats.avgWordLen.toFixed(1)} ch`} />
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="Reading & speaking time" icon={<Clock className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border-2 border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2.5">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-[#1E40AF]">
                  <BookOpen className="h-3 w-3" /> Read
                </span>
                <span className="font-mono text-lg font-bold text-[#1E3A8A]">{fmtTime(stats.readingTime)}</span>
                <span className="block text-[9.5px] font-semibold text-[#64748B]">at {wpm} wpm</span>
              </div>
              <div className="rounded-xl border-2 border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2.5">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-[#1E40AF]">
                  <Mic className="h-3 w-3" /> Speak
                </span>
                <span className="font-mono text-lg font-bold text-[#1E3A8A]">{fmtTime(stats.speakingTime)}</span>
                <span className="block text-[9.5px] font-semibold text-[#64748B]">at {spm} wpm</span>
              </div>
            </div>

            <div className="mt-2.5 space-y-2">
              <label className="block">
                <span className="mb-1 flex justify-between text-[11px] font-bold text-[#1E3A8A]">
                  Reading speed <span className="font-mono text-[#1E40AF]">{wpm} wpm</span>
                </span>
                <input
                  type="range"
                  min={100}
                  max={400}
                  step={5}
                  value={wpm}
                  onChange={(e) => setWpm(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#DBEAFE] accent-[#3B82F6]"
                />
              </label>
              <label className="block">
                <span className="mb-1 flex justify-between text-[11px] font-bold text-[#1E3A8A]">
                  Speaking speed <span className="font-mono text-[#1E40AF]">{spm} wpm</span>
                </span>
                <input
                  type="range"
                  min={80}
                  max={220}
                  step={5}
                  value={spm}
                  onChange={(e) => setSpm(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#DBEAFE] accent-[#3B82F6]"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-[10px] font-semibold text-[#64748B]">
                {fmtNum(stats.syllables)} syllables
              </span>
              <button
                type="button"
                onClick={() => {
                  setWpm(225);
                  setSpm(130);
                  soundEngine.playPop(1.08);
                }}
                className="text-[10px] font-bold text-[#2563EB] underline decoration-dotted"
              >
                Reset to defaults
              </button>
            </div>
          </Panel>

          <Panel title="Readability" icon={<TrendingUp className="h-4 w-4" />}>
            <div className="flex items-center gap-3">
              <span className="font-mono text-3xl font-bold text-[#1E3A8A]">
                {stats.words ? stats.readability.toFixed(0) : '—'}
              </span>
              <div className="min-w-0 flex-1">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${ease.tone}`}>
                  {stats.words ? ease.label : 'No text yet'}
                </span>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#DBEAFE]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#60A5FA] to-[#2563EB] transition-all"
                    style={{ width: `${stats.readability}%` }}
                  />
                </div>
                <p className="mt-1 text-[9.5px] font-medium leading-snug text-[#64748B]">
                  Flesch Reading Ease · 60–70 is plain English
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        title="Keyword density"
        icon={<Hash className="h-4 w-4" />}
        actions={
          <label className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#1E3A8A]">
            <input
              type="checkbox"
              checked={includeStop}
              onChange={(e) => setIncludeStop(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#3B82F6]"
            />
            Include filler words
          </label>
        }
      >
        {stats.topWords.length === 0 ? (
          <EmptyHint>
            Nothing to analyse yet — paste a paragraph above. Filler words like “the” and “and” are hidden unless you
            tick the box.
          </EmptyHint>
        ) : (
          <div className="space-y-1">
            {stats.topWords.map((w) => (
              <div key={w.word} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate font-mono text-[11px] font-bold text-[#1E3A8A]">{w.word}</span>
                <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-[#EFF6FF]">
                  <div
                    className="h-full rounded-full bg-[#3B82F6]/70"
                    style={{
                      width: `${Math.max(2, (w.count / stats.topWords[0].count) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[10.5px] text-[#1E3A8A]">×{w.count}</span>
                <span className="w-12 shrink-0 text-right font-mono text-[10.5px] text-[#64748B]">
                  {w.density.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {stats.topBigrams.length > 0 && (
          <div className="mt-3 border-t border-[#DBEAFE] pt-2.5">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Repeated phrases</p>
            <div className="flex flex-wrap gap-1.5">
              {stats.topBigrams.map((b) => (
                <span
                  key={b.phrase}
                  className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 font-mono text-[10.5px] text-[#1E3A8A]"
                >
                  {b.phrase} <span className="text-[#64748B]">×{b.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {stats.longestWord && (
          <p className="mt-2 text-[10px] font-semibold text-[#64748B]">
            Longest word: <span className="font-mono text-[#1E3A8A]">{stats.longestWord}</span> (
            {stats.longestWord.length} chars)
          </p>
        )}
      </Panel>
    </div>
  );
};

export default WordCounterTool;
