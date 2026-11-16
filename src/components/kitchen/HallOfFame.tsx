import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Star } from 'lucide-react';
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
 * The Hall of Fame: an editorial wall of the tools the visitor has starred.
 * Empty by default — it fills up as they curate.
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
    <section aria-labelledby="hall-title" className="pt-7">
      <div className="eyebrow">Curated by you</div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-b border-[#e8e8df] pb-6">
        <div>
          <h1 id="hall-title" className="flex flex-wrap items-center gap-3">
            Hall of Fame
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fdf9ea] px-2.5 py-1 text-[10px] font-medium text-[#a8873f]">
              <Star className="h-2.5 w-2.5 fill-[#c39144] text-[#c39144]" />
              {entries.length} enshrined
            </span>
          </h1>
          <p className="mt-2 text-[13px] text-[#8a9281]">
            Star tools with ⋮ — your favourites, kept under one roof.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.08);
            onBrowse();
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#3d5544] bg-[#3d5544] px-4 text-[11.5px] font-medium text-[#faf9ed] transition-colors hover:bg-[#203f2d]"
        >
          Browse cupboards
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-[#e1e5d6] bg-[#fafbf5] px-6 py-16 text-center">
          <p className="font-serif text-[46px] leading-none text-[#b5bc9f]">✳</p>
          <h2 className="mt-4 text-[26px] text-[#41573f]">No favorites yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-[#8c947e]">
            Tap the <span className="font-mono">⋮</span> on any utility and pick{' '}
            <span className="rounded bg-[#f2f4e8] px-1.5 py-0.5 font-mono text-[11.5px] text-[#5c6f50]">
              Add to Hall of Fame
            </span>
            .
          </p>
          <button
            type="button"
            onClick={() => {
              soundEngine.playPop(1.06);
              onBrowse();
            }}
            className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dfe5d2] bg-[#fffefa] px-4 text-[11.5px] text-[#52644f] transition-colors hover:bg-[#edf0e4]"
          >
            Find something worth starring
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((tool, i) => {
            const cup = getCupboardById(tool.cupboardId);
            return (
              <motion.li
                key={tool.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.28), duration: 0.3 }}
              >
                <div className="group flex items-start gap-3 rounded-[11px] border border-[#e5e6db] bg-[#fffefa] p-4 transition-all duration-200 hover:-translate-y-[3px] hover:border-[#bac4aa] hover:shadow-[0_10px_24px_#455e3810]">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${cup.palette.base} 18%, #fff)`,
                      color: cup.palette.shadow,
                    }}
                  >
                    <ToolIcon name={tool.iconName} className="h-[17px] w-[17px]" strokeWidth={1.6} />
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playPop(1.06);
                      onSelectTool(tool);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-serif text-[16px] leading-snug text-[#273e30]">
                      {tool.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.06em] text-[#b3b9a6]">
                      {cup.shortName}
                    </span>
                    <span className="mt-1.5 line-clamp-2 block text-[11.5px] leading-relaxed text-[#979b8d]">
                      {tool.shortDescription}
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
                    className="grid h-7 w-7 shrink-0 place-items-center rounded text-[#b47b78] transition-colors hover:bg-[#fdf1ee]"
                  >
                    <Star className="h-3.5 w-3.5 fill-[#e5c1b6]" strokeWidth={1.7} />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      <p className="mt-10 text-center text-[10.5px] text-[#a0a58f]">
        Curated on this device · nothing is uploaded.
      </p>
    </section>
  );
};

export default HallOfFame;
