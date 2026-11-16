import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChefHat, ExternalLink, Github, Sparkles, Star, X } from 'lucide-react';
import { CUPBOARDS } from '../../registry/toolsRegistry';
import type { CupboardDefinition, CupboardId } from '../../registry/types';
import { CupboardEmblem } from '../mascot/CupboardEmblems';
import { soundEngine } from '../../utils/soundEngine';

interface WaffleWallHubProps {
  onOpenCupboard: (cupboardId: CupboardId) => void;
  onQuickOpenTool: (toolId: string) => void;
}

/**
 * Phase 1: The 2.5D Waffle Kitchen Wall (Main Hub)
 * Responsive 4x2 grid of all 8 Candy-Kitchen Cupboards with double paneled 2.5D doors,
 * brass knobs, custom SVG emblems, sticker badges, and 3D hover door-peek rattle.
 */
export const WaffleWallHub: React.FC<WaffleWallHubProps> = ({
  onOpenCupboard,
  onQuickOpenTool,
}) => {
  const [hoveredId, setHoveredId] = useState<CupboardId | null>(null);
  const [rattlingId, setRattlingId] = useState<CupboardId | null>(null);
  const [peekCupboard, setPeekCupboard] = useState<CupboardDefinition | null>(null);

  const handleCupboardClick = (cupboard: CupboardDefinition) => {
    if (cupboard.unlocked) {
      soundEngine.playCupboardOpen();
      onOpenCupboard(cupboard.id);
    } else {
      soundEngine.playLockedRattle();
      setRattlingId(cupboard.id);
      setPeekCupboard(cupboard);
      window.setTimeout(() => setRattlingId(null), 460);
    }
  };

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-28">
      {/* Sunny Kitchen Welcome Signboard */}
      <motion.div
        initial={{ y: -14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
        className="mb-7 flex flex-col md:flex-row items-center justify-between gap-4 rounded-3xl
                   bg-[#FFFDF8]/95 border-2 border-b-[6px] border-[#DEC098] px-5 sm:px-7 py-4 shadow-toy"
      >
        <div className="text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#B45309] mb-1">
            <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>The Waffle Kitchen Wall</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#3B2314]">
            Pick a Cupboard to Start Cooking!
          </h2>
          <p className="text-xs sm:text-sm text-[#6E4928] mt-0.5">
            Cupboards <strong className="text-[#DC2626]">1 (Math &amp; Numbers)</strong> &amp;{' '}
            <strong className="text-[#15803D]">2 (Coding &amp; Developing)</strong> are freshly
            stocked with <strong>30 full local utilities</strong> — zero paywalls, zero uploads.
          </p>
        </div>

        {/* Quick Star Tool Jump Chips */}
        <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundEngine.playPop(1.08);
              onQuickOpenTool('calculator');
            }}
            className="toy-btn bg-gradient-to-b from-[#FF6B6B] to-[#EF4444] border-[#991B1B] text-white px-3.5 py-2 text-xs sm:text-sm"
          >
            <Star className="w-3.5 h-3.5 fill-[#FEF08A] text-[#FEF08A]" />
            <span>Calculator ★</span>
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playPop(1.12);
              onQuickOpenTool('waffle-code');
            }}
            className="toy-btn bg-gradient-to-b from-[#4ADE80] to-[#16A34A] border-[#14532D] text-white px-3.5 py-2 text-xs sm:text-sm"
          >
            <Star className="w-3.5 h-3.5 fill-[#FEF08A] text-[#FEF08A]" />
            <span>WaffleCode IDE ★</span>
          </button>
        </div>
      </motion.div>

      {/* The 8 Interactive 2.5D Candy-Kitchen Cupboards (4x2 Desktop, 2x4 Tablet, 1-Col Mobile) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
        {CUPBOARDS.map((cupboard, index) => {
          const isHovered = hoveredId === cupboard.id;
          const isRattling = rattlingId === cupboard.id;
          const { base, highlight, shadow } = cupboard.palette;

          return (
            <motion.div
              key={cupboard.id}
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={
                isRattling
                  ? { opacity: 1, y: 0, scale: 1, x: [0, -7, 7, -5, 5, -2, 0] }
                  : { opacity: 1, y: 0, scale: 1, x: 0 }
              }
              transition={
                isRattling
                  ? { duration: 0.42 }
                  : { delay: index * 0.045, duration: 0.48, ease: [0.34, 1.56, 0.64, 1] }
              }
              className="flex flex-col"
            >
              <button
                type="button"
                data-cupboard-card={cupboard.id}
                onClick={() => handleCupboardClick(cupboard)}
                onMouseEnter={() => {
                  setHoveredId(cupboard.id);
                  soundEngine.playHover();
                }}
                onMouseLeave={() => setHoveredId((prev) => (prev === cupboard.id ? null : prev))}
                className={`group relative w-full text-left select-none cursor-pointer transition-transform duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#F59E0B] rounded-[1.6rem] ${
                  cupboard.unlocked ? 'hover:-translate-y-1.5 active:translate-y-1' : 'hover:-translate-y-0.5'
                }`}
                aria-label={`${cupboard.name} cupboard — ${cupboard.itemCount} ${cupboard.itemLabel}${
                  cupboard.unlocked ? '' : ' (Baking Soon)'
                }`}
              >
                {/* Top 2.5D Crown Molding Cornice */}
                <div
                  className="mx-1 h-4 rounded-t-2xl border-2 border-b-0 relative overflow-hidden"
                  style={{
                    background: `linear-gradient(180deg, ${highlight} 0%, ${base} 100%)`,
                    borderColor: shadow,
                    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.65)',
                  }}
                >
                  <div className="absolute inset-x-3 top-1 h-1 rounded-full bg-white/45" />
                </div>

                {/* Main Cupboard Outer Box */}
                <div
                  className="relative rounded-2xl border-[3px] border-b-[10px] p-2.5 transition-shadow"
                  style={{
                    backgroundColor: base,
                    borderColor: shadow,
                    boxShadow: isHovered
                      ? 'inset 0 2px 0 rgba(255,255,255,0.55), 0 18px 32px rgba(74, 42, 16, 0.26)'
                      : 'inset 0 2px 0 rgba(255,255,255,0.5), 0 12px 22px rgba(74, 42, 16, 0.18)',
                  }}
                >
                  {/* Cupboard Number Pill (Top-Left) & Tool Count Sticker Badge (Top-Right) */}
                  <div className="flex items-center justify-between gap-2 mb-2 px-0.5 relative z-20">
                    <span
                      className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-mono text-[11px] font-extrabold text-white border"
                      style={{
                        backgroundColor: shadow,
                        borderColor: 'rgba(255,255,255,0.28)',
                      }}
                    >
                      #{cupboard.number}
                    </span>

                    {cupboard.unlocked ? (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFFDF8] text-[11px] font-display font-bold border-2 border-b-[3px] shadow-sm -rotate-2 group-hover:rotate-0 transition-transform"
                        style={{ borderColor: shadow, color: shadow }}
                      >
                        <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
                        {cupboard.itemCount} {cupboard.itemLabel}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#78350F] text-[11px] font-display font-bold border-2 border-b-[3px] border-[#92400E] rotate-1"
                      >
                        <ChefHat className="w-3 h-3 text-[#B45309]" />
                        {cupboard.itemCount} {cupboard.itemLabel}
                      </span>
                    )}
                  </div>

                  {/* Double 2.5D Cabinet Doors Stage (with Recessed Warm Lit Shelf Behind) */}
                  <div className="relative h-48 rounded-xl overflow-hidden perspective-kitchen border-2" style={{ borderColor: shadow }}>
                    {/* Cozy Interior Shelf Peek (visible through center gap when doors swing slightly open on hover!) */}
                    <div className="absolute inset-0 wood-interior-back flex flex-col justify-between p-3">
                      <div
                        className="mx-auto w-24 h-12 rounded-full blur-md transition-opacity duration-300"
                        style={{
                          background: 'radial-gradient(circle, rgba(254,240,138,0.85) 0%, transparent 70%)',
                          opacity: isHovered ? 1 : 0.4,
                        }}
                      />
                      <div className="h-2.5 w-full rounded bg-[#D99B56] border-b-2 border-[#5C3415]" />
                      <div className="flex items-end justify-center gap-2 px-4">
                        <span className="w-5 h-7 rounded bg-[#FEF08A]/85 border border-[#92400E]" />
                        <span className="w-6 h-9 rounded bg-[#FFFDF8]/90 border border-[#92400E]" />
                        <span className="w-5 h-6 rounded bg-[#FCA5A5]/85 border border-[#991B1B]" />
                      </div>
                      <div className="h-2.5 w-full rounded bg-[#D99B56] border-b-2 border-[#5C3415]" />
                    </div>

                    {/* Left Cabinet Door */}
                    <div
                      className="absolute inset-y-0 left-0 w-1/2 origin-left transition-transform duration-300 border-r"
                      style={{
                        background: `linear-gradient(155deg, ${highlight} 0%, ${base} 42%, ${base} 100%)`,
                        borderColor: shadow,
                        transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                        transform: isHovered
                          ? cupboard.unlocked
                            ? 'rotateY(-24deg)'
                            : 'rotateY(-7deg)'
                          : 'rotateY(0deg)',
                        boxShadow: isHovered
                          ? 'inset 0 2px 0 rgba(255,255,255,0.55), 6px 0 14px rgba(35,15,5,0.35)'
                          : 'inset 0 2px 0 rgba(255,255,255,0.55)',
                      }}
                    >
                      {/* Recessed Shaker Door Panel */}
                      <div
                        className="absolute inset-2.5 rounded-lg border-2"
                        style={{
                          borderColor: `${shadow}66`,
                          boxShadow:
                            'inset 2px 2px 4px rgba(0,0,0,0.12), inset -1px -1px 0 rgba(255,255,255,0.38)',
                        }}
                      />
                      {/* Brass Hinges */}
                      <span className="absolute left-0.5 top-5 w-1.5 h-5 rounded-r bg-gradient-to-b from-[#FDE68A] to-[#B45309] border border-[#78350F]" />
                      <span className="absolute left-0.5 bottom-5 w-1.5 h-5 rounded-r bg-gradient-to-b from-[#FDE68A] to-[#B45309] border border-[#78350F]" />
                      {/* Tactile Brass Door Knob */}
                      <span
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-[#78350F]"
                        style={{
                          background: 'radial-gradient(circle at 32% 30%, #FEF9C3 0%, #F59E0B 60%, #B45309 100%)',
                          boxShadow: '0 2px 3px rgba(0,0,0,0.32)',
                        }}
                      />
                    </div>

                    {/* Right Cabinet Door */}
                    <div
                      className="absolute inset-y-0 right-0 w-1/2 origin-right transition-transform duration-300 border-l"
                      style={{
                        background: `linear-gradient(205deg, ${highlight} 0%, ${base} 45%, ${base} 100%)`,
                        borderColor: shadow,
                        transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                        transform: isHovered
                          ? cupboard.unlocked
                            ? 'rotateY(24deg)'
                            : 'rotateY(7deg)'
                          : 'rotateY(0deg)',
                        boxShadow: isHovered
                          ? 'inset 0 2px 0 rgba(255,255,255,0.5), -6px 0 14px rgba(35,15,5,0.35)'
                          : 'inset 0 2px 0 rgba(255,255,255,0.5)',
                      }}
                    >
                      {/* Recessed Shaker Door Panel */}
                      <div
                        className="absolute inset-2.5 rounded-lg border-2"
                        style={{
                          borderColor: `${shadow}66`,
                          boxShadow:
                            'inset 2px 2px 4px rgba(0,0,0,0.12), inset -1px -1px 0 rgba(255,255,255,0.38)',
                        }}
                      />
                      {/* Brass Hinges */}
                      <span className="absolute right-0.5 top-5 w-1.5 h-5 rounded-l bg-gradient-to-b from-[#FDE68A] to-[#B45309] border border-[#78350F]" />
                      <span className="absolute right-0.5 bottom-5 w-1.5 h-5 rounded-l bg-gradient-to-b from-[#FDE68A] to-[#B45309] border border-[#78350F]" />
                      {/* Tactile Brass Door Knob */}
                      <span
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-[#78350F]"
                        style={{
                          background: 'radial-gradient(circle at 32% 30%, #FEF9C3 0%, #F59E0B 60%, #B45309 100%)',
                          boxShadow: '0 2px 3px rgba(0,0,0,0.32)',
                        }}
                      />
                    </div>

                    {/* Floating Center SVG Emblem Medallion */}
                    <div
                      className={`absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none transition-all duration-300 ${
                        isHovered && cupboard.unlocked ? 'scale-110 -translate-y-[56%]' : ''
                      }`}
                    >
                      <div className="drop-shadow-[0_6px_10px_rgba(40,18,6,0.32)]">
                        <CupboardEmblem cupboardId={cupboard.id} size={62} />
                      </div>
                    </div>

                    {/* Status Ribbon at Bottom of Door */}
                    <div className="absolute inset-x-2.5 bottom-2.5 z-10 pointer-events-none flex justify-center">
                      {cupboard.unlocked ? (
                        <span
                          className="px-3 py-1 rounded-full bg-[#FFFDF9]/95 text-[11px] font-display font-bold border-2 shadow-sm transition-transform group-hover:scale-105"
                          style={{ borderColor: shadow, color: shadow }}
                        >
                          {isHovered ? 'Click to Swing Open! →' : `★ ${cupboard.starPreviewName}`}
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-[#3B2314]/85 text-[#FEF3C7] text-[11px] font-display font-semibold border border-[#FDE68A]/50 backdrop-blur-[1px]">
                          In the Waffle Iron • Soon
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cupboard Cream Enamel Nameplate */}
                  <div
                    className="mt-2.5 rounded-xl bg-[#FFFDF9] border-2 border-b-[4px] px-3 py-2.5 text-center"
                    style={{
                      borderColor: shadow,
                      boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.9)',
                    }}
                  >
                    <h3 className="font-display font-bold text-base text-[#3B2314] leading-tight">
                      {cupboard.name}
                    </h3>
                    <p className="text-[11px] text-[#7A5433] line-clamp-1 mt-0.5 font-medium">
                      {cupboard.palette.flavorName}
                    </p>
                  </div>
                </div>

                {/* Under-Cabinet Wall Bracket Feet */}
                <div className="flex justify-between px-5 -mt-0.5 pointer-events-none">
                  <span
                    className="w-5 h-2 rounded-b-md border-x-2 border-b-2"
                    style={{ backgroundColor: shadow, borderColor: shadow }}
                  />
                  <span
                    className="w-5 h-2 rounded-b-md border-x-2 border-b-2"
                    style={{ backgroundColor: shadow, borderColor: shadow }}
                  />
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Cozy Kitchen Countertop Attribution Footer */}
      <div className="mt-12 toy-panel px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#6E4928]">
        <div className="flex items-center gap-2 font-medium text-center sm:text-left">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
          <span>
            <strong>Zero-BS Guarantee:</strong> Every utility runs 100% locally in your browser with
            rigorous math, authentic W3C color names, and standard classical Latin.
          </span>
        </div>
        <a
          href="https://github.com/the-creative-master"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-display font-bold text-[#4A2506] hover:text-[#DC2626] transition-colors shrink-0"
        >
          <Github className="w-3.5 h-3.5" />
          <span>the-creative-master</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Playful Peek Popover When Clicking Baking-Soon Cupboards 3-8 */}
      <AnimatePresence>
        {peekCupboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPeekCupboard(null)}
            className="fixed inset-0 z-50 bg-[#2C1608]/45 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.85, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 12, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl bg-[#FFFDF9] border-[3px] border-b-[9px] p-6 shadow-toy-lg relative"
              style={{ borderColor: peekCupboard.palette.shadow }}
            >
              <button
                type="button"
                onClick={() => {
                  soundEngine.playPop(0.95);
                  setPeekCupboard(null);
                }}
                className="absolute top-4 right-4 toy-btn-cream p-2"
                aria-label="Close preview"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3.5 mb-4">
                <div
                  className="p-2.5 rounded-2xl border-2 border-b-[4px]"
                  style={{
                    backgroundColor: peekCupboard.palette.surface,
                    borderColor: peekCupboard.palette.base,
                  }}
                >
                  <CupboardEmblem cupboardId={peekCupboard.id} size={48} />
                </div>
                <div>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-display font-bold text-white mb-1"
                    style={{ backgroundColor: peekCupboard.palette.base }}
                  >
                    Cupboard #{peekCupboard.number} • {peekCupboard.palette.flavorName}
                  </span>
                  <h3 className="font-display font-bold text-xl text-[#3B2314]">
                    {peekCupboard.name}
                  </h3>
                </div>
              </div>

              <p className="text-sm text-[#5C3A1E] mb-4">{peekCupboard.tagline}</p>

              <div className="waffle-recess rounded-2xl p-3.5 mb-5">
                <div className="flex items-center gap-1.5 text-xs font-display font-bold text-[#78350F] mb-2">
                  <ChefHat className="w-4 h-4 text-[#D97706]" />
                  <span>
                    Warming in the Waffle Iron ({peekCupboard.itemCount} {peekCupboard.itemLabel}{' '}
                    planned)
                  </span>
                </div>
                {peekCupboard.starPreviewName && (
                  <div className="text-xs font-bold text-[#B45309] mb-2">
                    Top Shelf Star: {peekCupboard.starPreviewName}
                  </div>
                )}
                {peekCupboard.upcomingHighlights && (
                  <div className="flex flex-wrap gap-1.5">
                    {peekCupboard.upcomingHighlights.map((item) => (
                      <span
                        key={item}
                        className="px-2.5 py-1 rounded-lg bg-[#FFFDF9] border border-[#DEC098] text-[11px] font-semibold text-[#5C3415]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const id: CupboardId = 'math';
                    setPeekCupboard(null);
                    soundEngine.playCupboardOpen();
                    onOpenCupboard(id);
                  }}
                  className="toy-btn-primary px-4 py-2 text-xs"
                >
                  Explore Math (#1)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id: CupboardId = 'coding';
                    setPeekCupboard(null);
                    soundEngine.playCupboardOpen();
                    onOpenCupboard(id);
                  }}
                  className="toy-btn-mint px-4 py-2 text-xs"
                >
                  Explore Coding (#2)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
