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
    <div className="flex flex-wrap items-baseline gap-2">
      <h4 className="text-[13px] font-semibold text-[#2c4335]">{label}</h4>
      <span className="text-[11px] text-[#8a9281]">{hint}</span>
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
            className={`relative h-8 w-8 rounded-full border transition ${
              active
                ? 'border-[#8b9d78] ring-2 ring-[#8b9d78] ring-offset-2 ring-offset-[#fffefa]'
                : 'border-black/10 hover:scale-105'
            }`}
            style={{ backgroundColor: o.value }}
          >
            {active && (
              <Check
                className="absolute inset-0 m-auto h-3.5 w-3.5"
                style={{ color: '#fffefa' }}
                strokeWidth={3}
              />
            )}
          </button>
        );
      })}
      <label className="ml-1 flex items-center gap-2 rounded-lg border border-[#dfe5d2] bg-[#fafbf5] px-2.5 py-1.5">
        <span className="text-[10.5px] text-[#6d7c62]">Custom</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onPick(e.target.value)}
          className="h-5 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
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
            className="absolute inset-0 bg-[#17281c]/40 backdrop-blur-[2px]"
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
            transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-[16px] border border-[#e1e5d6] bg-[#fffefa] shadow-[0_28px_60px_-18px_#28392145]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e8e8df] px-6 py-5">
              <div>
                <h3 id="settings-title" className="text-[22px] leading-tight text-[#253f31]">
                  Settings
                </h3>
                <p className="mt-1 text-[11.5px] text-[#8a9281]">
                  Tune the kitchen to taste. Saved on this device only.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#e4e4d9] bg-[#fafbf5] text-[#7d8a76] transition-colors hover:bg-[#f0f2e6]"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="space-y-6 px-6 py-5">
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Palette className="h-3.5 w-3.5 text-[#8b9a7c]" strokeWidth={1.8} />
                  <h4 className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[#8b9a7c]">
                    Kitchen colors
                  </h4>
                </div>
                <div className="space-y-4 rounded-lg border border-[#e8e8df] bg-[#fafbf5] p-4">
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

              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-[#8b9a7c]" strokeWidth={1.8} />
                  <h4 className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[#8b9a7c]">
                    Performance
                  </h4>
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e8e8df] bg-[#fafbf5] p-4">
                  <input
                    type="checkbox"
                    checked={settings.potatoMode}
                    onChange={(e) => {
                      onChange({ potatoMode: e.target.checked });
                      soundEngine.playPop(e.target.checked ? 0.86 : 1.14);
                    }}
                    className="mt-0.5 h-4 w-4 accent-[#3d5544]"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-[#2c4335]">
                      Potato mode
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-[#8a9281]">
                      Fewer textures, shadows, and animations
                    </span>
                  </span>
                </label>
              </section>

              <div className="flex items-center justify-between gap-3 border-t border-[#e8e8df] pt-4">
                <button
                  type="button"
                  onClick={() => {
                    onReset();
                    soundEngine.playPop(0.8);
                  }}
                  className="inline-flex h-9 items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-[#8b9a7c] transition-colors hover:text-[#b3633f]"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Reset settings
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 items-center rounded-lg border border-[#3d5544] bg-[#3d5544] px-5 text-[11.5px] font-medium text-[#faf9ed] transition-colors hover:bg-[#203f2d]"
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
