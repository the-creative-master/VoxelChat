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
  isHall?: boolean;
  onToggleHall?: () => void;
}

/**
 * The tool page: a back link, an editorial heading with the tool's icon and
 * description, then the tool itself on a plain paper card. No cutting board.
 */
export const CuttingBoardShell: React.FC<CuttingBoardShellProps> = ({
  tool,
  isFavorite,
  onToggleFavorite,
  onBackToCupboard,
  isHall = false,
  onToggleHall,
}) => {
  const cupboard = getCupboardById(tool.cupboardId);
  const [resetNonce, setResetNonce] = useState(0);
  const ToolComponent = tool.component;
  const { base, shadow } = cupboard.palette;

  const handleReset = () => {
    soundEngine.playPop(0.92);
    setResetNonce((n) => n + 1);
  };

  return (
    <motion.div
      key={tool.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-7 sm:px-8"
    >
      {/* ------------------------------ back row ----------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(0.96);
            onBackToCupboard();
          }}
          className="inline-flex items-center gap-1.5 text-[11px] text-[#8b9a83] transition-colors hover:text-[#4c6152]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
          Back to {cupboard.name}
        </button>

        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-[#8c987b]">
          <ShieldCheck className="h-3 w-3" strokeWidth={1.7} />
          Runs on your device
        </span>
      </div>

      {/* ------------------------------ heading ------------------------------ */}
      <header className="flex flex-wrap items-start gap-4 py-6">
        <span
          className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-xl"
          style={{
            backgroundColor: `color-mix(in srgb, ${base} 20%, #fff)`,
            color: shadow,
          }}
        >
          <ToolIcon name={tool.iconName} className="h-6 w-6" strokeWidth={1.5} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[clamp(26px,3vw,38px)] leading-tight">{tool.name}</h1>
            {tool.isStar && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fdf9ea] px-2 py-0.5 text-[9.5px] font-medium text-[#a8873f]">
                <Star className="h-2.5 w-2.5 fill-[#c39144] text-[#c39144]" /> Star utility
              </span>
            )}
          </div>
          <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-[#89917f]">
            {tool.shortDescription}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onToggleHall && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playStar();
                onToggleHall();
              }}
              title={isHall ? 'Remove from Hall of Fame' : 'Add to Hall of Fame'}
              className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors ${
                isHall
                  ? 'border-[#e5c1b6] bg-[#fdf1ee] text-[#b47b78]'
                  : 'border-[#e4e4d9] bg-[#fafbf5] text-[#a8b09b] hover:border-[#d3d8c7] hover:text-[#b47b78]'
              }`}
            >
              <Star className={`h-4 w-4 ${isHall ? 'fill-[#e5c1b6]' : ''}`} strokeWidth={1.7} />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.playStar();
              onToggleFavorite();
            }}
            title={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors ${
              isFavorite
                ? 'border-[#e5c1b6] bg-[#fdf1ee] text-[#b47b78]'
                : 'border-[#e4e4d9] bg-[#fafbf5] text-[#a8b09b] hover:border-[#d3d8c7] hover:text-[#b47b78]'
            }`}
          >
            <Star className={`h-4 w-4 ${isFavorite ? 'fill-[#e5c1b6]' : ''}`} strokeWidth={1.7} />
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dfe5d2] bg-[#fafbf5] px-3 text-[11px] text-[#52644f] transition-colors hover:bg-[#edf0e4]"
            title="Reset this tool to its initial state"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </header>

      {/* --------------------------- the workspace --------------------------- */}
      <div className="rounded-xl border border-[#e1e4d7] bg-[#fffefa] p-4 shadow-[0_2px_5px_#2a3c2507] sm:p-7">
        <ToolErrorBoundary key={`eb-${tool.id}-${resetNonce}`} onReset={handleReset}>
          <Suspense fallback={<WaffleLoader label={`Opening ${tool.name}…`} />}>
            <ToolComponent key={`${tool.id}-${resetNonce}`} />
          </Suspense>
        </ToolErrorBoundary>
      </div>

      <p className="mt-6 text-center text-[10.5px] text-[#a0a58f]">
        {tool.name} · part of {cupboard.name}. Nothing leaves this tab.
      </p>
    </motion.div>
  );
};

export default CuttingBoardShell;
