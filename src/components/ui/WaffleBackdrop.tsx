import React, { useEffect, useState } from 'react';

interface ParticleSpec {
  id: number;
  x: number;
  y: number;
  size: number;
  depth: number;
  kind: 'crumb' | 'sparkle' | 'steam';
  rotate: number;
  delay: number;
}

const AMBIENT_PARTICLES: ParticleSpec[] = [
  { id: 1, x: 7, y: 16, size: 11, depth: 18, kind: 'crumb', rotate: 18, delay: 0 },
  { id: 2, x: 91, y: 14, size: 18, depth: 24, kind: 'sparkle', rotate: 0, delay: 0.4 },
  { id: 3, x: 16, y: 46, size: 15, depth: 14, kind: 'sparkle', rotate: 10, delay: 1.2 },
  { id: 4, x: 84, y: 38, size: 9, depth: 20, kind: 'crumb', rotate: -24, delay: 0.7 },
  { id: 5, x: 6, y: 76, size: 13, depth: 22, kind: 'crumb', rotate: 42, delay: 1.5 },
  { id: 6, x: 94, y: 68, size: 10, depth: 16, kind: 'crumb', rotate: -14, delay: 0.9 },
  { id: 7, x: 26, y: 84, size: 16, depth: 26, kind: 'sparkle', rotate: 0, delay: 2.1 },
  { id: 8, x: 74, y: 82, size: 14, depth: 18, kind: 'sparkle', rotate: 0, delay: 1.7 },
  { id: 9, x: 48, y: 11, size: 14, depth: 12, kind: 'sparkle', rotate: 0, delay: 0.2 },
  { id: 10, x: 12, y: 28, size: 64, depth: 10, kind: 'steam', rotate: 0, delay: 0.5 },
  { id: 11, x: 86, y: 24, size: 72, depth: 12, kind: 'steam', rotate: 0, delay: 1.6 },
  { id: 12, x: 62, y: 18, size: 8, depth: 15, kind: 'crumb', rotate: 31, delay: 1.1 },
];

/**
 * Embossed 2.5D Waffle-Iron Wall Backdrop with subtle cursor-reactive parallax layers:
 * warm morning sunbeams, floating golden waffle crumbs, soft steam wisps, and sparkles.
 */
export const WaffleBackdrop: React.FC = () => {
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let raf = 0;
    const handleMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = e.clientX / Math.max(window.innerWidth, 1) - 0.5;
        const ny = e.clientY / Math.max(window.innerHeight, 1) - 0.5;
        setCursor({ x: nx, y: ny });
      });
    };
    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 waffle-wall-surface"
      aria-hidden="true"
    >
      {/* Warm Sun-Drenched Kitchen Window Glow */}
      <div
        className="absolute -top-36 left-1/2 -translate-x-1/2 w-[1100px] h-[520px] rounded-full opacity-55 transition-transform duration-300 ease-out"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(254, 240, 138, 0.52) 0%, rgba(253, 224, 71, 0.16) 45%, transparent 72%)',
          transform: `translate(calc(-50% + ${cursor.x * -18}px), ${cursor.y * -12}px)`,
        }}
      />

      {/* Diagonal Morning Sunbeam Rays */}
      <div
        className="absolute -top-24 -left-20 w-[55vw] h-[85vh] opacity-25 rotate-[18deg]"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255, 251, 235, 0.9) 35%, transparent 65%)',
        }}
      />

      {/* Parallax Golden Crumbs, Soft Steam Wisps & Sparkles */}
      {AMBIENT_PARTICLES.map((p) => {
        const tx = cursor.x * -p.depth;
        const ty = cursor.y * -p.depth;

        return (
          <div
            key={p.id}
            className="absolute transition-transform duration-300 ease-out"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              transform: `translate3d(${tx}px, ${ty}px, 0)`,
            }}
          >
            {p.kind === 'crumb' && (
              <div
                className="rounded-[4px] border border-[#B45309]/50 bg-gradient-to-br from-[#FCD34D] to-[#D97706] shadow-sm opacity-65"
                style={{
                  width: p.size,
                  height: p.size,
                  transform: `rotate(${p.rotate}deg)`,
                }}
              />
            )}
            {p.kind === 'sparkle' && (
              <svg
                width={p.size}
                height={p.size}
                viewBox="0 0 24 24"
                className="animate-twinkle opacity-75"
                style={{ animationDelay: `${p.delay}s` }}
              >
                <path
                  d="M12 1 L14.5 9.5 L23 12 L14.5 14.5 L12 23 L9.5 14.5 L1 12 L9.5 9.5 Z"
                  fill="#FBBF24"
                  stroke="#B45309"
                  strokeWidth="1.2"
                />
              </svg>
            )}
            {p.kind === 'steam' && (
              <div
                className="rounded-full bg-white/50 blur-xl animate-gentle-float"
                style={{
                  width: p.size,
                  height: p.size * 1.35,
                  animationDelay: `${p.delay}s`,
                }}
              />
            )}
          </div>
        );
      })}

      {/* Soft Cozy Edge Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, transparent 58%, rgba(180, 120, 60, 0.12) 100%)',
        }}
      />
    </div>
  );
};
