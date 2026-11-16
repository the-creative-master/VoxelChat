import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { KitchenHeader } from './components/ui/KitchenHeader';
import { BootSplashScreen } from './components/splash/BootSplashScreen';
import { WaffleWallHub } from './components/kitchen/WaffleWallHub';
import { CupboardModal } from './components/kitchen/CupboardModal';
import { CuttingBoardShell } from './components/kitchen/CuttingBoardShell';
import { LunchboxDrawer } from './components/kitchen/LunchboxDrawer';
import { CommandSpotlight } from './components/search/CommandSpotlight';
import { WaffleChatDrawer } from './components/chat/WaffleChatDrawer';
import { getCupboardById, getToolById } from './registry/toolsRegistry';
import type { CupboardId, ToolDefinition } from './registry/types';
import { getFavorites, toggleFavoriteId } from './utils/storage';
import { soundEngine } from './utils/soundEngine';
import { SettingsPanel } from './components/kitchen/SettingsPanel';
import { HallOfFame } from './components/kitchen/HallOfFame';
import {
  getHall,
  getPins,
  toggleHall,
  togglePin,
  useKitchenSettings,
} from './utils/uiPrefs';

type KitchenView =
  | { stage: 'splash' }
  | { stage: 'hub' }
  | { stage: 'hall' }
  | { stage: 'cupboard'; cupboardId: CupboardId }
  | { stage: 'tool'; toolId: string };

function parseHashToView(): KitchenView | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  if (!hash) return null;
  if (hash === 'kitchen') return { stage: 'hub' };
  if (hash === 'hall-of-fame') return { stage: 'hall' };
  if (hash.startsWith('cupboard/')) {
    const id = hash.slice('cupboard/'.length) as CupboardId;
    try {
      const cup = getCupboardById(id);
      if (cup.unlocked) return { stage: 'cupboard', cupboardId: id };
    } catch {
      return null;
    }
  }
  if (hash.startsWith('tool/')) {
    const id = hash.slice('tool/'.length);
    const tool = getToolById(id);
    if (tool) return { stage: 'tool', toolId: tool.id };
  }
  return null;
}

export const App: React.FC = () => {
  const [view, setView] = useState<KitchenView>(() => parseHashToView() ?? { stage: 'splash' });
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());
  const [searchOpen, setSearchOpen] = useState(false);
  const [lunchboxOpen, setLunchboxOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pins, setPins] = useState<string[]>(() => getPins());
  const [hall, setHall] = useState<string[]>(() => getHall());
  const { settings, update: updateSettings, reset: resetSettings } = useKitchenSettings();

  const navigate = useCallback((next: KitchenView) => {
    setView(next);
    let nextHash = '';
    if (next.stage === 'hub') nextHash = '#/kitchen';
    else if (next.stage === 'hall') nextHash = '#/hall-of-fame';
    else if (next.stage === 'cupboard') nextHash = `#/cupboard/${next.cupboardId}`;
    else if (next.stage === 'tool') nextHash = `#/tool/${next.toolId}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash || window.location.pathname);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onHashOrPop = () => {
      const parsed = parseHashToView();
      if (parsed) setView(parsed);
      else setView({ stage: 'splash' });
    };
    window.addEventListener('popstate', onHashOrPop);
    return () => window.removeEventListener('popstate', onHashOrPop);
  }, []);

  // Global Cmd+K / Ctrl+K Spotlight Keyboard Shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        soundEngine.playPop(1.12);
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleTogglePin = useCallback((toolId: string) => {
    setPins(togglePin(toolId));
  }, []);

  const handleToggleHall = useCallback((toolId: string) => {
    setHall(toggleHall(toolId));
  }, []);

  const handleToggleFavorite = useCallback((toolId: string) => {
    const { favorites: next, added } = toggleFavoriteId(toolId);
    setFavorites(next);
    if (added) soundEngine.playStar();
    else soundEngine.playPop(0.9);
  }, []);

  const handleSelectTool = useCallback(
    (tool: ToolDefinition) => {
      navigate({ stage: 'tool', toolId: tool.id });
    },
    [navigate]
  );

  const activeTool = view.stage === 'tool' ? getToolById(view.toolId) : undefined;
  const activeLocationLabel =
    view.stage === 'cupboard'
      ? `Cupboard #${getCupboardById(view.cupboardId).number} • ${getCupboardById(view.cupboardId).name}`
      : activeTool
      ? `${getCupboardById(activeTool.cupboardId).shortName} › ${activeTool.name}`
      : 'Waffle Kitchen Wall';

  return (
    <div className="paper-surface min-h-screen overflow-x-clip">
      {view.stage === 'splash' ? (
        <AnimatePresence mode="wait">
          <BootSplashScreen onLaunch={() => navigate({ stage: 'hub' })} />
        </AnimatePresence>
      ) : (
        <div className="relative z-10 min-h-screen flex flex-col">
          {/* Top Sticky Honey-Oak Kitchen Shelf Bar */}
          <KitchenHeader
            onGoHome={() => navigate({ stage: 'hub' })}
            onShowSplash={() => navigate({ stage: 'splash' })}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenLunchbox={() => setLunchboxOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenHall={() => navigate({ stage: 'hall' })}
            onOpenCupboard={(cupboardId) => navigate({ stage: 'cupboard', cupboardId })}
            favoriteCount={activeTool && favorites.includes(activeTool.id) ? favorites.length : favorites.length}
            hallCount={hall.length}
            activeLocationLabel={activeLocationLabel}
            activeCupboardId={
              view.stage === 'cupboard'
                ? view.cupboardId
                : activeTool
                  ? activeTool.cupboardId
                  : undefined
            }
            activeToolId={view.stage === 'tool' ? view.toolId : undefined}
            activeStage={view.stage === 'hall' ? 'hub' : view.stage}
          />

          {/* Spatial Kitchen Navigation Stage */}
          <main className="flex-1">
            <AnimatePresence mode="wait">
              {view.stage === 'hub' && (
                <div key="wall-hub">
                  <WaffleWallHub
                    onOpenCupboard={(cupboardId) => navigate({ stage: 'cupboard', cupboardId })}
                    onQuickOpenTool={(toolId) => navigate({ stage: 'tool', toolId })}
                  />
                </div>
              )}

              {view.stage === 'hall' && (
                <div key="hall-page" className="mx-auto w-full max-w-[1180px] px-4 pb-24 sm:px-8">
                  <HallOfFame
                    hall={hall}
                    onSelectTool={handleSelectTool}
                    onRemove={handleToggleHall}
                    onBrowse={() => navigate({ stage: 'hub' })}
                  />
                </div>
              )}

              {view.stage === 'cupboard' && (
                <CupboardModal
                  key={`cup-${view.cupboardId}`}
                  cupboardId={view.cupboardId}
                  favorites={favorites}
                  onToggleFavorite={handleToggleFavorite}
                  onSelectTool={handleSelectTool}
                  onClose={() => navigate({ stage: 'hub' })}
                  pins={pins}
                  onTogglePin={handleTogglePin}
                  hall={hall}
                  onToggleHall={handleToggleHall}
                />
              )}

              {view.stage === 'tool' && activeTool && (
                <CuttingBoardShell
                  key={`tool-${activeTool.id}`}
                  tool={activeTool}
                  isFavorite={favorites.includes(activeTool.id)}
                  onToggleFavorite={() => handleToggleFavorite(activeTool.id)}
                  onBackToCupboard={() =>
                    navigate({ stage: 'cupboard', cupboardId: activeTool.cupboardId })
                  }
                  isHall={hall.includes(activeTool.id)}
                  onToggleHall={() => handleToggleHall(activeTool.id)}
                />
              )}
            </AnimatePresence>
          </main>

          {/* Countertop Companion: Persistent Browser-Local llama.cpp WaffleChat */}
          <WaffleChatDrawer activeContextName={activeLocationLabel} />
        </div>
      )}

      {/* Global Cmd+K Recipe Spotlight */}
      <CommandSpotlight
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectTool={handleSelectTool}
      />

      {/* Kitchen Settings: colors + potato mode */}
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onReset={resetSettings}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Pinned Favorites ("My Lunchbox") Drawer */}
      <LunchboxDrawer
        open={lunchboxOpen}
        favorites={favorites}
        onClose={() => setLunchboxOpen(false)}
        onSelectTool={handleSelectTool}
        onToggleFavorite={handleToggleFavorite}
      />
    </div>
  );
};

export default App;
