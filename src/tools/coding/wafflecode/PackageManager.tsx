import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Plus, X, Check, Terminal, Globe, Info } from 'lucide-react';
import { soundEngine } from '../../../utils/soundEngine';

export type PackageKind = 'python' | 'esm';

interface PackageManagerProps {
  kind: PackageKind;
  packages: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}

const PYTHON_PRESETS = [
  { name: 'numpy', note: 'Numerical arrays (compiled — offline note)' },
  { name: 'pandas', note: 'Data frames (compiled — offline note)' },
  { name: 'sympy', note: 'Symbolic math (pure Python)' },
  { name: 'scipy', note: 'Scientific computing (compiled)' },
  { name: 'matplotlib', note: 'Plotting (compiled)' },
  { name: 'networkx', note: 'Graph algorithms (pure Python)' },
];

const ESM_PRESETS = [
  { name: 'lodash-es', note: 'Utility belt for arrays & objects' },
  { name: 'date-fns', note: 'Immutable date helpers' },
  { name: 'zod', note: 'Schema validation' },
  { name: 'nanoid', note: 'Tiny unique ID generator' },
  { name: 'mathjs', note: 'Expression parser & matrix math' },
  { name: 'ramda', note: 'Functional programming toolkit' },
];

/**
 * Local Package Manager — records micropip.install() / esm.sh requests as an
 * offline dependency manifest. No network request is ever issued.
 */
export const PackageManager: React.FC<PackageManagerProps> = ({ kind, packages, onChange, onClose }) => {
  const [draft, setDraft] = useState('');
  const presets = kind === 'python' ? PYTHON_PRESETS : ESM_PRESETS;

  const add = (name: string) => {
    const clean = name.trim();
    if (!clean || packages.includes(clean)) return;
    soundEngine.playPop(1.16);
    onChange([...packages, clean]);
    setDraft('');
  };

  const remove = (name: string) => {
    soundEngine.playClick();
    onChange(packages.filter((p) => p !== name));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B1708]/55 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 22, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 12, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-[#FFFDF8] border-2 border-b-[6px] border-[#C99B66] shadow-toy-lg overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F7EAD5] border-b-2 border-[#E2C6A2]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] border-2 border-[#16A34A] flex items-center justify-center text-[#14532D]">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-[#3B2314]">Local Package Manager</h3>
              <p className="text-[11px] text-[#8A6748]">
                {kind === 'python' ? 'micropip.install() manifest — Python' : 'esm.sh import map — JavaScript'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="toy-btn-cream px-2.5 py-1.5 text-xs" aria-label="Close package manager">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add(draft); }}
              placeholder={kind === 'python' ? 'e.g. sympy or numpy==1.26.4' : 'e.g. lodash-es or preact@10'}
              className="toy-input font-mono text-xs"
            />
            <button type="button" onClick={() => add(draft)} className="toy-btn-mint px-3.5 py-2 text-xs shrink-0">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>

          <div className="rounded-xl border-2 border-[#E2C6A2] bg-[#FFF8EB] p-3">
            <p className="text-[11px] font-bold text-[#6B4423] flex items-center gap-1.5 mb-1.5">
              <Info className="w-3.5 h-3.5" /> How offline packages work
            </p>
            <p className="text-[11px] leading-relaxed text-[#7A5535]">
              {kind === 'python'
                ? 'WaffleCode records each requirement in a local manifest. Pure-Python packages are the ones that can run without a network round-trip; packages with compiled C extensions (numpy, pandas, scipy…) are listed for documentation only and will print a note instead of silently failing.'
                : 'WaffleCode builds an import map pointing at esm.sh. Because this sandbox is fully offline, entries are stored as a manifest you can copy into your own project — nothing is fetched while you are in the kitchen.'}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-bold text-[#6B4423] mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Popular presets
            </p>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => add(p.name)}
                  disabled={packages.includes(p.name)}
                  title={p.note}
                  className={`toy-pill text-[11px] transition-all ${
                    packages.includes(p.name)
                      ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]'
                      : 'bg-white border-[#D4AA78] text-[#7A5535] hover:bg-[#FEF3C7]'
                  }`}
                >
                  {packages.includes(p.name) ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold text-[#6B4423] mb-1.5 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" /> Manifest ({packages.length})
            </p>
            {packages.length === 0 ? (
              <p className="text-[11px] text-[#A98768] italic">No packages yet — the manifest is empty.</p>
            ) : (
              <div className="space-y-1">
                {packages.map((p) => (
                  <div key={p} className="flex items-center justify-between gap-2 rounded-lg bg-[#F7EAD5] border border-[#E2C6A2] px-2.5 py-1.5">
                    <code className="font-mono text-[11px] text-[#3B2314]">
                      {kind === 'python' ? `micropip.install('${p}')` : `import "${p}"`}
                    </code>
                    <button type="button" onClick={() => remove(p)} className="text-[#B91C1C] hover:text-[#7F1D1D]" aria-label={`Remove ${p}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <AnimatePresence />
        </div>
      </motion.div>
    </motion.div>
  );
};
