import { useMemo, useState } from 'react';
import { LayoutGrid, Columns3, Grid3x3, Sparkles } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, Segmented } from './shared';

type LayoutKind = 'flex' | 'grid';

interface FlexState {
  direction: 'row' | 'column';
  wrap: 'nowrap' | 'wrap' | 'wrap-reverse';
  justify: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  align: 'stretch' | 'flex-start' | 'flex-end' | 'center' | 'baseline';
  gap: number;
  itemCount: number;
  grow: boolean;
}

interface GridState {
  columns: number;
  rows: number;
  colGap: number;
  rowGap: number;
  justifyItems: 'stretch' | 'start' | 'center' | 'end';
  alignItems: 'stretch' | 'start' | 'center' | 'end';
  autoFlow: 'row' | 'column' | 'dense';
  itemCount: number;
  span: number;
}

const TAILWIND_JUSTIFY: Record<string, string> = {
  'flex-start': 'justify-start',
  'flex-end': 'justify-end',
  center: 'justify-center',
  'space-between': 'justify-between',
  'space-around': 'justify-around',
  'space-evenly': 'justify-evenly',
};
const TAILWIND_ALIGN: Record<string, string> = {
  stretch: 'items-stretch',
  'flex-start': 'items-start',
  'flex-end': 'items-end',
  center: 'items-center',
  baseline: 'items-baseline',
};

export const CssLayoutPlaygroundTool: React.FC = () => {
  const [kind, setKind] = useState<LayoutKind>('flex');
  const [flex, setFlex] = useState<FlexState>({
    direction: 'row',
    wrap: 'wrap',
    justify: 'space-between',
    align: 'center',
    gap: 12,
    itemCount: 5,
    grow: false,
  });
  const [grid, setGrid] = useState<GridState>({
    columns: 3,
    rows: 2,
    colGap: 12,
    rowGap: 12,
    justifyItems: 'stretch',
    alignItems: 'stretch',
    autoFlow: 'row',
    itemCount: 6,
    span: 1,
  });

  const cssText = useMemo(() => {
    if (kind === 'flex') {
      return `.container {
  display: flex;
  flex-direction: ${flex.direction};
  flex-wrap: ${flex.wrap};
  justify-content: ${flex.justify};
  align-items: ${flex.align};
  gap: ${flex.gap}px;
}

.item {
  ${flex.grow ? 'flex: 1 1 auto;\n  ' : ''}padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: #22C55E;
  color: #fff;
}`;
    }
    return `.container {
  display: grid;
  grid-template-columns: repeat(${grid.columns}, minmax(0, 1fr));
  grid-auto-rows: minmax(3rem, auto);
  column-gap: ${grid.colGap}px;
  row-gap: ${grid.rowGap}px;
  justify-items: ${grid.justifyItems};
  align-items: ${grid.alignItems};
  grid-auto-flow: ${grid.autoFlow};
}

.item.wide {
  grid-column: span ${grid.span};
}`;
  }, [kind, flex, grid]);

  const tailwindText = useMemo(() => {
    if (kind === 'flex') {
      const parts = [
        'flex',
        flex.direction === 'column' ? 'flex-col' : 'flex-row',
        flex.wrap === 'wrap' ? 'flex-wrap' : flex.wrap === 'wrap-reverse' ? 'flex-wrap-reverse' : 'flex-nowrap',
        TAILWIND_JUSTIFY[flex.justify],
        TAILWIND_ALIGN[flex.align],
        `gap-[${flex.gap}px]`,
      ];
      return `<div class="${parts.join(' ')}">\n  ${Array.from({ length: flex.itemCount }, (_, i) => `<div class="rounded-xl bg-[#22C55E] px-4 py-3 text-white${flex.grow ? ' flex-1' : ''}">${i + 1}</div>`).join('\n  ')}\n</div>`;
    }
    return `<div class="grid grid-cols-${grid.columns} gap-x-[${grid.colGap}px] gap-y-[${grid.rowGap}px] justify-items-${grid.justifyItems === 'start' ? 'start' : grid.justifyItems} items-${grid.alignItems} grid-flow-${grid.autoFlow === 'dense' ? 'row-dense' : grid.autoFlow}">\n  ${Array.from({ length: grid.itemCount }, (_, i) => `<div class="rounded-xl bg-[#22C55E] px-4 py-3 text-white${i === 0 && grid.span > 1 ? ` col-span-${grid.span}` : ''}">${i + 1}</div>`).join('\n  ')}\n</div>`;
  }, [kind, flex, grid]);

  const previewStyle = useMemo<React.CSSProperties>(() => {
    if (kind === 'flex') {
      return {
        display: 'flex',
        flexDirection: flex.direction,
        flexWrap: flex.wrap,
        justifyContent: flex.justify,
        alignItems: flex.align,
        gap: `${flex.gap}px`,
      };
    }
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
      gridAutoRows: 'minmax(3rem, auto)',
      columnGap: `${grid.colGap}px`,
      rowGap: `${grid.rowGap}px`,
      justifyItems: grid.justifyItems,
      alignItems: grid.alignItems,
      gridAutoFlow: grid.autoFlow,
    };
  }, [kind, flex, grid]);

  return (
    <div className="space-y-3">
      <div className="toy-card p-2.5 flex flex-wrap items-center gap-2">
        <Segmented
          value={kind}
          onChange={(id) => { soundEngine.playClick(); setKind(id as LayoutKind); }}
          options={[
            { id: 'flex', label: 'Flexbox', icon: <Columns3 className="w-3 h-3" /> },
            { id: 'grid', label: 'CSS Grid', icon: <Grid3x3 className="w-3 h-3" /> },
          ]}
        />
        <span className="text-[10px] text-[#A98768]">
          {kind === 'flex' ? 'One-dimensional layout along a main axis' : 'Two-dimensional rows and columns'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-3">
        <div className="space-y-2.5">
          {kind === 'flex' ? (
            <Panel title="Flex container" icon={<LayoutGrid className="w-3.5 h-3.5" />}>
              <div className="space-y-2">
                <label className="block">
                  <span className="block text-[10.5px] font-bold text-[#6B4423] mb-1">flex-direction</span>
                  <div className="flex gap-1">
                    {(['row', 'column'] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { soundEngine.playClick(); setFlex((f) => ({ ...f, direction: d })); }}
                        className={`toy-btn flex-1 px-1.5 py-1 text-[10px] ${flex.direction === d ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-[#FFFDF8] border-[#D4AA78] text-[#7A5535]'}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block">
                  <span className="block text-[10.5px] font-bold text-[#6B4423] mb-1">flex-wrap</span>
                  <select
                    value={flex.wrap}
                    onChange={(e) => setFlex((f) => ({ ...f, wrap: e.target.value as FlexState['wrap'] }))}
                    className="toy-input text-[11px] py-1"
                  >
                    <option value="nowrap">nowrap</option>
                    <option value="wrap">wrap</option>
                    <option value="wrap-reverse">wrap-reverse</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10.5px] font-bold text-[#6B4423] mb-1">justify-content</span>
                  <select
                    value={flex.justify}
                    onChange={(e) => setFlex((f) => ({ ...f, justify: e.target.value as FlexState['justify'] }))}
                    className="toy-input text-[11px] py-1"
                  >
                    {['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'].map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10.5px] font-bold text-[#6B4423] mb-1">align-items</span>
                  <select
                    value={flex.align}
                    onChange={(e) => setFlex((f) => ({ ...f, align: e.target.value as FlexState['align'] }))}
                    className="toy-input text-[11px] py-1"
                  >
                    {['stretch', 'flex-start', 'flex-end', 'center', 'baseline'].map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="flex items-center justify-between text-[10.5px] font-bold text-[#6B4423] mb-1">
                    <span>gap</span><span className="font-mono">{flex.gap}px</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={48}
                    value={flex.gap}
                    onChange={(e) => setFlex((f) => ({ ...f, gap: Number(e.target.value) }))}
                    className="w-full accent-[#16A34A]"
                    aria-label="Gap size"
                  />
                </label>
                <label className="block">
                  <span className="flex items-center justify-between text-[10.5px] font-bold text-[#6B4423] mb-1">
                    <span>items</span><span className="font-mono">{flex.itemCount}</span>
                  </span>
                  <input
                    type="range"
                    min={2}
                    max={12}
                    value={flex.itemCount}
                    onChange={(e) => setFlex((f) => ({ ...f, itemCount: Number(e.target.value) }))}
                    className="w-full accent-[#16A34A]"
                    aria-label="Number of items"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => { soundEngine.playClick(); setFlex((f) => ({ ...f, grow: !f.grow })); }}
                  aria-pressed={flex.grow}
                  className={`toy-btn w-full px-2 py-1 text-[10px] ${flex.grow ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-[#FFFDF8] border-[#D4AA78] text-[#7A5535]'}`}
                >
                  flex: 1 1 auto on children
                </button>
              </div>
            </Panel>
          ) : (
            <Panel title="Grid container" icon={<Grid3x3 className="w-3.5 h-3.5" />}>
              <div className="space-y-2">
                {([
                  ['columns', 'grid-template-columns', 1, 6],
                  ['rows', 'grid-auto-rows', 1, 4],
                  ['colGap', 'column-gap', 0, 40],
                  ['rowGap', 'row-gap', 0, 40],
                  ['itemCount', 'items', 2, 12],
                  ['span', 'first item span', 1, 3],
                ] as [keyof GridState, string, number, number][]).map(([key, label, min, max]) => (
                  <label key={key} className="block">
                    <span className="flex items-center justify-between text-[10.5px] font-bold text-[#6B4423] mb-1">
                      <span>{label}</span>
                      <span className="font-mono">{String(grid[key])}{key === 'colGap' || key === 'rowGap' ? 'px' : ''}</span>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={Number(grid[key])}
                      onChange={(e) => setGrid((g) => ({ ...g, [key]: Number(e.target.value) }))}
                      className="w-full accent-[#16A34A]"
                      aria-label={label}
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="block text-[10.5px] font-bold text-[#6B4423] mb-1">justify-items</span>
                  <select value={grid.justifyItems} onChange={(e) => setGrid((g) => ({ ...g, justifyItems: e.target.value as GridState['justifyItems'] }))} className="toy-input text-[11px] py-1">
                    {['stretch', 'start', 'center', 'end'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10.5px] font-bold text-[#6B4423] mb-1">align-items</span>
                  <select value={grid.alignItems} onChange={(e) => setGrid((g) => ({ ...g, alignItems: e.target.value as GridState['alignItems'] }))} className="toy-input text-[11px] py-1">
                    {['stretch', 'start', 'center', 'end'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10.5px] font-bold text-[#6B4423] mb-1">grid-auto-flow</span>
                  <select value={grid.autoFlow} onChange={(e) => setGrid((g) => ({ ...g, autoFlow: e.target.value as GridState['autoFlow'] }))} className="toy-input text-[11px] py-1">
                    <option value="row">row</option>
                    <option value="column">column</option>
                    <option value="dense">row dense</option>
                  </select>
                </label>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-2.5 min-w-0">
          <Panel title="Live preview" icon={<Sparkles className="w-3.5 h-3.5" />} actions={<span className="toy-pill bg-[#F0FDF4] border-[#86EFAC] text-[#14532D] text-[9.5px]">{kind}</span>}>
            <div
              className="rounded-xl bg-[#FFF8EB] border-2 border-dashed border-[#D9B68C] p-3 min-h-[16rem]"
              style={{ backgroundImage: 'radial-gradient(circle, #E6C79C 1px, transparent 1px)', backgroundSize: '16px 16px' }}
            >
              <div style={previewStyle}>
                {Array.from({ length: kind === 'flex' ? flex.itemCount : grid.itemCount }, (_, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-gradient-to-b from-[#4ADE80] to-[#22C55E] text-white font-display font-bold text-xs flex items-center justify-center border-2 border-b-[4px] border-[#166534] px-3 py-2"
                    style={{
                      gridColumn: kind === 'grid' && i === 0 && grid.span > 1 ? `span ${grid.span}` : undefined,
                      flex: kind === 'flex' && flex.grow ? '1 1 auto' : undefined,
                      minWidth: kind === 'grid' ? '2.5rem' : undefined,
                      minHeight: '3rem',
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
            <Panel title="CSS" icon={<span className="text-[10px] font-bold">CSS</span>} actions={<CopyButton text={cssText} />}>
              <pre className="max-h-56 overflow-auto rounded-lg bg-[#1F150E] p-2.5 font-mono text-[10.5px] leading-relaxed text-[#FDF3E1] whitespace-pre">{cssText}</pre>
            </Panel>
            <Panel title="Tailwind" icon={<span className="text-[10px] font-bold">TW</span>} actions={<CopyButton text={tailwindText} />}>
              <pre className="max-h-56 overflow-auto rounded-lg bg-[#1F150E] p-2.5 font-mono text-[10.5px] leading-relaxed text-[#86EFAC] whitespace-pre-wrap break-all">{tailwindText}</pre>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CssLayoutPlaygroundTool;
