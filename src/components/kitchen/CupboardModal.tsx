import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, MoreVertical, Pin, PinOff, Search, ShieldCheck, Sparkles, Star, StarOff, X } from 'lucide-react';
import { getCupboardById, getToolsForCupboard } from '../../registry/toolsRegistry';
import type { CupboardId, ToolDefinition } from '../../registry/types';
import { CupboardEmblem } from '../mascot/CupboardEmblems';
import { ToolIcon } from '../ui/ToolIcon';
import { soundEngine } from '../../utils/soundEngine';

interface CupboardModalProps {
  cupboardId: CupboardId;
  favorites: string[];
  onToggleFavorite: (toolId: string) => void;
  onSelectTool: (tool: ToolDefinition) => void;
  onClose: () => void;
  /** Shelf pins — pinned tools float to the top of the cupboard. */
  pins?: string[];
  onTogglePin?: (toolId: string) => void;
  /** Hall of Fame — the starred showcase board. */
  hall?: string[];
  onToggleHall?: (toolId: string) => void;
}

/**
 * Phase 2: Cupboard Zoom-In & 3D Door-Swing Shelf Exploration
 * - 3D perspective: 1200px with rotateY(-105deg) / rotateY(+105deg) swinging cabinet doors
 * - Top Shelf: Oversized golden-trimmed Star Utility ★ hero cartridge
 * - Lower Shelves: Remaining 14 local tool cartridges mounted on wooden shelves
 */
export const CupboardModal: React.FC<CupboardModalProps> = ({
  cupboardId,
  favorites,
  onToggleFavorite,
  onSelectTool,
  onClose,
  pins = [],
  onTogglePin,
  hall = [],
  onToggleHall,
}) => {
  const cupboard = getCupboardById(cupboardId);
  const allTools = useMemo(() => getToolsForCupboard(cupboardId), [cupboardId]);
  const [filter, setFilter] = useState('');
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  useEffect(() => {
    setDoorsOpen(false);
    const timer = window.setTimeout(() => setDoorsOpen(true), 45);
    return () => window.clearTimeout(timer);
  }, [cupboardId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !filter) {
        soundEngine.playCupboardClose();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filter, onClose]);

  const starTool = cupboard.hasStarTool ? allTools.find((t) => t.isStar) : undefined;
  const shelfTools = useMemo(() => {
    let rest = allTools.filter((t) => !t.isStar);
    if (filter.trim()) {
      const q = filter.toLowerCase().trim();
      rest = rest.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.shortDescription.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    // Pinned items sit at the top of the cupboard, in pin order.
    const pinRank = (id: string) => {
      const i = pins.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...rest].sort((a, b) => pinRank(a.id) - pinRank(b.id));
  }, [allTools, filter, pins]);

  const starMatchesFilter = useMemo(() => {
    if (!starTool) return false;
    if (!filter.trim()) return true;
    const q = filter.toLowerCase().trim();
    return (
      starTool.name.toLowerCase().includes(q) ||
      starTool.shortDescription.toLowerCase().includes(q) ||
      starTool.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [starTool, filter]);

  const { base, highlight, shadow, surface } = cupboard.palette;

  return (
    <motion.div
      key={`cupboard-${cupboardId}`}
      initial={{ opacity: 0, scale: 0.92, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 12 }}
      transition={{ duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }}
      className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 pt-5 pb-28"
    >
      {/* Top 2.5D Cupboard Cornice Header */}
      <div
        className="mx-2 sm:mx-4 h-5 rounded-t-3xl border-[3px] border-b-0"
        style={{
          background: `linear-gradient(180deg, ${highlight} 0%, ${base} 100%)`,
          borderColor: shadow,
          boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.65)',
        }}
      />

      {/* Zoomed-In 2.5D Cabinet Frame with Swinging 3D Doors */}
      <div
        className="relative rounded-3xl border-[4px] border-b-[12px] p-3 sm:p-5 perspective-kitchen shadow-toy-lg"
        style={{
          backgroundColor: base,
          borderColor: shadow,
          boxShadow:
            'inset 0 3px 0 rgba(255,255,255,0.52), 0 24px 48px rgba(58, 30, 10, 0.28)',
        }}
      >
        {/* Left Swinging 3D Cabinet Door (rotateY(-105deg)) */}
        <motion.div
          initial={{ rotateY: 0, opacity: 1 }}
          animate={
            doorsOpen
              ? { rotateY: -105, opacity: 0 }
              : { rotateY: 0, opacity: 1 }
          }
          transition={{
            rotateY: { duration: 0.68, ease: [0.34, 1.56, 0.64, 1] },
            opacity: { delay: 0.36, duration: 0.3 },
          }}
          style={{
            transformOrigin: 'left center',
            background: `linear-gradient(145deg, ${highlight} 0%, ${base} 55%)`,
            borderColor: shadow,
          }}
          className="pointer-events-none hidden lg:block absolute inset-y-4 left-4 w-[calc(50%-1rem)] z-30 rounded-l-2xl border-[3px] shadow-2xl"
          aria-hidden="true"
        >
          <div className="absolute inset-6 rounded-xl border-2 border-black/15" />
          <span className="absolute right-5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-br from-[#FEF08A] to-[#B45309] border-2 border-[#78350F]" />
        </motion.div>

        {/* Right Swinging 3D Cabinet Door (rotateY(+105deg)) */}
        <motion.div
          initial={{ rotateY: 0, opacity: 1 }}
          animate={
            doorsOpen
              ? { rotateY: 105, opacity: 0 }
              : { rotateY: 0, opacity: 1 }
          }
          transition={{
            rotateY: { duration: 0.68, ease: [0.34, 1.56, 0.64, 1] },
            opacity: { delay: 0.36, duration: 0.3 },
          }}
          style={{
            transformOrigin: 'right center',
            background: `linear-gradient(215deg, ${highlight} 0%, ${base} 55%)`,
            borderColor: shadow,
          }}
          className="pointer-events-none hidden lg:block absolute inset-y-4 right-4 w-[calc(50%-1rem)] z-30 rounded-r-2xl border-[3px] shadow-2xl"
          aria-hidden="true"
        >
          <div className="absolute inset-6 rounded-xl border-2 border-black/15" />
          <span className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-br from-[#FEF08A] to-[#B45309] border-2 border-[#78350F]" />
        </motion.div>

        {/* Cupboard Header Control Strip */}
        <div
          className="rounded-2xl bg-[#FFFDF9] border-2 border-b-[5px] px-4 sm:px-6 py-3.5 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
          style={{ borderColor: shadow }}
        >
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.playCupboardClose();
                onClose();
              }}
              className="toy-btn-cream px-3.5 py-2 text-xs sm:text-sm shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kitchen Wall</span>
            </button>

            <div className="hidden sm:block shrink-0">
              <CupboardEmblem cupboardId={cupboard.id} size={46} />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold text-white"
                  style={{ backgroundColor: shadow }}
                >
                  CUPBOARD #{cupboard.number}
                </span>
                <span className="text-xs font-semibold text-[#8B5A2B]">
                  {allTools.length} Local {cupboard.itemLabel}
                </span>
              </div>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-[#3B2314] leading-tight">
                {cupboard.name}
              </h2>
            </div>
          </div>

          {/* Shelf Filter Search */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-[#9A6B3E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${cupboard.shortName} shelf...`}
              className="toy-input pl-9 pr-8 py-2 text-sm"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B5A2B] hover:text-[#3B2314]"
                aria-label="Clear shelf filter"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Cozy Warm Wooden Cupboard Interior Shelves */}
        <div
          className="wood-interior-back rounded-2xl border-[3px] p-4 sm:p-6 space-y-6"
          style={{
            borderColor: shadow,
            boxShadow: 'inset 0 8px 24px rgba(28, 12, 2, 0.55)',
          }}
        >
          {/* TOP SHELF: Oversized Golden-Trimmed STAR UTILITY ★ Hero Cartridge */}
          {starTool && starMatchesFilter && (
            <div>
              <div className="flex items-center gap-2 text-xs font-display font-bold uppercase tracking-wider text-[#FDE68A] mb-2.5 px-1">
                <Sparkles className="w-4 h-4 text-[#FBBF24]" />
                <span>Top Shelf — Signature Star Utility</span>
              </div>

              <div className="relative group rounded-3xl bg-gradient-to-br from-[#FFFDF7] via-[#FFF9E6] to-[#FEF0C3] border-[3px] border-b-[8px] border-[#B45309] p-5 sm:p-6 shadow-toy-lg transition-transform hover:-translate-y-0.5">
                {/* Pulsing STAR UTILITY ★ Ribbon Badge */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gradient-to-r from-[#F59E0B] via-[#FBBF24] to-[#F59E0B] text-[#4A2104] font-display font-bold text-xs border-2 border-b-[3px] border-[#92400E] shadow-sm animate-pulse">
                    <Star className="w-3.5 h-3.5 fill-[#4A2104] text-[#4A2104]" />
                    <span>STAR UTILITY ★</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#DCFCE7] border border-[#16A34A] text-[#14532D] text-[11px] font-bold">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
                      100% Local
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(starTool.id);
                      }}
                      className={`toy-btn px-2.5 py-1.5 text-xs ${
                        favorites.includes(starTool.id)
                          ? 'bg-[#FEF08A] border-[#B45309] text-[#78350F]'
                          : 'bg-white border-[#D4AA78] text-[#7A5433]'
                      }`}
                      title={
                        favorites.includes(starTool.id)
                          ? 'Pinned in My Lunchbox'
                          : 'Pin to My Lunchbox'
                      }
                    >
                      <Star
                        className={`w-4 h-4 ${
                          favorites.includes(starTool.id)
                            ? 'fill-[#F59E0B] text-[#B45309]'
                            : 'text-[#A07855]'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-16 h-16 rounded-2xl border-2 border-b-[5px] flex items-center justify-center shrink-0 shadow-toy-sm"
                      style={{
                        background: `linear-gradient(145deg, ${highlight} 0%, ${base} 100%)`,
                        borderColor: shadow,
                      }}
                    >
                      <ToolIcon name={starTool.iconName} className="w-8 h-8 text-white drop-shadow" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-2xl sm:text-3xl text-[#3B2314]">
                        {starTool.name} ★
                      </h3>
                      <p className="text-sm text-[#5C3A1E] mt-1 max-w-2xl leading-relaxed">
                        {starTool.shortDescription}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playPop(1.1);
                      onSelectTool(starTool);
                    }}
                    className="toy-btn-gold px-6 py-3.5 text-base shrink-0 self-start lg:self-center"
                  >
                    <span>Open on Cutting Board</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Thick Honey-Oak Top Wooden Shelf Plank */}
              <div className="h-4 -mx-2 sm:-mx-3 -mt-1 rounded-lg bg-gradient-to-b from-[#EAB97E] to-[#C88844] border-2 border-b-[5px] border-[#4E2A0E] shadow-[0_8px_14px_rgba(20,8,0,0.42)]" />
            </div>
          )}

          {/* LOWER SHELVES: 14 Collectible 2.5D Tool Cartridges */}
          <div>
            <div className="flex items-center justify-between text-xs font-display font-bold uppercase tracking-wider text-[#FDE68A]/90 mb-3 px-1">
              <span>Cupboard Shelves — {shelfTools.length} Utilities</span>
              <span>Click any cartridge to launch</span>
            </div>

            {shelfTools.length === 0 && !starMatchesFilter ? (
              <div className="rounded-2xl bg-[#FFFDF9]/95 border-2 border-[#D4AA78] p-8 text-center">
                <p className="font-display font-bold text-lg text-[#3B2314]">
                  No utilities matched &ldquo;{filter}&rdquo;
                </p>
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  className="toy-btn-cream px-4 py-2 text-xs mt-3"
                >
                  Show all {allTools.length} tools
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {shelfTools.map((tool, i) => {
                  const isPinned = pins.includes(tool.id);
                  const isHall = hall.includes(tool.id);
                  return (
                    <motion.div
                      key={tool.id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: Math.min(i * 0.03, 0.35),
                        duration: 0.35,
                        ease: [0.34, 1.56, 0.64, 1],
                      }}
                      onClick={() => {
                        soundEngine.playPop(1.06);
                        onSelectTool(tool);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          soundEngine.playPop(1.06);
                          onSelectTool(tool);
                        }
                      }}
                      className="group relative flex flex-col justify-between rounded-2xl bg-[#FFFDF9] hover:bg-[#FFFBF2]
                                 border-2 border-b-[6px] border-[#D9B68C] hover:border-[#F59E0B] p-4
                                 cursor-pointer transition-all hover:-translate-y-1 active:translate-y-[3px] active:border-b-[2px] shadow-toy"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <div
                            className="w-11 h-11 rounded-xl border-2 border-b-[4px] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                            style={{
                              backgroundColor: surface,
                              borderColor: base,
                              color: shadow,
                            }}
                          >
                            <ToolIcon name={tool.iconName} className="w-5 h-5" />
                          </div>

                          <div className="flex items-center gap-1">
                            {isPinned && (
                              <span
                                className="inline-flex items-center rounded-md border border-[#D97706]/40 bg-[#FEF3C7] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#B45309]"
                                title="Pinned to the top of this cupboard"
                              >
                                <Pin className="h-2.5 w-2.5" strokeWidth={3} />
                              </span>
                            )}
                            {isHall && (
                              <span
                                className="inline-flex items-center rounded-md border border-[#B45309]/40 bg-gradient-to-r from-[#FDE68A] to-[#FBBF24] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#4A2104]"
                                title="In the Hall of Fame"
                              >
                                <Star className="h-2.5 w-2.5 fill-current" strokeWidth={3} />
                              </span>
                            )}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  soundEngine.playPop(1.2);
                                  setMenuFor(menuFor === tool.id ? null : tool.id);
                                }}
                                className={`p-1.5 rounded-lg border transition-colors ${
                                  isPinned
                                    ? 'bg-[#FEF3C7] border-[#D97706] text-[#B45309]'
                                    : 'bg-[#FFF9EF] border-[#E6C79C] text-[#B08D6A] hover:text-[#78350F]'
                                }`}
                                title="Tool options"
                                aria-label={`Options for ${tool.name}`}
                                aria-haspopup="menu"
                                aria-expanded={menuFor === tool.id}
                              >
                                <MoreVertical className="w-3.5 h-3.5" strokeWidth={2.5} />
                              </button>

                              {menuFor === tool.id && (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full z-40 mt-1.5 w-52 overflow-hidden rounded-xl border-2 border-b-[4px] border-[#3B2314]/25 bg-[#FFFDF9] py-1 text-left shadow-xl"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      onTogglePin?.(tool.id);
                                      soundEngine.playPop(isPinned ? 0.9 : 1.16);
                                      setMenuFor(null);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-[#3B2314] hover:bg-[#FEF3C7]"
                                  >
                                    {isPinned ? (
                                      <PinOff className="h-3.5 w-3.5 text-[#B45309]" strokeWidth={2.5} />
                                    ) : (
                                      <Pin className="h-3.5 w-3.5 text-[#B45309]" strokeWidth={2.5} />
                                    )}
                                    {isPinned ? 'Remove from top of cupboard' : 'Pin to top of cupboard'}
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      onToggleHall?.(tool.id);
                                      soundEngine.playStar();
                                      setMenuFor(null);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-[#3B2314] hover:bg-[#FEF3C7]"
                                  >
                                    {isHall ? (
                                      <StarOff className="h-3.5 w-3.5 text-[#B45309]" strokeWidth={2.5} />
                                    ) : (
                                      <Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#B45309]" strokeWidth={2.5} />
                                    )}
                                    {isHall ? 'Remove from Hall of Fame' : 'Add to Hall of Fame'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <h3 className="font-display font-bold text-base text-[#3B2314] group-hover:text-[#B45309] transition-colors leading-snug">
                          {tool.name}
                        </h3>
                        <p className="text-xs text-[#6E4928] mt-1 leading-relaxed line-clamp-2">
                          {tool.shortDescription}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-3.5 pt-2.5 border-t border-[#F3DFC1]">
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#15803D] bg-[#ECFDF5] border border-[#BBF7D0] px-2 py-0.5 rounded-full">
                          <ShieldCheck className="w-3 h-3" />
                          100% Local
                        </span>
                        <span
                          className="text-xs font-display font-bold inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
                          style={{ color: shadow }}
                        >
                          Open <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Bottom Honey-Oak Shelf Plank */}
            <div className="h-4 -mx-2 sm:-mx-3 mt-2 rounded-lg bg-gradient-to-b from-[#EAB97E] to-[#C88844] border-2 border-b-[5px] border-[#4E2A0E] shadow-[0_8px_14px_rgba(20,8,0,0.42)]" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
