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
          className="fixed inset-0 z-50 flex items-start justify-center bg-[#17281c]/40 px-4 pt-[10vh] backdrop-blur-[2px]"
        >
          <motion.div
            initial={{ scale: 0.92, y: -16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: -10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 440, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            className="w-full max-w-2xl overflow-hidden rounded-[15px] border border-[#e1e5d6] bg-[#fffefa] shadow-[0_28px_60px_-18px_#28392140]"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 border-b border-[#e8e8df] px-5 py-4">
              <Search className="h-[17px] w-[17px] shrink-0 text-[#939c86]" strokeWidth={1.7} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any tool, cupboard, language, or tag (e.g. vinculum, regex, rust, matrix)..."
                className="flex-1 bg-transparent text-[14px] text-[#354239] outline-none placeholder:text-[#9c9e92]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="rounded p-1 text-[#a8b09b] hover:text-[#4c6152]"
                  aria-label="Clear query"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-[#e3e5d8] bg-[#f4f5ec] px-2 py-0.5 font-mono text-[10px] text-[#8a9282]"
              >
                ESC
              </button>
            </div>

            {/* Live Keyboard-Navigable Results */}
            <div ref={listRef} className="max-h-[58vh] overflow-y-auto p-2.5 space-y-1">
              {results.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="font-serif text-[19px] text-[#41573f]">
                    Nothing found for &ldquo;{query}&rdquo;
                  </p>
                  <p className="mt-1 text-[11.5px] text-[#8c947e]">
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
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-[#dfe5d2] bg-[#f2f4e8]'
                          : 'border-transparent hover:bg-[#f7f8f0]'
                      }`}
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

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-serif text-[15px] text-[#273e30]">
                            {tool.name}
                          </span>
                          {tool.isStar && (
                            <Star className="w-3.5 h-3.5 fill-[#F59E0B] text-[#B45309] shrink-0" />
                          )}
                        </div>
                        <p className="truncate text-[11px] text-[#979b8d]">{tool.shortDescription}</p>
                      </div>

                      <span
                        className="hidden shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-medium text-white sm:inline-flex"
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
            <div className="flex items-center justify-between border-t border-[#e8e8df] bg-[#fafbf5] px-5 py-2.5 text-[10.5px] text-[#8c947e]">
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
