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
          className="fixed inset-0 z-50 bg-[#2C1608]/45 backdrop-blur-[2px] flex justify-end"
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full bg-[#FFF8EB] border-l-[4px] border-[#8B5220] shadow-2xl flex flex-col"
          >
            {/* Lunchbox Header */}
            <div className="bg-gradient-to-b from-[#FDE68A] to-[#FBBF24] border-b-[5px] border-[#92400E] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFFDF9] border-2 border-[#92400E] flex items-center justify-center text-[#B45309]">
                  <PackageOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-xl text-[#3B2314]">My Lunchbox</h2>
                  <p className="text-xs font-semibold text-[#78350F]">
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
                className="toy-btn-cream p-2"
                aria-label="Close My Lunchbox"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pinned List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pinnedTools.length === 0 ? (
                <div className="toy-panel p-8 text-center mt-8">
                  <Star className="w-10 h-10 text-[#F59E0B] mx-auto mb-3" />
                  <h3 className="font-display font-bold text-lg text-[#3B2314] mb-1">
                    Your Lunchbox is Empty!
                  </h3>
                  <p className="text-xs text-[#6E4928] leading-relaxed">
                    Click the <strong>★ Pin to Lunchbox</strong> button on any cupboard cartridge or
                    tool workspace to keep your go-to utilities one tap away.
                  </p>
                </div>
              ) : (
                pinnedTools.map((tool) => {
                  const cupboard = getCupboardById(tool.cupboardId);
                  return (
                    <div
                      key={tool.id}
                      className="toy-card p-3.5 flex items-center justify-between gap-3 hover:border-[#F59E0B]"
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
                          className="w-10 h-10 rounded-xl border-2 border-b-[3px] flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: cupboard.palette.surface,
                            borderColor: cupboard.palette.base,
                            color: cupboard.palette.shadow,
                          }}
                        >
                          <ToolIcon name={tool.iconName} className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-display font-bold text-sm text-[#3B2314] group-hover:text-[#B45309] truncate">
                            {tool.name} {tool.isStar ? '★' : ''}
                          </div>
                          <div className="text-[11px] text-[#7A5433] truncate">{cupboard.name}</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#B45309] shrink-0" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleFavorite(tool.id)}
                        className="p-2 rounded-lg text-[#9A7B5C] hover:text-[#DC2626] hover:bg-[#FEE2E2] transition-colors"
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
