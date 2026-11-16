import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Github, ShieldCheck, Sparkles, Utensils } from 'lucide-react';
import { WaffleCupMascot } from '../mascot/WaffleCupMascot';
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
      exit={{ opacity: 0, scale: 1.12, filter: 'blur(4px)' }}
      transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
      className="relative z-10 min-h-screen flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Top Cozy Cafe Awning Scallops */}
      <div className="w-full overflow-hidden pointer-events-none">
        <div
          className="h-5 sm:h-6 w-full border-b-[4px] border-[#991B1B]"
          style={{
            background:
              'repeating-linear-gradient(90deg, #EF4444 0px, #EF4444 36px, #FFFDF7 36px, #FFFDF7 72px)',
          }}
        />
        <div className="flex w-full overflow-hidden opacity-90 -mt-[1px]">
          {Array.from({ length: 44 }).map((_, idx) => (
            <div
              key={idx}
              className={`h-3.5 w-9 shrink-0 rounded-b-full border-b-[3px] border-x ${
                idx % 2 === 0
                  ? 'bg-[#EF4444] border-[#991B1B]'
                  : 'bg-[#FFFDF7] border-[#D9B68C]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main Splash Centerpiece */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center max-w-4xl mx-auto">
        {/* Top Zero-BS Ribbon Pill */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          className="toy-pill bg-[#FFFDF8] border-[#D9B68C] text-[#78350F] mb-2 shadow-toy-sm"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
          <span>100% Browser-Local • Zero Paywalls • Zero Ads • Zero Uploads</span>
        </motion.div>

        {/* Adorable Animated 2.5D Waffle Coffee Cup Mascot */}
        <motion.div
          initial={{ scale: 0.65, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: [0, -7, 0], opacity: 1 }}
          transition={{
            scale: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] },
            opacity: { duration: 0.4 },
            y: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' },
          }}
          whileHover={{ scale: 1.06, rotate: [-1.5, 1.5, 0] }}
          onClick={() => soundEngine.playPop(1.15)}
          className="cursor-pointer drop-shadow-[0_14px_20px_rgba(110,60,20,0.2)] -mb-2"
          title="Good morning! Ready to cook up something awesome?"
        >
          <WaffleCupMascot
            size={215}
            showSteam
            showSaucer
            interactive
            mood={hoveringLaunch ? 'excited' : 'happy'}
          />
        </motion.div>

        {/* Chunky Multi-Layer 2.5D / 3D-Extruded Title Banner */}
        <motion.div
          initial={{ scale: 0.84, opacity: 0, y: 18 }}
          animate={{ scale: 1, opacity: 1, y: [0, -5, 0] }}
          transition={{
            scale: { delay: 0.14, duration: 0.55, ease: [0.34, 1.56, 0.64, 1] },
            opacity: { delay: 0.14, duration: 0.4 },
            y: { delay: 0.5, duration: 4.1, repeat: Infinity, ease: 'easeInOut' },
          }}
          className="relative mb-5"
        >
          {/* Decorative Wooden Nameplate Backing */}
          <div className="relative px-6 sm:px-10 py-4 sm:py-5 rounded-[2rem] bg-gradient-to-b from-[#FFEBC7] via-[#F7D7A3] to-[#E9BA79] border-[3px] border-b-[9px] border-[#8B5220] shadow-toy-lg">
            {/* Corner brass rivets */}
            <span className="absolute top-3 left-3.5 w-3 h-3 rounded-full bg-gradient-to-br from-[#FEF08A] to-[#B45309] border border-[#78350F]" />
            <span className="absolute top-3 right-3.5 w-3 h-3 rounded-full bg-gradient-to-br from-[#FEF08A] to-[#B45309] border border-[#78350F]" />
            <span className="absolute bottom-3 left-3.5 w-3 h-3 rounded-full bg-gradient-to-br from-[#FEF08A] to-[#B45309] border border-[#78350F]" />
            <span className="absolute bottom-3 right-3.5 w-3 h-3 rounded-full bg-gradient-to-br from-[#FEF08A] to-[#B45309] border border-[#78350F]" />

            <h1 className="leading-[0.98] tracking-tight">
              <span className="block splash-title-3d text-4xl sm:text-6xl md:text-7xl">
                BITE SIZED
              </span>
              <span className="block splash-title-accent text-4xl sm:text-6xl md:text-[4.35rem] mt-1">
                UTILITIES
              </span>
            </h1>
          </div>
        </motion.div>

        {/* Creator Credit 2.5D Pill Button (Required Direct Attribution Link) */}
        <motion.a
          href="https://github.com/the-creative-master"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => soundEngine.playPop(1.08)}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.24, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          className="group inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#FFFDF9] hover:bg-[#FEF3C7]
                     border-2 border-b-[5px] border-[#C98A4B] text-[#4A2506] font-display font-semibold text-sm sm:text-base
                     shadow-toy transition-all active:translate-y-[3px] active:border-b-[2px] mb-7"
        >
          <span className="w-7 h-7 rounded-full bg-[#3B2314] text-[#FFF8EB] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Github className="w-4 h-4" />
          </span>
          <span>Made by the-creative-master, check out my GitHub account!</span>
          <ExternalLink className="w-4 h-4 text-[#B45309] shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </motion.a>

        {/* Bouncy Primary Launch Button ("Open the Kitchen!") */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 18 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
          className="flex flex-col items-center gap-3"
        >
          <motion.button
            type="button"
            onClick={handleLaunchClick}
            onMouseEnter={() => {
              setHoveringLaunch(true);
              soundEngine.playHover();
            }}
            onMouseLeave={() => setHoveringLaunch(false)}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.97, y: 4 }}
            transition={{ type: 'spring', stiffness: 450, damping: 18 }}
            className="relative inline-flex items-center gap-3 px-9 sm:px-11 py-4 sm:py-4.5 rounded-2xl
                       bg-gradient-to-b from-[#FF7070] via-[#EF4444] to-[#DC2626]
                       text-white font-display font-bold text-xl sm:text-2xl tracking-wide
                       border-[3px] border-b-[8px] border-[#881313]
                       active:border-b-[3px] cursor-pointer"
            style={{
              boxShadow:
                'inset 0 3px 0 rgba(255,255,255,0.55), 0 12px 26px rgba(185, 28, 28, 0.35)',
              textShadow: '0 2px 0 rgba(120, 14, 14, 0.55)',
            }}
          >
            <Utensils className="w-6 h-6 text-[#FEF08A]" />
            <span>Open the Kitchen!</span>
            <Sparkles className="w-6 h-6 text-[#FEF08A]" />
          </motion.button>

          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-[#7C4D25]">
            <span>or press</span>
            <kbd className="px-2.5 py-0.5 rounded-lg bg-[#FFFDF8] border-2 border-b-[3px] border-[#D4AA78] font-mono text-xs font-bold text-[#4A2506]">
              Enter ↵
            </kbd>
            <span>to step right in</span>
          </div>
        </motion.div>
      </div>

      {/* Bottom Cozy Honey-Oak Countertop Ledge */}
      <div className="w-full wood-shelf-surface border-t-[4px] border-[#9A5F28] py-3 px-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs font-semibold text-[#5C3415]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] border border-[#7F1D1D]" />
          Math &amp; Numbers (15 Live Tools)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E] border border-[#14532D]" />
          Coding &amp; Developing (15 Live Tools + 32-Lang IDE)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] border border-[#78350F]" />
          WaffleChat Browser-Local AI Companion
        </span>
      </div>
    </motion.div>
  );
};
