import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Clock3,
  Heart,
  LayoutGrid,
  Menu,
  Search,
  Settings,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CUPBOARDS, getToolsForCupboard } from '../../registry/toolsRegistry';
import type { CupboardId } from '../../registry/types';
import { soundEngine } from '../../utils/soundEngine';
import { ToolIcon } from './ToolIcon';

interface KitchenHeaderProps {
  onGoHome: () => void;
  onShowSplash: () => void;
  onOpenSearch: () => void;
  onOpenLunchbox: () => void;
  onOpenSettings: () => void;
  onOpenHall: () => void;
  onOpenCupboard: (id: CupboardId) => void;
  favoriteCount: number;
  hallCount: number;
  activeLocationLabel?: string;
  activeCupboardId?: CupboardId;
  activeToolId?: string;
  activeStage: 'hub' | 'cupboard' | 'tool';
}

/**
 * The kitchen shell: a fixed sage sidebar on the left (brand, navigation,
 * cupboards, local-first badge) and a quiet top bar with the breadcrumb,
 * search, sound and settings controls.
 */
export const KitchenHeader: React.FC<KitchenHeaderProps> = ({
  onGoHome,
  onShowSplash,
  onOpenSearch,
  onOpenLunchbox,
  onOpenSettings,
  onOpenHall,
  onOpenCupboard,
  favoriteCount,
  hallCount,
  activeLocationLabel,
  activeCupboardId,
  activeToolId,
  activeStage,
}) => {
  const [muted, setMuted] = useState(() => soundEngine.isMuted());
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => soundEngine.subscribe(setMuted), []);

  // Close the drawer whenever the route changes.
  useEffect(() => setMobileOpen(false), [activeStage, activeCupboardId, activeToolId]);

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

  const crumb =
    activeStage === 'tool'
      ? activeLocationLabel ?? 'Utility'
      : activeStage === 'cupboard'
        ? activeLocationLabel ?? 'Cupboard'
        : 'The kitchen';

  const Sidebar = (
    <aside
      className={`kitchen-sidebar fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col px-5 pb-5 pt-7
                  transition-transform duration-200 lg:translate-x-0 ${
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                  }`}
      aria-label="Kitchen navigation"
    >
      <div className="flex items-start justify-between">
        {/* brand */}
        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.04);
            onGoHome();
          }}
          className="group flex items-center gap-3 text-left"
          title="Back to the kitchen"
        >
          <span className="relative grid h-[46px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-[#f4eddb] font-serif text-[34px] font-bold leading-none text-[#213b30]">
            B
            <span className="absolute -right-[3px] top-0 h-3.5 w-3.5 rounded-full bg-[#213b30] shadow-[3px_-4px_0_#213b30]" />
          </span>
          <span className="font-serif text-[25px] leading-[1.05] tracking-[-0.8px] text-[#f6f2e6]">
            BiteSized
            <span className="mt-[7px] block font-sans text-[9px] font-medium tracking-[3px] text-[#becbb7]">
              UTILITIES
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1.5 text-[#c3d2c1] hover:bg-[#2a483a] lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 mt-8 pl-2 text-[9px] uppercase tracking-[1.5px] text-[#b7c6b3]">
        Your little tool kitchen
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.05);
            onGoHome();
          }}
          className={`nav-item ${activeStage === 'hub' ? 'is-active' : ''}`}
          aria-current={activeStage === 'hub' ? 'page' : undefined}
        >
          <LayoutGrid className="h-[17px] w-[17px] shrink-0" strokeWidth={1.6} />
          <span>The kitchen</span>
        </button>

        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.05);
            onOpenHall();
          }}
          className={`nav-item ${activeStage === 'tool' && activeToolId === '__hall' ? 'is-active' : ''}`}
        >
          <Sparkles className="h-[17px] w-[17px] shrink-0" strokeWidth={1.6} />
          <span>Hall of Fame</span>
          <span className="ml-auto font-mono text-[10px] text-[#8ba394]">{hallCount}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.05);
            onOpenLunchbox();
          }}
          className="nav-item"
        >
          <Heart className="h-[17px] w-[17px] shrink-0" strokeWidth={1.6} />
          <span>My favorites</span>
          <span className="ml-auto font-mono text-[10px] text-[#8ba394]">{favoriteCount}</span>
        </button>

        <button type="button" onClick={onShowSplash} className="nav-item">
          <Clock3 className="h-[17px] w-[17px] shrink-0" strokeWidth={1.6} />
          <span>Replay the intro</span>
        </button>

        <div className="nav-label">
          <span>The cupboards</span>
          <span className="font-mono">8</span>
        </div>

        {CUPBOARDS.map((cupboard) => {
          const count = cupboard.unlocked ? getToolsForCupboard(cupboard.id).length : 0;
          const isActive = activeCupboardId === cupboard.id;
          return (
            <button
              key={cupboard.id}
              type="button"
              onClick={() => {
                soundEngine.playPop(1.05);
                onOpenCupboard(cupboard.id);
              }}
              className={`nav-item ${isActive ? 'is-active' : ''}`}
              title={cupboard.unlocked ? cupboard.tagline : 'Baking soon'}
            >
              <span
                className="nav-emoji shrink-0"
                style={{ ['--cup' as string]: cupboard.palette.base }}
              >
                <ToolIcon
                  name={
                    ['Calculator', 'TerminalSquare', 'FileText', 'Shapes', 'Film', 'Sigma', 'Music4', 'Gamepad2'][
                      cupboard.number - 1
                    ] ?? 'Sparkles'
                  }
                  className="h-3 w-3"
                  style={{ color: cupboard.palette.shadow }}
                />
              </span>
              <span className="min-w-0 truncate">{cupboard.shortName}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-[#8ba394]">
                {cupboard.unlocked ? count : '·'}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-4 shrink-0 border-t border-[#34503f] pt-4">
        <p className="font-serif text-[15px] italic leading-snug text-[#cbd8c8]">
          Small tools.
          <br />
          Big possibilities.
        </p>
        <a
          href="https://github.com/the-creative-master"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 inline-flex items-center gap-1 text-[10px] text-[#9fb3a3] transition-colors hover:text-[#e6efe1]"
        >
          Made by the-creative-master
          <ArrowUpRight className="h-3 w-3" />
        </a>
        <div className="local-badge mt-2.5">
          <i />
          Your files stay on your device
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {Sidebar}

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#17281c]/45 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <div className="lg:ml-[260px]">
        <header className="topbar-shell sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2.5 text-[11px] text-[#7d8676]">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-[#4c6152] hover:bg-[#eaecdd] lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-[18px] w-[18px]" />
            </button>
            <span className="hidden text-[#b3b9a6] sm:inline">⌂</span>
            <button
              type="button"
              onClick={onGoHome}
              className="shrink-0 transition-colors hover:text-[#33473a]"
            >
              The kitchen
            </button>
            {activeStage !== 'hub' && (
              <>
                <span className="shrink-0 text-[#c3c8b8]">/</span>
                <span className="truncate text-[#485c4b]">{crumb}</span>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(1.1);
                onOpenSearch();
              }}
              className="hidden items-center gap-2 rounded-lg border border-[#e4e4d9] bg-[#fffefa] px-3 py-[7px]
                         text-[11px] text-[#8a9282] transition-colors hover:border-[#c9d2ba] hover:text-[#4d6152] sm:flex"
              aria-label="Search all utilities"
            >
              <Search className="h-[15px] w-[15px] text-[#939c86]" strokeWidth={1.8} />
              <span>Search everything</span>
              <kbd className="ml-1 rounded border border-[#e3e5d8] bg-[#f4f5ec] px-1.5 py-px font-mono text-[9.5px] text-[#8a9282]">
                {isMac ? '⌘' : 'Ctrl'} K
              </kbd>
            </button>

            <button
              type="button"
              onClick={onOpenSearch}
              className="rounded-lg border border-[#e4e4d9] bg-[#fffefa] p-2 text-[#7d8a76] transition-colors hover:border-[#c9d2ba] sm:hidden"
              aria-label="Search all utilities"
            >
              <Search className="h-4 w-4" strokeWidth={1.8} />
            </button>

            <span className="hidden items-center gap-1.5 text-[10px] text-[#8b9a83] xl:flex">
              <i className="h-1.5 w-1.5 rounded-full bg-[#7fb08a]" />
              Local-first tools
            </span>

            <button
              type="button"
              onClick={() => soundEngine.toggleMute()}
              className="rounded-lg border border-transparent p-2 text-[#7d8a76] transition-colors hover:border-[#e4e4d9] hover:bg-[#f2f4e8]"
              title={muted ? 'Unmute sound effects' : 'Mute sound effects'}
              aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            >
              {muted ? <VolumeX className="h-[17px] w-[17px]" strokeWidth={1.7} /> : <Volume2 className="h-[17px] w-[17px]" strokeWidth={1.7} />}
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playPop(1.06);
                onOpenSettings();
              }}
              className="rounded-lg border border-transparent p-2 text-[#7d8a76] transition-colors hover:border-[#e4e4d9] hover:bg-[#f2f4e8]"
              title="Kitchen settings"
              aria-label="Open kitchen settings"
            >
              <Settings className="h-[17px] w-[17px]" strokeWidth={1.7} />
            </button>

            <span
              className="grid h-8 w-8 place-items-center rounded-full border border-[#dfe3d4] bg-[#f3f5e9] text-[13px] text-[#6c8163]"
              aria-hidden
            >
              ✦
            </span>
          </div>
        </header>
      </div>
    </>
  );
};

export default KitchenHeader;
