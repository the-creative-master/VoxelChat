import { useMemo, useState } from 'react';
import { Boxes, CircleDot, Droplets, Layers, Plus, Sparkles, Trash2, Type, Wand2 } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, Segmented } from './shared';

type EffectTab = 'radius' | 'shadow' | 'gradient' | 'glass' | 'text';

interface Shadow {
  id: number;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
  inset: boolean;
}

interface Stop {
  color: string;
  position: number;
}

const PRESETS: { name: string; radius: [number, number, number, number]; shadow: Omit<Shadow, 'id'>[] }[] = [
  { name: 'Pillow', radius: [18, 18, 18, 18], shadow: [{ x: 0, y: 10, blur: 24, spread: -6, color: '#7A5535', opacity: 0.28, inset: false }] },
  { name: 'Toy button', radius: [14, 14, 14, 14], shadow: [{ x: 0, y: 4, blur: 0, spread: 0, color: '#166534', opacity: 1, inset: false }, { x: 0, y: 6, blur: 12, spread: -2, color: '#166534', opacity: 0.35, inset: false }] },
  { name: 'Soft card', radius: [22, 22, 22, 22], shadow: [{ x: 0, y: 2, blur: 6, spread: -1, color: '#B45309', opacity: 0.15, inset: false }, { x: 0, y: 14, blur: 32, spread: -10, color: '#B45309', opacity: 0.25, inset: false }] },
  { name: 'Neumorphic', radius: [24, 24, 24, 24], shadow: [{ x: 8, y: 8, blur: 16, spread: 0, color: '#D4AA78', opacity: 0.9, inset: false }, { x: -8, y: -8, blur: 16, spread: 0, color: '#FFFFFF', opacity: 0.95, inset: false }] },
  { name: 'Inset well', radius: [16, 16, 16, 16], shadow: [{ x: 0, y: 3, blur: 8, spread: 0, color: '#7A5535', opacity: 0.45, inset: true }] },
  { name: 'Sticker', radius: [40, 6, 40, 6], shadow: [{ x: 3, y: 4, blur: 0, spread: 0, color: '#3B2314', opacity: 1, inset: false }] },
];

const GRADIENT_PRESETS: { name: string; stops: Stop[]; angle: number }[] = [
  { name: 'Honey', stops: [{ color: '#FDE68A', position: 0 }, { color: '#F59E0B', position: 100 }], angle: 135 },
  { name: 'Waffle', stops: [{ color: '#FCD34D', position: 0 }, { color: '#B45309', position: 100 }], angle: 135 },
  { name: 'Mint', stops: [{ color: '#A7F3D0', position: 0 }, { color: '#059669', position: 100 }], angle: 120 },
  { name: 'Berry', stops: [{ color: '#FBCFE8', position: 0 }, { color: '#BE185D', position: 100 }], angle: 145 },
  { name: 'Sunset', stops: [{ color: '#FDE68A', position: 0 }, { color: '#FB923C', position: 50 }, { color: '#DB2777', position: 100 }], angle: 110 },
  { name: 'Night', stops: [{ color: '#1E293B', position: 0 }, { color: '#0F172A', position: 100 }], angle: 160 },
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [0, 0, 0];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;
}

let shadowId = 100;

export const CssEffectsStudioTool: React.FC = () => {
  const [tab, setTab] = useState<EffectTab>('shadow');

  const [radius, setRadius] = useState<[number, number, number, number]>([18, 18, 18, 18]);
  const [linkedRadius, setLinkedRadius] = useState(true);
  const [shadows, setShadows] = useState<Shadow[]>([
    { id: 1, x: 0, y: 10, blur: 24, spread: -6, color: '#7A5535', opacity: 0.28, inset: false },
  ]);

  const [angle, setAngle] = useState(135);
  const [stops, setStops] = useState<Stop[]>([{ color: '#FDE68A', position: 0 }, { color: '#F59E0B', position: 100 }]);
  const [gradientType, setGradientType] = useState<'linear' | 'radial' | 'conic'>('linear');

  const [glass, setGlass] = useState({ blur: 12, saturation: 140, alpha: 0.35, borderAlpha: 0.5, tint: '#FFFFFF' });

  const [textShadow, setTextShadow] = useState({ x: 2, y: 2, blur: 0, color: '#3B2314', opacity: 1, size: 34 });
  const [textColor, setTextColor] = useState('#FFF8EB');

  const shadowCss = useMemo(
    () => shadows.map((s) => `${s.inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${withAlpha(s.color, s.opacity)}`).join(', '),
    [shadows]
  );

  const radiusCss = useMemo(() => {
    if (radius.every((r) => r === radius[0])) return `${radius[0]}px`;
    return radius.map((r) => `${r}px`).join(' ');
  }, [radius]);

  const gradientCss = useMemo(() => {
    const stopText = stops
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => `${s.color} ${s.position}%`)
      .join(', ');
    if (gradientType === 'radial') return `radial-gradient(circle at 50% 50%, ${stopText})`;
    if (gradientType === 'conic') return `conic-gradient(from ${angle}deg at 50% 50%, ${stopText})`;
    return `linear-gradient(${angle}deg, ${stopText})`;
  }, [stops, gradientType, angle]);

  const glassCss = useMemo(
    () => `background: ${withAlpha(glass.tint, glass.alpha)};
backdrop-filter: blur(${glass.blur}px) saturate(${glass.saturation}%);
-webkit-backdrop-filter: blur(${glass.blur}px) saturate(${glass.saturation}%);
border: 1px solid ${withAlpha('#FFFFFF', glass.borderAlpha)};
box-shadow: 0 8px 32px ${withAlpha('#3B2314', 0.18)};`,
    [glass]
  );

  const textShadowCss = useMemo(
    () => `${textShadow.x}px ${textShadow.y}px ${textShadow.blur}px ${withAlpha(textShadow.color, textShadow.opacity)}`,
    [textShadow]
  );

  const fullCss = useMemo(() => {
    const lines: string[] = ['.toy-element {', `  border-radius: ${radiusCss};`];
    if (shadows.length) lines.push(`  box-shadow: ${shadowCss};`);
    lines.push(`  background: ${gradientCss};`, '}');
    return lines.join('\n');
  }, [radiusCss, shadowCss, gradientCss, shadows.length]);

  const copyText = useMemo(() => {
    switch (tab) {
      case 'radius': return `.element {\n  border-radius: ${radiusCss};\n}`;
      case 'shadow': return `.element {\n  box-shadow: ${shadowCss};\n}`;
      case 'gradient': return `.element {\n  background: ${gradientCss};\n}`;
      case 'glass': return `.element {\n  ${glassCss.replace(/\n/g, '\n  ')}\n}`;
      default: return `.element {\n  text-shadow: ${textShadowCss};\n}`;
    }
  }, [tab, radiusCss, shadowCss, gradientCss, glassCss, textShadowCss]);

  const updateShadow = (id: number, patch: Partial<Shadow>) => {
    setShadows((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addShadow = () => {
    soundEngine.playPop(1.15);
    setShadows((list) => [...list, { id: ++shadowId, x: 0, y: 8, blur: 16, spread: 0, color: '#7A5535', opacity: 0.25, inset: false }]);
  };

  const updateRadius = (index: number, value: number) => {
    setRadius((prev) => {
      if (linkedRadius) return [value, value, value, value];
      const next = [...prev] as [number, number, number, number];
      next[index] = value;
      return next;
    });
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    soundEngine.playPop(1.12);
    setRadius(preset.radius);
    setLinkedRadius(preset.radius.every((r) => r === preset.radius[0]));
    setShadows(preset.shadow.map((s) => ({ ...s, id: ++shadowId })));
  };

  const previewShadow = shadowCss;
  const previewBg = tab === 'gradient' ? gradientCss : 'linear-gradient(160deg, #FCD34D, #F59E0B)';

  return (
    <div className="space-y-3">
      <div className="toy-card p-2.5 flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={(id) => { soundEngine.playClick(); setTab(id as EffectTab); }}
          options={[
            { id: 'radius', label: 'Radius', icon: <CircleDot className="w-3 h-3" /> },
            { id: 'shadow', label: 'Shadows', icon: <Boxes className="w-3 h-3" /> },
            { id: 'gradient', label: 'Gradient', icon: <Layers className="w-3 h-3" /> },
            { id: 'glass', label: 'Glass', icon: <Droplets className="w-3 h-3" /> },
            { id: 'text', label: 'Text', icon: <Type className="w-3 h-3" /> },
          ]}
        />
        <div className="flex-1" />
        <CopyButton text={copyText} label="Copy CSS" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-3">
        <div className="space-y-2.5 min-w-0">
          <Panel title="Live preview" icon={<Sparkles className="w-3.5 h-3.5" />}>
            <div
              className="relative rounded-2xl p-6 min-h-[19rem] flex items-center justify-center overflow-hidden border-2 border-[#E2C6A2]"
              style={{
                backgroundColor: '#FFF3DC',
                backgroundImage:
                  tab === 'glass'
                    ? 'linear-gradient(120deg, #FDE68A 0%, #FCA5A5 35%, #93C5FD 70%, #A7F3D0 100%)'
                    : 'radial-gradient(circle, #E6C79C 1px, transparent 1px)',
                backgroundSize: tab === 'glass' ? 'cover' : '18px 18px',
              }}
            >
              <div
                className="w-full max-w-[22rem] h-48 flex items-center justify-center transition-all duration-200"
                style={{
                  borderRadius: radiusCss,
                  boxShadow: previewShadow || undefined,
                  background: tab === 'glass' ? `rgba(255,255,255,${glass.alpha})` : previewBg,
                  backdropFilter: tab === 'glass' ? `blur(${glass.blur}px) saturate(${glass.saturation}%)` : undefined,
                  WebkitBackdropFilter: tab === 'glass' ? `blur(${glass.blur}px) saturate(${glass.saturation}%)` : undefined,
                  border: tab === 'glass' ? `1px solid rgba(255,255,255,${glass.borderAlpha})` : 'none',
                }}
              >
                {tab === 'text' ? (
                  <span
                    className="font-display font-black tracking-tight px-2 text-center leading-none"
                    style={{ fontSize: `${textShadow.size}px`, color: textColor, textShadow: textShadowCss }}
                  >
                    Waffle
                  </span>
                ) : (
                  <span className="font-display font-bold text-[#3B2314] text-sm bg-white/70 rounded-full px-3 py-1 border border-white/80">
                    Preview
                  </span>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Generated CSS" icon={<span className="text-[10px] font-bold">CSS</span>}>
            <pre className="max-h-72 overflow-auto rounded-lg bg-[#1F150E] p-2.5 font-mono text-[10.5px] leading-relaxed text-[#FDF3E1] whitespace-pre-wrap break-all">
              {tab === 'glass' ? `.element {\n  ${glassCss.replace(/\n/g, '\n  ')}\n}` : copyText}
            </pre>
          </Panel>
        </div>

        <div className="space-y-2.5">
          {tab === 'radius' && (
            <Panel title="Corner radii" icon={<CircleDot className="w-3.5 h-3.5" />}>
              <button
                type="button"
                onClick={() => { soundEngine.playClick(); setLinkedRadius((v) => { const next = !v; if (next) setRadius([radius[0], radius[0], radius[0], radius[0]]); return next; }); }}
                aria-pressed={linkedRadius}
                className={`toy-btn w-full mb-2 px-2 py-1 text-[10px] ${linkedRadius ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-[#FFFDF8] border-[#D4AA78] text-[#7A5535]'}`}
              >
                {linkedRadius ? 'All corners linked' : 'Corners independent'}
              </button>
              <div className="space-y-2">
                {(['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'] as const).map((label, idx) => (
                  <label key={label} className="block">
                    <span className="flex items-center justify-between text-[10.5px] font-bold text-[#6B4423] mb-0.5">
                      <span>{label}</span><span className="font-mono">{radius[idx]}px</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={radius[idx]}
                      onChange={(e) => updateRadius(idx, Number(e.target.value))}
                      className="w-full accent-[#16A34A]"
                      aria-label={`${label} radius`}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-[#A98768]">
                Tip: a single value applies to all corners; four values run clockwise from top-left.
              </p>
            </Panel>
          )}

          {tab === 'shadow' && (
            <Panel
              title="Layers"
              icon={<Boxes className="w-3.5 h-3.5" />}
              actions={<button type="button" onClick={addShadow} className="toy-btn-cream px-2 py-1 text-[10px]"><Plus className="w-3 h-3" /> Add</button>}
            >
              <div className="space-y-2">
                {shadows.map((s) => (
                  <div key={s.id} className="rounded-xl border-2 border-[#E2C6A2] bg-[#FFFDF9] p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[#6B4423] flex-1">Shadow layer</span>
                      <button
                        type="button"
                        onClick={() => updateShadow(s.id, { inset: !s.inset })}
                        className={`toy-pill text-[9px] ${s.inset ? 'bg-[#EDE9FE] border-[#C4B5FD] text-[#4C1D95]' : 'bg-white border-[#D4AA78] text-[#7A5535]'}`}
                      >
                        inset
                      </button>
                      <input
                        type="color"
                        value={s.color}
                        onChange={(e) => updateShadow(s.id, { color: e.target.value })}
                        className="w-6 h-5 rounded cursor-pointer border border-[#D4AA78]"
                        aria-label="Shadow colour"
                      />
                      <button
                        type="button"
                        onClick={() => { soundEngine.playClick(); setShadows((list) => list.filter((x) => x.id !== s.id)); }}
                        className="text-[#B91C1C] hover:bg-[#FEE2E2] rounded p-0.5"
                        aria-label="Remove shadow layer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {([
                      ['x', 'X', -60, 60],
                      ['y', 'Y', -60, 60],
                      ['blur', 'Blur', 0, 120],
                      ['spread', 'Spread', -40, 40],
                    ] as [keyof Shadow, string, number, number][]).map(([key, label, min, max]) => (
                      <label key={String(key)} className="grid grid-cols-[2.2rem_1fr_2.2rem] items-center gap-1.5">
                        <span className="text-[9.5px] text-[#8A6748]">{label}</span>
                        <input
                          type="range"
                          min={min}
                          max={max}
                          value={Number(s[key])}
                          onChange={(e) => updateShadow(s.id, { [key]: Number(e.target.value) } as Partial<Shadow>)}
                          className="w-full accent-[#16A34A]"
                          aria-label={`Shadow ${label}`}
                        />
                        <span className="text-[9.5px] font-mono text-right text-[#3B2314]">{String(s[key])}</span>
                      </label>
                    ))}
                    <label className="grid grid-cols-[2.2rem_1fr_2.2rem] items-center gap-1.5">
                      <span className="text-[9.5px] text-[#8A6748]">Alpha</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={s.opacity}
                        onChange={(e) => updateShadow(s.id, { opacity: Number(e.target.value) })}
                        className="w-full accent-[#16A34A]"
                        aria-label="Shadow opacity"
                      />
                      <span className="text-[9.5px] font-mono text-right text-[#3B2314]">{s.opacity.toFixed(2)}</span>
                    </label>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {tab === 'gradient' && (
            <>
              <Panel title="Shape" icon={<Layers className="w-3.5 h-3.5" />}>
                <Segmented
                  value={gradientType}
                  onChange={(id) => { soundEngine.playClick(); setGradientType(id as 'linear' | 'radial' | 'conic'); }}
                  options={[{ id: 'linear', label: 'Linear' }, { id: 'radial', label: 'Radial' }, { id: 'conic', label: 'Conic' }]}
                />
                {gradientType !== 'radial' && (
                  <label className="block mt-2">
                    <span className="flex items-center justify-between text-[10.5px] font-bold text-[#6B4423] mb-0.5">
                      <span>Angle</span><span className="font-mono">{angle}°</span>
                    </span>
                    <input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="w-full accent-[#16A34A]" aria-label="Gradient angle" />
                  </label>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {GRADIENT_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => { soundEngine.playPop(1.1); setStops(p.stops); setAngle(p.angle); }}
                      className="toy-pill bg-white border-[#D4AA78] text-[#7A5535] text-[9.5px]"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel
                title="Colour stops"
                icon={<span className="text-[10px] font-bold">●</span>}
                actions={
                  <button
                    type="button"
                    onClick={() => { soundEngine.playPop(1.15); setStops((s) => [...s, { color: '#FFFFFF', position: 50 }]); }}
                    className="toy-btn-cream px-2 py-1 text-[10px]"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                }
              >
                <div className="space-y-1.5">
                  {stops.map((stop, idx) => (
                    <div key={idx} className="grid grid-cols-[1.6rem_1fr_3.4rem_1.2rem] items-center gap-1.5">
                      <input
                        type="color"
                        value={stop.color}
                        onChange={(e) => setStops((list) => list.map((s, i) => (i === idx ? { ...s, color: e.target.value } : s)))}
                        className="w-6 h-5 rounded border border-[#D4AA78] cursor-pointer"
                        aria-label={`Stop ${idx + 1} colour`}
                      />
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={stop.position}
                        onChange={(e) => setStops((list) => list.map((s, i) => (i === idx ? { ...s, position: Number(e.target.value) } : s)))}
                        className="w-full accent-[#16A34A]"
                        aria-label={`Stop ${idx + 1} position`}
                      />
                      <span className="font-mono text-[9.5px] text-[#3B2314]">{stop.position}%</span>
                      <button
                        type="button"
                        disabled={stops.length <= 2}
                        onClick={() => setStops((list) => list.filter((_, i) => i !== idx))}
                        className="text-[#B91C1C] disabled:opacity-25 rounded p-0.5"
                        aria-label={`Remove stop ${idx + 1}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}

          {tab === 'glass' && (
            <Panel title="Glassmorphism" icon={<Droplets className="w-3.5 h-3.5" />}>
              <div className="space-y-2">
                {([
                  ['blur', 'Backdrop blur', 0, 40, 'px'],
                  ['saturation', 'Saturation', 50, 250, '%'],
                  ['alpha', 'Panel alpha', 0, 1, ''],
                  ['borderAlpha', 'Border alpha', 0, 1, ''],
                ] as [Exclude<keyof typeof glass, 'tint'>, string, number, number, string][]).map(([key, label, min, max, unit]) => (
                  <label key={key} className="block">
                    <span className="flex items-center justify-between text-[10.5px] font-bold text-[#6B4423] mb-0.5">
                      <span>{label}</span>
                      <span className="font-mono">{key === 'blur' || key === 'saturation' ? glass[key] : glass[key].toFixed(2)}{unit}</span>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={key === 'alpha' || key === 'borderAlpha' ? 0.01 : 1}
                      value={glass[key]}
                      onChange={(e) => setGlass((g) => ({ ...g, [key]: Number(e.target.value) }))}
                      className="w-full accent-[#16A34A]"
                      aria-label={label}
                    />
                  </label>
                ))}
                <label className="flex items-center justify-between text-[10.5px] font-bold text-[#6B4423]">
                  Tint
                  <input type="color" value={glass.tint} onChange={(e) => setGlass((g) => ({ ...g, tint: e.target.value }))} className="w-10 h-6 rounded border border-[#D4AA78] cursor-pointer" aria-label="Glass tint" />
                </label>
                <p className="text-[10px] text-[#A98768]">backdrop-filter needs a translucent background to show through — the preview uses a four-colour gradient behind it.</p>
              </div>
            </Panel>
          )}

          {tab === 'text' && (
            <Panel title="Text shadow" icon={<Type className="w-3.5 h-3.5" />}>
              <div className="space-y-2">
                {([
                  ['x', 'X offset', -20, 20],
                  ['y', 'Y offset', -20, 20],
                  ['blur', 'Blur', 0, 40],
                  ['size', 'Font size', 16, 72],
                ] as [keyof typeof textShadow, string, number, number][]).map(([key, label, min, max]) => (
                  <label key={key} className="block">
                    <span className="flex items-center justify-between text-[10.5px] font-bold text-[#6B4423] mb-0.5">
                      <span>{label}</span><span className="font-mono">{textShadow[key]}{key === 'size' ? 'px' : ''}</span>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={textShadow[key]}
                      onChange={(e) => setTextShadow((t) => ({ ...t, [key]: Number(e.target.value) }))}
                      className="w-full accent-[#16A34A]"
                      aria-label={label}
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="flex items-center justify-between text-[10.5px] font-bold text-[#6B4423] mb-0.5">
                    <span>Opacity</span><span className="font-mono">{textShadow.opacity.toFixed(2)}</span>
                  </span>
                  <input type="range" min={0} max={1} step={0.01} value={textShadow.opacity} onChange={(e) => setTextShadow((t) => ({ ...t, opacity: Number(e.target.value) }))} className="w-full accent-[#16A34A]" aria-label="Text shadow opacity" />
                </label>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1 text-[10.5px] font-bold text-[#6B4423]">
                    Shadow
                    <input type="color" value={textShadow.color} onChange={(e) => setTextShadow((t) => ({ ...t, color: e.target.value }))} className="w-8 h-5 rounded border border-[#D4AA78] cursor-pointer" aria-label="Text shadow colour" />
                  </label>
                  <label className="flex items-center gap-1 text-[10.5px] font-bold text-[#6B4423]">
                    Text
                    <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-8 h-5 rounded border border-[#D4AA78] cursor-pointer" aria-label="Text colour" />
                  </label>
                </div>
              </div>
            </Panel>
          )}

          {(tab === 'shadow' || tab === 'radius') && (
            <Panel title="Combined snippet" icon={<Wand2 className="w-3.5 h-3.5" />} actions={<CopyButton text={fullCss} />}>
              <pre className="max-h-40 overflow-auto rounded-lg bg-[#1F150E] p-2.5 font-mono text-[10.5px] leading-relaxed text-[#FDF3E1] whitespace-pre-wrap break-all">{fullCss}</pre>
              <p className="mt-1.5 text-[10px] text-[#A98768]">Presets:</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button key={p.name} type="button" onClick={() => applyPreset(p)} className="toy-pill bg-white border-[#D4AA78] text-[#7A5535] text-[9.5px]">
                    {p.name}
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
};

export default CssEffectsStudioTool;
