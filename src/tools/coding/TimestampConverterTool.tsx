import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Calendar, Clock, Globe2, Timer, Zap } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, Segmented, Field, StatChip, ErrorBanner } from './shared';

type Unit = 's' | 'ms';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function rfc2822(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${DAY_NAMES[date.getDay()]}, ${pad(date.getDate())} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

function isoWithOffset(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

function isoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

interface ParsedInput {
  date?: Date;
  error?: string;
  note?: string;
}

function parseInput(raw: string, preference: 'auto' | 'seconds' | 'milliseconds'): ParsedInput {
  const input = raw.trim();
  if (!input) return { error: undefined, note: 'Empty input — showing the live clock.' };

  // pure numeric epoch
  if (/^-?\d{1,17}$/.test(input)) {
    const value = Number(input);
    let millis: number;
    let note: string;
    if (preference === 'milliseconds') {
      millis = value;
      note = 'Read as milliseconds (as chosen).';
    } else if (preference === 'seconds') {
      millis = value * 1000;
      note = 'Read as seconds (as chosen).';
    } else {
      const digits = input.replace('-', '').length;
      if (digits <= 10) {
        millis = value * 1000;
        note = 'Detected as seconds (≤ 10 digits).';
      } else if (digits <= 13) {
        millis = value;
        note = 'Detected as milliseconds (11–13 digits).';
      } else {
        millis = value / 1000;
        note = 'Detected as microseconds / nanoseconds and scaled down.';
      }
    }
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) return { error: 'That epoch value is outside the representable date range.' };
    return { date, note };
  }

  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) return { date: parsed, note: 'Parsed as a date string.' };

  // ISO without timezone => local
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(input);
  if (iso) {
    const date = new Date(
      Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]),
      Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0)
    );
    if (!Number.isNaN(date.getTime())) return { date, note: 'Interpreted in local time (no offset supplied).' };
  }
  return { error: 'Could not parse this value. Try a Unix timestamp, ISO-8601, or RFC-2822 date.' };
}

const SAMPLE_RELATIVE: { label: string; offsetMs: number }[] = [
  { label: 'now', offsetMs: 0 },
  { label: '+1 h', offsetMs: 3_600_000 },
  { label: '+1 d', offsetMs: 86_400_000 },
  { label: '+1 w', offsetMs: 604_800_000 },
  { label: '+30 d', offsetMs: 2_592_000_000 },
  { label: '+1 y', offsetMs: 31_536_000_000 },
];

export const TimestampConverterTool: React.FC = () => {
  const [liveNow, setLiveNow] = useState<Date>(() => new Date());
  const [ticking, setTicking] = useState(true);
  const [unit, setUnit] = useState<Unit>('s');
  const [input, setInput] = useState('');
  const [preference, setPreference] = useState<'auto' | 'seconds' | 'milliseconds'>('auto');
  const [fromLive, setFromLive] = useState(true);

  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setLiveNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  const parsed = useMemo(() => (fromLive ? { date: liveNow, note: 'Live clock' } : parseInput(input, preference)), [fromLive, liveNow, input, preference]);
  const active = parsed.date;

  const fields = useMemo(() => {
    if (!active) return [];
    const epochMs = active.getTime();
    const epochS = Math.floor(epochMs / 1000);
    return [
      { label: 'Unix seconds', value: String(epochS), mono: true },
      { label: 'Unix milliseconds', value: String(epochMs), mono: true },
      { label: 'Unix microseconds', value: `${epochS}000000`, mono: true },
      { label: 'ISO 8601 (UTC)', value: active.toISOString(), mono: true },
      { label: 'ISO 8601 (local)', value: isoWithOffset(active), mono: true },
      { label: 'RFC 2822', value: rfc2822(active), mono: false },
      { label: 'UTC string', value: active.toUTCString(), mono: false },
      { label: 'Local string', value: active.toString(), mono: false },
      { label: 'SQL datetime (UTC)', value: `${active.toISOString().slice(0, 10)} ${active.toISOString().slice(11, 19)}`, mono: true },
      { label: 'Date only (UTC)', value: active.toISOString().slice(0, 10), mono: true },
      { label: 'Time only (UTC)', value: active.toISOString().slice(11, 19), mono: true },
      { label: 'ISO week', value: `${active.getUTCFullYear()}-W${pad(isoWeek(active))}`, mono: true },
      { label: 'Day of year', value: String(dayOfYear(active)), mono: true },
      { label: 'Filename stamp', value: `${active.getFullYear()}-${pad(active.getMonth() + 1)}-${pad(active.getDate())}_${pad(active.getHours())}-${pad(active.getMinutes())}-${pad(active.getSeconds())}`, mono: true },
    ];
  }, [active]);

  const relative = useMemo(() => {
    if (!active) return '';
    const diff = active.getTime() - liveNow.getTime();
    const abs = Math.abs(diff);
    const units: [number, string][] = [
      [1000, 'second'], [60_000, 'minute'], [3_600_000, 'hour'],
      [86_400_000, 'day'], [604_800_000, 'week'], [2_592_000_000, 'month'], [31_536_000_000, 'year'],
    ];
    let chosen = units[0];
    for (const u of units) if (abs >= u[0]) chosen = u;
    const count = Math.round(abs / chosen[0]);
    const unitLabel = `${chosen[1]}${count === 1 ? '' : 's'}`;
    if (abs < 1000) return 'right now';
    return diff < 0 ? `${count} ${unitLabel} ago` : `in ${count} ${unitLabel}`;
  }, [active, liveNow]);

  const setEpoch = (offsetMs: number) => {
    soundEngine.playPop(1.1);
    const date = new Date(Date.now() + offsetMs);
    setFromLive(false);
    setInput(unit === 's' ? String(Math.floor(date.getTime() / 1000)) : String(date.getTime()));
  };

  const useNow = () => {
    soundEngine.playPop(1.18);
    setFromLive(true);
    setInput('');
  };

  const useLocal = () => {
    soundEngine.playPop(1.1);
    setFromLive(false);
    setInput(isoWithOffset(liveNow));
  };

  const inputPlaceholder = unit === 's' ? '1736995200' : '1736995200000';

  return (
    <div className="space-y-3">
      <div className="toy-card p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={fromLive ? 'live' : 'manual'}
            onChange={(id) => {
              soundEngine.playClick();
              if (id === 'live') useNow();
              else { setFromLive(false); if (!input) setInput(String(Math.floor(Date.now() / 1000))); }
            }}
            options={[
              { id: 'live', label: 'Live clock', icon: <Timer className="w-3 h-3" /> },
              { id: 'manual', label: 'Convert value', icon: <ArrowLeftRight className="w-3 h-3" /> },
            ]}
          />
          <div className="flex-1" />
          <Segmented
            value={unit}
            onChange={(id) => { soundEngine.playClick(); setUnit(id as Unit); }}
            options={[{ id: 's', label: 'seconds' }, { id: 'ms', label: 'milliseconds' }]}
          />
          {fromLive && (
            <button
              type="button"
              onClick={() => { soundEngine.playClick(); setTicking((v) => !v); }}
              className={`toy-pill text-[10px] ${ticking ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#14532D]' : 'bg-[#FEF3C7] border-[#FCD34D] text-[#78350F]'}`}
            >
              <Clock className="w-3 h-3" /> {ticking ? 'Ticking' : 'Paused'}
            </button>
          )}
        </div>

        {fromLive ? (
          <div className="rounded-xl bg-[#1F150E] px-3 py-3 text-center">
            <p className="font-mono text-2xl tracking-[0.08em] text-[#86EFAC] tabular-nums" aria-live="off">
              {String(Math.floor(liveNow.getTime() / 1000))}
            </p>
            <p className="font-mono text-[11px] text-[#FCD34D] tabular-nums">{liveNow.getTime()} ms</p>
            <p className="mt-1 text-[10.5px] text-[#C4A88C]">
              {liveNow.toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              {' · '}{Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
            <div className="mt-2 flex items-center justify-center gap-1">
              <CopyButton text={String(Math.floor(liveNow.getTime() / 1000))} label="Copy epoch" />
              <CopyButton text={liveNow.toISOString()} label="Copy ISO" />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 rounded-xl bg-[#FFFDF9] border-2 border-[#DEC098] px-3 py-2 focus-within:border-[#D97706]">
              <Zap className="w-4 h-4 text-[#C98A4B] shrink-0" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                aria-label="Timestamp or date string"
                placeholder={`${inputPlaceholder} or 2026-01-15T09:30:00Z`}
                className="flex-1 min-w-0 bg-transparent font-mono text-sm text-[#3B2314] focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-[#8A6748] font-bold">Parse as:</span>
              {(['auto', 'seconds', 'milliseconds'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { soundEngine.playClick(); setPreference(p); }}
                  className={`toy-pill text-[9.5px] ${preference === p ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-white border-[#D4AA78] text-[#7A5535]'}`}
                >
                  {p}
                </button>
              ))}
              <div className="flex-1" />
              <button type="button" onClick={useLocal} className="toy-btn-cream px-2 py-1 text-[10px]">Set from local time</button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-[#8A6748] font-bold">Quick:</span>
              {SAMPLE_RELATIVE.map((s) => (
                <button key={s.label} type="button" onClick={() => setEpoch(s.offsetMs)} className="toy-pill bg-white border-[#D4AA78] text-[#7A5535] text-[9.5px]">
                  {s.label}
                </button>
              ))}
            </div>
            {parsed.error && <ErrorBanner message={parsed.error} />}
            {!parsed.error && parsed.note && <p className="text-[10px] text-[#A98768]"><Clock className="inline w-3 h-3 mr-1" />{parsed.note}</p>}
          </div>
        )}
      </div>

      {active && !parsed.error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="toy-card p-2">
              <p className="text-[9.5px] uppercase tracking-wide text-[#A98768] font-bold">Relative</p>
              <p className="font-display text-sm text-[#3B2314]">{relative}</p>
            </div>
            <div className="toy-card p-2">
              <p className="text-[9.5px] uppercase tracking-wide text-[#A98768] font-bold">Day of week</p>
              <p className="font-display text-sm text-[#3B2314]">{active.toLocaleDateString(undefined, { weekday: 'long' })}</p>
            </div>
            <div className="toy-card p-2">
              <p className="text-[9.5px] uppercase tracking-wide text-[#A98768] font-bold">Timezone</p>
              <p className="font-display text-sm text-[#3B2314] truncate">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
            </div>
          </div>

          <Panel
            title="All formats"
            icon={<Globe2 className="w-3.5 h-3.5" />}
            actions={<StatChip label="valid" value="yes" tone="mint" />}
          >
            <div className="rounded-lg border-2 border-[#E2C6A2] overflow-hidden">
              {fields.map((f, idx) => (
                <div key={f.label} className={`flex items-center gap-2 px-2 py-1 ${idx % 2 ? 'bg-[#FFFDF9]' : 'bg-white'}`}>
                  <span className="w-32 shrink-0 text-[10px] font-bold text-[#8A6748]">{f.label}</span>
                  <span className="flex-1 break-all text-[11px] text-[#3B2314] select-all" style={{ fontFamily: f.mono ? 'ui-monospace, monospace' : 'inherit' }}>{f.value}</span>
                  <CopyButton text={f.value} label="" />
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <Panel title="Calendar breakdown" icon={<Calendar className="w-3.5 h-3.5" />}>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  ['Year', active.getUTCFullYear()],
                  ['Month', active.getUTCMonth() + 1],
                  ['Day', active.getUTCDate()],
                  ['Hour (UTC)', active.getUTCHours()],
                  ['Minute', active.getUTCMinutes()],
                  ['Second', active.getUTCSeconds()],
                  ['Weekday', active.getUTCDay()],
                  ['Quarter', Math.floor(active.getUTCMonth() / 3) + 1],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-[#FFF8EB] border border-[#E6C79C] px-2 py-1 flex items-center justify-between">
                    <span className="text-[10px] text-[#8A6748]">{label}</span>
                    <span className="font-mono text-[11px] text-[#3B2314]">{String(value)}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Build a timestamp" icon={<Timer className="w-3.5 h-3.5" />}>
              <Field label="Pick a date & time" hint="Uses your browser's local timezone.">
                <input
                  type="datetime-local"
                  value={`${active.getFullYear()}-${pad(active.getMonth() + 1)}-${pad(active.getDate())}T${pad(active.getHours())}:${pad(active.getMinutes())}`}
                  onChange={(e) => {
                    const next = new Date(e.target.value);
                    if (Number.isNaN(next.getTime())) return;
                    setFromLive(false);
                    setInput(String(Math.floor(next.getTime() / 1000)));
                  }}
                  className="toy-input font-mono text-[11px] py-1"
                  aria-label="Date and time picker"
                />
              </Field>
              <div className="mt-2 flex flex-wrap gap-1">
                {[0, 6, 12, 18].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      const next = new Date(active);
                      next.setHours(h, 0, 0, 0);
                      setFromLive(false);
                      setInput(String(Math.floor(next.getTime() / 1000)));
                    }}
                    className="toy-pill bg-white border-[#D4AA78] text-[#7A5535] text-[9.5px]"
                  >
                    {pad(h)}:00 local
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-[#A98768]">
                Tip: ISO strings without an offset (e.g. 2026-01-15T09:30) are read as local time; add Z for UTC.
              </p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default TimestampConverterTool;
