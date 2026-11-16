import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, Clock, Info, Sparkles } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, Segmented, ErrorBanner, EmptyHint, StatChip } from './shared';

/* ------------------------------ cron matcher ------------------------------ */

const MACROS: { expr: string; label: string; description: string }[] = [
  { expr: '* * * * *', label: 'Every minute', description: 'Runs every single minute of every hour' },
  { expr: '*/5 * * * *', label: 'Every 5 minutes', description: 'Every fifth minute' },
  { expr: '0 * * * *', label: 'Hourly', description: 'At minute 0 of every hour' },
  { expr: '0 9 * * 1-5', label: 'Weekdays at 09:00', description: 'Monday to Friday morning' },
  { expr: '0 0 * * *', label: 'Daily at midnight', description: 'Every day at 00:00' },
  { expr: '0 3 * * 0', label: 'Sundays at 03:00', description: 'Weekly maintenance window' },
  { expr: '0 0 1 * *', label: 'Monthly', description: 'First day of every month at midnight' },
  { expr: '0 0 1 1 *', label: 'Yearly', description: 'January 1st at midnight' },
  { expr: '30 8-18/2 * * 1-5', label: 'Business hours', description: 'Every 2 hours from 08:30 to 18:30 on weekdays' },
  { expr: '15,45 * * * *', label: 'Twice hourly', description: 'At minutes 15 and 45' },
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const FIELD_DEFS = [
  { name: 'minute', min: 0, max: 59, aliases: [] as string[] },
  { name: 'hour', min: 0, max: 23, aliases: [] as string[] },
  { name: 'day of month', min: 1, max: 31, aliases: [] as string[] },
  { name: 'month', min: 1, max: 12, aliases: MONTHS },
  { name: 'day of week', min: 0, max: 6, aliases: DAYS },
];

interface CronParse {
  fields: number[][];
  error?: string;
}

function parseField(raw: string, index: number): { values: number[]; error?: string } {
  const def = FIELD_DEFS[index];
  const values = new Set<number>();
  const normalized = raw.toUpperCase().replace(/\?/g, '*');
  if (!normalized.trim()) return { values: [], error: `The ${def.name} field is empty.` };
  for (const part of normalized.split(',')) {
    const piece = part.trim();
    if (!piece) return { values: [], error: `Empty list item in the ${def.name} field.` };
    // step
    const stepMatch = /^(\*|\d+(?:-\d+)?)\/(\d+)$/.exec(piece);
    if (stepMatch) {
      const step = Number(stepMatch[2]);
      if (step < 1) return { values: [], error: `Step must be ≥ 1 in the ${def.name} field.` };
      let start = def.min;
      let end = def.max;
      if (stepMatch[1] !== '*') {
        const range = stepMatch[1].split('-').map(Number);
        start = range[0];
        end = range.length > 1 ? range[1] : def.max;
      }
      for (let v = start; v <= end; v += step) {
        if (v >= def.min && v <= def.max) values.add(index === 4 ? v % 7 : v);
      }
      continue;
    }
    // range
    const rangeMatch = /^([A-Z0-9]+)-([A-Z0-9]+)$/.exec(piece);
    if (rangeMatch) {
      const toVal = (t: string) => {
        const aliasIdx = def.aliases.indexOf(t);
        if (aliasIdx >= 0) return index === 3 ? aliasIdx + 1 : aliasIdx;
        return Number(t);
      };
      const start = toVal(rangeMatch[1]);
      const end = toVal(rangeMatch[2]);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        return { values: [], error: `“${piece}” is not a valid range in the ${def.name} field.` };
      }
      if (start > end) return { values: [], error: `Range start ${start} is greater than ${end} in the ${def.name} field.` };
      for (let v = start; v <= end; v++) {
        if (v >= def.min && v <= def.max) values.add(index === 4 ? v % 7 : v);
      }
      continue;
    }
    // wildcard
    if (piece === '*') {
      for (let v = def.min; v <= def.max; v++) values.add(index === 4 ? v % 7 : v);
      continue;
    }
    // single value / alias
    const aliasIdx = def.aliases.indexOf(piece);
    const single = aliasIdx >= 0 ? (index === 3 ? aliasIdx + 1 : aliasIdx) : Number(piece);
    if (Number.isNaN(single)) return { values: [], error: `“${piece}” is not a number, alias, range or step in the ${def.name} field.` };
    if (single < def.min || single > def.max) {
      return { values: [], error: `${single} is out of range for the ${def.name} field (${def.min}–${def.max}).` };
    }
    values.add(index === 4 ? single % 7 : single);
  }
  return { values: [...values].sort((a, b) => a - b) };
}

function parseCron(expr: string): CronParse {
  const trimmed = expr.trim();
  if (!trimmed) return { fields: [], error: 'Enter a cron expression with 5 fields.' };

  // macros
  const macro = MACROS.find((m) => m.expr === trimmed);
  if (macro) {
    const parts = macro.expr.split(/\s+/);
    const fields: number[][] = [];
    for (let i = 0; i < parts.length; i++) fields.push(parseField(parts[i], i).values);
    return { fields };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 6) {
    // tolerated 6-field form: drop the seconds column when it is a plain 0
    if (parts[0] === '0') return parseCron(parts.slice(1).join(' '));
    return { fields: [], error: 'This parser uses the classic 5-field form (minute hour day-of-month month day-of-week). Six-field expressions with seconds are not supported.' };
  }
  if (parts.length !== 5) {
    return { fields: [], error: `Expected 5 fields but found ${parts.length}. Format: minute hour day-of-month month day-of-week.` };
  }
  const fields: number[][] = [];
  for (let i = 0; i < 5; i++) {
    const parsed = parseField(parts[i], i);
    if (parsed.error) return { fields: [], error: parsed.error };
    fields.push(parsed.values);
  }
  if (fields[2].length === 0 || fields[3].length === 0 || fields[4].length === 0) {
    return { fields: [], error: 'A day/month field resolved to nothing.' };
  }
  return { fields };
}

function matchesCron(fields: number[][], date: Date): boolean {
  if (fields.length !== 5) return false;
  return (
    fields[0].includes(date.getMinutes()) &&
    fields[1].includes(date.getHours()) &&
    fields[2].includes(date.getDate()) &&
    fields[3].includes(date.getMonth() + 1) &&
    fields[4].includes(date.getDay())
  );
}

function nextRuns(fields: number[][], count: number): Date[] {
  const out: Date[] = [];
  if (fields.length !== 5) return out;
  const cursor = new Date();
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  let guard = 0;
  while (out.length < count && guard++ < 60 * 24 * 400) {
    if (matchesCron(fields, cursor)) {
      out.push(new Date(cursor));
      cursor.setMinutes(cursor.getMinutes() + 1);
      continue;
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return out;
}

/* ------------------------------ English ------------------------------ */

function listPhrase(values: number[], names?: string[], max = 4): string {
  const labels = values.map((v) => (names ? names[v] ?? String(v) : String(v)));
  if (labels.length <= max) {
    return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  }
  return `${labels.slice(0, max).join(', ')} and ${labels.length - max} more`;
}

function describeCron(parts: string[], fields: number[][]): string[] {
  if (fields.length !== 5) return [];
  const descriptions: string[] = [];
  const [minute, hour] = parts;
  void parts;
  const allMinutes = fields[0].length === 60;
  const allHours = fields[1].length === 24;
  const allDom = fields[2].length === 31;
  const allMonth = fields[3].length === 12;
  const allDow = fields[4].length === 7;

  if (minute === '*') descriptions.push('at every minute');
  else if (/^\*\/\d+$/.test(minute)) descriptions.push(`every ${minute.split('/')[1]} minutes`);
  else if (minute.includes(',')) descriptions.push(`at minutes ${listPhrase(fields[0])}`);
  else if (minute.includes('-')) descriptions.push(`every minute from ${fields[0][0]} through ${fields[0][fields[0].length - 1]}`);
  else descriptions.push(`at minute ${fields[0].join(', ')}`);

  if (allHours) descriptions.push('of every hour');
  else if (/^\*\/\d+$/.test(hour)) descriptions.push(`every ${hour.split('/')[1]} hours`);
  else if (hour.includes('-') && hour.includes('/')) {
    const [start, rest] = hour.split('-');
    const end = rest.split('/')[0];
    descriptions.push(`every ${rest.split('/')[1]} hours between ${start}:00 and ${end}:59`);
  } else descriptions.push(`past hours ${listPhrase(fields[1])}`);

  if (allDom && allMonth && allDow) descriptions.push('every day');
  else {
    if (!allDom) descriptions.push(`on day ${listPhrase(fields[2])} of the month`);
    if (!allMonth) descriptions.push(`in ${listPhrase(fields[3], ['', ...MONTHS])}`);
    if (!allDow) descriptions.push(`on ${listPhrase(fields[4], DAYS)}`);
  }
  void allMinutes;
  return descriptions;
}

/* ------------------------------ component ------------------------------ */

export const CronParserTool: React.FC = () => {
  const [expression, setExpression] = useState('30 8-18/2 * * 1-5');
  const [builderMode, setBuilderMode] = useState<'expression' | 'builder'>('expression');
  const [builder, setBuilder] = useState({ minute: '0', hour: '9', dom: '*', month: '*', dow: '1-5' });
  const [referenceDate, setReferenceDate] = useState(() => new Date());

  const effectiveExpression = useMemo(() => {
    if (builderMode === 'builder') {
      return `${builder.minute} ${builder.hour} ${builder.dom} ${builder.month} ${builder.dow}`;
    }
    return expression;
  }, [builderMode, builder, expression]);

  const parsed = useMemo(() => parseCron(effectiveExpression), [effectiveExpression]);
  const runs = useMemo(() => nextRuns(parsed.fields, 15), [parsed.fields, referenceDate]);
  const description = useMemo(
    () => describeCron(effectiveExpression.trim().split(/\s+/), parsed.fields),
    [effectiveExpression, parsed.fields]
  );

  const applyMacro = (expr: string) => {
    soundEngine.playPop(1.12);
    setExpression(expr);
    setBuilderMode('expression');
    const parts = expr.split(/\s+/);
    setBuilder({ minute: parts[0], hour: parts[1], dom: parts[2], month: parts[3], dow: parts[4] });
  };

  const updateBuilder = (key: keyof typeof builder, value: string) => {
    setBuilder((prev) => ({ ...prev, [key]: value }));
  };

  const copyValue = effectiveExpression;

  return (
    <div className="space-y-3">
      <div className="toy-card p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={builderMode}
            onChange={(id) => { soundEngine.playClick(); setBuilderMode(id as 'expression' | 'builder'); }}
            options={[
              { id: 'expression', label: 'Expression', icon: <CalendarClock className="w-3 h-3" /> },
              { id: 'builder', label: 'Visual builder', icon: <Sparkles className="w-3 h-3" /> },
            ]}
          />
          <div className="flex-1" />
          <CopyButton text={copyValue} label="Copy expression" />
        </div>

        {builderMode === 'expression' ? (
          <div className="flex items-center gap-1.5 rounded-xl bg-[#FFFDF9] border-2 border-[#DEC098] px-3 py-2 focus-within:border-[#D97706]">
            <Clock className="w-4 h-4 text-[#C98A4B] shrink-0" />
            <input
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              spellCheck={false}
              aria-label="Cron expression"
              className="flex-1 min-w-0 bg-transparent font-mono text-sm tracking-wider text-[#3B2314] focus:outline-none"
              placeholder="* * * * *"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {([
              ['minute', 'Minute', '0-59'],
              ['hour', 'Hour', '0-23'],
              ['dom', 'Day of month', '1-31'],
              ['month', 'Month', '1-12 / JAN'],
              ['dow', 'Day of week', '0-6 / SUN'],
            ] as [keyof typeof builder, string, string][]).map(([key, label, hint]) => (
              <label key={key} className="block">
                <span className="block text-[10.5px] font-bold text-[#6B4423] mb-0.5">{label}</span>
                <input
                  value={builder[key]}
                  onChange={(e) => updateBuilder(key, e.target.value)}
                  spellCheck={false}
                  className="toy-input font-mono text-[11px] py-1"
                  aria-label={label}
                  placeholder={hint}
                />
                <span className="block text-[9px] text-[#A98768] mt-0.5">{hint}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-[#8B5A2B]" />
          <span className="text-[10.5px] text-[#8A6748]">Macros:</span>
          {MACROS.map((m) => (
            <button
              key={m.expr}
              type="button"
              onClick={() => applyMacro(m.expr)}
              title={m.description}
              className={`toy-pill text-[10px] transition-all ${
                effectiveExpression === m.expr ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-white border-[#D4AA78] text-[#7A5535] hover:bg-[#FEF3C7]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {parsed.error && <ErrorBanner message={parsed.error} />}
      </div>

      {!parsed.error && (
        <>
          <div className="grid grid-cols-5 gap-1.5">
            {['Minute', 'Hour', 'Day', 'Month', 'Weekday'].map((label, idx) => (
              <div key={label} className="rounded-xl bg-[#FFF8EB] border-2 border-[#E6C79C] px-1.5 py-1.5 text-center">
                <p className="text-[9px] uppercase tracking-wide text-[#A98768] font-bold">{label}</p>
                <p className="font-mono text-[11px] text-[#3B2314] break-all leading-tight">
                  {parsed.fields[idx] ? (parsed.fields[idx].length > 8 ? `${parsed.fields[idx].length} values` : parsed.fields[idx].join(' ')) : '—'}
                </p>
              </div>
            ))}
          </div>

          <Panel title="Plain English" icon={<Sparkles className="w-3.5 h-3.5" />}>
            <p className="text-sm font-display text-[#3B2314] leading-relaxed">
              “{description.join(' ')}”
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatChip label="runs/day" value={parsed.fields[0].length * parsed.fields[1].length} tone="gold" />
              <StatChip label="minute values" value={parsed.fields[0].length} tone="cream" />
              <StatChip label="hour values" value={parsed.fields[1].length} tone="cream" />
              <StatChip label="month values" value={parsed.fields[3].length} tone="cream" />
            </div>
          </Panel>

          <Panel
            title="Next 15 executions"
            icon={<CalendarClock className="w-3.5 h-3.5" />}
            actions={
              <button
                type="button"
                onClick={() => { soundEngine.playPop(1.1); setReferenceDate(new Date()); }}
                className="toy-btn-cream px-2 py-1 text-[10px]"
              >
                Recalculate
              </button>
            }
          >
            {runs.length === 0 ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                <EmptyHint>
                  No matching times found in the next 400 days. Check for an impossible combination such as day 31 in February.
                </EmptyHint>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {runs.map((run, idx) => {
                  const rel = Math.round((run.getTime() - referenceDate.getTime()) / 60000);
                  return (
                    <div key={idx} className="flex items-center gap-2 rounded-lg bg-[#FFFDF9] border border-[#E2C6A2] px-2 py-1">
                      <span className="w-5 shrink-0 text-right text-[10px] text-[#C4A88C]">{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-[#3B2314] truncate">
                          {run.toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                        </p>
                        <p className="text-[9px] text-[#A98768]">
                          in {rel < 60 ? `${rel} min` : rel < 1440 ? `${(rel / 60).toFixed(1)} h` : `${(rel / 1440).toFixed(1)} d`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 flex items-center gap-1 text-[10px] text-[#A98768]">
              <Check className="w-3 h-3 text-[#16A34A]" /> Computed in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
            </p>
          </Panel>
        </>
      )}
    </div>
  );
};

export default CronParserTool;
