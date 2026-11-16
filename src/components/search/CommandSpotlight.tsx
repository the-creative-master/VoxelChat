import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Search, Star, X } from 'lucide-react';
import { getCupboardById, TOOLS_REGISTRY } from '../../registry/toolsRegistry';
import type { ToolDefinition } from '../../registry/types';
import { ToolIcon } from '../ui/ToolIcon';
import { soundEngine } from '../../utils/soundEngine';

interface CommandSpotlightProps {
  open: boolean;
  onClose: () => void;
  onSelectTool: (tool: ToolDefinition) => void;
}

function scoreTool(tool: ToolDefinition, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return tool.isStar ? 100 : 50;

  const cupboard = getCupboardById(tool.cupboardId);
  const name = tool.name.toLowerCase();
  const id = tool.id.toLowerCase();
  const desc = tool.shortDescription.toLowerCase();
  const cupName = cupboard.name.toLowerCase();

  let score = 0;
  if (name === q || id === q) score += 200;
  else if (name.startsWith(q)) score += 130;
  else if (name.includes(q)) score += 90;

  const tokens = q.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (name.includes(tok)) score += 45;
    else if (tool.tags.some((t) => t.toLowerCase().startsWith(tok))) score += 36;
    else if (tool.tags.some((t) => t.toLowerCase().includes(tok))) score += 24;
    else if (cupName.includes(tok)) score += 22;
    else if (desc.includes(tok)) score += 14;
    else {
      // Subsequence fuzzy match on name
      let qi = 0;
      for (let i = 0; i < name.length && qi < tok.length; i++) {
        if (name[i] === tok[qi]) qi++;
      }
      if (qi === tok.length && tok.length >= 2) score += 10;
      else return 0;
    }
  }
  if (tool.isStar) score += 5;
  return score;
}

/**
 * Global Cmd+K / Ctrl+K Recipe Spotlight Search Bar
 * Instant fuzzy search across all registered tools with keyboard navigation.
 */
export const CommandSpotlight: React.FC<CommandSpotlightProps> = ({
  open,
  onClose,
  onSelectTool,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(() => {
    return TOOLS_REGISTRY.map((tool) => ({ tool, score: scoreTool(tool, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.tool);
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        results.length ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      soundEngine.playPop(1.1);
      onSelectTool(results[activeIndex]);
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-[#2C1608]/50 backdrop-blur-[3px] flex items-start justify-center pt-[10vh] px-4"
        >
          <motion.div
            initial={{ scale: 0.92, y: -16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: -10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 440, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            className="w-full max-w-2xl rounded-3xl bg-[#FFFDF9] border-[3px] border-b-[9px] border-[#8B5220] shadow-toy-lg overflow-hidden"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-5 py-4 bg-[#FFF8EB] border-b-2 border-[#E6C79C]">
              <Search className="w-5 h-5 text-[#D97706] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any tool, cupboard, language, or tag (e.g. vinculum, regex, rust, matrix)..."
                className="flex-1 bg-transparent text-base font-medium text-[#3B2314] placeholder:text-[#A38160] focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 text-[#8B5A2B] hover:text-[#3B2314]"
                  aria-label="Clear query"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-2 py-1 rounded-lg bg-[#F3DFC1] text-[11px] font-mono font-bold text-[#5C3415] border border-[#D4AA78]"
              >
                ESC
              </button>
            </div>

            {/* Live Keyboard-Navigable Results */}
            <div ref={listRef} className="max-h-[58vh] overflow-y-auto p-2.5 space-y-1">
              {results.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="font-display font-bold text-lg text-[#3B2314]">
                    No matching recipe found for &ldquo;{query}&rdquo;
                  </p>
                  <p className="text-xs text-[#7A5433] mt-1">
                    Try searching &ldquo;calculator&rdquo;, &ldquo;wafflecode&rdquo;, &ldquo;roman&rdquo;,
                    &ldquo;cron&rdquo;, &ldquo;jwt&rdquo;, or &ldquo;lorem&rdquo;.
                  </p>
                </div>
              ) : (
                results.map((tool, idx) => {
                  const cupboard = getCupboardById(tool.cupboardId);
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      data-idx={idx}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        soundEngine.playPop(1.1);
                        onSelectTool(tool);
                        onClose();
                      }}
                      className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#FEF3C7] border-2 border-[#D97706]'
                          : 'border-2 border-transparent hover:bg-[#FFF8EB]'
                      }`}
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

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-sm sm:text-base text-[#3B2314] truncate">
                            {tool.name}
                          </span>
                          {tool.isStar && (
                            <Star className="w-3.5 h-3.5 fill-[#F59E0B] text-[#B45309] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-[#7A5433] truncate">{tool.shortDescription}</p>
                      </div>

                      <span
                        className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-display font-bold text-white shrink-0"
                        style={{ backgroundColor: cupboard.palette.base }}
                      >
                        {cupboard.shortName}
                      </span>

                      {active && <CornerDownLeft className="w-4 h-4 text-[#B45309] shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Key Hints */}
            <div className="px-5 py-2.5 bg-[#FFF8EB] border-t-2 border-[#E6C79C] flex items-center justify-between text-[11px] font-semibold text-[#7A5433]">
              <div className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Launch Tool</span>
                <span>Esc Close</span>
              </div>
              <span>{results.length} live local utilities</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
