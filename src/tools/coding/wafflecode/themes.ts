import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

/** Custom WaffleCode Theme 1: Waffle Roast Dark */
const waffleRoastEditor = EditorView.theme(
  {
    '&': {
      color: '#FDF3E1',
      backgroundColor: '#1F150E',
      fontSize: '13.5px',
      fontFamily: '"JetBrains Mono", monospace',
      height: '100%',
    },
    '.cm-content': {
      caretColor: '#FBBF24',
      padding: '12px 0',
      fontFamily: '"JetBrains Mono", monospace',
      fontVariantLigatures: 'contextual common-ligatures',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#FBBF24', borderLeftWidth: '2.2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(245, 158, 11, 0.28)',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 232, 195, 0.055)' },
    '.cm-gutters': {
      backgroundColor: '#18100A',
      color: '#8C6B4F',
      borderRight: '1px solid #382518',
      fontFamily: '"JetBrains Mono", monospace',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#2A1C12',
      color: '#FDE68A',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(74, 222, 128, 0.25)',
      outline: '1px solid #4ADE80',
    },
  },
  { dark: true }
);

const waffleRoastHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.moduleKeyword], color: '#FB923C', fontWeight: '700' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: '#FDF3E1' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: '#FDE047', fontWeight: '600' },
  { tag: [t.propertyName], color: '#93C5FD' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#F9A8D4' },
  { tag: [t.definition(t.name), t.separator], color: '#FDE68A' },
  { tag: [t.typeName, t.className, t.namespace], color: '#6EE7B7', fontWeight: '600' },
  { tag: [t.number, t.changed, t.annotation, t.modifier, t.self], color: '#FCA5A5' },
  { tag: [t.operator, t.operatorKeyword], color: '#FDBA74' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#86EFAC' },
  { tag: [t.meta, t.comment], color: '#9C7B5E', fontStyle: 'italic' },
  { tag: [t.bool, t.atom], color: '#C4B5FD', fontWeight: '600' },
  { tag: [t.tagName], color: '#FB7185', fontWeight: '600' },
  { tag: [t.attributeName], color: '#FCD34D' },
  { tag: [t.heading], color: '#FDE047', fontWeight: '700' },
]);

/** Custom WaffleCode Theme 2: Creamy Latte Light */
const creamyLatteEditor = EditorView.theme(
  {
    '&': {
      color: '#3B2314',
      backgroundColor: '#FFFDF8',
      fontSize: '13.5px',
      fontFamily: '"JetBrains Mono", monospace',
      height: '100%',
    },
    '.cm-content': {
      caretColor: '#C2410C',
      padding: '12px 0',
      fontFamily: '"JetBrains Mono", monospace',
      fontVariantLigatures: 'contextual common-ligatures',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#C2410C', borderLeftWidth: '2.2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(251, 191, 36, 0.35)',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(243, 223, 193, 0.42)' },
    '.cm-gutters': {
      backgroundColor: '#FAF0DF',
      color: '#9C7856',
      borderRight: '1px solid #E6C79C',
      fontFamily: '"JetBrains Mono", monospace',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#F3DFC1',
      color: '#5C3415',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(34, 197, 94, 0.22)',
      outline: '1px solid #16A34A',
    },
  },
  { dark: false }
);

const creamyLatteHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.moduleKeyword], color: '#B91C1C', fontWeight: '700' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#9A3412', fontWeight: '600' },
  { tag: [t.propertyName], color: '#1D4ED8' },
  { tag: [t.typeName, t.className, t.namespace], color: '#047857', fontWeight: '600' },
  { tag: [t.number, t.bool, t.atom], color: '#7C3AED', fontWeight: '600' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#15803D' },
  { tag: [t.operator], color: '#B45309' },
  { tag: [t.meta, t.comment], color: '#9A7B5C', fontStyle: 'italic' },
  { tag: [t.tagName], color: '#BE123C', fontWeight: '600' },
  { tag: [t.attributeName], color: '#B45309' },
  { tag: [t.heading], color: '#9A3412', fontWeight: '700' },
]);

export const waffleRoastDarkTheme: Extension = [
  waffleRoastEditor,
  syntaxHighlighting(waffleRoastHighlight),
];

export const creamyLatteLightTheme: Extension = [
  creamyLatteEditor,
  syntaxHighlighting(creamyLatteHighlight),
];
