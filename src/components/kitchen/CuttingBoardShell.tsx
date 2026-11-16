import React, { Suspense, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, RotateCcw, ShieldCheck, Star } from 'lucide-react';
import { getCupboardById } from '../../registry/toolsRegistry';
import type { ToolDefinition } from '../../registry/types';
import { ToolIcon } from '../ui/ToolIcon';
import { ToolErrorBoundary, WaffleLoader } from '../ui/ErrorBoundary';
import { soundEngine } from '../../utils/soundEngine';

interface CuttingBoardShellProps {
  tool: ToolDefinition;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBackToCupboard: () => void;
}

/**
 * Phase 3: The Tactile 2.5D Wooden Cutting Board / Recipe Card Tool Workspace
 * - Top bar with "← Back to [Cupboard Name]", tool title, "Pin to Lunchbox ★", "Reset Tool"
 * - Full-width responsive max-w-7xl interactive utility canvas
 */
export const CuttingBoardShell: React.FC<CuttingBoardShellProps> = ({
  tool,
  isFavorite,
  onToggleFavorite,
  onBackToCupboard,
}) => {
  const cupboard = getCupboardById(tool.cupboardId);
  const [resetNonce, setResetNonce] = useState(0);
  const ToolComponent = tool.component;

  const handleReset = () => {
    soundEngine.playPop(0.92);
    setResetNonce((n) => n + 1);
  };

  return (
    <motion.div
      key={tool.id}
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
      className="relative z-10 max-w-7xl mx-auto px-2.5 sm:px-6 pt-5 pb-28"
    >
      {/* Tactile 2.5D Butcher-Block Wooden Cutting Board */}
      <div className="cutting-board-frame rounded-[1.85rem] p-2.5 sm:p-4">
        <div className="cutting-board-groove rounded-[1.45rem] p-2 sm:p-3.5">
          {/* Top Cutting Board Toolbar */}
          <div className="rounded-2xl bg-[#FFFDF9] border-2 border-b-[5px] border-[#C99B66] px-3.5 sm:px-5 py-3 mb-3.5 flex flex-wrap items-center justify-between gap-3 shadow-toy-sm">
            {/* Left: Back to Cupboard + Decorative Cutting Board Handle Hole */}
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playPop(0.96);
                  onBackToCupboard();
                }}
                className="toy-btn px-3 sm:px-4 py-2 text-xs sm:text-sm text-white shrink-0"
                style={{
                  background: `linear-gradient(180deg, ${cupboard.palette.base} 0%, ${cupboard.palette.shadow} 145%)`,
                  borderColor: cupboard.palette.shadow,
                }}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to {cupboard.name}</span>
              </button>

              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="hidden sm:flex w-10 h-10 rounded-xl border-2 border-b-[4px] items-center justify-center shrink-0"
                  style={{
                    backgroundColor: cupboard.palette.surface,
                    borderColor: cupboard.palette.base,
                    color: cupboard.palette.shadow,
                  }}
                >
                  <ToolIcon name={tool.iconName} className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="font-display font-bold text-lg sm:text-xl text-[#3B2314] truncate">
                      {tool.name}
                    </h1>
                    {tool.isStar && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FEF08A] border border-[#B45309] text-[#78350F] font-display font-bold text-[10.5px]">
                        <Star className="w-3 h-3 fill-[#F59E0B] text-[#B45309]" />
                        STAR
                      </span>
                    )}
                    <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ECFDF5] border border-[#86EFAC] text-[#14532D] text-[10.5px] font-bold">
                      <ShieldCheck className="w-3 h-3 text-[#16A34A]" />
                      100% Local
                    </span>
                  </div>
                  <p className="hidden md:block text-xs text-[#7A5433] truncate max-w-xl">
                    {tool.shortDescription}
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Pin to Lunchbox ★ + Reset Tool */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <button
                type="button"
                onClick={onToggleFavorite}
                className={`toy-btn px-3 sm:px-3.5 py-2 text-xs sm:text-sm ${
                  isFavorite
                    ? 'bg-gradient-to-b from-[#FEF08A] to-[#FBBF24] border-[#92400E] text-[#4A2506]'
                    : 'bg-[#FFFDF8] border-[#D4AA78] text-[#5C3415] hover:bg-[#FFF6E5]'
                }`}
              >
                <Star
                  className={`w-4 h-4 ${
                    isFavorite ? 'fill-[#D97706] text-[#92400E]' : 'text-[#A07855]'
                  }`}
                />
                <span className="hidden sm:inline">
                  {isFavorite ? 'Pinned in Lunchbox ★' : 'Pin to Lunchbox ★'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="toy-btn-cream px-3 sm:px-3.5 py-2 text-xs sm:text-sm"
                title="Reset tool to clean initial state"
              >
                <RotateCcw className="w-4 h-4 text-[#B45309]" />
                <span className="hidden sm:inline">Reset Tool</span>
              </button>
            </div>
          </div>

          {/* Recipe Card Interactive Tool Surface */}
          <div className="rounded-2xl bg-[#FFFDF9] border-2 border-b-[6px] border-[#D7B386] p-3.5 sm:p-6 min-h-[540px] shadow-[inset_0_2px_0_rgba(255,255,255,0.9)]">
            <ToolErrorBoundary key={`eb-${tool.id}-${resetNonce}`} onReset={handleReset}>
              <Suspense fallback={<WaffleLoader label={`Plating ${tool.name}...`} />}>
                <ToolComponent key={`${tool.id}-${resetNonce}`} />
              </Suspense>
            </ToolErrorBoundary>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
