import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, Zap, RotateCcw, X, Check } from 'lucide-react';
import {
  ACCENT_SWATCHES,
  MAIN_SWATCHES,
  type KitchenSettings,
} from '../../utils/uiPrefs';
import { soundEngine } from '../../utils/soundEngine';

interface SettingsPanelProps {
  open: boolean;
  settings: KitchenSettings;
  onChange: (patch: Partial<KitchenSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

const SwatchRow: React.FC<{
  label: string;
  hint: string;
  value: string;
  options: { name: string; value: string }[];
  onPick: (value: string) => void;
}> = ({ label, hint, value, options, onPick }) => (
  <div>
    <div className="flex items-baseline gap-2">
      <h4 className="font-display text-lg font-extrabold text-[#3B2314]">{label}</h4>
      <span className="text-xs font-semibold text-[#8B5A2B]/70">{hint}</span>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {options.map((o) => {
        const active = o.value.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              onPick(o.value);
              soundEngine.playPop(1.08);
            }}
            title={o.name}
            aria-label={o.name}
            aria-pressed={active}
            className="relative h-10 w-10 rounded-2xl border-2 border-b-[5px] transition active:translate-y-[3px] active:border-b-2"
            style={{
              backgroundColor: o.value,
              borderColor: 'rgba(59,35,20,0.28)',
              boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.45)',
            }}
          >
            {active && (
              <Check
                className="absolute inset-0 m-auto h-5 w-5"
                style={{ color: '#FFF8EB' }}
                strokeWidth={4}
              />
            )}
          </button>
        );
      })}
      <label className="ml-1 flex items-center gap-2 rounded-2xl border-2 border-[#3B2314]/15 bg-[#FFF8EB] px-2.5 py-1.5">
        <span className="text-xs font-bold text-[#8B5A2B]">Custom</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onPick(e.target.value)}
          className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          aria-label="Custom colour"
        />
      </label>
    </div>
  </div>
);

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  open,
  settings,
  onChange,
  onReset,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto px-4 py-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-[#3B2314]/45 backdrop-blur-[3px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            initial={{ y: 26, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="relative w-full max-w-xl rounded-[28px] border-2 border-b-[10px] border-[#3B2314]/25 bg-[#FFF8EB] p-6 shadow-[0_28px_60px_-18px_rgba(59,35,20,0.55)]"
            style={{ boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.7)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="settings-title" className="font-display text-2xl font-extrabold text-[#3B2314]">
                  Settings
                </h3>
                <p className="mt-0.5 text-sm font-semibold text-[#8B5A2B]/80">
                  Tune the kitchen to taste. Saved on this device only.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="rounded-xl border-2 border-b-[4px] border-[#3B2314]/20 bg-[#F3DFC1] p-1.5 text-[#3B2314] transition active:translate-y-[2px] active:border-b-2"
              >
                <X className="h-4 w-4" strokeWidth={3} />
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <section className="rounded-2xl border-2 border-[#3B2314]/12 bg-white/60 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Palette className="h-4 w-4 text-[var(--kitchen-accent-dark)]" strokeWidth={3} />
                  <h4 className="font-display text-sm font-extrabold uppercase tracking-wide text-[#8B5A2B]">
                    Kitchen colors
                  </h4>
                </div>
                <div className="space-y-4">
                  <SwatchRow
                    label="Main color"
                    hint="Signs and game panels"
                    value={settings.mainColor}
                    options={MAIN_SWATCHES}
                    onPick={(mainColor) => onChange({ mainColor })}
                  />
                  <SwatchRow
                    label="Accent color"
                    hint="Buttons, knobs, and highlights"
                    value={settings.accentColor}
                    options={ACCENT_SWATCHES}
                    onPick={(accentColor) => onChange({ accentColor })}
                  />
                </div>
              </section>

              <section className="rounded-2xl border-2 border-[#3B2314]/12 bg-white/60 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-[var(--kitchen-accent-dark)]" strokeWidth={3} />
                  <h4 className="font-display text-sm font-extrabold uppercase tracking-wide text-[#8B5A2B]">
                    Performance
                  </h4>
                </div>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={settings.potatoMode}
                    onChange={(e) => {
                      onChange({ potatoMode: e.target.checked });
                      soundEngine.playPop(e.target.checked ? 0.86 : 1.14);
                    }}
                    className="mt-1 h-4 w-4 accent-[var(--kitchen-accent)]"
                  />
                  <span>
                    <span className="block font-display text-base font-extrabold text-[#3B2314]">
                      Potato mode
                    </span>
                    <span className="block text-xs font-semibold text-[#8B5A2B]/75">
                      Fewer textures, shadows, and animations
                    </span>
                  </span>
                </label>
              </section>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onReset();
                    soundEngine.playPop(0.8);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-b-[5px] border-[#3B2314]/20 bg-[#F3DFC1] px-3 py-2 font-display text-xs font-extrabold uppercase tracking-wide text-[#3B2314] transition active:translate-y-[3px] active:border-b-2"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={3} />
                  Reset settings
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border-2 border-b-[5px] bg-[var(--kitchen-accent)] px-5 py-2 font-display text-sm font-extrabold text-[var(--kitchen-accent-ink)] transition active:translate-y-[3px] active:border-b-2"
                  style={{ borderColor: 'var(--kitchen-accent-dark)' }}
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsPanel;
