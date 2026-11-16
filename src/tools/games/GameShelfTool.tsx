import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Expand,
  Gamepad2,
  Keyboard,
  RotateCcw,
  ShieldCheck,
  Shrink,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { Panel } from '../coding/shared';
import { soundEngine } from '../../utils/soundEngine';

/* ---------------------------------------------------------------------------
   Arcade shelf — the locally bundled SchoolGames cartridges.
   Every title below is a single self-contained HTML file in public/games/,
   so nothing is requested from the network once the app is loaded.
   --------------------------------------------------------------------------- */

export interface Cartridge {
  id: string;
  file: string;
  name: string;
  blurb: string;
  genre: 'Puzzle' | 'Arcade' | 'Action' | 'Sandbox' | 'Word';
  year?: string;
  accent: string;
  emoji: string;
}

export const CARTRIDGES: Cartridge[] = [
  {
    id: '2048',
    file: '2048.html',
    name: '2048',
    blurb: 'Slide and merge the numbered tiles until one reads 2048.',
    genre: 'Puzzle',
    accent: '#F59E0B',
    emoji: '🔢',
  },
  {
    id: 'trap-the-cat',
    file: 'trap-the-cat.html',
    name: 'Trap the Cat',
    blurb: 'Wall off the hexagon before the cat slips free. Pure deduction.',
    genre: 'Puzzle',
    accent: '#10B981',
    emoji: '🐈',
  },
  {
    id: 'wordle-unlimited',
    file: 'wordle-unlimited.html',
    name: 'Wordle Unlimited',
    blurb: 'Endless five-letter guessing with colour-coded feedback.',
    genre: 'Word',
    accent: '#22C55E',
    emoji: '🔤',
  },
  {
    id: 'sand-game',
    file: 'sand-game.html',
    name: 'Sand Game',
    blurb: 'Pour falling sand, water and fire and watch the physics settle.',
    genre: 'Sandbox',
    accent: '#EAB308',
    emoji: '🏖️',
  },
  {
    id: 'fluidsimulator',
    file: 'fluidsimulator.html',
    name: 'Fluid Simulator',
    blurb: 'Drag to stir a real-time fluid field. Mesmerising and freeform.',
    genre: 'Sandbox',
    accent: '#3B82F6',
    emoji: '🌊',
  },
  {
    id: 'offlineparadise',
    file: 'offlineparadise.html',
    name: 'Offline Paradise',
    blurb: 'A tiny island to wander when the internet is switched off.',
    genre: 'Sandbox',
    accent: '#EC4899',
    emoji: '🌴',
  },
  {
    id: 'radiusraid',
    file: 'radiusraid.html',
    name: 'Radius Raid',
    blurb: 'Twin-stick survival shooter with an escalating enemy swarm.',
    genre: 'Arcade',
    accent: '#EF4444',
    emoji: '🎯',
  },
  {
    id: 'itsrainingboxes',
    file: 'itsrainingboxes.html',
    name: "It's Raining Boxes",
    blurb: 'Dodge and stack while the boxes keep falling. One-more-go bait.',
    genre: 'Arcade',
    accent: '#8B5CF6',
    emoji: '📦',
  },
  {
    id: 'ninjavsevilcorp',
    file: 'ninjavsevilcorp.html',
    name: 'Ninja vs Evil Corp',
    blurb: 'Slash through a corporate tower of henchmen.',
    genre: 'Action',
    accent: '#0EA5E9',
    emoji: '🥷',
  },
  {
    id: 'agar-io-lite',
    file: 'agar-io-lite.html',
    name: 'Agar.io Lite',
    blurb: 'Eat cells, grow bigger, avoid the bigger ones. Offline edition.',
    genre: 'Arcade',
    accent: '#14B8A6',
    emoji: '🫧',
  },
  {
    id: 'paper-io-2',
    file: 'paper-io-2.htm',
    name: 'Paper.io 2',
    blurb: 'Sweep territory behind you and steal it back from rivals.',
    genre: 'Arcade',
    accent: '#F97316',
    emoji: '🟧',
  },
];

const GENRES = ['All', 'Puzzle', 'Arcade', 'Action', 'Sandbox', 'Word'] as const;

/* ------------------------------- the player ------------------------------- */

export const CartridgePlayer: React.FC<{ game: Cartridge; onExit?: () => void }> = ({ game, onExit }) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [nonce, setNonce] = useState(0);
  const [full, setFull] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const restart = useCallback(() => {
    setLoaded(false);
    setNonce((n) => n + 1);
    soundEngine.playPop(1.05);
  }, []);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onExit ? (
          <button type="button" onClick={onExit} className="toy-btn-cream px-3 py-2 text-xs sm:text-sm">
            <ArrowLeft className="h-4 w-4" />
            <span>Arcade shelf</span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 px-1 font-display text-xs font-extrabold text-[#3B2314] sm:text-sm">
            <Gamepad2 className="h-4 w-4" /> {game.name}
          </span>
        )}
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border-2 border-[#BBF7D0] bg-[#ECFDF5] px-2.5 py-1 text-[10.5px] font-bold text-[#15803D] sm:inline-flex">
            <ShieldCheck className="h-3 w-3" />
            Sandboxed · no network
          </span>
          <button type="button" onClick={restart} className="toy-btn-cream px-3 py-2 text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Restart</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFull((f) => !f);
              soundEngine.playPop(1.12);
            }}
            className="toy-btn-cream px-3 py-2 text-xs"
          >
            {full ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{full ? 'Exit fullscreen' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      <div
        ref={shellRef}
        className={
          full
            ? 'fixed inset-0 z-[80] flex flex-col bg-[#24160C] p-2'
            : 'relative overflow-hidden rounded-2xl border-2 border-b-[8px] border-[#4E2A0E] bg-[#24160C] p-1.5'
        }
        style={{ boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.08)' }}
      >
        {!loaded && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#24160C]/80">
            <span className="animate-pulse font-display text-sm font-bold text-[#FDE68A]">
              Loading {game.name}…
            </span>
          </div>
        )}
        <iframe
          key={`${game.id}-${nonce}`}
          ref={frameRef}
          src={`${import.meta.env.BASE_URL}games/${game.file}`}
          title={`${game.name} — playable game`}
          onLoad={() => setLoaded(true)}
          className={
            full
              ? 'h-full w-full flex-1 rounded-lg border-0 bg-black'
              : 'h-[clamp(380px,64vh,760px)] w-full rounded-lg border-0 bg-black'
          }
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads allow-popups"
          allow="autoplay; fullscreen; gamepad"
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[#8B5A2B]/80">
        <span className="inline-flex items-center gap-1">
          <Keyboard className="h-3 w-3" strokeWidth={3} /> Arrow keys / WASD in most titles
        </span>
        <span className="inline-flex items-center gap-1">
          <Trophy className="h-3 w-3" strokeWidth={3} /> Progress saves inside the sandbox
        </span>
        <span>Runs entirely from this device.</span>
      </p>
    </div>
  );
};

/* -------------------------------- the shelf ------------------------------- */

export const GameShelfTool: React.FC = () => {
  const [genre, setGenre] = useState<(typeof GENRES)[number]>('All');
  const [activeId, setActiveId] = useState<string | null>(null);

  const shown = useMemo(
    () => (genre === 'All' ? CARTRIDGES : CARTRIDGES.filter((g) => g.genre === genre)),
    [genre]
  );

  const active = activeId ? CARTRIDGES.find((g) => g.id === activeId) : undefined;

  if (active) {
    return <CartridgePlayer game={active} onExit={() => setActiveId(null)} />;
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Games & Fun arcade"
        icon={<Gamepad2 className="h-4 w-4" />}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#BBF7D0] bg-[#ECFDF5] px-2.5 py-1 text-[10.5px] font-bold text-[#15803D]">
            <ShieldCheck className="h-3 w-3" />
            {CARTRIDGES.length} local cartridges
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {GENRES.map((g) => {
            const on = genre === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setGenre(g);
                  soundEngine.playPop(1.08);
                }}
                aria-pressed={on}
                className={`rounded-xl border-2 border-b-[4px] px-3 py-1.5 font-display text-xs font-extrabold transition active:translate-y-[2px] active:border-b-2 ${
                  on
                    ? 'border-[#065F46] bg-[#10B981] text-white'
                    : 'border-[#D9B68C] bg-[#FFFDF9] text-[#8B5A2B] hover:border-[#10B981]'
                }`}
              >
                {g}
              </button>
            );
          })}
          <span className="ml-auto font-mono text-[11px] font-bold text-[#8B5A2B]/70">
            {shown.length.toString().padStart(2, '0')} shown
          </span>
        </div>
      </Panel>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((g, i) => (
          <motion.li
            key={g.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.3 }}
          >
            <button
              type="button"
              onClick={() => {
                setActiveId(g.id);
                soundEngine.playPop(1.14);
              }}
              className="group flex h-full w-full flex-col justify-between rounded-2xl border-2 border-b-[6px] border-[#D9B68C] bg-[#FFFDF9] p-4 text-left transition hover:-translate-y-1 hover:border-[#10B981] active:translate-y-[3px] active:border-b-[2px]"
            >
              <div>
                <div className="mb-2.5 flex items-start justify-between gap-2">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-b-[4px] text-xl transition-transform group-hover:scale-105"
                    style={{
                      borderColor: g.accent,
                      background: `${g.accent}1A`,
                    }}
                    aria-hidden
                  >
                    {g.emoji}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 font-display text-[10px] font-extrabold uppercase tracking-wide text-white"
                    style={{ backgroundColor: g.accent }}
                  >
                    {g.genre}
                  </span>
                </div>
                <h3 className="font-display text-base font-bold leading-snug text-[#3B2314] transition-colors group-hover:text-[#065F46]">
                  {g.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#6E4928]">{g.blurb}</p>
              </div>
              <span className="mt-3.5 inline-flex items-center gap-1 border-t border-[#F3DFC1] pt-2.5 font-display text-xs font-bold text-[#065F46] transition-transform group-hover:translate-x-0.5">
                <Sparkles className="h-3 w-3" strokeWidth={3} />
                Play now →
              </span>
            </button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
};

export default GameShelfTool;
