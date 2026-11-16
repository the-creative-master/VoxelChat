import { useCallback, useEffect, useState } from 'react';
import { readLocalJson, writeLocalJson } from './storage';

/* ============================================================================
   Kitchen preferences, shelf pins & the Hall of Fame
   Everything here is browser-local. No network, no accounts.
   ============================================================================ */

const SETTINGS_KEY = 'bsu:settings:v2';
const PINS_KEY = 'bsu:pins:v2';
const HALL_KEY = 'bsu:hall:v2';

export interface KitchenSettings {
  /** Signs, cupboard panels and game frames. */
  mainColor: string;
  /** Buttons, knobs and highlights. */
  accentColor: string;
  /** Fewer textures, shadows and animations. */
  potatoMode: boolean;
  muted: boolean;
}

export const DEFAULT_SETTINGS: KitchenSettings = {
  mainColor: '#8B5A2B',
  accentColor: '#F59E0B',
  potatoMode: false,
  muted: false,
};

export const MAIN_SWATCHES = [
  { name: 'Cocoa', value: '#8B5A2B' },
  { name: 'Espresso', value: '#5B3A1E' },
  { name: 'Berry', value: '#B3325C' },
  { name: 'Matcha', value: '#4F7A3A' },
  { name: 'Blueberry', value: '#2F5AA8' },
  { name: 'Plum', value: '#6B4A8C' },
];

export const ACCENT_SWATCHES = [
  { name: 'Honey', value: '#F59E0B' },
  { name: 'Butter', value: '#FBBF24' },
  { name: 'Strawberry', value: '#EF4444' },
  { name: 'Mint', value: '#10B981' },
  { name: 'Sky', value: '#3B82F6' },
  { name: 'Bubblegum', value: '#EC4899' },
];

/* ---------------------------------- state --------------------------------- */

export function getSettings(): KitchenSettings {
  return { ...DEFAULT_SETTINGS, ...readLocalJson<Partial<KitchenSettings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(next: KitchenSettings): void {
  writeLocalJson(SETTINGS_KEY, next);
}

/** Relative luminance so we always pick readable text on a custom colour. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#FFF8EB';
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? '#3B2314' : '#FFF8EB';
}

/** Mix a hex colour toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) =>
    Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* ---------------------------------- pins ---------------------------------- */

export function getPins(): string[] {
  return readLocalJson<string[]>(PINS_KEY, []);
}

export function togglePin(id: string): string[] {
  const cur = getPins();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  writeLocalJson(PINS_KEY, next);
  return next;
}

/* ------------------------------ hall of fame ------------------------------ */

export function getHall(): string[] {
  return readLocalJson<string[]>(HALL_KEY, []);
}

export function toggleHall(id: string): string[] {
  const cur = getHall();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  writeLocalJson(HALL_KEY, next);
  return next;
}

/* ---------------------------------- hooks --------------------------------- */

function applySettings(s: KitchenSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--kitchen-main', s.mainColor);
  root.style.setProperty('--kitchen-main-ink', readableOn(s.mainColor));
  root.style.setProperty('--kitchen-main-light', shade(s.mainColor, 0.28));
  root.style.setProperty('--kitchen-main-dark', shade(s.mainColor, -0.24));
  root.style.setProperty('--kitchen-accent', s.accentColor);
  root.style.setProperty('--kitchen-accent-ink', readableOn(s.accentColor));
  root.style.setProperty('--kitchen-accent-light', shade(s.accentColor, 0.34));
  root.style.setProperty('--kitchen-accent-dark', shade(s.accentColor, -0.24));
  root.classList.toggle('potato-mode', s.potatoMode);
}

export function useKitchenSettings(): {
  settings: KitchenSettings;
  update: (patch: Partial<KitchenSettings>) => void;
  reset: () => void;
} {
  const [settings, setSettings] = useState<KitchenSettings>(() => getSettings());

  useEffect(() => {
    applySettings(settings);
    saveSettings(settings);
  }, [settings]);

  const update = useCallback((patch: Partial<KitchenSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return { settings, update, reset };
}

/** Apply persisted colours once at boot, before React paints. */
export function applyStoredSettingsAtBoot(): void {
  applySettings(getSettings());
}
