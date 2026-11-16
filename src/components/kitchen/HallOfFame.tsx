import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Star, Trophy } from 'lucide-react';
import { getCupboardById, getToolById } from '../../registry/toolsRegistry';
import type { ToolDefinition } from '../../registry/types';
import { ToolIcon } from '../ui/ToolIcon';
import { soundEngine } from '../../utils/soundEngine';

interface HallOfFameProps {
  hall: string[];
  onSelectTool: (tool: ToolDefinition) => void;
  onRemove: (toolId: string) => void;
  onBrowse: () => void;
}

/**
 * The Hall of Fame: a velvet display case for the tools the visitor
 * has starred. Empty by default — it fills up as they curate.
 */
export const HallOfFame: React.FC<HallOfFameProps> = ({
  hall,
  onSelectTool,
  onRemove,
  onBrowse,
}) => {
  const entries = hall
    .map((id) => getToolById(id))
    .filter((t): t is ToolDefinition => Boolean(t));

  return (
    <section
      aria-labelledby="hall-title"
      className="relative mx-auto mt-10 w-full max-w-6xl px-3 sm:px-6"
    >
      <div
        className="relative overflow-hidden rounded-[28px] border-2 border-b-[10px] p-5 sm:p-7"
        style={{
          borderColor: 'var(--kitchen-main-dark)',
          background:
            'linear-gradient(168deg, #FFFCF4 0%, #FFF6E4 42%, #FDEBC8 78%, #F8DFAE 100%)',
          boxShadow:
            'inset 0 2px 0 rgba(255,255,255,0.85), 0 22px 44px -20px rgba(59,35,20,0.5)',
        }}
      >
        {/* soft spotlight wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[70%] -translate-x-1/2 rounded-full opacity-60 blur-2xl"
          style={{ background: 'radial-gradient(closest-side, #FDE68A 0%, transparent 100%)' }}
        />

        <header className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-b-[5px]"
              style={{
                borderColor: 'var(--kitchen-main-dark)',
                background: 'linear-gradient(180deg, #FDE68A 0%, #F59E0B 100%)',
                boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.7)',
              }}
            >
              <Trophy className="h-6 w-6 text-[#4A2104]" strokeWidth={2.5} />
            </span>
            <div>
              <h2
                id="hall-title"
                className="font-display text-xl font-extrabold leading-tight text-[#3B2314] sm:text-2xl"
              >
                Hall of Fame
              </h2>
              <p className="text-xs font-semibold text-[#8B5A2B]/85">
                Star tools with ⋮ — {entries.length === 0 ? 'none starred yet' : `${entries.length} enshrined`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#D9B68C] bg-white/70 px-3 py-1 font-mono text-[11px] font-bold text-[#8B5A2B]">
              <Star className="h-3 w-3 fill-[#F59E0B] text-[#B45309]" strokeWidth={2.5} />
              {entries.length.toString().padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(1.1);
                onBrowse();
              }}
              className="rounded-xl border-2 border-b-[5px] bg-[var(--kitchen-accent)] px-3 py-1.5 font-display text-xs font-extrabold text-[var(--kitchen-accent-ink)] transition active:translate-y-[3px] active:border-b-2"
              style={{ borderColor: 'var(--kitchen-accent-dark)' }}
            >
              Browse cupboards
            </button>
          </div>
        </header>

        {entries.length === 0 ? (
          <div className="relative mt-5 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#D9B68C] bg-white/45 px-6 py-9 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FEF3C7]">
              <Star className="h-5 w-5 text-[#B45309]" strokeWidth={2.5} />
            </span>
            <p className="font-display text-base font-extrabold text-[#3B2314]">No favorites yet</p>
            <p className="max-w-sm text-xs font-semibold leading-relaxed text-[#8B5A2B]/85">
              Open a cupboard, tap the <span className="font-mono">⋮</span> on any utility and pick
              <span className="mx-1 rounded bg-[#FEF3C7] px-1 font-mono">Add to Hall of Fame</span>
              to show it off here.
            </p>
          </div>
        ) : (
          <ul className="relative mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((tool, i) => {
              const cup = getCupboardById(tool.cupboardId);
              const { base, shadow, surface } = cup.palette;
              return (
                <motion.li
                  key={tool.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.3 }}
                >
                  <div className="group flex items-center gap-3 rounded-2xl border-2 border-b-[5px] border-[#D9B68C] bg-[#FFFDF9] p-2.5 pr-2 transition hover:-translate-y-0.5 hover:border-[#F59E0B]">
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playPop(1.06);
                        onSelectTool(tool);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-b-[3px]"
                        style={{ backgroundColor: surface, borderColor: base, color: shadow }}
                      >
                        <ToolIcon name={tool.iconName} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-display text-sm font-bold leading-tight text-[#3B2314]">
                          {tool.name}
                        </span>
                        <span className="block truncate text-[10.5px] font-semibold text-[#8B5A2B]/80">
                          {cup.shortName}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playPop(0.88);
                        onRemove(tool.id);
                      }}
                      aria-label={`Remove ${tool.name} from the Hall of Fame`}
                      title="Remove from Hall of Fame"
                      className="shrink-0 rounded-lg border border-transparent p-1.5 text-[#B08D6A] transition hover:border-[#D9B68C] hover:text-[#78350F]"
                    >
                      <Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#B45309]" strokeWidth={2.5} />
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}

        {entries.length > 0 && (
          <p className="relative mt-4 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#8B5A2B]/70">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
            Curated on this device
            <ArrowRight className="h-3 w-3" strokeWidth={3} />
          </p>
        )}
      </div>
    </section>
  );
};

export default HallOfFame;
