import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, PackageOpen, Star, Trash2, X } from 'lucide-react';
import { getCupboardById, getToolById } from '../../registry/toolsRegistry';
import type { ToolDefinition } from '../../registry/types';
import { ToolIcon } from '../ui/ToolIcon';
import { soundEngine } from '../../utils/soundEngine';

interface LunchboxDrawerProps {
  open: boolean;
  favorites: string[];
  onClose: () => void;
  onSelectTool: (tool: ToolDefinition) => void;
  onToggleFavorite: (toolId: string) => void;
}

export const LunchboxDrawer: React.FC<LunchboxDrawerProps> = ({
  open,
  favorites,
  onClose,
  onSelectTool,
  onToggleFavorite,
}) => {
  const pinnedTools = favorites
    .map((id) => getToolById(id))
    .filter((t): t is ToolDefinition => Boolean(t));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex justify-end bg-[#17281c]/40 backdrop-blur-[2px]"
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col border-l border-[#e1e5d6] bg-[#faf8f1] shadow-[-18px_0_54px_#17281c20]"
          >
            {/* Lunchbox Header */}
            <div className="flex items-center justify-between border-b border-[#e5e7db] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#e4e4d9] bg-[#f2f4e8] text-[#6c8163]">
                  <PackageOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-serif text-[20px] leading-tight text-[#253f31]">My favorites</h2>
                  <p className="text-[11px] text-[#8a9281]">
                    {pinnedTools.length} pinned {pinnedTools.length === 1 ? 'utility' : 'utilities'}{' '}
                    (saved locally)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playPop(0.95);
                  onClose();
                }}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#e4e4d9] bg-[#fafbf5] text-[#7d8a76] hover:bg-[#f0f2e6]"
                aria-label="Close My Lunchbox"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pinned List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pinnedTools.length === 0 ? (
                <div className="mt-10 rounded-lg border border-dashed border-[#e1e5d6] p-8 text-center">
                  <Star className="mx-auto mb-3 h-8 w-8 text-[#b5bc9f]" strokeWidth={1.4} />
                  <h3 className="mb-1 font-serif text-[19px] text-[#41573f]">
                    Nothing pinned yet
                  </h3>
                  <p className="text-[11.5px] leading-relaxed text-[#8c947e]">
                    Use the <strong>★</strong> button on any tool page, or <strong>Pin</strong> in a cupboard menu, to keep your go-to utilities one tap away.
                  </p>
                </div>
              ) : (
                pinnedTools.map((tool) => {
                  const cupboard = getCupboardById(tool.cupboardId);
                  return (
                    <div
                      key={tool.id}
                      className="flex items-center justify-between gap-3 rounded-[11px] border border-[#e5e6db] bg-[#fffefa] p-3 transition-colors hover:border-[#bac4aa]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playPop(1.08);
                          onSelectTool(tool);
                          onClose();
                        }}
                        className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer group"
                      >
                        <div
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${cupboard.palette.base} 18%, #fff)`,
                            color: cupboard.palette.shadow,
                          }}
                        >
                          <ToolIcon name={tool.iconName} className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-serif text-[15px] text-[#273e30] transition-colors group-hover:text-[#41603f]">
                            {tool.name} {tool.isStar ? '★' : ''}
                          </div>
                          <div className="truncate text-[10px] uppercase tracking-[0.06em] text-[#b3b9a6]">{cupboard.name}</div>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#b6bda8]" strokeWidth={1.7} />
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleFavorite(tool.id)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-[#a8b09b] transition-colors hover:bg-[#fdf1ee] hover:text-[#b47b78]"
                        title="Unpin from Lunchbox"
                        aria-label={`Unpin ${tool.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
