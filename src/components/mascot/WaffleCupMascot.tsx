import React, { useEffect, useState } from 'react';

interface WaffleCupMascotProps {
  size?: number;
  className?: string;
  showSteam?: boolean;
  showSaucer?: boolean;
  interactive?: boolean;
  mood?: 'happy' | 'excited' | 'thinking';
}

/**
 * Custom 2.5D Pastel Ceramic Waffle Coffee Cup Mascot:
 * - Warm ivory-peach glazed ceramic mug with glossy highlights & saucer
 * - Rich roasted coffee with latte heart swirl
 * - Crispy golden square waffle wedge + melting butter pat + syrup drop perched on rim
 * - Blinking eyes with sparkles, rosy cheeks, cute smile, and animated rising steam curls
 */
export const WaffleCupMascot: React.FC<WaffleCupMascotProps> = ({
  size = 180,
  className = '',
  showSteam = true,
  showSaucer = true,
  interactive = false,
  mood = 'happy',
}) => {
  const [blinking, setBlinking] = useState(false);
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let blinkTimeout: number;
    const scheduleBlink = () => {
      const delay = 2600 + Math.random() * 2400;
      blinkTimeout = window.setTimeout(() => {
        setBlinking(true);
        window.setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 150);
      }, delay);
    };
    scheduleBlink();
    return () => window.clearTimeout(blinkTimeout);
  }, []);

  useEffect(() => {
    if (!interactive) return;
    const handleMove = (e: MouseEvent) => {
      const nx = (e.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      const ny = (e.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
      setPupilOffset({
        x: Math.max(-2.4, Math.min(2.4, nx * 2.4)),
        y: Math.max(-1.8, Math.min(1.8, ny * 1.8)),
      });
    };
    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMove);
  }, [interactive]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 220 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Waffle Coffee Cup Mascot"
    >
      <defs>
        <linearGradient id="mugBodyGrad" x1="52" y1="88" x2="152" y2="184" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFDF9" />
          <stop offset="58%" stopColor="#FFF3E0" />
          <stop offset="100%" stopColor="#F5D7B2" />
        </linearGradient>
        <linearGradient id="saucerGrad" x1="34" y1="172" x2="176" y2="198" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFDF8" />
          <stop offset="65%" stopColor="#F8E2C4" />
          <stop offset="100%" stopColor="#E4BE90" />
        </linearGradient>
        <linearGradient id="coffeeGrad" x1="60" y1="84" x2="146" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5C3216" />
          <stop offset="55%" stopColor="#7C4621" />
          <stop offset="100%" stopColor="#9A5B2D" />
        </linearGradient>
        <linearGradient id="waffleGrad" x1="115" y1="32" x2="178" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCD34D" />
          <stop offset="55%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        <linearGradient id="syrupGrad" x1="128" y1="40" x2="165" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>
      </defs>

      {/* Ambient ground shadow */}
      {showSaucer && <ellipse cx="104" cy="199" rx="72" ry="11" fill="#8B5A2B" opacity="0.22" />}

      {/* Rising animated cozy steam curls */}
      {showSteam && (
        <g strokeLinecap="round" fill="none">
          <path
            className="animate-steam-1"
            d="M74 68 C67 57, 81 47, 73 34 C69 27, 75 21, 78 16"
            stroke="#FFFFFF"
            strokeWidth="5.5"
            opacity="0.82"
          />
          <path
            className="animate-steam-2"
            d="M98 63 C91 50, 106 40, 97 26 C94 20, 100 14, 103 10"
            stroke="#FFF8EB"
            strokeWidth="6"
            opacity="0.85"
          />
          <path
            className="animate-steam-3"
            d="M119 66 C114 55, 126 47, 119 35"
            stroke="#FFFFFF"
            strokeWidth="4.5"
            opacity="0.7"
          />
        </g>
      )}

      {/* Pastel Ceramic Saucer */}
      {showSaucer && (
        <g>
          <ellipse
            cx="104"
            cy="185"
            rx="68"
            ry="15"
            fill="url(#saucerGrad)"
            stroke="#6B3A19"
            strokeWidth="4.5"
          />
          <ellipse cx="104" cy="183" rx="45" ry="8" fill="#EBD0AE" opacity="0.7" />
          <path
            d="M48 182 C62 191, 146 191, 160 182"
            stroke="#FFFFFF"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.75"
          />
        </g>
      )}

      {/* Chunky Ceramic Mug Handle */}
      <g>
        <path
          d="M150 112 H164 C179 112, 185 123, 185 135 C185 148, 177 159, 161 159 H146"
          stroke="#6B3A19"
          strokeWidth="19"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M150 112 H164 C179 112, 185 123, 185 135 C185 148, 177 159, 161 159 H146"
          stroke="#FCE7CC"
          strokeWidth="10.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M156 110 H164 C174 110, 180 116, 182 125"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
      </g>

      {/* Mug Body */}
      <path
        d="M52 92 H156 V136 C156 166, 134 185, 104 185 C74 185, 52 166, 52 136 V92 Z"
        fill="url(#mugBodyGrad)"
        stroke="#6B3A19"
        strokeWidth="5"
        strokeLinejoin="round"
      />

      {/* Strawberry-Cream Decorative Cafe Stripe Near Bottom */}
      <path
        d="M59 158 C78 166, 130 166, 149 158"
        stroke="#FCA5A5"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.7"
      />

      {/* Glossy Left Highlight on Ceramic */}
      <path
        d="M64 108 V136 C64 148, 69 158, 76 164"
        stroke="#FFFFFF"
        strokeWidth="6.5"
        strokeLinecap="round"
        opacity="0.88"
      />
      <circle cx="64" cy="100" r="3.2" fill="#FFFFFF" opacity="0.9" />

      {/* Mug Rim & Rich Coffee Pool */}
      <ellipse
        cx="104"
        cy="92"
        rx="52"
        ry="15.5"
        fill="#FFFDF9"
        stroke="#6B3A19"
        strokeWidth="5"
      />
      <ellipse cx="104" cy="93" rx="44" ry="11" fill="url(#coffeeGrad)" />

      {/* Cute Latte Art Foam Swirl */}
      <path
        d="M84 93 C84 88, 93 88, 95 92 C97 88, 106 88, 106 93 C106 98, 95 101, 95 101 C95 101, 84 98, 84 93 Z"
        fill="#FDE8C9"
        opacity="0.78"
      />

      {/* Crispy Golden Square Waffle Wedge Perched Playfully on Right Rim */}
      <g transform="rotate(21 146 66)">
        {/* Waffle 3D side crust */}
        <rect
          x="118"
          y="39"
          width="58"
          height="58"
          rx="11"
          fill="#B45309"
          stroke="#6B3A19"
          strokeWidth="4.5"
        />
        {/* Waffle golden face */}
        <rect
          x="114"
          y="34"
          width="58"
          height="58"
          rx="11"
          fill="url(#waffleGrad)"
          stroke="#6B3A19"
          strokeWidth="4.5"
        />
        {/* 3x3 Waffle Grid Pockets */}
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => (
            <g key={`${row}-${col}`}>
              <rect
                x={122 + col * 15}
                y={42 + row * 15}
                width="11"
                height="11"
                rx="2.6"
                fill="#C2640A"
              />
              <rect
                x={123.5 + col * 15}
                y={43.5 + row * 15}
                width="9"
                height="9"
                rx="2"
                fill="#E07C12"
              />
            </g>
          ))
        )}
        {/* Maple Syrup Drizzle */}
        <path
          d="M126 42 C136 39, 152 40, 160 47 C163 50, 158 56, 156 62 C154 66, 150 64, 150 58 C147 60, 143 68, 139 66 C135 64, 138 55, 133 54 C128 53, 123 46, 126 42 Z"
          fill="url(#syrupGrad)"
          opacity="0.88"
        />
        {/* Pat of Melting Golden Butter */}
        <rect
          x="133"
          y="43"
          width="18"
          height="15"
          rx="4"
          transform="rotate(-8 142 50)"
          fill="#FEF08A"
          stroke="#78350F"
          strokeWidth="3"
        />
        <path
          d="M136 46 H146"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>

      {/* Overlap Rim Front Clip so Waffle Sits Snugly IN the Mug Rim */}
      <path
        d="M112 107 C134 106, 152 100, 156 93"
        stroke="#FFFDF9"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M110 107.2 C134 106.5, 152 100.5, 156 93"
        stroke="#6B3A19"
        strokeWidth="4.8"
        strokeLinecap="round"
      />

      {/* Rosy Pastel Cheeks */}
      <ellipse cx="75" cy="143" rx="9.5" ry="5.8" fill="#FDA4AF" opacity="0.85" />
      <ellipse cx="133" cy="143" rx="9.5" ry="5.8" fill="#FDA4AF" opacity="0.85" />

      {/* Expressive Blinking Eyes */}
      {blinking ? (
        <g stroke="#3B2314" strokeWidth="4.2" strokeLinecap="round" fill="none">
          <path d="M79 133 Q85 138 91 133" />
          <path d="M117 133 Q123 138 129 133" />
        </g>
      ) : mood === 'excited' ? (
        <g stroke="#3B2314" strokeWidth="4.4" strokeLinecap="round" fill="none">
          <path d="M79 135 Q85 126 91 135" />
          <path d="M117 135 Q123 126 129 135" />
        </g>
      ) : (
        <g>
          <g transform={`translate(${pupilOffset.x}, ${pupilOffset.y})`}>
            <circle cx="85" cy="132" r="6.8" fill="#3B2314" />
            <circle cx="82.7" cy="129.6" r="2.6" fill="#FFFFFF" />
            <circle cx="87.5" cy="134.8" r="1.2" fill="#FFFFFF" />

            <circle cx="123" cy="132" r="6.8" fill="#3B2314" />
            <circle cx="120.7" cy="129.6" r="2.6" fill="#FFFFFF" />
            <circle cx="125.5" cy="134.8" r="1.2" fill="#FFFFFF" />
          </g>
        </g>
      )}

      {/* Happy Little Smile */}
      {mood === 'thinking' ? (
        <circle cx="104" cy="143" r="4" fill="#7F1D1D" stroke="#3B2314" strokeWidth="2.8" />
      ) : mood === 'excited' ? (
        <g>
          <path
            d="M95 139 H113 C113 149, 95 149, 95 139 Z"
            fill="#991B1B"
            stroke="#3B2314"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
          <ellipse cx="104" cy="145" rx="5" ry="2.6" fill="#FB7185" />
        </g>
      ) : (
        <path
          d="M96 139 Q104 148 112 139"
          stroke="#3B2314"
          strokeWidth="3.8"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* Ambient Mini Sparkles */}
      <g className="animate-twinkle" style={{ transformOrigin: '36px 76px' }}>
        <path
          d="M36 66 L38.5 73.5 L46 76 L38.5 78.5 L36 86 L33.5 78.5 L26 76 L33.5 73.5 Z"
          fill="#FBBF24"
          stroke="#92400E"
          strokeWidth="1.5"
        />
      </g>
      <g className="animate-twinkle" style={{ transformOrigin: '188px 82px', animationDelay: '1.1s' }}>
        <path
          d="M188 74 L190 80 L196 82 L190 84 L188 90 L186 84 L180 82 L186 80 Z"
          fill="#FDE047"
          stroke="#92400E"
          strokeWidth="1.4"
        />
      </g>
    </svg>
  );
};
