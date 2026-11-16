import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, MoreVertical, Pin, PinOff, Search, ShieldCheck, Star, StarOff } from 'lucide-react';
import { getCupboardById, getToolsForCupboard } from '../../registry/toolsRegistry';
import type { CupboardId, ToolDefinition } from '../../registry/types';
import { ToolIcon } from '../ui/ToolIcon';
import { soundEngine } from '../../utils/soundEngine';

interface CupboardModalProps {
  cupboardId: CupboardId;
  favorites?: string[];
  onToggleFavorite?: (toolId: string) => void;
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
  const [menuFor, setMenuFor] = useState<string | null>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

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

  const { base, shadow, flavorName } = cupboard.palette;
  const pinnedCount = shelfTools.filter((t) => pins.includes(t.id)).length;

  return (
    <motion.div
      key={`cupboard-${cupboardId}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
      className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-7 sm:px-8"
    >
      {/* ------------------------------ heading ------------------------------ */}
      <button
        type="button"
        onClick={() => {
          soundEngine.playCupboardClose();
          onClose();
        }}
        className="inline-flex items-center gap-1.5 text-[11px] text-[#8b9a83] transition-colors hover:text-[#4c6152]"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
        Back to the kitchen
      </button>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4 border-b border-[#e8e8df] pb-6">
        <div className="min-w-0">
          <div className="eyebrow">
            Cupboard {cupboard.number} · {flavorName}
          </div>
          <h1 className="mt-3 flex flex-wrap items-center gap-3">
            {cupboard.name}
            {cupboard.hasStarTool && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fdf9ea] px-2.5 py-1 text-[10px] font-medium text-[#a8873f]">
                <Star className="h-2.5 w-2.5 fill-[#c39144] text-[#c39144]" /> Star utility
              </span>
            )}
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#8a9281]">
            {cupboard.tagline}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="font-mono text-[11px] text-[#9aa58c]">
            {allTools.length} {allTools.length === 1 ? 'utility' : 'utilities'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10.5px] text-[#8b9a7c]">
            <ShieldCheck className="h-3 w-3" strokeWidth={1.7} /> 100% local
          </span>
        </div>
      </div>

      {/* --------------------------- search / meta --------------------------- */}
      <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center">
        <label className="flex h-[42px] flex-1 items-center gap-2.5 rounded-lg border border-[#e4e4d9] bg-[#fffefa] px-3.5 focus-within:border-[#879e72] focus-within:shadow-[0_0_0_3px_#879e7215]">
          <Search className="h-[15px] w-[15px] shrink-0 text-[#939c86]" strokeWidth={1.7} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search ${cupboard.name.toLowerCase()}…`}
            aria-label={`Search ${cupboard.name}`}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[#354239] outline-none placeholder:text-[#9c9e92]"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="shrink-0 text-[10.5px] font-medium text-[#8b9a83] hover:text-[#4c6152]"
            >
              Clear
            </button>
          )}
        </label>
        <span className="font-mono text-[10.5px] text-[#a3ab96] sm:whitespace-nowrap">
          {shelfTools.length + (starMatchesFilter && starTool ? 1 : 0)} shown
          {pinnedCount > 0 ? ` · ${pinnedCount} pinned` : ''}
        </span>
      </div>

      {/* ---------------------------- star utility --------------------------- */}
      {starTool && starMatchesFilter && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36 }}
          className="mb-4 overflow-hidden rounded-[17px] border border-[#e4e5da] bg-[#fffefa] shadow-[0_2px_5px_#2a3c2507]"
        >
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-xl"
              style={{
                backgroundColor: `color-mix(in srgb, ${base} 20%, #fff)`,
                color: shadow,
              }}
            >
              <ToolIcon name={starTool.iconName} className="h-6 w-6" strokeWidth={1.5} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-[22px] leading-tight text-[#273e30]">{starTool.name}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fdf9ea] px-2 py-0.5 text-[9.5px] font-medium text-[#a8873f]">
                  <Star className="h-2.5 w-2.5 fill-[#c39144] text-[#c39144]" /> ★
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-[#8a9281]">
                {starTool.shortDescription}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundEngine.playStar();
                  onToggleHall?.(starTool.id);
                }}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[11px] transition-colors ${
                  hall.includes(starTool.id)
                    ? 'border-[#e5c1b6] bg-[#fdf1ee] text-[#b47b78]'
                    : 'border-[#e4e4d9] bg-[#fafbf5] text-[#7d8a76] hover:border-[#d3d8c7]'
                }`}
                title="Hall of Fame"
              >
                <Star
                  className={`h-3.5 w-3.5 ${hall.includes(starTool.id) ? 'fill-[#e5c1b6]' : ''}`}
                  strokeWidth={1.7}
                />
                <span className="hidden sm:inline">Fame</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playPop(1.1);
                  onSelectTool(starTool);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#3d5544] bg-[#3d5544] px-4 text-[11.5px] font-medium text-[#faf9ed] transition-colors hover:bg-[#203f2d]"
              >
                Open tool
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </motion.section>
      )}

      {/* ------------------------------ the shelf ---------------------------- */}
      {shelfTools.length === 0 && !starMatchesFilter ? (
        <div className="rounded-xl border border-dashed border-[#e1e5d6] bg-[#fafbf5] px-6 py-16 text-center">
          <p className="font-serif text-[24px] text-[#b5bc9f]">✳</p>
          <p className="mt-2 text-[13px] text-[#8c947e]">
            No utilities matched &ldquo;{filter}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => setFilter('')}
            className="mt-4 inline-flex h-9 items-center rounded-lg border border-[#dfe5d2] bg-[#fafbf5] px-4 text-[11.5px] text-[#52644f] transition-colors hover:bg-[#edf0e4]"
          >
            Show all {allTools.length} tools
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shelfTools.map((tool, i) => {
            const isPinned = pins.includes(tool.id);
            const isHall = hall.includes(tool.id);
            // first tag / audience line, like "Python · C/C++" on the live site
            const subtitle = tool.tags
              .filter((t) => t !== 'star')
              .slice(0, 2)
              .join(' · ');

            return (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.32 }}
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
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[11px] border
                           border-[#e5e6db] bg-[#fffefa] p-4 transition-all duration-200
                           hover:-translate-y-[3px] hover:border-[#bac4aa] hover:shadow-[0_10px_24px_#455e3810]
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b9d78]"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${base} 18%, #fff)`,
                      color: shadow,
                    }}
                  >
                    <ToolIcon name={tool.iconName} className="h-[17px] w-[17px]" strokeWidth={1.6} />
                  </span>

                  <div className="flex items-center gap-1">
                    {isPinned && (
                      <span
                        className="inline-flex items-center rounded px-1 py-0.5 text-[8.5px] font-medium uppercase tracking-wide text-[#7d8a76]"
                        title="Pinned to the top of this cupboard"
                      >
                        <Pin className="h-2.5 w-2.5" strokeWidth={2.4} />
                      </span>
                    )}
                    {isHall && (
                      <span
                        className="inline-flex items-center rounded px-1 py-0.5 text-[8.5px] text-[#b47b78]"
                        title="In the Hall of Fame"
                      >
                        <Star className="h-2.5 w-2.5 fill-[#e5c1b6] text-[#c99a95]" />
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
                        className="grid h-6 w-6 place-items-center rounded text-[#bec3b1] transition-colors hover:bg-[#f2f4e8] hover:text-[#6c8163]"
                        title="Tool options"
                        aria-label={`Options for ${tool.name}`}
                        aria-haspopup="menu"
                        aria-expanded={menuFor === tool.id}
                      >
                        <MoreVertical className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>

                      {menuFor === tool.id && (
                        <div
                          role="menu"
                          className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-lg border border-[#e1e5d6] bg-[#fffefa] py-1 shadow-[0_14px_34px_#28392118]"
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
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11.5px] text-[#4d6152] transition-colors hover:bg-[#f2f4e8]"
                          >
                            {isPinned ? (
                              <PinOff className="h-3.5 w-3.5 text-[#8b9a83]" strokeWidth={1.8} />
                            ) : (
                              <Pin className="h-3.5 w-3.5 text-[#8b9a83]" strokeWidth={1.8} />
                            )}
                            {isPinned ? 'Unpin from this cupboard' : '📌 Pin to top of cupboard'}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onToggleHall?.(tool.id);
                              soundEngine.playStar();
                              setMenuFor(null);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11.5px] text-[#4d6152] transition-colors hover:bg-[#f2f4e8]"
                          >
                            {isHall ? (
                              <StarOff className="h-3.5 w-3.5 text-[#b47b78]" strokeWidth={1.8} />
                            ) : (
                              <Star className="h-3.5 w-3.5 fill-[#e5c1b6] text-[#b47b78]" strokeWidth={1.8} />
                            )}
                            {isHall ? 'Remove from Hall of Fame' : '★ Add to Hall of Fame'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <h3 className="font-serif text-[16px] leading-snug text-[#273e30] transition-colors group-hover:text-[#41603f]">
                  {tool.name}
                </h3>
                {subtitle && (
                  <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.06em] text-[#b3b9a6]">
                    {subtitle}
                  </p>
                )}
                <p className="mt-2 line-clamp-2 flex-1 text-[11.5px] leading-relaxed text-[#979b8d]">
                  {tool.shortDescription}
                </p>

                <span className="mt-3 inline-flex items-center gap-1 text-[10.5px] text-[#8b9a7c] transition-transform group-hover:translate-x-0.5">
                  Open
                  <ArrowRight className="h-3 w-3" strokeWidth={1.8} />
                </span>
              </motion.div>
            );
          })}
        </div>
      )}

      <p className="mt-10 text-center text-[10.5px] text-[#a0a58f]">
        Everything runs in this tab. Nothing is uploaded.
      </p>
    </motion.div>
  );
};

export default CupboardModal;
