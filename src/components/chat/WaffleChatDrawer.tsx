import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import singleThreadWasmUrl from '@wllama/wllama/esm/single-thread/wllama.wasm?url';
import multiThreadWasmUrl from '@wllama/wllama/esm/multi-thread/wllama.wasm?url';
import { WaffleCupMascot } from '../mascot/WaffleCupMascot';
import { soundEngine } from '../../utils/soundEngine';

interface GgufModelSpec {
  id: string;
  name: string;
  badge: string;
  sizeLabel: string;
  approxBytes: number;
  description: string;
  url: string;
  isDefault?: boolean;
}

/**
 * All 5 Selectable Quantized GGUF Models (Q4_K_M) executed 100% locally via @wllama/wllama
 */
const WAFFLECHAT_MODELS: GgufModelSpec[] = [
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen 2.5 1.5B Instruct (Q4_K_M)',
    badge: 'Default • All-Around',
    sizeLabel: '~986 MB',
    approxBytes: 986_000_000,
    description: 'Best all-around balance for coding, math explanations, and quick utility help.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    isDefault: true,
  },
  {
    id: 'smollm2-1.7b',
    name: 'SmolLM2 1.7B Instruct (Q4_K_M)',
    badge: 'Lightweight Speedster',
    sizeLabel: '~1.06 GB',
    approxBytes: 1_055_000_000,
    description: "Hugging Face's snappy on-device reasoning and structured writing model.",
    url: 'https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'llama3.2-1b',
    name: 'Llama 3.2 1B Instruct (Q4_K_M)',
    badge: 'Ultra-Fast Pocket',
    sizeLabel: '~808 MB',
    approxBytes: 808_000_000,
    description: 'Ideal for low-RAM Chromebooks, tablets, and mobile browsers.',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'gemma2-2b',
    name: 'Gemma 2 2B Instruct (Q4_K_M)',
    badge: 'Creative & Structured',
    sizeLabel: '~1.71 GB',
    approxBytes: 1_710_000_000,
    description: 'Strong creative brainstorming, documentation, and structured explanations.',
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
  },
  {
    id: 'deepseek-r1-1.5b',
    name: 'DeepSeek-R1-Distill-Qwen 1.5B (Q4_K_M)',
    badge: 'Math & Logic Thinker',
    sizeLabel: '~1.12 GB',
    approxBytes: 1_120_000_000,
    description: 'Specialized step-by-step chain-of-thought reasoning for math and debugging.',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
  },
];

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokPerSec?: number;
}

interface WaffleChatDrawerProps {
  activeContextName?: string;
}

function formatMB(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * Countertop Companion: WaffleChat (100% Browser-Local llama.cpp via @wllama/wllama)
 */
export const WaffleChatDrawer: React.FC<WaffleChatDrawerProps> = ({ activeContextName }) => {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(WAFFLECHAT_MODELS[0].id);
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number; speedMBs: number } | null>(null);
  const [cachedUrls, setCachedUrls] = useState<Record<string, { size: number }>>({});
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hi! I am WaffleChat — your 100% local, private llama.cpp WebAssembly assistant. Load any of the 5 quantized GGUF models above (cached in your browser for offline use!) and ask me anything about math, code, or your current utility.',
    },
  ]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wllamaRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedModel =
    WAFFLECHAT_MODELS.find((m) => m.id === selectedModelId) ?? WAFFLECHAT_MODELS[0];

  const isMultiThreadSupported =
    typeof window !== 'undefined' &&
    Boolean(window.crossOriginIsolated) &&
    typeof SharedArrayBuffer !== 'undefined';

  const deviceRamGb =
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? (navigator as unknown as { deviceMemory?: number }).deviceMemory
      : undefined;

  const ensureWllamaInstance = useCallback(async () => {
    if (wllamaRef.current) return wllamaRef.current;
    const { Wllama } = await import('@wllama/wllama');
    const instance = new Wllama({
      'single-thread/wllama.wasm': singleThreadWasmUrl,
      'multi-thread/wllama.wasm': multiThreadWasmUrl,
    });
    wllamaRef.current = instance;
    return instance;
  }, []);

  const refreshCacheStatus = useCallback(async () => {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        setStorageEstimate({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
      }
      const instance = await ensureWllamaInstance();
      if (instance?.cacheManager?.list) {
        const entries = await instance.cacheManager.list();
        const map: Record<string, { size: number }> = {};
        for (const entry of entries) {
          const srcUrl: string = entry?.metadata?.originalURL ?? entry?.name ?? '';
          for (const m of WAFFLECHAT_MODELS) {
            if (srcUrl.includes(m.url) || srcUrl.includes(m.url.split('/').pop() ?? '__')) {
              map[m.id] = {
                size: (map[m.id]?.size ?? 0) + (typeof entry.size === 'number' ? entry.size : 0),
              };
            }
          }
        }
        setCachedUrls(map);
      }
    } catch {
      // Cache API may be unavailable in restricted contexts
    }
  }, [ensureWllamaInstance]);

  useEffect(() => {
    if (open) {
      void refreshCacheStatus();
    }
  }, [open, refreshCacheStatus]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, generating]);

  const handleLoadModel = async (model: GgufModelSpec) => {
    if (loading) return;
    setLoading(true);
    setLoadError(null);
    setSelectedModelId(model.id);
    setProgress({ loaded: 0, total: model.approxBytes, speedMBs: 0 });

    const startedAt = performance.now();
    try {
      const wllama = await ensureWllamaInstance();
      if (loadedModelId) {
        try {
          await wllama.exit();
        } catch {
          // Ignore clean unload
        }
      }

      await wllama.loadModelFromUrl(model.url, {
        n_ctx: 2048,
        useCache: true,
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
          const elapsedSec = Math.max((performance.now() - startedAt) / 1000, 0.1);
          const speedMBs = loaded / 1_000_000 / elapsedSec;
          setProgress({
            loaded,
            total: total || model.approxBytes,
            speedMBs,
          });
        },
      });

      setLoadedModelId(model.id);
      setProgress(null);
      soundEngine.playSuccess();
      await refreshCacheStatus();
    } catch (err) {
      setProgress(null);
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Failed to download or initialize GGUF model. Check your internet connection or available browser storage.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCachedModel = async (model: GgufModelSpec) => {
    try {
      const wllama = await ensureWllamaInstance();
      if (loadedModelId === model.id) {
        await wllama.exit();
        setLoadedModelId(null);
      }
      if (wllama?.cacheManager?.list && wllama?.cacheManager?.delete) {
        const entries = await wllama.cacheManager.list();
        const fileName = model.url.split('/').pop() ?? '';
        for (const entry of entries) {
          const srcUrl: string = entry?.metadata?.originalURL ?? entry?.name ?? '';
          if (srcUrl.includes(model.url) || (fileName && srcUrl.includes(fileName))) {
            await wllama.cacheManager.delete(entry.name);
          }
        }
      }
      soundEngine.playPop(0.9);
      await refreshCacheStatus();
    } catch {
      // Ignore cache delete error
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || generating) return;

    if (!loadedModelId || !wllamaRef.current) {
      setLoadError('Load a GGUF model first (click "Download & Load" above) to run inference locally.');
      return;
    }

    setLoadError(null);
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    const assistantId = `a-${Date.now() + 1}`;
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setInput('');
    setGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const t0 = performance.now();
    let tokenCount = 0;

    try {
      const systemPrompt = [
        'You are WaffleChat, a warm, concise, technically rigorous browser-local assistant inside BiteSizedUtilities.',
        activeContextName ? `The user is currently working in: ${activeContextName}.` : '',
        'Strictly obey factual accuracy: provide exact math, clean standard code, genuine W3C color names, and authentic classical Latin when asked for Lorem Ipsum — never insert food puns into technical outputs.',
      ]
        .filter(Boolean)
        .join(' ');

      const chatHistory = [
        { role: 'system', content: systemPrompt },
        ...messages
          .filter((m) => m.id !== 'welcome')
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: trimmed },
      ];

      await wllamaRef.current.createChatCompletion(chatHistory, {
        nPredict: 512,
        abortSignal: controller.signal,
        sampling: { temp: 0.5, top_k: 40, top_p: 0.9 },
        onNewToken: (_token: number, _piece: Uint8Array, currentText: string) => {
          tokenCount += 1;
          const elapsed = Math.max((performance.now() - t0) / 1000, 0.05);
          const tps = tokenCount / elapsed;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: currentText, tokPerSec: tps } : m
            )
          );
        },
      });
    } catch (err) {
      if (!controller.signal.aborted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    m.content ||
                    `Inference error: ${err instanceof Error ? err.message : String(err)}`,
                }
              : m
          )
        );
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  return (
    <>
      {/* Persistent Bottom-Right Countertop Waffle Coffee Cup Mascot Button */}
      {!open && (
        <motion.button
          type="button"
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          whileHover={{ scale: 1.06, y: -3 }}
          whileTap={{ scale: 0.95, y: 3 }}
          onClick={() => {
            soundEngine.playPop(1.14);
            setOpen(true);
          }}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 pr-4 pl-2 py-1.5 rounded-full
                     bg-gradient-to-b from-[#fffefa] to-[#FDE8C8] border-[3px] border border-[#dfe5d2]
                     shadow-[0_18px_44px_-16px_#28392130] cursor-pointer group"
          aria-label="Open WaffleChat local AI assistant"
        >
          <div className="-my-2">
            <WaffleCupMascot size={50} showSteam={false} showSaucer={false} />
          </div>
          <div className="text-left leading-tight">
            <div className="font-serif font-medium text-sm text-[#273e30] flex items-center gap-1">
              <span>Ask WaffleChat</span>
              <MessageCircle className="w-3.5 h-3.5 text-[#EF4444]" />
            </div>
            <div className="text-[10px] font-bold text-[#15803D]">
              {loadedModelId ? 'Model Ready • Offline' : 'Local llama.cpp AI'}
            </div>
          </div>
        </motion.button>
      )}

      {/* Resizable 2.5D WaffleChat Drawer */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ opacity: 0, y: 36, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className={`fixed bottom-3 right-3 z-50 flex flex-col rounded-3xl bg-[#fffefa] border-[3px] border-b-[9px] border-[#dfe5d2] shadow-[0_18px_44px_-16px_#28392130] overflow-hidden transition-[width,height] duration-200 ${
              expanded
                ? 'w-[calc(100vw-1.5rem)] sm:w-[620px] h-[calc(100vh-1.5rem)] sm:h-[82vh]'
                : 'w-[calc(100vw-1.5rem)] sm:w-[410px] h-[74vh] max-h-[640px]'
            }`}
          >
            {/* Header */}
            <div className="wood-shelf-surface border border-[#dfe5d2] px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="-my-2 shrink-0">
                  <WaffleCupMascot
                    size={42}
                    showSteam={false}
                    showSaucer={false}
                    mood={generating ? 'thinking' : 'happy'}
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="font-serif font-medium text-base text-[#273e30] leading-tight">
                    WaffleChat
                  </h3>
                  <p className="text-[10.5px] font-semibold text-[#5C3415] truncate">
                    wllama • {isMultiThreadSupported ? 'Multi-Thread SIMD' : 'Single-Thread WASM'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowManager((s) => !s)}
                  className={`toy-btn px-2.5 py-1.5 text-[11px] ${
                    showManager
                      ? 'bg-[#FEF08A] border-[#c9d2ba] text-[#4A2506]'
                      : 'bg-[#FFFDF8] border-[#dfe5d2] text-[#4A2506]'
                  }`}
                  title="Device RAM & Cached GGUF Storage Manager"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Models</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="hidden sm:inline-flex toy-btn-cream p-1.5"
                  title={expanded ? 'Compact drawer' : 'Expand drawer'}
                >
                  {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playPop(0.92);
                    setOpen(false);
                  }}
                  className="toy-btn-cream p-1.5"
                  aria-label="Close WaffleChat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Model Selector & Download Progress Bar */}
            <div className="bg-[#faf8f1] border-b-2 border-[#e5e7db] px-3.5 py-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  disabled={loading}
                  className="flex-1 min-w-0 rounded-xl bg-white border border-[#dfe5d2] px-2.5 py-1.5 text-xs font-semibold text-[#273e30] focus:outline-none focus:border-[#c39144]"
                >
                  {WAFFLECHAT_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {cachedUrls[m.id] ? '✓ ' : ''}
                      {m.name} ({m.sizeLabel})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={loading || loadedModelId === selectedModel.id}
                  onClick={() => void handleLoadModel(selectedModel)}
                  className={`toy-btn px-3 py-1.5 text-xs shrink-0 ${
                    loadedModelId === selectedModel.id
                      ? 'bg-[#DCFCE7] border-[#15803D] text-[#14532D]'
                      : 'toy-btn-mint'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading</span>
                    </>
                  ) : loadedModelId === selectedModel.id ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>{cachedUrls[selectedModel.id] ? 'Load Cached' : 'Load'}</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-[#8c947e] leading-snug">
                <strong>{selectedModel.badge}:</strong> {selectedModel.description}
              </p>

              {progress && (
                <div className="space-y-1">
                  <div className="flex justify-between font-mono text-[10.5px] font-bold text-[#5C3415]">
                    <span>
                      {formatMB(progress.loaded)} / {formatMB(progress.total)}
                    </span>
                    <span>{progress.speedMBs.toFixed(1)} MB/s</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#e5e7db] overflow-hidden border border-[#dfe5d2]">
                    <div
                      className="h-full bg-gradient-to-r from-[#22C55E] to-[#16A34A] transition-all"
                      style={{
                        width: `${Math.min(100, (progress.loaded / Math.max(progress.total, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {loadError && (
                <div className="text-[11px] text-[#991B1B] bg-[#FEE2E2] border border-[#FCA5A5] rounded-xl px-2.5 py-1.5">
                  {loadError}
                </div>
              )}
            </div>

            {/* Expandable Device RAM & Cached Model Storage Manager */}
            {showManager && (
              <div className="bg-[#FDF3E1] border-b-2 border-[#DEC098] p-3.5 max-h-64 overflow-y-auto space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#5C3415]">
                  <span className="inline-flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-[#c39144]" />
                    Device RAM: {deviceRamGb ? `~${deviceRamGb} GB` : 'Auto-detected'} •{' '}
                    {isMultiThreadSupported ? 'SharedArrayBuffer SIMD' : 'Single-Thread WASM'}
                  </span>
                  {storageEstimate && (
                    <span className="font-mono">
                      Cache: {formatMB(storageEstimate.usage)} / {formatMB(storageEstimate.quota)}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {WAFFLECHAT_MODELS.map((m) => {
                    const cached = cachedUrls[m.id];
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-white border border-[#DEC098] px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[#273e30] truncate flex items-center gap-1.5">
                            {cached && <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />}
                            <span className="truncate">{m.name}</span>
                          </div>
                          <div className="text-[10.5px] text-[#8c947e]">
                            {cached ? `Cached offline (${formatMB(cached.size)})` : `${m.sizeLabel} • Not downloaded`}
                          </div>
                        </div>
                        {cached ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteCachedModel(m)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FEE2E2] hover:bg-[#FECACA] text-[#991B1B] text-[10.5px] font-bold border border-[#FCA5A5] shrink-0"
                            title="Delete Cached Model"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void handleLoadModel(m)}
                            className="px-2.5 py-1 rounded-lg bg-[#f2f4e8] hover:bg-[#eef0e4] text-[#78350F] text-[10.5px] font-bold border border-[#c39144] shrink-0"
                          >
                            Get
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chat Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#fffefa]">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words border ${
                      m.role === 'user'
                        ? 'bg-[#EF4444] text-white border-[#991B1B] rounded-br-md'
                        : 'bg-[#faf8f1] text-[#273e30] border-[#e5e7db] rounded-bl-md'
                    }`}
                  >
                    {m.content || (generating ? 'Thinking locally...' : '')}
                  </div>
                  {m.tokPerSec !== undefined && (
                    <span className="mt-1 font-mono text-[10px] text-[#9A7B5C]">
                      {m.tokPerSec.toFixed(1)} tokens/sec • 100% on-device
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => void handleSend(e)}
              className="p-3 bg-[#faf8f1] border-t-2 border-[#e5e7db] flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  loadedModelId
                    ? 'Ask about math, code, or tools...'
                    : 'Load a GGUF model above to chat offline...'
                }
                className="toy-input py-2 text-xs sm:text-sm flex-1"
              />
              {generating ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="toy-btn-primary p-2.5"
                  title="Stop generation"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="toy-btn-gold p-2.5"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};
