import React from 'react';
import type { CupboardId } from '../../registry/types';

/**
 * 8 Hand-Crafted 2.5D Toybox SVG Emblems mounted on each Cupboard's medallion.
 */
export const CupboardEmblem: React.FC<{ cupboardId: CupboardId; size?: number }> = ({
  cupboardId,
  size = 56,
}) => {
  switch (cupboardId) {
    case 'math':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="8" y="8" width="48" height="48" rx="13" fill="#FFFDF9" stroke="#7F1D1D" strokeWidth="3.2" />
          <rect x="13" y="13" width="17" height="17" rx="5" fill="#FEE2E2" stroke="#EF4444" strokeWidth="2" />
          <path d="M21.5 17.5V25.5M17.5 21.5H25.5" stroke="#B91C1C" strokeWidth="2.8" strokeLinecap="round" />
          <rect x="34" y="13" width="17" height="17" rx="5" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2" />
          <path d="M38.5 21.5H46.5" stroke="#B45309" strokeWidth="2.8" strokeLinecap="round" />
          <rect x="13" y="34" width="17" height="17" rx="5" fill="#FFEDD5" stroke="#F97316" strokeWidth="2" />
          <path d="M18.5 39.5L24.5 45.5M24.5 39.5L18.5 45.5" stroke="#C2410C" strokeWidth="2.6" strokeLinecap="round" />
          <rect x="34" y="34" width="17" height="17" rx="5" fill="#EF4444" stroke="#991B1B" strokeWidth="2" />
          <path d="M38.5 40.2H46.5M38.5 44.8H46.5" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
        </svg>
      );

    case 'coding':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="7" y="10" width="50" height="44" rx="11" fill="#1E293B" stroke="#14532D" strokeWidth="3.2" />
          <path d="M10 21H54" stroke="#334155" strokeWidth="2.5" />
          <circle cx="16" cy="15.5" r="2.3" fill="#F87171" />
          <circle cx="23" cy="15.5" r="2.3" fill="#FBBF24" />
          <circle cx="30" cy="15.5" r="2.3" fill="#4ADE80" />
          <path d="M17 31L25 37.5L17 44" stroke="#4ADE80" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M31 44H45" stroke="#FDE047" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      );

    case 'text-files':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="14" y="12" width="34" height="42" rx="7" transform="rotate(-6 14 12)" fill="#DBEAFE" stroke="#1E3A8A" strokeWidth="2.8" />
          <rect x="16" y="10" width="34" height="44" rx="7" fill="#FFFDF9" stroke="#1E3A8A" strokeWidth="3.2" />
          <path d="M23 22H43M23 30H43M23 38H36" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" />
          <circle cx="44" cy="44" r="9" fill="#FBBF24" stroke="#1E3A8A" strokeWidth="2.8" />
          <path d="M44 40V48M40.5 44.5L44 48L47.5 44.5" stroke="#1E3A8A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'art-design':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <path
            d="M32 10C18.5 10 8 19.8 8 32C8 44.2 18.2 54 30 54C34.2 54 37 51.2 37 47.6C37 45.7 36.2 44.2 36.2 42.8C36.2 40.6 38 39 40.5 39H45C51.6 39 56 34.4 56 27.8C56 17.5 45.2 10 32 10Z"
            fill="#FFFDF9"
            stroke="#78350F"
            strokeWidth="3.2"
          />
          <circle cx="21" cy="25" r="4.3" fill="#EF4444" />
          <circle cx="31" cy="20" r="4.3" fill="#F59E0B" />
          <circle cx="42" cy="24" r="4.3" fill="#22C55E" />
          <circle cx="20" cy="36" r="4.3" fill="#3B82F6" />
          <circle cx="29" cy="44" r="3.4" fill="#E6C79C" stroke="#78350F" strokeWidth="2" />
        </svg>
      );

    case 'video-editing':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="10" y="22" width="44" height="32" rx="7" fill="#2E1065" stroke="#4C1D95" strokeWidth="3.2" />
          <g transform="rotate(-10 10 22)">
            <rect x="10" y="13" width="44" height="10" rx="4" fill="#FFFDF9" stroke="#4C1D95" strokeWidth="3" />
            <path d="M18 23L23 13M30 23L35 13M42 23L47 13" stroke="#7C3AED" strokeWidth="3.5" />
          </g>
          <path d="M27 31L40 38.5L27 46V31Z" fill="#FDE047" stroke="#FFFDF9" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );

    case 'science-physics':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="32" cy="32" r="24" fill="#FFFDF9" stroke="#7C2D12" strokeWidth="3" />
          <ellipse cx="32" cy="32" rx="20" ry="8.5" transform="rotate(30 32 32)" stroke="#F97316" strokeWidth="2.8" />
          <ellipse cx="32" cy="32" rx="20" ry="8.5" transform="rotate(-30 32 32)" stroke="#EA580C" strokeWidth="2.8" />
          <ellipse cx="32" cy="32" rx="20" ry="8.5" transform="rotate(90 32 32)" stroke="#FB923C" strokeWidth="2.4" />
          <circle cx="32" cy="32" r="5" fill="#EF4444" stroke="#7C2D12" strokeWidth="2.2" />
        </svg>
      );

    case 'music-composing':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="9" y="9" width="46" height="46" rx="13" fill="#FFFDF9" stroke="#831843" strokeWidth="3.2" />
          <path d="M26 42V21L45 17V38" stroke="#DB2777" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M26 26L45 22" stroke="#F472B6" strokeWidth="3" />
          <ellipse cx="21.5" cy="43" rx="5.5" ry="4.5" fill="#EC4899" stroke="#831843" strokeWidth="2.4" />
          <ellipse cx="40.5" cy="39" rx="5.5" ry="4.5" fill="#F59E0B" stroke="#831843" strokeWidth="2.4" />
        </svg>
      );

    case 'games':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <path
            d="M16 20H48C53 20 57 25 56 32L54 45C53.2 49.5 48.5 51 45 47.5L40 42H24L19 47.5C15.5 51 10.8 49.5 10 45L8 32C7 25 11 20 16 20Z"
            fill="#FFFDF9"
            stroke="#064E3B"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
          <path d="M20 27V37M15 32H25" stroke="#059669" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="42" cy="29" r="3.2" fill="#EF4444" />
          <circle cx="47" cy="34" r="3.2" fill="#F59E0B" />
          <circle cx="37" cy="34" r="3.2" fill="#3B82F6" />
        </svg>
      );
  }
};
