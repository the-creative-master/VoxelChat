import type { ComponentType, LazyExoticComponent } from 'react';

export type CupboardId =
  | 'math'
  | 'coding'
  | 'text-files'
  | 'art-design'
  | 'video-editing'
  | 'science-physics'
  | 'music-composing'
  | 'games';

export interface CupboardPalette {
  base: string;
  highlight: string;
  shadow: string;
  surface: string;
  badgeText: string;
  flavorName: string;
}

export interface CupboardDefinition {
  id: CupboardId;
  number: number;
  name: string;
  shortName: string;
  tagline: string;
  palette: CupboardPalette;
  itemCount: number;
  itemLabel: 'Tools' | 'Games';
  hasStarTool: boolean;
  unlocked: boolean;
  starPreviewName?: string;
  upcomingHighlights?: string[];
}

export interface ToolDefinition {
  id: string;
  cupboardId: CupboardId;
  name: string;
  shortDescription: string;
  isStar?: boolean;
  iconName: string;
  tags: string[];
  component: LazyExoticComponent<ComponentType>;
}

export interface GameDefinition {
  id: string;
  cupboardId: 'games';
  name: string;
  category:
    | 'fancade-physics'
    | 'life-idle'
    | 'flash-action'
    | 'puzzles-logic'
    | 'retro-tabletop';
  shortDescription: string;
  tags: string[];
  embedUrl?: string;
  component: LazyExoticComponent<ComponentType>;
}
