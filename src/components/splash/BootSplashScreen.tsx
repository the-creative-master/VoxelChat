import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Github, ShieldCheck, Sparkles, Utensils } from 'lucide-react';
import { WaffleCupMascot } from '../mascot/WaffleCupMascot';
import { KitchenScene } from '../ui/KitchenScene';
import { soundEngine } from '../../utils/soundEngine';

interface BootSplashScreenProps {
  onLaunch: () => void;
}

/**
 * Phase 0: The "Bite-Sized Morning" Boot Splash Screen
 * - Custom animated 2.5D Waffle Coffee Cup Mascot
 * - Chunky 3D-extruded "BITE SIZED UTILITIES" floating display banner
 * - Creator Credit Pill linking to https://github.com/the-creative-master
 * - Bouncy "Open the Kitchen!" primary CTA + Enter shortcut
 */
export const BootSplashScreen: React.FC<BootSplashScreenProps> = ({ onLaunch }) => {
  const [hoveringLaunch, setHoveringLaunch] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'a') return;
        e.preventDefault();
        soundEngine.playSplashLaunch();
        onLaunch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onLaunch]);

  const handleLaunchClick = () => {
    soundEngine.playSplashLaunch();
    onLaunch();
  };

  return (
    <motion.div
      key="boot-splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(3px)' }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      className="paper-surface relative z-10 min-h-screen select-none overflow-hidden"
    >
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1080px] flex-col px-6 py-10 sm:px-10">
        {/* top ribbon */}
        <motion.div
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.06, duration: 0.45 }}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7db] pb-5"
        >
          <span className="font-serif text-[20px] tracking-[-0.6px] text-[#253f31]">
            BiteSized<span className="ml-1.5 font-sans text-[9px] uppercase tracking-[3px] text-[#8b9a7c]">utilities</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[#8b9a7c]">
            <ShieldCheck className="h-3 w-3" strokeWidth={1.8} />
            100% browser-local · no uploads
          </span>
        </motion.div>

        {/* centre */}
        <div className="flex flex-1 flex-col items-start justify-center gap-8 py-10 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="eyebrow"
            >
              Good morning
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              className="mt-5 text-[clamp(38px,6vw,66px)] leading-[1.04] tracking-[-2.2px] text-[#253f31]"
            >
              A little tool
              <br />
              for <em className="italic text-[#67844f]">everything.</em>
              <span className="ml-3 inline-block align-top text-[26px] text-[#d28253]" style={{ transform: 'rotate(17deg)' }} aria-hidden>
                ✳
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.24, duration: 0.5 }}
              className="mt-5 max-w-md text-[14px] leading-relaxed text-[#6d7c62]"
            >
              Sixty little utilities and a handful of arcade games, all running in your browser.
              No sign-up, no uploads, no nonsense.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.45 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <motion.button
                type="button"
                onClick={handleLaunchClick}
                onMouseEnter={() => {
                  setHoveringLaunch(true);
                  soundEngine.playHover();
                }}
                onMouseLeave={() => setHoveringLaunch(false)}
                whileHover={{ y: -2 }}
                whileTap={{ y: 1 }}
                className="inline-flex h-[46px] items-center gap-2 rounded-[9px] border border-[#3d5544]
                           bg-[#3d5544] px-6 text-[13px] font-medium text-[#faf9ed]
                           transition-colors hover:bg-[#203f2d]"
              >
                <Utensils className="h-4 w-4 text-[#dbe7cd]" strokeWidth={1.8} />
                Open the kitchen
                <Sparkles className="h-4 w-4 text-[#dbe7cd]" strokeWidth={1.8} />
              </motion.button>

              <span className="inline-flex items-center gap-2 text-[11.5px] text-[#8b9a83]">
                or press
                <kbd className="rounded border border-[#e3e5d8] bg-[#f4f5ec] px-2 py-0.5 font-mono text-[10px] text-[#6d7c62]">
                  Enter ↵
                </kbd>
              </span>
            </motion.div>

            <motion.a
              href="https://github.com/the-creative-master"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => soundEngine.playPop(1.08)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.45 }}
              className="group mt-7 inline-flex items-center gap-2 text-[11px] text-[#8b9a7c] transition-colors hover:text-[#4c6152]"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#eef0e4] text-[#5c6f50]">
                <Github className="h-3 w-3" />
              </span>
              Made by the-creative-master, check out my GitHub account!
              <ExternalLink className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </motion.a>
          </div>

          {/* mascot on a soft plate, with the scene behind */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative w-full max-w-[420px] shrink-0 lg:ml-auto"
          >
            <div className="relative overflow-hidden rounded-[18px] border border-[#e2e5d6] bg-[#eeefe2]">
              <KitchenScene note="a pinch of possibility." />
              <div className="relative flex items-end justify-center px-6 pb-5 pt-10">
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
                  whileHover={{ scale: 1.04 }}
                  onClick={() => soundEngine.playPop(1.15)}
                  className="cursor-pointer"
                  title="Good morning! Ready to cook up something useful?"
                >
                  <WaffleCupMascot
                    size={150}
                    showSteam
                    showSaucer
                    interactive
                    mood={hoveringLaunch ? 'excited' : 'happy'}
                  />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* footer strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7db] pt-5 text-[10.5px] text-[#9aa58c]">
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            {[
              ['Math & Numbers', '#EF4444'],
              ['Coding', '#22C55E'],
              ['Text & Files', '#3B82F6'],
              ['Games', '#10B981'],
            ].map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </span>
          <span>Everything stays on your device.</span>
        </div>
      </div>
    </motion.div>
  );
};

export default BootSplashScreen;
