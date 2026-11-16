import React, { useEffect, useState } from 'react';
import { PackageOpen, Search, Settings, Sparkles, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { WaffleCupMascot } from '../mascot/WaffleCupMascot';
import { soundEngine } from '../../utils/soundEngine';

interface KitchenHeaderProps {
  onGoHome: () => void;
  onShowSplash: () => void;
  onOpenSearch: () => void;
  onOpenLunchbox: () => void;
  onOpenSettings: () => void;
  favoriteCount: number;
  activeLocationLabel?: string;
}

/**
 * Top Sticky 2.5D Kitchen Shelf Bar:
 * - Mini Waffle Cup logo button (returns to Kitchen Wall from anywhere)
 * - Global Cmd+K / Ctrl+K Recipe Spotlight Search Bar
 * - Pinned Favorites ("My Lunchbox") Drawer Toggle
 * - Synthesized UI Sound Effects Mute/Unmute Toggle
 * - Offline / 100% Local Cache Status Pill
 */
export const KitchenHeader: React.FC<KitchenHeaderProps> = ({
  onGoHome,
  onShowSplash,
  onOpenSearch,
  onOpenLunchbox,
  onOpenSettings,
  favoriteCount,
  activeLocationLabel,
}) => {
  const [muted, setMuted] = useState(() => soundEngine.isMuted());
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const unsub = soundEngine.subscribe(setMuted);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

  return (
    <header className="sticky top-0 z-30">
      {/* Main Honey-Oak Floating Shelf */}
      <div className="wood-shelf-surface border-b-[6px] border-[#8B5220] px-3 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2.5 sm:gap-4">
          {/* Left: Mini Waffle Cup Logo Button -> Kitchen Wall */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(1.05);
                onGoHome();
              }}
              className="group flex items-center gap-2 rounded-2xl bg-[#FFFDF8] hover:bg-[#FFF5E2]
                         border-2 border-b-[5px] border-[#B47438] px-2.5 sm:px-3.5 py-1.5
                         active:translate-y-[3px] active:border-b-[2px] transition-all shadow-toy-sm cursor-pointer"
              title="Return to Waffle Kitchen Wall"
            >
              <div className="-my-2 -ml-1 group-hover:scale-110 transition-transform">
                <WaffleCupMascot size={42} showSteam={false} showSaucer={false} />
              </div>
              <div className="text-left leading-tight">
                <div className="font-display font-bold text-sm sm:text-base text-[#3B2314] tracking-tight">
                  BiteSized<span className="text-[#DC2626]">Utilities</span>
                </div>
                <div className="hidden md:block text-[10.5px] font-semibold text-[#8B5A2B]">
                  {activeLocationLabel ?? 'Cozy Waffle Kitchen'}
                </div>
              </div>
            </button>
          </div>

          {/* Center: Global Cmd+K / Ctrl+K Recipe Spotlight Search Bar */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playPop(1.1);
              onOpenSearch();
            }}
            className="flex-1 max-w-md flex items-center justify-between gap-2 rounded-2xl
                       bg-[#FFFDF9] hover:bg-white border-2 border-b-[5px] border-[#C98A4B]
                       px-3.5 py-2 text-left transition-all active:translate-y-[3px] active:border-b-[2px]
                       shadow-toy-sm cursor-pointer group"
            aria-label="Search tools (Cmd+K or Ctrl+K)"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Search className="w-4 h-4 text-[#C2410C] shrink-0 group-hover:scale-110 transition-transform" />
              <span className="text-xs sm:text-sm font-medium text-[#8B6240] truncate">
                Search recipes &amp; utilities...
              </span>
            </span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-[#F8E7CE] border border-b-2 border-[#D4AA78] font-mono text-[11px] font-bold text-[#5C3415] shrink-0">
              {isMac ? '⌘K' : 'Ctrl+K'}
            </kbd>
          </button>

          {/* Right: My Lunchbox Favorites + Sound Toggle + Offline Status Pill */}
          <div className="flex items-center gap-2 shrink-0">
            {/* My Lunchbox Favorites Toggle */}
            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(1.06);
                onOpenLunchbox();
              }}
              className="toy-btn bg-gradient-to-b from-[#FDE68A] to-[#FBBF24] hover:from-[#FEF08A] hover:to-[#F59E0B]
                         border-[#92400E] text-[#4A2506] px-3 py-2 text-xs sm:text-sm"
              title="Open My Lunchbox (Pinned Favorites)"
            >
              <PackageOpen className="w-4 h-4 text-[#92400E]" />
              <span className="hidden lg:inline">My Lunchbox</span>
              {favoriteCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#EF4444] text-white font-mono text-[11px] font-bold border border-[#7F1D1D]">
                  {favoriteCount}
                </span>
              )}
            </button>

            {/* Kitchen Settings: colors + potato mode */}
            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(1.1);
                onOpenSettings();
              }}
              className="toy-btn bg-[#FFFDF8] border-[#B47438] text-[#3B2314] px-2.5 py-2 text-xs"
              title="Kitchen settings"
              aria-label="Open kitchen settings"
            >
              <Settings className="w-4 h-4 text-[#B45309]" />
            </button>

            {/* UI Sound Effects Mute/Unmute Speaker Toggle */}
            <button
              type="button"
              onClick={() => soundEngine.toggleMute()}
              className={`toy-btn px-2.5 py-2 text-xs ${
                muted
                  ? 'bg-[#F3E5D0] border-[#B89772] text-[#7C5A38]'
                  : 'bg-[#FFFDF8] border-[#B47438] text-[#3B2314]'
              }`}
              title={muted ? 'Unmute Cozy Kitchen SFX' : 'Mute Cozy Kitchen SFX'}
              aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            >
              {muted ? (
                <VolumeX className="w-4 h-4 text-[#9A7B5C]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#D97706]" />
              )}
            </button>

            {/* Splash Intro Re-Watch Mini Button */}
            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(1.12);
                onShowSplash();
              }}
              className="hidden xl:inline-flex toy-btn bg-[#FFFDF8] border-[#B47438] text-[#5C3415] px-2.5 py-2 text-xs"
              title="View Morning Splash Screen"
              aria-label="View Morning Splash Screen"
            >
              <Sparkles className="w-4 h-4 text-[#F59E0B]" />
            </button>

            {/* Offline / 100% Local Cache Status Pill */}
            <div
              className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-b-[4px] text-xs font-display font-semibold ${
                online
                  ? 'bg-[#DCFCE7] border-[#15803D] text-[#14532D]'
                  : 'bg-[#FEF3C7] border-[#B45309] text-[#78350F]'
              }`}
              style={{ boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.75)' }}
              title="Every tool executes 100% locally in your browser — zero server uploads."
            >
              {online ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[#16A34A]" />
                  <span>100% Local</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[#D97706]" />
                  <span>Offline Ready</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
