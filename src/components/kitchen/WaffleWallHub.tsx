import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, FileText, Leaf, Search, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { CUPBOARDS, getCupboardById, getToolsForCupboard } from '../../registry/toolsRegistry';
import type { CupboardId } from '../../registry/types';
import { soundEngine } from '../../utils/soundEngine';
import { KitchenScene } from '../ui/KitchenScene';
import { ToolIcon } from '../ui/ToolIcon';

interface WaffleWallHubProps {
  onOpenCupboard: (cupboardId: CupboardId) => void;
  onQuickOpenTool: (toolId: string) => void;
  onSearch?: () => void;
}

const CUPBOARD_ICONS: Record<CupboardId, string> = {
  math: 'Calculator',
  coding: 'TerminalSquare',
  'text-files': 'FileText',
  'art-design': 'Shapes',
  'video-editing': 'Film',
  'science-physics': 'Sigma',
  'music-composing': 'Music4',
  games: 'Gamepad2',
};

/** A short editorial line per cupboard, in the voice of the live site. */
const CUPBOARD_BLURBS: Record<CupboardId, string> = {
  math: 'Numbers, units and sums — checked twice.',
  coding: 'A tiny IDE and the developer odds and ends.',
  'text-files': 'Words in, words out. Files handled gently.',
  'art-design': 'Colour, shape and things that look nice.',
  'video-editing': 'Clips, captions and timelines.',
  'science-physics': 'Labs you can run on the countertop.',
  'music-composing': 'Little instruments and bigger ideas.',
  games: 'Take a break. The kettle can wait.',
};

const TOTAL_TOOLS = CUPBOARDS.reduce(
  (n, c) => n + (c.unlocked ? getToolsForCupboard(c.id).length : 0),
  0
);

/**
 * The kitchen home page: an editorial hero with a CSS kitchen still life,
 * a search row, and the eight cupboard cards as colour-blocked doors.
 */
export const WaffleWallHub: React.FC<WaffleWallHubProps> = ({
  onOpenCupboard,
  onQuickOpenTool,
  onSearch,
}) => {
  const [hovered, setHovered] = useState<CupboardId | null>(null);
  const [lockedNudge, setLockedNudge] = useState<CupboardId | null>(null);

  const handleCupboardClick = (id: CupboardId) => {
    const cupboard = getCupboardById(id);
    if (!cupboard.unlocked) {
      soundEngine.playLockedRattle();
      setLockedNudge(id);
      window.setTimeout(() => setLockedNudge(null), 520);
      return;
    }
    soundEngine.playCupboardOpen();
    onOpenCupboard(id);
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-7 sm:px-8">
      {/* ------------------------------- hero ------------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        className="hero-shell mb-7 grid overflow-hidden lg:grid-cols-[1.05fr_0.95fr]"
      >
        <div className="relative z-10 px-6 pb-7 pt-9 sm:px-10 sm:pb-9 sm:pt-11">
          <div className="eyebrow">Come on in. Make something.</div>

          <h1 className="mt-5">
            A little tool
            <br />
            for <em className="not-italic">everything.</em>
            <span
              className="ml-3 inline-block align-top text-[26px] text-[#d28253]"
              style={{ transform: 'rotate(17deg)' }}
              aria-hidden
            >
              ✳
            </span>
          </h1>

          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-[#6d7c62]">
            Welcome to your cozy corner of the internet.
            <br className="hidden sm:block" /> Open a cupboard. Find something useful. Make your day.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-[#7f8973]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#8e9c78]" strokeWidth={1.8} />
              Private by nature
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Leaf className="h-3.5 w-3.5 text-[#8e9c78]" strokeWidth={1.8} />
              No sign-up. Just useful.
            </span>
            <span className="font-mono text-[10.5px] text-[#9aa58c]">
              {TOTAL_TOOLS} tools ready
            </span>
          </div>
        </div>

        <div className="relative min-h-[220px] lg:min-h-[352px]">
          <KitchenScene />
        </div>
      </motion.section>

      {/* ----------------------------- discovery ---------------------------- */}
      <div className="mb-11 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.08);
            onSearch?.();
          }}
          className="search-wrap flex h-[46px] flex-1 items-center gap-3 rounded-lg border border-[#e4e4d9]
                     bg-[#fffefa] px-4 text-left transition-colors hover:border-[#c9d2ba]"
          aria-label="Search every utility"
        >
          <Search className="h-[17px] w-[17px] shrink-0 text-[#939c86]" strokeWidth={1.7} />
          <span className="flex-1 truncate text-[13px] text-[#9c9e92]">
            What would you like to make easier?
          </span>
          <kbd className="hidden shrink-0 rounded border border-[#e3e5d8] bg-[#f4f5ec] px-1.5 py-0.5 font-mono text-[10px] text-[#8a9282] sm:block">
            /
          </kbd>
        </button>

        <button
          type="button"
          onClick={() => {
            const unlocked = CUPBOARDS.filter((c) => c.unlocked);
            const tools = unlocked.flatMap((c) => getToolsForCupboard(c.id));
            const pick = tools[Math.floor(Math.random() * tools.length)];
            if (pick) {
              soundEngine.playPop(1.12);
              onQuickOpenTool(pick.id);
            }
          }}
          className="inline-flex h-[46px] shrink-0 items-center justify-center gap-2 rounded-lg border border-[#e1e3d5]
                     bg-[#f1f2e8] px-5 text-[12px] text-[#657155] transition-colors hover:bg-[#e8ebdc]"
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
          Surprise me
        </button>
      </div>

      {/* ----------------------------- cupboards ---------------------------- */}
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow">The cupboards</div>
          <h2 className="mt-2">Pick a cupboard.</h2>
        </div>
        <p className="hidden pb-2 font-serif text-[13px] italic text-[#a0a48f] sm:block">
          everything in its place <span className="ml-1.5 text-[18px]">✳</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CUPBOARDS.map((cupboard, index) => {
          const { base, shadow, flavorName } = cupboard.palette;
          const isHovered = hovered === cupboard.id;
          const isNudging = lockedNudge === cupboard.id;
          const tools = cupboard.unlocked ? getToolsForCupboard(cupboard.id) : [];

          return (
            <motion.div
              key={cupboard.id}
              initial={{ opacity: 0, y: 16 }}
              animate={
                isNudging
                  ? { opacity: 1, y: 0, x: [0, -5, 5, -3, 3, 0] }
                  : { opacity: 1, y: 0, x: 0 }
              }
              transition={{ delay: Math.min(index * 0.04, 0.28), duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
              className="flex"
            >
              <button
                type="button"
                data-cupboard-card={cupboard.id}
                onClick={() => handleCupboardClick(cupboard.id)}
                onMouseEnter={() => {
                  setHovered(cupboard.id);
                  soundEngine.playHover();
                }}
                onMouseLeave={() => setHovered((prev) => (prev === cupboard.id ? null : prev))}
                className="group flex w-full flex-col overflow-hidden rounded-[17px] border border-[#e4e5da]
                           bg-[#fffefa] text-left shadow-[0_2px_5px_#2a3c2507] transition-all duration-200
                           hover:-translate-y-[5px] hover:border-[#d3d8c7] hover:shadow-[0_15px_30px_#37472a13]
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b9d78] focus-visible:ring-offset-2"
                aria-label={`${cupboard.name} — ${
                  cupboard.unlocked ? `${tools.length} tools` : 'baking soon'
                }`}
              >
                {/* colour-blocked door */}
                <div
                  className="relative h-[150px] w-full overflow-hidden"
                  style={{
                    backgroundColor: base,
                    boxShadow: 'inset 0 2px 0 #ffffff64, inset 0 -5px 12px #37402719',
                    filter: !cupboard.unlocked
                      ? 'saturate(0.5) opacity(0.82)'
                      : isHovered
                        ? 'saturate(1.09) brightness(1.02)'
                        : undefined,
                    transition: 'filter .2s',
                  }}
                >
                  {/* hairline door inset */}
                  <div
                    className="absolute inset-x-4 inset-y-3 rounded-lg border"
                    style={{
                      borderColor: '#30432e28',
                      boxShadow: '1px 1px 0 #ffffff70, inset 1px 1px 4px #35432b12',
                    }}
                  />
                  {/* faint vertical striping, like brushed cabinetry */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.12]"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(92deg, transparent 0 29px, #ffffff66 30px, transparent 31px 50px)',
                    }}
                  />

                  <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2">
                    <span
                      className="grid h-[57px] w-[57px] place-items-center rounded-full border border-[#ffffff73]"
                      style={{
                        background: '#ffffff47',
                        color: shadow,
                        boxShadow: '0 4px 12px #3d48241c',
                      }}
                    >
                      <ToolIcon name={CUPBOARD_ICONS[cupboard.id]} className="h-6 w-6" strokeWidth={1.5} />
                    </span>
                    <span
                      className="text-[9px] font-bold uppercase tracking-[1.5px]"
                      style={{ color: '#344a37' }}
                    >
                      {cupboard.unlocked
                        ? `${tools.length} ${tools.length === 1 ? 'tool' : 'tools'}`
                        : 'Baking soon'}
                    </span>
                  </div>

                  {/* brass knob */}
                  <span
                    className="absolute right-5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border"
                    style={{
                      background: '#f4eddb',
                      borderColor: '#8a7c5e44',
                      boxShadow: '0 1px 2px #3d482433',
                    }}
                    aria-hidden
                  />
                </div>

                {/* info */}
                <div className="flex flex-1 flex-col px-5 pb-4 pt-[18px]">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-serif text-[19px] leading-snug text-[#273e30]">
                      {cupboard.name}
                    </h3>
                    <ArrowRight
                      className="mt-1 h-4 w-4 shrink-0 text-[#b6bda8] transition-all group-hover:translate-x-1 group-hover:text-[#6c8163]"
                      strokeWidth={1.6}
                    />
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#979b8d]">
                    {cupboard.unlocked ? CUPBOARD_BLURBS[cupboard.id] : 'Still in the oven — check back soon.'}
                  </p>
                  <span className="mt-3 font-mono text-[10px] uppercase tracking-wide text-[#b3b9a6]">
                    {flavorName}
                  </span>
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* --------------------------- star utilities -------------------------- */}
      <section className="mt-14">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Start here</div>
            <h2 className="mt-2">The starred ones.</h2>
          </div>
          <p className="hidden pb-2 font-serif text-[13px] italic text-[#a0a48f] sm:block">
            picked by the kitchen <span className="ml-1.5 text-[18px]">✦</span>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { id: 'calculator', cupboard: 'math' as CupboardId, icon: 'Calculator', label: 'Calculator', blurb: 'Standard and scientific, with a memory tape.' },
            { id: 'waffle-code', cupboard: 'coding' as CupboardId, icon: 'TerminalSquare', label: 'CodeHubWeb', blurb: 'Python, C/C++ and more, right in the tab.' },
            { id: 'universal-file-converter', cupboard: 'text-files' as CupboardId, icon: 'FileOutput', label: 'File Converter', blurb: 'images · docs · data · audio' },
          ].map((starTool) => {
            const cup = getCupboardById(starTool.cupboard);
            return (
              <button
                key={starTool.id}
                type="button"
                onClick={() => {
                  soundEngine.playPop(1.1);
                  onQuickOpenTool(starTool.id);
                }}
                className="group relative flex flex-col items-start overflow-hidden rounded-[11px] border border-[#e5e6db]
                           bg-[#fffefa] p-5 text-left transition-all duration-200 hover:-translate-y-1
                           hover:border-[#bac4aa] hover:shadow-[0_10px_24px_#455e3810]"
              >
                <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#fdf9ea] px-2 py-0.5 text-[9px] font-medium text-[#a8873f]">
                  <Star className="h-2.5 w-2.5 fill-[#c39144] text-[#c39144]" /> Star
                </span>
                <span
                  className="mb-3 grid h-9 w-9 place-items-center rounded-lg"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${cup.palette.base} 22%, #fff)`,
                    color: cup.palette.shadow,
                  }}
                >
                  <ToolIcon name={starTool.icon} className="h-[18px] w-[18px]" strokeWidth={1.6} />
                </span>
                <strong className="font-serif text-[16px] font-medium text-[#273e30]">
                  {starTool.label}
                </strong>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[#979b8d]">{starTool.blurb}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[10.5px] text-[#8b9a7c]">
                  Open
                  <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* --------------------------- privacy strip -------------------------- */}
      <section className="mt-12 flex items-center gap-4 rounded-lg border border-[#e7e9dc] bg-[#eff1e6] px-6 py-5">
        <ShieldCheck className="h-6 w-6 shrink-0 text-[#8e9c78]" strokeWidth={1.5} />
        <div>
          <strong className="block text-[12px] font-medium text-[#738265]">
            Your files never leave this device.
          </strong>
          <span className="text-[11.5px] text-[#8f9a82]">
            Everything runs in your browser. No uploads, no accounts, no analytics.
          </span>
        </div>
        <span className="ml-auto hidden rotate-[15deg] text-[32px] text-[#b2b99b] sm:block" aria-hidden>
          ✳
        </span>
      </section>

      {/* ------------------------------ footer ------------------------------ */}
      <footer className="mt-10 flex flex-col gap-2 border-t border-[#e8e8df] pt-5 text-[11px] text-[#9aa38f] sm:flex-row sm:items-center sm:justify-between">
        <span>Handy little things, all in one happy place.</span>
        <span className="inline-flex items-center gap-2">
          <FileText className="h-3 w-3" strokeWidth={1.6} />
          Privacy first. Curiosity always.
          <span className="text-[15px] text-[#b2b99b]" aria-hidden>
            ✳
          </span>
        </span>
      </footer>
    </div>
  );
};

export default WaffleWallHub;
