/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WaffleCode C-family / block-language interpreter.
 * A single interpreter with per-language dialects covers:
 *   C, C++, C#, Java, Kotlin, Rust, Go, Swift, Dart, Zig, PHP, Perl, Julia, R,
 *   Lua, Luau, Ruby, Bash.
 * It parses real source (types, classes, control flow, functions) and executes it
 * locally against a small standard library. No compilation servers, no network.
 */
import {
  Val, RtError, OutSink, BreakSignal, ContinueSignal, ReturnSignal,
  truthy, toStr, toNum, toInt, numStr, printfFormat, jsEq,
} from './core';

export type Dialect =
  | 'c' | 'cpp' | 'csharp' | 'java' | 'kotlin' | 'rust' | 'go' | 'swift' | 'dart' | 'zig'
  | 'php' | 'perl' | 'julia' | 'r' | 'lua' | 'luau' | 'ruby' | 'bash';

export interface DialectSpec {
  swiftInterp?: boolean;
  semi: boolean;
  endBlocks: boolean;
  dollarVars: boolean;
  lineComment: string;
  blockComment: [string, string] | null;
  preprocessor: boolean;
}

export const DIALECTS: Record<Dialect, DialectSpec> = {
  c: { semi: true, endBlocks: false, dollarVars: false, lineComment: '//', blockComment: ['/*', '*/'], preprocessor: true },
  cpp: { semi: true, endBlocks: false, dollarVars: false, lineComment: '//', blockComment: ['/*', '*/'], preprocessor: true },
  csharp: { semi: true, endBlocks: false, dollarVars: false, lineComment: '//', blockComment: ['/*', '*/'], preprocessor: false },
  java: { semi: true, endBlocks: false, dollarVars: false, lineComment: '//', blockComment: ['/*', '*/'], preprocessor: false },
  kotlin: { semi: false, endBlocks: false, dollarVars: false, lineComment: '//', blockComment: ['/*', '*/'], preprocessor: false },
  rust: { semi: true, endBlocks: false, dollarVars: false, lineComment: '//', blockComment: ['/*', '*/'], preprocessor: false },
  go: { semi: false, endBlocks: false, dollarVars: false, lineComment: '//', blockComment: ['/*', '*/'], preprocessor: false },
  swift: { semi: false, endBlocks: false, dollarVars: false, lineComment: '//', blockComment: ['/*', '*/'], preprocessor: false, swiftInterp: true },
  dart: { semi: true, endBlocks: false, dollarVars: false, lineComment: '//', blockComment: ['/*', '*/'], preprocessor: false },
  zig: { semi: true, endBlocks: false, dollarVars: false, lineComment: '//', blockComment: null, preprocessor: false },
  php: { semi: true, endBlocks: false, dollarVars: true, lineComment: '//', blockComment: ['/*', '*/'], preprocessor: false },
  perl: { semi: true, endBlocks: false, dollarVars: true, lineComment: '#', blockComment: null, preprocessor: false },
  julia: { semi: false, endBlocks: true, dollarVars: false, lineComment: '#', blockComment: ['#=', '=#'], preprocessor: false },
  r: { semi: false, endBlocks: false, dollarVars: false, lineComment: '#', blockComment: null, preprocessor: false },
  lua: { semi: false, endBlocks: true, dollarVars: false, lineComment: '--', blockComment: null, preprocessor: false },
  luau: { semi: false, endBlocks: true, dollarVars: false, lineComment: '--', blockComment: null, preprocessor: false },
  ruby: { semi: false, endBlocks: true, dollarVars: false, lineComment: '#', blockComment: null, preprocessor: false },
  bash: { semi: false, endBlocks: true, dollarVars: true, lineComment: '#', blockComment: null, preprocessor: false },
};

const TYPE_WORDS = new Set([
  'int', 'float', 'double', 'char', 'long', 'short', 'unsigned', 'signed', 'void', 'bool', 'boolean',
  'byte', 'sbyte', 'decimal', 'string', 'String', 'var', 'let', 'const', 'auto', 'final', 'static',
  'public', 'private', 'protected', 'internal', 'struct', 'class', 'interface', 'enum', 'record',
  'mut', 'fn', 'fun', 'func', 'function', 'def', 'sub', 'procedure', 'module', 'namespace', 'using',
  'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64', 'isize', 'usize', 'str',
  'object', 'any', 'dynamic', 'val', 'readonly', 'override', 'virtual', 'abstract', 'sealed',
  'inline', 'extern', 'pub', 'crate', 'async', 'await', 'constexpr', 'volatile', 'register',
  'number', 'number?', 'int?', 'String?', 'dyn', 'impl', 'trait', 'type', 'export', 'declare',
]);

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return',
  'try', 'catch', 'finally', 'throw', 'new', 'delete', 'sizeof', 'typeof', 'instanceof', 'in', 'of',
  'and', 'or', 'not', 'nil', 'null', 'true', 'false', 'True', 'False', 'None', 'this', 'self', 'super',
  'echo', 'print', 'println', 'puts', 'printf', 'then', 'do', 'end', 'begin', 'rescue', 'ensure',
  'unless', 'elsif', 'elseif', 'elseif', 'repeat', 'until', 'local', 'global', 'foreach', 'as', 'match',
  'when', 'is', 'defer', 'go', 'select', 'range', 'package', 'import', 'mod', 'use', 'extern', 'crate',
  'pub', 'impl', 'trait', 'where', 'loop', 'yield', 'raise', 'require', 'include', 'defined',
]);

interface Tok { t: 'num' | 'str' | 'id' | 'op' | 'nl' | 'eof'; v: string; n?: number; line: number; }

export function lex(src: string, spec: DialectSpec): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = 1;
  const push = (t: Tok['t'], v: string, n?: number) => toks.push({ t, v, n, line });
  const OPS = ['===', '!==', '<<=', '>>=', '**=', '...', '..=', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '++', '--',
    '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '->', '=>', '::', ':=', '**', '//', '..', '&.', '?.', '??', '|>', '<-', ':=', '=~'];

  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') { push('nl', '\n'); i++; line++; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
    if (spec.blockComment && src.startsWith(spec.blockComment[0], i)) {
      const end = src.indexOf(spec.blockComment[1], i + spec.blockComment[0].length);
      const stop = end < 0 ? src.length : end + spec.blockComment[1].length;
      for (let k = i; k < stop; k++) if (src[k] === '\n') { line++; toks.push({ t: 'nl', v: '\n', line }); }
      i = stop;
      continue;
    }
    if (src.startsWith(spec.lineComment, i)) {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (spec.preprocessor && ch === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    // strings
    if (ch === '"' || ch === "'" || (ch === '`' && (spec.semi || spec.endBlocks))) {
      const q = ch;
      i++;
      let raw = '';
      while (i < src.length) {
        const c = src[i];
        if (c === '\\' && src[i + 1] === '(' && (spec as any).swiftInterp) {
          let depth = 1;
          i += 2;
          let inner = '';
          while (i < src.length && depth > 0) {
            if (src[i] === '(') depth++;
            if (src[i] === ')') { depth--; if (depth === 0) break; }
            inner += src[i];
            i++;
          }
          i++;
          raw += '{' + inner + '}';
          continue;
        }
        if (c === '\\') {
          const nx = src[i + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'", '`': '`' };
          if (nx === 'u' && /^[0-9a-fA-F]{4}$/.test(src.substr(i + 2, 4))) {
            raw += String.fromCharCode(parseInt(src.substr(i + 2, 4), 16));
            i += 6;
            continue;
          }
          raw += map[nx] ?? nx;
          i += 2;
          continue;
        }
        if (c === q) { i++; break; }
        if (c === '\n') { line++; }
        raw += c;
        i++;
      }
      push('str', raw);
      continue;
    }
    // variables $x
    if (spec.dollarVars && ch === '$' && /[A-Za-z_{]/.test(src[i + 1] ?? '')) {
      let j = i + 1;
      if (src[j] === '{') {
        j++;
        while (j < src.length && src[j] !== '}') j++;
        j++;
      } else {
        while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      }
      push('id', src.slice(i, j));
      i = j;
      continue;
    }
    // perl scalar/array sigils
    if (spec.dollarVars && (ch === '@' || ch === '%') && /[A-Za-z_]/.test(src[i + 1] ?? '')) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      push('id', src.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      if (ch === '0' && /[xXbB]/.test(src[i + 1] ?? '')) {
        j += 2;
        while (j < src.length && /[0-9a-fA-F_]/.test(src[j])) j++;
      } else {
        while (j < src.length && /[0-9_]/.test(src[j])) j++;
        if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) {
          j++;
          while (j < src.length && /[0-9_]/.test(src[j])) j++;
        }
        if (/[eE]/.test(src[j] ?? '') && /[0-9+\-]/.test(src[j + 1] ?? '')) {
          j += 2;
          while (j < src.length && /[0-9]/.test(src[j])) j++;
        }
        while (j < src.length && /[uUlLfFdD]/.test(src[j])) j++;
      }
      const text = src.slice(i, j).replace(/_/g, '').replace(/[uUlLfFdD]+$/, '');
      let value = Number(text);
      if (/^0[xX]/.test(text)) value = parseInt(text.slice(2), 16);
      else if (/^0[bB]/.test(text)) value = parseInt(text.slice(2), 2);
      push('num', text, value);
      i = j;
      continue;
    }
    if (/[A-Za-z_@$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_@$?!]/.test(src[j])) j++;
      push('id', src.slice(i, j));
      i = j;
      continue;
    }
    let op = '';
    for (const o of OPS) if (src.startsWith(o, i)) { op = o; break; }
    if (!op) op = ch;
    push('op', op);
    i += op.length;
  }
  push('eof', '');
  return toks;
}

interface Ctx {
  vars: Map<string, Val>;
  parent?: Ctx;
  consts?: Set<string>;
  guards?: Set<string>;
}

interface StepCounter { n: number }

export interface CDialectRuntimeOptions {
  sink: OutSink;
  dialect: Dialect;
  stdin?: string;
  className?: string;
}

export class CFamilyRuntime {
  opts: CDialectRuntimeOptions;
  spec: DialectSpec;
  toks: Tok[] = [];
  pos = 0;
  /** >0 while re-parsing a branch that must not run (untaken `?:` arm). */
  suppress = 0;
  global: Ctx = { vars: new Map() };
  funcs = new Map<string, any>();
  classes = new Map<string, any>();
  stepsShared: StepCounter = { n: 0 };
  out: string[] = [];
  structs = new Map<string, string[]>();

  constructor(opts: CDialectRuntimeOptions) {
    this.opts = opts;
    this.spec = DIALECTS[opts.dialect];
    this.installBuiltins();
  }

  /* ----------------------------- stream ----------------------------- */
  write(text: string): void {
    this.out.push(text);
    this.opts.sink('stdout', text);
  }
  err(text: string): void {
    this.opts.sink('stderr', text);
  }
  tick(): void {
    if (++this.stepsShared.n > 8_000_000) throw new RtError('ExecutionLimit: program exceeded 8,000,000 operations');
  }

  peek(o = 0): Tok { return this.toks[Math.min(this.pos + o, this.toks.length - 1)]; }
  next(): Tok { return this.toks[this.pos++]; }
  at(v: string): boolean { const t = this.peek(); return (t.t === 'id' || t.t === 'op') && t.v === v; }
  atSemi(): boolean { return this.peek().t === 'op' && (this.peek().v === ';' || this.peek().v === ','); }
  eat(v: string): boolean { if (this.at(v)) { this.pos++; return true; } return false; }
  expect(v: string): Tok {
    if (!this.at(v)) {
      const t = this.peek();
      throw new RtError(`SyntaxError: expected '${v}' but found '${t.v || t.t}' on line ${t.line}`, t.line);
    }
    return this.next();
  }
  skipNl(): void { while (this.peek().t === 'nl') this.pos++; }
  skipTerm(): void {
    let guard = 0;
    while (guard++ < 200) {
      const t = this.peek();
      if (t.t === 'nl' || (t.t === 'op' && t.v === ';')) { this.pos++; continue; }
      break;
    }
  }

  /* ---------------------------- stdlib ------------------------------ */
  installBuiltins(): void {
    const g = this.global.vars;
    const def = (name: string, f: (...a: Val[]) => Val) => {
      g.set(name, { __builtin: true, name, f });
      this.funcs.set(name, { __builtin: true, name, f });
    };
    const print = (s: string) => this.write(s);
    def('printf', (fmt, ...rest) => { print(printfFormat(toStr(fmt), rest)); return null; });
    def('puts', (s) => { print(toStr(s) + '\n'); return null; });
    def('putchar', (c) => { print(String.fromCharCode(toInt(c))); return null; });
    def('println', (s) => { print((s === undefined ? '' : toStr(s)) + '\n'); return null; });
    def('print', (s) => { print(toStr(s)); return null; });
    def('printLn', (s) => { print(toStr(s) + '\n'); return null; });
    def('printInt', (s) => { print(toStr(s)); return null; });
    def('printlnInt', (s) => { print(toStr(s) + '\n'); return null; });
    def('echo', (...a) => { print(a.map(toStr).join('')); return null; });
    def('sprintf', (fmt, ...rest) => printfFormat(toStr(fmt), rest));
    def('fmt_sprintf', (fmt, ...rest) => printfFormat(toStr(fmt), rest));
    def('printfn', (fmt, ...rest) => { print(printfFormat(toStr(fmt), rest) + '\n'); return null; });
    def('scanf', () => null);

    /* ---- Java / C# / Kotlin console objects ------------------------- */
    const stdoutObj = {
      println: (v?: Val) => { print((v === undefined ? '' : toStr(v)) + '\n'); return null; },
      print: (v?: Val) => { print(v === undefined ? '' : toStr(v)); return null; },
      printf: (fmt: Val, ...rest: Val[]) => { print(printfFormat(toStr(fmt), rest)); return null; },
      write: (v: Val) => { print(toStr(v)); return null; },
    };
    const javaSystem = { out: stdoutObj, err: stdoutObj, getProperty: () => '', currentTimeMillis: () => Date.now(), exit: () => null };
    g.set('System', javaSystem);
    g.set('Console', { WriteLine: stdoutObj.println, Write: stdoutObj.print });
    g.set('ConsoleColor', {});
    g.set('Math', {
      abs: Math.abs, max: Math.max, min: Math.min, pow: Math.pow, sqrt: Math.sqrt, floor: Math.floor,
      ceil: Math.ceil, round: Math.round, random: () => Math.random(), signum: Math.sign, cbrt: Math.cbrt,
      hypot: Math.hypot, log: Math.log, log10: Math.log10, exp: Math.exp, PI: Math.PI, E: Math.E,
    });
    g.set('Integer', { parseInt: (v: Val, r?: Val) => parseInt(toStr(v), r === undefined ? 10 : toInt(r)), MAX_VALUE: 2147483647, MIN_VALUE: -2147483648, toString: (v: Val) => toStr(v), valueOf: (v: Val) => toInt(v) });
    g.set('Double', { parseDouble: (v: Val) => parseFloat(toStr(v)), toString: (v: Val) => toStr(v), valueOf: (v: Val) => toNum(v) });
    g.set('Long', { parseLong: (v: Val) => parseInt(toStr(v), 10), MAX_VALUE: Number.MAX_SAFE_INTEGER });
    g.set('Character', { isDigit: (c: Val) => /^\d$/.test(toStr(c)), isLetter: (c: Val) => /^[A-Za-z]$/.test(toStr(c)) });
    g.set('Objects', { equals: (a: Val, b: Val) => toStr(a) === toStr(b), toString: (v: Val) => toStr(v) });
    g.set('Arrays', {
      toString: (a: Val) => `[${(Array.isArray(a) ? a : []).map(toStr).join(', ')}]`,
      sort: (a: Val) => { if (Array.isArray(a)) a.sort((x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : toStr(x).localeCompare(toStr(y)))); return null; },
      asList: (...a: Val[]) => a,
      fill: (a: Val, v: Val) => { if (Array.isArray(a)) a.fill(v); return a; },
    });
    g.set('Collections', {
      sort: (a: Val) => { if (Array.isArray(a)) a.sort((x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : toStr(x).localeCompare(toStr(y)))); return null; },
      reverse: (a: Val) => { if (Array.isArray(a)) a.reverse(); return null; },
      max: (a: Val) => Math.max(...(Array.isArray(a) ? a.map(toNum) : [])),
      min: (a: Val) => Math.min(...(Array.isArray(a) ? a.map(toNum) : [])),
    });
    g.set('String', {
      valueOf: (v: Val) => toStr(v),
      format: (fmt: Val, ...rest: Val[]) => printfFormat(toStr(fmt), rest),
      join: (sep: Val, ...parts: Val[]) => parts.flat().map(toStr).join(toStr(sep)),
    });
    g.set('args', []);
    def('readLine', () => this.opts.stdin ?? '');
    def('gets', () => this.opts.stdin ?? '');
    def('input', (p) => { if (p !== undefined) print(toStr(p)); return this.opts.stdin ?? ''; });

    const num1 = (name: string, f: (x: number) => number) =>
      def(name, (x) => {
        const n = toNum(x);
        const r = f(n);
        return Number.isNaN(r) ? null : r;
      });
    num1('sqrt', Math.sqrt); num1('cbrt', Math.cbrt); num1('sin', Math.sin); num1('cos', Math.cos);
    num1('tan', Math.tan); num1('asin', Math.asin); num1('acos', Math.acos); num1('atan', Math.atan);
    num1('sinh', Math.sinh); num1('cosh', Math.cosh); num1('tanh', Math.tanh); num1('exp', Math.exp);
    num1('log2', Math.log2); num1('log10', Math.log10); num1('floor', Math.floor); num1('ceil', Math.ceil);
    num1('round', Math.round); num1('trunc', Math.trunc); num1('fabs', Math.abs); num1('abs', Math.abs);
    num1('Math.abs', Math.abs); num1('std::abs', Math.abs);
    def('log', (a, b) => (b !== undefined ? Math.log(toNum(a)) / Math.log(toNum(b)) : Math.log(toNum(a))));
    def('pow', (a, b) => Math.pow(toNum(a), toNum(b)));
    def('Math.pow', (a, b) => Math.pow(toNum(a), toNum(b)));
    def('Math.sqrt', (a) => Math.sqrt(toNum(a)));
    def('Math.hypot', (...a) => Math.hypot(...a.map(toNum)));
    def('hypot', (...a) => Math.hypot(...a.map(toNum)));
    def('Math.min', (...a) => Math.min(...a.map(toNum)));
    def('Math.max', (...a) => Math.max(...a.map(toNum)));
    def('min', (...a) => (Array.isArray(a[0]) ? Math.min(...(a[0] as any[]).map(toNum)) : Math.min(...a.map(toNum))));
    def('max', (...a) => (Array.isArray(a[0]) ? Math.max(...(a[0] as any[]).map(toNum)) : Math.max(...a.map(toNum))));
    def('Math.round', (a) => Math.round(toNum(a)));
    def('Math.floor', (a) => Math.floor(toNum(a)));
    def('Math.ceil', (a) => Math.ceil(toNum(a)));
    def('Math.trunc', (a) => Math.trunc(toNum(a)));
    def('Math.sign', (a) => Math.sign(toNum(a)));
    def('Math.sin', (a) => Math.sin(toNum(a)));
    def('Math.cos', (a) => Math.cos(toNum(a)));
    def('Math.tan', (a) => Math.tan(toNum(a)));
    def('Math.log', (a) => Math.log(toNum(a)));
    def('Math.log10', (a) => Math.log(toNum(a)) / Math.LN10);
    def('Math.atan2', (a, b) => Math.atan2(toNum(a), toNum(b)));
    def('atan2', (a, b) => Math.atan2(toNum(a), toNum(b)));
    g.set('Math.PI', Math.PI);
    g.set('Math.E', Math.E);
    g.set('PI', Math.PI);
    g.set('M_PI', Math.PI);
    g.set('E', Math.E);
    def('strlen', (s) => toStr(s).length);
    def('length', (s) => (Array.isArray(s) ? s.length : toStr(s).length));
    def('len', (s) => (Array.isArray(s) ? s.length : s instanceof Map ? s.size : toStr(s).length));
    def('count', (s) => (Array.isArray(s) ? s.length : toStr(s).length));
    def('size', (s) => (Array.isArray(s) ? s.length : s instanceof Map ? s.size : toStr(s).length));
    def('sizeof', (s) => (Array.isArray(s) ? s.length : 8));
    def('strcmp', (a: any, b: any) => (toStr(a) < toStr(b) ? -1 : toStr(a) > toStr(b) ? 1 : 0));
    def('strcpy', (_a: any, b: any) => toStr(b));
    def('substr', (s, start, len) => toStr(s).substr(toInt(start), len === undefined ? undefined : toInt(len)));
    def('toupper', (s) => toStr(s).toUpperCase());
    def('tolower', (s) => toStr(s).toLowerCase());
    def('trim', (s) => toStr(s).trim());
    def('split', (s, sep) => toStr(s).split(sep === undefined ? /\s+/ : toStr(sep)));
    def('join', (arr, sep) => (Array.isArray(arr) ? arr.map(toStr).join(toStr(sep ?? '')) : toStr(arr)));
    def('reverse', (arr) => (Array.isArray(arr) ? [...arr].reverse() : Array.from(toStr(arr)).reverse().join('')));
    def('sort', (arr) => (Array.isArray(arr) ? [...arr].sort((x, y) => toNum(x) - toNum(y)) : arr));
    def('isPrime', (n) => {
      const v = toInt(n);
      if (v < 2) return false;
      for (let d = 2; d * d <= v; d++) if (v % d === 0) return false;
      return true;
    });
    def('isprime', (n) => {
      const v = toInt(n);
      if (v < 2) return false;
      for (let d = 2; d * d <= v; d++) if (v % d === 0) return false;
      return true;
    });
    def('gcd', (a, b) => {
      let x = Math.abs(toInt(a)), y = Math.abs(toInt(b));
      while (y) { const t = y; y = x % y; x = t; }
      return x;
    });
    def('factorial', (n) => {
      let r = 1;
      for (let i = 2; i <= toInt(n); i++) r *= i;
      return r;
    });
    def('parseInt', (s) => parseInt(toStr(s), 10));
    def('parseFloat', (s) => parseFloat(toStr(s)));
    def('Integer.parseInt', (s) => {
      const n = parseInt(toStr(s), 10);
      if (Number.isNaN(n)) throw new RtError(`NumberFormatException: For input string: "${toStr(s)}"`);
      return n;
    });
    def('Double.parseDouble', (s) => parseFloat(toStr(s)));
    def('intdiv', (a, b) => Math.floor(toNum(a) / toNum(b)));
    def('int.class', () => 'int');
    def('String.valueOf', (v) => toStr(v));
    def('String.format', (fmt, ...rest) => printfFormat(toStr(fmt), rest));
    def('str', (v) => toStr(v));
    def('repr', (v) => JSON.stringify(v));
    def('ord', (s) => toStr(s).charCodeAt(0));
    def('chr', (n) => String.fromCharCode(toInt(n)));
    def('hex', (n) => toInt(n).toString(16));
    def('rand', () => Math.floor(Math.random() * 32768));
    def('randint', (a, b) => toInt(a) + Math.floor(Math.random() * (toInt(b) - toInt(a) + 1)));
    def('time', () => Date.now() / 1000);
    def('clock', () => performance.now() / 1000);
    def('getpid', () => 4242);
    def('exit', () => { throw new ReturnSignal(null); });
    def('assert', (cond, msg) => { if (!truthy(cond)) throw new RtError(`AssertionError: ${msg ? toStr(msg) : 'assertion failed'}`); return null; });
    def('error', (msg) => { throw new RtError(`Error: ${toStr(msg)}`); });
    def('die', (msg) => { throw new RtError(`Fatal: ${toStr(msg)}`); });
    def('panic', (msg) => { throw new RtError(`panic: ${toStr(msg)}`); });
    def('typedef', () => null);
    def('free', () => null);
    def('malloc', (n) => new Array(toInt(n) >>> 3).fill(0));
    def('calloc', (n) => new Array(toInt(n)).fill(0));
    def('memset', (arr) => arr);
    def('memcpy', (arr) => arr);
    def('strcat', (a, b) => toStr(a) + toStr(b));
    def('str_replace', (a, b, c) => toStr(a).split(toStr(b)).join(toStr(c)));
    def('str_repeat', (a, n) => toStr(a).repeat(toInt(n)));
    def('implode', (sep, arr) => (Array.isArray(arr) ? arr.map(toStr).join(toStr(sep)) : ''));
    def('explode', (sep, s) => toStr(s).split(toStr(sep)));
    def('array_push', (arr, v) => { if (Array.isArray(arr)) arr.push(v); return arr; });
    def('array_sum', (arr) => (Array.isArray(arr) ? arr.reduce((a, b) => toNum(a) + toNum(b), 0) : 0));
    def('number_format', (n, d) => toNum(n).toFixed(d === undefined ? 0 : toInt(d)));
    def('sprintf_l', (fmt, ...rest) => printfFormat(toStr(fmt), rest));
    def('json_encode', (v) => JSON.stringify(v));
    def('json_decode', (v) => JSON.parse(toStr(v)));
    def('defined', () => true);
    def('isset', (v) => v !== null && v !== undefined);
    def('empty', (v) => !truthy(v));
    def('to_s', (v) => toStr(v));
    def('to_i', (v) => toInt(v));
    def('to_f', (v) => toNum(v));
    def('upcase', (v) => toStr(v).toUpperCase());
    def('downcase', (v) => toStr(v).toLowerCase());
    def('capitalize', (v) => { const s = toStr(v); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); });
    def('chomp', (v) => toStr(v).replace(/\n$/, ''));
    def('strip', (v) => toStr(v).trim());
    def('Integer', (v) => toInt(v));
    def('Float', (v) => toNum(v));
    def('String', (v) => toStr(v));
    def('Array', (v) => (Array.isArray(v) ? v : [v]));
    def('rand_int', (a, b) => toInt(a) + Math.floor(Math.random() * (toInt(b) - toInt(a) + 1)));
    def('seed', () => null);
    def('nil?', (v) => v === null || v === undefined);
    def('print_ln', (s) => { print(toStr(s) + '\n'); return null; });
    def('println!', (s) => { print(toStr(s) + '\n'); return null; });
    def('print!', (s) => { print(toStr(s)); return null; });
    def('format!', (fmt, ...rest) => printfFormat(toStr(fmt).replace(/\{\d*\}/g, '%s'), rest));
    def('vec!', (...a) => (Array.isArray(a[0]) ? a[0] : [...a]));
    def('vec', (...a) => [...a]);
    def('Some', (v) => v);
    def('Ok', (v) => v);
    def('Err', (v) => v);
    def('unwrap', (v) => v);
    def('borrow', (v) => v);
    def('clone', (v) => v);
    def('to_string', (v) => toStr(v));
    def('to_owned', (v) => toStr(v));
    def('as_str', (v) => toStr(v));
    def('push_str', (arr) => arr);
    def('repeat', (s, n) => toStr(s).repeat(toInt(n)));
    def('abs_val', (v) => Math.abs(toNum(v)));
    def('clamp', (v, lo, hi) => Math.min(Math.max(toNum(v), toNum(lo)), toNum(hi)));
    def('cat', (...a) => { print(a.map(toStr).join('')); return null; });
    def('say', (s) => { print(toStr(s) + '\n'); return null; });
    def('warn', (s) => { this.err(toStr(s) + '\n'); return null; });
    def('lc', (s) => toStr(s).toLowerCase());
    def('uc', (s) => toStr(s).toUpperCase());
    def('sqrt_', (s) => Math.sqrt(toNum(s)));
    def('intval', (v) => toInt(v));
    def('floatval', (v) => toNum(v));
    def('strval', (v) => toStr(v));
    def('date', () => new Date().toISOString());
    def('microtime', (asFloat) => (truthy(asFloat) ? Date.now() / 1000 : `0.${Date.now()}`));
    def('srand', () => null);
    def('printf_c', (fmt, ...rest) => { print(printfFormat(toStr(fmt), rest)); return null; });
    def('nsprintf', (fmt, ...rest) => printfFormat(toStr(fmt), rest));
    def('Array.new', () => []);
    def('Hash.new', () => new Map());
    def('puts_p', (...a) => { print(a.map(toStr).join('') + '\n'); return null; });
    def('raise', (msg) => { throw new RtError(`RuntimeError: ${toStr(msg)}`); });

    // PHP-ish glue
    this.funcs.set('array_map', { __builtin: true, name: 'array_map', f: (cb: any, arr: any[]) => arr.map((x) => this.callValue(cb, [x])) });
    this.funcs.set('usort', { __builtin: true, name: 'usort', f: (arr: any[], cb: any) => { if (Array.isArray(arr)) arr.sort((a, b) => toInt(this.callValue(cb, [a, b]))); return true; } });
  }

  /* --------------------------- token helpers ------------------------ */
  isTypeToken(t: Tok): boolean {
    if (t.t !== 'id') return false;
    return TYPE_WORDS.has(t.v) && !KEYWORDS.has(t.v);
  }

  skipTypeAnnotations(): void {
    let guard = 0;
    while (guard++ < 20) {
      const t = this.peek();
      if (this.isTypeToken(t)) {
        this.next();
        // generic parameters  List<int>
        if (this.at('<') ) {
          let depth = 0;
          do {
            const tk = this.next();
            if (tk.v === '<') depth++;
            if (tk.v === '>') depth--;
          } while (depth > 0 && this.peek().t !== 'eof');
        }
        if (this.at('&') || this.at('*')) { this.next(); continue; }
        if (this.at('?') || this.at('!')) { this.next(); continue; }
        if (this.at('::')) { this.next(); this.next(); continue; }
        continue;
      }
      if (t.t === 'id' && this.peek(1).t === 'id' && this.peek(1).line === t.line) {
        // e.g. `MyType x` — user-defined type annotation followed by identifier
        if (!KEYWORDS.has(t.v) && !this.at('=') && !this.at('(')) {
          this.next();
          continue;
        }
      }
      if (t.t === 'id' && (this.at('*') || this.at('&')) && this.peek(1).t === 'id') {
        this.next(); this.next(); continue;
      }
      break;
    }
  }

  /** consume optional trailing tokens like `!` in `println!(` */
  matchFnName(): string {
    let name = this.next().v;
    if (this.at('!')) { this.next(); name += '!'; }
    return name;
  }

  /* ------------------------------ parse ---------------------------- */
  parseProgram(): void {
    while (this.peek().t !== 'eof') {
      try {
        this.parseTopLevel();
      } catch (err) {
        if (!(err instanceof RtError)) throw err;
        // Skip to next line to recover
        while (this.peek().t !== 'eof' && this.peek().t !== 'nl') this.pos++;
        this.skipNl();
        throw err;
      }
    }
  }

  parseTopLevel(): void {
    this.skipNl();
    const t = this.peek();
    if (t.t === 'eof') return;
    const lineStart = this.pos;

    // Decorators/annotations: @Override, #[derive(...)], [Attribute]
    while (this.at('@') || (this.at('#') && this.at('['))) {
      const open = this.next().v === '#' ? '[' : null;
      if (open) {
        let depth = 1;
        while (this.peek().t !== 'eof' && depth > 0) {
          const tk = this.next();
          if (tk.v === '[') depth++;
          if (tk.v === ']') depth--;
        }
      } else {
        while (this.peek().t !== 'eof' && this.peek().t !== 'nl' && !this.at('(')) this.next();
        if (this.at('(')) { let d = 0; do { const tk = this.next(); if (tk.v === '(') d++; if (tk.v === ')') d--; } while (d > 0 && this.peek().t !== 'eof'); }
      }
      this.skipNl();
    }

    // Skip import/package boilerplate, but keep `use`/`using` harmless
    if (t.t === 'id' && ['package', 'import', 'using', 'use', 'require', 'include', 'mod', 'extern', 'namespace', 'typedef', 'type', 'export'].includes(t.v)) {
      // `export default`/`export function` — just drop the keyword
      if (t.v === 'export') { this.next(); return; }
      if (t.v === 'type' && this.peek(1).t === 'id' && this.peek(2).v === '=') {
        while (this.peek().t !== 'eof' && this.peek().t !== 'nl' && !this.at(';')) this.next();
        return;
      }
      if ((t.v === 'use' || t.v === 'using' || t.v === 'import') && this.peek(1).v === '(') return; // PHP closure use()
      while (this.peek().t !== 'eof' && this.peek().t !== 'nl' && !this.at(';') && !this.at('{')) this.next();
      if (this.at('{') && (t.v === 'namespace' || t.v === 'mod')) this.skipBlock();
      this.skipTerm();
      return;
    }

    // Class-like declarations possibly preceded by modifiers
    {
      let scan = this.pos;
      let guard = 0;
      while (guard++ < 8) {
        const tk = this.toks[scan];
        if (tk && tk.t === 'id' && ['public', 'private', 'protected', 'internal', 'final', 'abstract', 'sealed', 'static', 'open', 'data', 'export', 'pub'].includes(tk.v)) scan++;
        else break;
      }
      const nextTok = this.toks[scan];
      if (nextTok && nextTok.t === 'id' && ['class', 'struct', 'interface', 'enum', 'object', 'record'].includes(nextTok.v)) {
        this.pos = scan;
        this.parseClassLike(false);
        return;
      }
      if (nextTok && nextTok.t === 'id' && ['impl', 'trait'].includes(nextTok.v)) {
        this.pos = scan;
        this.parseClassLike(true);
        return;
      }
    }

    // Function definitions (any return type / modifiers) — must be checked before statements
    if (t.t === 'id' && !['if', 'for', 'while', 'switch', 'catch', 'do', 'try', 'return', 'new', 'else', 'case', 'throw', 'raise'].includes(t.v)) {
      if (this.looksLikeFunctionDef()) {
        this.parseFunctionDef();
        return;
      }
    }

    this.pos = lineStart;
    // C-family stream output:  std::cout << ... << std::endl;
    if (this.tryStreamOutput()) return;
    this.parseStatement();
    this.skipTerm();
  }

  /** Handles std::cout / cout / cerr / std::cerr streaming chains */
  tryStreamOutput(): boolean {
    const start = this.pos;
    let stream = '';
    if (this.at('std') && this.peek(1).v === '::' && ['cout', 'cerr', 'clog'].includes(this.peek(2).v)) {
      stream = this.peek(2).v;
      this.pos += 3;
    } else if (this.at('cout') || this.at('cerr') || this.at('clog')) {
      stream = this.next().v;
    }
    if (!stream || !this.at('<<')) { this.pos = start; return false; }
    let text = '';
    while (this.at('<<')) {
      this.next();
      // read a single operand
      const operand: Tok[] = [];
      let depth = 0;
      while (this.peek().t !== 'eof') {
        const tk = this.peek();
        if (depth === 0 && (tk.v === '<<' || tk.v === ';' || tk.t === 'nl')) break;
        if (tk.v === '(' || tk.v === '[' || tk.v === '{') depth++;
        if (tk.v === ')' || tk.v === ']' || tk.v === '}') depth--;
        operand.push(this.next());
      }
      if (!operand.length) break;
      const joined = operand.map((x) => x.v).join('');
      if (joined === 'endl' || joined === 'std::endl') text += '\n';
      else if (joined === 'flush') continue;
      else text += toStr(this.evalTokens(operand));
    }
    if (stream === 'cout' || stream === 'clog') this.write(text);
    else this.err(text);
    return true;
  }

  skipBlock(): void {
    let depth = 0;
    do {
      const t = this.next();
      if (t.v === '{') depth++;
      else if (t.v === '}') depth--;
      else if (t.t === 'eof') break;
    } while (depth > 0);
  }

  looksLikeFunctionDef(): boolean {
    // scan ahead for `(` ... `)` followed by `{` or an end-block `:`
    let i = this.pos;
    let depth = 0;
    let sawParen = false;
    let guard = 0;
    while (i < this.toks.length && guard++ < 160) {
      const t = this.toks[i];
      if (t.t === 'id' && ['class', 'struct', 'interface', 'enum', 'object', 'namespace'].includes(t.v)) return false;
      if (t.v === '=' || t.v === '+=' || t.v === ':=' || t.v === '&&' || t.v === '||') return false;
      if (t.v === '(') { depth++; sawParen = true; }
      else if (t.v === ')') depth--;
      else if (t.v === '{' && sawParen && depth === 0) return true;
      else if (t.v === ':' && sawParen && depth === 0 && this.spec.endBlocks) return true;
      else if (t.v === ';' && depth === 0) return false;
      else if (t.t === 'nl' && !sawParen && depth === 0 && (this.spec.semi || this.spec.endBlocks)) return false;
      i++;
    }
    return false;
  }

  parseClassLike(anonymous: boolean): void {
    if (!anonymous) {
      this.next(); // class/struct
      this.skipNl();
      let name = '';
      if (this.peek().t === 'id' && !this.at('{')) {
        name = this.next().v;
        if (this.at('<')) { while (!this.at('>') && this.peek().t !== 'eof') this.next(); this.next(); }
        if (this.at('extends') || this.at(':')) { while (!this.at('{') && this.peek().t !== 'eof') this.next(); }
        if (this.at('implements')) { while (!this.at('{') && this.peek().t !== 'eof') this.next(); }
      }
      while (this.peek().t !== 'eof' && !this.at('{') && this.peek().t !== 'nl') this.next();
      if (this.at('{')) {
        const body = this.captureBraces();
        this.registerClassBody(name, body);
      }
    } else {
      while (this.peek().t !== 'eof' && this.peek().t !== 'nl' && !this.at('{')) this.next();
      if (this.at('{')) {
        const body = this.captureBraces();
        this.flattenClassBody(body);
      }
    }
  }

  captureBraces(): Tok[] {
    const start = this.pos;
    let depth = 0;
    do {
      const t = this.next();
      if (t.v === '{') depth++;
      else if (t.v === '}') depth--;
      else if (t.t === 'eof') break;
    } while (depth > 0);
    return this.toks.slice(start + 1, this.pos - 1);
  }

  registerClassBody(name: string, body: Tok[]): void {
    this.classes.set(name, body);
    // Structural members are flattened once into the global scope so static
    // helpers are callable, but we never execute method bodies here.
    this.flattenClassBody(body);
  }

  flattenClassBody(body: Tok[]): void {
    const save = { toks: this.toks, pos: this.pos };
    this.toks = [...body, { t: 'eof', v: '', line: 0 } as Tok];
    this.pos = 0;
    this.skipNl();
    let guard = 0;
    while (this.peek().t !== 'eof' && guard++ < 4000) {
      const mark = this.pos;
      try {
        if (this.looksLikeFunctionDef()) {
          this.parseFunctionDef();
        } else if (this.at('{')) {
          this.skipBlock();
        } else {
          while (this.peek().t !== 'eof' && this.peek().t !== 'nl' && !this.atSemi() && !this.at('{')) this.next();
          if (this.at('{')) this.skipBlock();
          this.skipTerm();
        }
      } catch {
        this.pos = Math.max(mark + 1, this.pos);
        this.skipTerm();
      }
      this.skipNl();
      if (this.pos === mark) this.next();
    }
    this.toks = save.toks;
    this.pos = save.pos;
  }

  parseFunctionDef(): void {
    const modifiers = new Set<string>();
    let guard = 0;
    while (guard++ < 14) {
      const v = this.peek().v;
      if (['public', 'private', 'protected', 'internal', 'static', 'final', 'const', 'async', 'inline', 'extern',
           'override', 'open', 'virtual', 'abstract', 'export', 'pub', 'local', 'global', 'readonly', 'unsafe'].includes(v)) {
        modifiers.add(v);
        this.next();
        continue;
      }
      break;
    }
    if (this.at('def') || this.at('fn') || this.at('fun') || this.at('func') || this.at('function') || this.at('sub') || this.at('procedure')) this.next();

    // A leading return type may survive if it is not in the modifier list (`void`, `int`, `String`...).
    // A return type may still be sitting in front of the function name (`void main`, `int add`).
    // Walk forward to the identifier immediately followed by `(`, but only over plausible type tokens.
    let scan = this.pos;
    while (scan < this.toks.length && scan - this.pos < 12) {
      const tk = this.toks[scan];
      if (tk.t === 'nl') { scan++; continue; }
      if (tk.t === 'op' && ['*', '&', '<', '>', ':', '[', ']', ',', '::'].includes(tk.v)) { scan++; continue; }
      if (tk.t !== 'id') break;
      const after = this.toks[scan + 1];
      if (after && after.v === '(') break; // this identifier is `name (` — stop here
      if (!TYPE_WORDS.has(tk.v)) break;    // not a type word, so this is not a return type
      scan++;
    }
    if (scan < this.toks.length && this.toks[scan].t === 'id' && this.toks[scan + 1] && this.toks[scan + 1].v === '(') {
      if (scan > this.pos) this.pos = scan;
    }

    let name = 'anonymous';
    if (this.peek().t === 'id' || this.at('operator')) {
      name = this.next().v;
      if (this.at('!')) { this.next(); name += '!'; }
      if (this.at('::')) { this.next(); name = this.next().v; }
      if (this.at('.')) { this.next(); name = this.next().v; }
      if (this.at('<')) {
        let depth = 0;
        do {
          const tk = this.next();
          if (tk.v === '<') depth++;
          if (tk.v === '>') depth--;
        } while (depth > 0 && this.peek().t !== 'eof');
      }
    }

    const params: { name: string; def?: Tok[] }[] = [];
    if (this.at('(')) {
      this.next();
      this.skipNl();
      let pguard = 0;
      while (!this.at(')') && this.peek().t !== 'eof' && pguard++ < 60) {
        const chunk: Tok[] = [];
        let depth = 0;
        while (this.peek().t !== 'eof') {
          const tk = this.peek();
          if (depth === 0 && (tk.v === ',' || tk.v === ')')) break;
          if (tk.v === '(' || tk.v === '[' || tk.v === '<' || tk.v === '{') depth++;
          if (tk.v === ')' || tk.v === ']' || tk.v === '>' || tk.v === '}') depth--;
          chunk.push(this.next());
        }
        if (chunk.length) {
          let colon = -1;
          let assign = -1;
          let d2 = 0;
          for (let i = 0; i < chunk.length; i++) {
            const tk = chunk[i];
            if (tk.v === '(' || tk.v === '[' || tk.v === '<') d2++;
            if (tk.v === ')' || tk.v === ']' || tk.v === '>') d2--;
            if (d2 === 0 && tk.v === ':' && colon < 0 && assign < 0) colon = i;
            if (d2 === 0 && (tk.v === '=' || tk.v === ':=') && assign < 0) assign = i;
          }
          let nameToks: Tok[] = [];
          let defTokens: Tok[] | undefined;
          if (colon >= 0) {
            nameToks = chunk.slice(0, colon);
            if (assign > colon) defTokens = chunk.slice(assign + 1);
          } else if (assign >= 0) {
            nameToks = chunk.slice(0, assign);
            defTokens = chunk.slice(assign + 1);
          } else {
            let lastId = -1;
            for (let i = 0; i < chunk.length; i++) if (chunk[i].t === 'id' && !['const', 'mut', 'ref', 'final', 'var'].includes(chunk[i].v)) lastId = i;
            nameToks = lastId >= 0 ? [chunk[lastId]] : [];
          }
          const cleanName = nameToks
            .filter((tk) => tk.t === 'id')
            .filter((tk) => !['const', 'let', 'var', 'mut', 'ref', 'final', 'readonly'].includes(tk.v));
          const pname = cleanName.length ? cleanName[cleanName.length - 1].v : `_p${params.length}`;
          params.push({ name: pname, def: defTokens });
        }
        if (!this.eat(',')) break;
        this.skipNl();
      }
      if (this.at(')')) this.next();
    }

    if (this.at('where')) { while (this.peek().t !== 'eof' && !this.at('{') && this.peek().t !== 'nl') this.next(); }

    let body: Tok[] = [];
    if (this.at('{')) {
      body = this.captureBraces();
    } else if (this.spec.endBlocks) {
      let depth = 0;
      let i = this.pos;
      const collect: Tok[] = [];
      let g2 = 0;
      const openers = ['function', 'def', 'do', 'if', 'for', 'while', 'repeat', 'case', 'unless', 'begin', 'class', 'module', 'until'];
      while (i < this.toks.length && g2++ < 40000) {
        const tk = this.toks[i];
        const v = tk.v;
        if (tk.t === 'id' && openers.includes(v)) depth++;
        else if (tk.t === 'id' && v === 'end') {
          if (depth === 0) { i++; break; }
          depth--;
        }
        collect.push(tk);
        i++;
      }
      body = collect;
      this.pos = i;
    } else {
      // return-type tail, expression body or prototype
      let exprBody: Tok[] | null = null;
      let g3 = 0;
      while (g3++ < 24 && this.peek().t !== 'eof' && this.peek().t !== 'nl' && !this.at('{') && !this.at(';')) {
        if (this.at('=')) {
          this.next();
          exprBody = this.captureExprTokens();
          break;
        }
        this.next();
      }
      if (exprBody) body = [{ t: 'id', v: 'return', line: 0 } as Tok, ...exprBody];
    }

    const fnDef = {
      __fn: true,
      name,
      params,
      body,
      globals: this.global,
      modifiers,
      line: this.peek().line,
    };
    this.funcs.set(name, fnDef);
    this.global.vars.set(name, fnDef);
  }

  captureExprTokens(): Tok[] {
    const out: Tok[] = [];
    let depth = 0;
    let guard = 0;
    while (this.peek().t !== 'eof' && guard++ < 2000) {
      const t = this.peek();
      if (t.v === '(' || t.v === '[' || t.v === '{') depth++;
      if (t.v === ')' || t.v === ']' || t.v === '}') {
        if (depth === 0) break;
        depth--;
      }
      if (t.v === ',' && depth === 0) break;
      // an expression never spans a statement terminator or a hard newline at depth 0
      if (depth === 0 && (t.v === ';' || t.t === 'nl')) break;
      out.push(this.next());
    }
    return out;
  }

  /* --------------------------- statements --------------------------- */
  parseStatement(): void {
    this.tick();
    this.skipNl();
    const t = this.peek();
    if (t.t === 'eof') return;
    if (t.t === 'id') {
      switch (t.v) {
        case 'if': {
          this.next();
          const cond = this.parseParenExpr();
          const thenBlock = this.parseBlockOrStatement();
          this.skipNl();
          let elseBlock: Tok[] | null = null;
          if (this.at('else') || this.at('elsif')) {
            this.next();
            elseBlock = this.at('if') ? this.wrapAsBlock() : this.parseBlockOrStatement();
          }
          if (truthy(this.evalTokens(cond))) this.runTokens(thenBlock);
          else if (elseBlock) this.runTokens(elseBlock);
          return;
        }
        case 'unless': {
          this.next();
          const cond = this.parseParenExpr();
          const body = this.parseBlockOrStatement();
          if (!truthy(this.evalTokens(cond))) this.runTokens(body);
          return;
        }
        case 'while': {
          this.next();
          const cond = this.parseParenExpr();
          const body = this.parseBlockOrStatement();
          let guard = 0;
          while (truthy(this.evalTokens(cond))) {
            this.tick();
            if (++guard > 1_000_000) throw new RtError('ExecutionLimit: while loop exceeded 1,000,000 iterations');
            try { this.runTokens(body); }
            catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; }
          }
          return;
        }
        case 'do': {
          this.next();
          const body = this.parseBlockOrStatement();
          // `do { ... } while (cond);` runs the body at least once, then tests.
          let condToks: Tok[] | null = null;
          let invert = false;
          let guardDo = 0;
          for (;;) {
            if (++guardDo > 1_000_000) throw new RtError('ExecutionLimit: do/while exceeded 1,000,000 iterations');
            this.tick();
            let broke = false;
            try { this.runTokens(body); }
            catch (e) { if (e instanceof BreakSignal) broke = true; else if (!(e instanceof ContinueSignal)) throw e; }
            if (broke) return;
            if (condToks === null) {
              if (!this.at('while') && !this.at('until')) return;
              invert = this.next().v === 'until';
              condToks = this.parseParenExpr();
              this.skipTerm();
            }
            // while → keep looping while true; until → keep looping while false.
            const go = invert ? !truthy(this.evalTokens(condToks)) : truthy(this.evalTokens(condToks));
            if (!go) return;
          }
        }
        case 'for': {
          this.next();
          this.parseFor();
          return;
        }
        case 'foreach': {
          this.next();
          this.parseForeach();
          return;
        }
        case 'repeat': {
          this.next();
          const body = this.parseBlockOrStatement();
          void body;
          return;
        }
        case 'switch': {
          this.next();
          this.parseSwitch();
          return;
        }
        case 'break': this.next(); this.skipTerm(); throw new BreakSignal();
        case 'continue': this.next(); this.skipTerm(); throw new ContinueSignal();
        case 'return': {
          this.next();
          const vals: Tok[] = [];
          while (this.peek().t !== 'eof' && this.peek().t !== 'nl' && !this.at(';')) vals.push(this.next());
          throw new ReturnSignal(vals.length ? this.evalTokens(vals) : null);
        }
        case 'try': {
          this.next();
          const body = this.at('{') ? this.parseBlockOrStatement() : this.collectUntilKeyword(['catch', 'except', 'finally', 'rescue']);
          let caught: any = null;
          try { this.runTokens(body); } catch (e) { if (e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal) throw e; caught = e; }
          this.skipNl();
          if (caught && (this.at('catch') || this.at('except') || this.at('rescue'))) {
            this.next();
            let bindName: string | null = null;
            if (this.at('(')) {
              this.next();
              if (this.peek().t === 'id') bindName = this.next().v;
              this.expect(')');
            } else if (this.peek().t === 'id' && this.peek().v !== '{') {
              bindName = this.next().v;
            }
            if (bindName) this.global.vars.set(bindName, caught instanceof Error ? caught.message : String(caught));
            const handler = this.at('{') ? this.parseBlockOrStatement() : this.collectUntilKeyword(['finally', 'end']);
            this.runTokens(handler);
          }
          this.skipNl();
          if (this.at('finally')) {
            this.next();
            const fin = this.at('{') ? this.parseBlockOrStatement() : this.collectUntilKeyword(['end']);
            this.runTokens(fin);
          }
          return;
        }
        case 'throw':
        case 'raise': {
          this.next();
          const v = this.exprUntilTerm();
          throw new RtError(toStr(this.evalTokens(v)));
        }
        case 'echo': {
          this.next();
          const parts: Tok[][] = [];
          let cur: Tok[] = [];
          let depth = 0;
          let guard = 0;
          while (this.peek().t !== 'eof' && guard++ < 4000) {
            const tk = this.peek();
            if (tk.t === 'nl' || (tk.v === ';' && depth === 0)) break;
            if (tk.v === '(' || tk.v === '[') depth++;
            if (tk.v === ')' || tk.v === ']') depth--;
            if (tk.v === ',' && depth === 0) { parts.push(cur); cur = []; this.next(); continue; }
            cur.push(this.next());
          }
          parts.push(cur);
          if (parts.length === 1 || cur.length) {
            this.write(parts.map((p) => (p.length ? toStr(this.evalTokens(p)) : '')).join(''));
          }
          return;
        }
        case 'print': {
          this.next();
          const v = this.parseParenExpr();
          this.write(toStr(this.evalTokens(v)));
          return;
        }
        case 'println':
        case 'puts':
        case 'say': {
          this.next();
          const v = this.parseParenExpr();
          this.write(toStr(this.evalTokens(v)) + '\n');
          return;
        }
        case 'local':
        case 'global':
        case 'let':
        case 'var':
        case 'const':
        case 'val':
        case 'mut':
        case 'auto':
          this.next();
          this.parseDeclarations();
          return;
        case 'package':
        case 'import':
        case 'using':
        case 'use':
        case 'require':
        case 'include':
        case 'namespace': {
          while (this.peek().t !== 'eof' && this.peek().t !== 'nl' && !this.at(';')) this.next();
          return;
        }
        default:
          break;
      }
      if (this.tryTypedDeclaration()) return;
    }
    // expression / assignment
    const expr = this.exprUntilTerm();
    if (expr.length) this.evalTokensWithAssign(expr);
  }

  /** Detects and executes `Type name = value;` style declarations. */
  tryTypedDeclaration(): boolean {
    const save = this.pos;
    const prefix: Tok[] = [];
    let depth = 0;
    let guard = 0;
    let eqIndex = -1;
    const lineLimit = this.peek().line;
    while (guard++ < 120) {
      const tk = this.peek();
      if (tk.t === 'eof') break;
      if (depth === 0 && (tk.t === 'nl' || tk.v === ';')) break;
      if (depth === 0 && tk.v === '{') break;
      if (tk.v === '(') depth++;
      if (tk.v === ')') depth--;
      if (depth === 0 && (tk.v === '=' || tk.v === ':=')) { eqIndex = prefix.length; break; }
      if (tk.t === 'nl' && prefix.length && tk.line !== lineLimit) break;
      prefix.push(this.next());
    }
    if (this.pos === save) return false;

    const allowedOps = new Set(['::', '<', '>', '*', '&', '?', '[', ']', ',', '|', '^', '.', 'const']);
    // Track bracket depth: anything inside `[...]` is an array size/expression, not a type token.
    let typeOk = true;
    let bdepth = 0;
    for (let i = 0; i < prefix.length; i++) {
      const tk = prefix[i];
      if (tk.v === '[') { bdepth++; continue; }
      if (tk.v === ']') { bdepth = Math.max(0, bdepth - 1); continue; }
      if (bdepth > 0) continue;
      if (tk.t === 'id') continue;
      if (tk.t === 'op' && allowedOps.has(tk.v)) continue;
      typeOk = false;
      break;
    }
    // The declared name is the last plain identifier before any array/pointer suffix
    // (`int a[3]` -> a, `char *s` -> s, `int *p` -> p).
    let nameTokIdx = -1;
    for (let i = prefix.length - 1; i >= 0; i--) {
      if (prefix[i].t === 'id') { nameTokIdx = i; break; }
    }
    const nameTok = nameTokIdx >= 0 ? prefix[nameTokIdx] : { t: 'id', v: '', line: 0 } as Tok;
    // Rewind so the array/pointer suffix after the name can be parsed by the caller.
    if (nameTokIdx >= 0 && nameTokIdx < prefix.length - 1) {
      let back = prefix.length - 1 - nameTokIdx;
      while (back-- > 0) this.pos--;
    }
    const looksLikeTypePrefix = prefix.length >= 2 && nameTok.t === 'id' && prefix.every((tk, i) => {
      if (i > nameTokIdx) return tk.t === 'op' || tk.t === 'num'; // array/pointer suffix after the name
      return tk.t === 'id' || (tk.t === 'op' && allowedOps.has(tk.v));
    }) && (nameTok.v !== 'in' && nameTok.v !== 'of');
    const hasTypeBefore = prefix.slice(0, nameTokIdx).some((tk) => tk.t === 'id' && !['const', 'let', 'var', 'final', 'auto', 'static', 'mut', 'readonly'].includes(tk.v));
    const prevIsDot = nameTokIdx >= 1 && prefix[nameTokIdx - 1].v === '.';
    const prevIsScope = nameTokIdx >= 1 && prefix[nameTokIdx - 1].v === '::';

    if (!typeOk || !looksLikeTypePrefix || (!hasTypeBefore && eqIndex !== 0) || prevIsDot && eqIndex === -1) {
      this.pos = save;
      return false;
    }
    if (prefix.length === 1) { this.pos = save; return false; }

    const name = nameTok.v;
    let value: Val = null;
    // Array declarator: `int a[3]` / `int a[] = {1,2,3}` / `char s[32]`
    let sizeExpr: Val = null;
    let sawArray = false;
    if (this.at('[')) {
      sawArray = true;
      this.next();
      if (!this.at(']')) sizeExpr = this.evalTokens(this.captureExprTokens());
      if (this.at(']')) this.next();
    }
    if (eqIndex >= 0 && this.at('=') || this.at(':=')) {
      this.next();
      if (this.at('{')) {
        const brace = this.captureBraces();
        value = this.evalTokens([{ t: 'op', v: '{', line: 0 } as Tok, ...brace, { t: 'op', v: '}', line: 0 } as Tok]);
      } else {
        value = this.evalTokens(this.captureExprTokens());
      }
    } else if (sawArray) {
      const len = sizeExpr === null ? 0 : Math.max(0, toInt(sizeExpr));
      value = Array.from({ length: len }, () => null);
    } else {
      // `int x;` or pointer syntax
      while (this.at('[')) { this.next(); if (this.at(']')) this.next(); }
    }
    void prevIsScope;
    this.global.vars.set(name, value);
    this.skipTerm();
    return true;
  }

  collectUntilKeyword(keywords: string[]): Tok[] {
    const out: Tok[] = [];
    let depth = 0;
    let guard = 0;
    while (this.peek().t !== 'eof' && guard++ < 20000) {
      const t = this.peek();
      if (depth === 0 && t.t === 'id' && keywords.includes(t.v)) break;
      if (depth === 0 && this.spec.endBlocks && t.t === 'id' && t.v === 'end') break;
      if (t.v === '{' || t.v === '(' || t.v === '[') depth++;
      if (t.v === '}' || t.v === ')' || t.v === ']') depth--;
      out.push(this.next());
    }
    return out;
  }

  wrapAsBlock(): Tok[] {
    return [{ t: 'id', v: 'if', line: 0 } as Tok, ...this.toks.slice(this.pos - 1)];
  }

  parseParenExpr(): Tok[] {
    if (this.at('(')) {
      this.next();
      const out: Tok[] = [];
      let depth = 1;
      let guard = 0;
      while (this.peek().t !== 'eof' && guard++ < 4000) {
        const t = this.peek();
        if (t.v === '(') depth++;
        if (t.v === ')') { depth--; if (depth === 0) { this.next(); break; } }
        out.push(this.next());
      }
      return out;
    }
    // no parentheses: expression to end of line
    return this.exprUntilBlockStart();
  }

  exprUntilBlockStart(): Tok[] {
    const out: Tok[] = [];
    let guard = 0;
    while (this.peek().t !== 'eof' && guard++ < 2000) {
      const t = this.peek();
      if (t.t === 'nl' || t.v === '{') break;
      if (this.spec.endBlocks && t.t === 'id' && (t.v === 'do' || t.v === 'then')) break;
      out.push(this.next());
    }
    return out;
  }

  exprUntilTerm(): Tok[] {
    const out: Tok[] = [];
    let depth = 0;
    let guard = 0;
    while (this.peek().t !== 'eof' && guard++ < 4000) {
      const t = this.peek();
      if (t.t === 'nl' && depth === 0) break;
      if (t.v === ';' && depth === 0) break;
      if (t.v === '{' && depth === 0) break;
      if (t.v === '}') break;
      if (t.v === '(' || t.v === '[') depth++;
      if (t.v === ')' || t.v === ']') depth--;
      out.push(this.next());
    }
    return out;
  }

  parseBlockOrStatement(): Tok[] {
    this.skipNl();
    if (this.at('{')) return this.captureBraces();
    if (this.spec.endBlocks) {
      if (this.at('then') || this.at('do')) this.next();
      return this.collectUntilEnd();
    }
    // single statement
    const out: Tok[] = [];
    let guard = 0;
    while (this.peek().t !== 'eof' && guard++ < 2000) {
      const t = this.peek();
      if (t.v === ';') { out.push(this.next()); break; }
      if (t.t === 'nl') { this.next(); break; }
      if (t.v === '{') break;
      out.push(this.next());
    }
    return out;
  }

  collectUntilEnd(): Tok[] {
    const out: Tok[] = [];
    let depth = 0;
    let guard = 0;
    const openers = ['if', 'for', 'while', 'repeat', 'function', 'def', 'do', 'case', 'begin', 'unless', 'until', 'foreach'];
    while (this.peek().t !== 'eof' && guard++ < 30000) {
      const t = this.peek();
      if (t.t === 'id' && openers.includes(t.v)) depth++;
      if (t.t === 'id' && t.v === 'end') {
        if (depth === 0) { this.next(); break; }
        depth--;
      }
      out.push(this.next());
    }
    return out;
  }

  parseDeclarations(): void {
    let guard = 0;
    while (guard++ < 50) {
      this.skipTypeAnnotations();
      this.skipNl();
      const nameTok = this.peek();
      if (nameTok.t !== 'id') { this.skipTerm(); return; }
      const name = this.next().v;
      // destructuring
      let value: Val = null;
      if (this.at('=')) {
        this.next();
        const exprTok = this.captureExprTokens();
        value = this.evalTokens(exprTok);
      } else if (this.at(':') && !this.spec.semi) {
        this.next();
        this.skipTypeAnnotations();
        while (this.at('*')) this.next();
      } else if (this.at(':=')) {
        this.next();
        value = this.evalTokens(this.captureExprTokens());
      }
      this.global.vars.set(name, value);
      if (this.at(',')) { this.next(); continue; }
      break;
    }
    this.skipTerm();
  }

  parseFor(): void {
    // C-style: for (init; cond; step)
    if (this.at('(')) {
      const savePos = this.pos;
      this.next();
      const header: Tok[][] = [[]];
      let depth = 0;
      let guard = 0;
      let isC = false;
      while (this.peek().t !== 'eof' && guard++ < 4000) {
        const t = this.peek();
        if (t.v === ';' && depth === 0) { isC = true; header.push([]); this.next(); continue; }
        if (t.v === ')') {
          if (depth === 0) { this.next(); break; } // closes the for-header
          depth--;
          header[header.length - 1].push(this.next());
          continue;
        }
        if (t.v === '(') depth++;
        header[header.length - 1].push(this.next());
      }
      if (isC && header.length >= 2) {
        // init
        if (header[0].length) {
          const sub = this.subRun(header[0]);
          sub.execTokens();
        }
        const cond = header[1];
        const step = header[2] ?? [];
        const body = this.parseBlockOrStatement();
        let iterations = 0;
        while (cond.length === 0 || truthy(this.evalTokens(cond))) {
          this.tick();
          if (++iterations > 1_000_000) throw new RtError('ExecutionLimit: for loop exceeded 1,000,000 iterations');
          try { this.runTokens(body); }
          catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) { /* fallthrough */ } else throw e; }
          if (step.length) this.evalTokensWithAssign(step);
        }
        return;
      }
      // for-of / range style: for (x : arr) / for x in arr / for (int i : arr)
      this.pos = savePos;
      this.next();
      this.skipTypeAnnotations();
      const varName = this.peek().t === 'id' ? this.next().v : '_';
      let iterableToks: Tok[] = [];
      if (this.at(':') || this.at('in') || this.at('of')) {
        this.next();
        iterableToks = this.captureExprTokens();
        this.expect(')');
      } else {
        this.expect(')');
      }
      const body = this.parseBlockOrStatement();
      const iterable = this.evalTokens(iterableToks);
      const items = Array.isArray(iterable) ? iterable : typeof iterable === 'string' ? Array.from(iterable) : iterable instanceof Map ? [...iterable.keys()] : [];
      for (const item of items) {
        this.global.vars.set(varName, item);
        try { this.runTokens(body); }
        catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; else throw e; }
      }
      return;
    }
    // for i in range(...) / for i in 1..10
    this.skipTypeAnnotations();
    const varName = this.peek().t === 'id' ? this.next().v : '_';
    if (this.at('in')) this.next();
    else if (this.at('of')) this.next();
    const iterToks = this.exprUntilBlockStart();
    const body = this.parseBlockOrStatement();
    const iterable = this.evalTokens(iterToks);
    const items = Array.isArray(iterable) ? iterable : typeof iterable === 'string' ? Array.from(iterable) : iterable instanceof Map ? [...iterable.keys()] : typeof iterable === 'number' ? Array.from({ length: Math.max(0, iterable) }, (_, i) => i) : [];
    for (const item of items) {
      this.global.vars.set(varName, item);
      try { this.runTokens(body); }
      catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; else throw e; }
    }
  }

  parseForeach(): void {
    if (this.at('(')) this.next();
    const varName = this.peek().t === 'id' ? this.next().v : '_';
    if (this.at('=>')) { this.next(); this.next(); }
    if (this.at('in') || this.at('as')) this.next();
    const iterToks = this.captureExprTokens();
    if (this.at(')')) this.next();
    const body = this.parseBlockOrStatement();
    const iterable = this.evalTokens(iterToks);
    const items = Array.isArray(iterable) ? iterable : iterable instanceof Map ? [...iterable.values()] : [];
    for (const item of items) {
      this.global.vars.set(varName, item);
      try { this.runTokens(body); }
      catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; else throw e; }
    }
  }

  parseSwitch(): void {
    if (this.at('(')) this.next();
    const discToks = this.captureExprTokens();
    if (this.at(')')) this.next();
    const disc = this.evalTokens(discToks);
    if (!this.at('{')) { this.skipTerm(); return; }
    const body = this.captureBraces();
    const sub = this.subRun(body);
    sub.global.vars = this.global.vars;
    sub.execSwitch(disc);
    void sub;
  }

  execSwitch(disc: Val): void {
    // find cases
    const startPos = 0;
    this.pos = startPos;
    let guard = 0;
    let matched = false;
    while (this.peek().t !== 'eof' && guard++ < 2000) {
      this.skipNl();
      if (this.at('case')) {
        this.next();
        const caseToks = this.exprUntilColon();
        this.eat(':');
        const isMatch = jsEq(this.evalTokens(caseToks), disc) || toStr(this.evalTokens(caseToks)) === toStr(disc);
        if (isMatch) matched = true;
        if (matched) {
          const block = this.collectUntilCase();
          try { this.runTokens(block); } catch (e) { if (e instanceof BreakSignal) break; throw e; }
        }
      } else if (this.at('default')) {
        this.next();
        this.eat(':');
        if (!matched) {
          const block = this.collectUntilCase();
          try { this.runTokens(block); } catch (e) { if (e instanceof BreakSignal) break; throw e; }
        }
      } else {
        this.next();
      }
    }
  }

  exprUntilColon(): Tok[] {
    const out: Tok[] = [];
    let depth = 0;
    while (this.peek().t !== 'eof') {
      const t = this.peek();
      if (t.v === '(' || t.v === '[') depth++;
      if (t.v === ')' || t.v === ']') depth--;
      if (t.v === ':' && depth === 0) break;
      out.push(this.next());
    }
    return out;
  }

  collectUntilCase(): Tok[] {
    const out: Tok[] = [];
    let depth = 0;
    while (this.peek().t !== 'eof') {
      const t = this.peek();
      if (depth === 0 && (this.at('case') || this.at('default'))) break;
      if (t.v === '{' || t.v === '(') depth++;
      if (t.v === '}' || t.v === ')') depth--;
      out.push(this.next());
    }
    return out;
  }

  /* --------------------------- block exec --------------------------- */
  runTokens(tokens: Tok[]): void {
    if (!tokens.length) return;
    const sub = this.subRun(tokens);
    sub.execTokens();
  }

  subRun(tokens: Tok[]): CFamilyRuntime {
    const sub = new CFamilyRuntime({ ...this.opts, dialect: this.opts.dialect });
    sub.toks = [...tokens, { t: 'eof', v: '', line: 0 } as Tok];
    sub.pos = 0;
    sub.global = { vars: this.global.vars, parent: this.global };
    sub.funcs = this.funcs;
    sub.classes = this.classes;
    sub.stepsShared = this.stepsShared;
    return sub;
  }

  execTokens(): void {
    this.skipNl();
    while (this.peek().t !== 'eof') {
      this.parseStatementSafely();
      this.skipNl();
      this.skipTerm();
      this.skipNl();
    }
  }

  parseStatementSafely(): void {
    const start = this.pos;
    try {
      // C++ stream output also appears inside function bodies.
      if (this.tryStreamOutput()) return;
      this.parseStatement();
    } catch (err) {
      if (err instanceof BreakSignal || err instanceof ContinueSignal || err instanceof ReturnSignal || err instanceof RtError) throw err;
      throw err;
    } finally {
      if (this.pos === start) this.next();
    }
  }

  /* --------------------------- expressions -------------------------- */
  evalTokens(tokens: Tok[]): Val {
    if (!tokens.length) return null;
    // C/C++/Java brace initializer list: {1, 2, 3}
    if (tokens[0].v === '{' && tokens[tokens.length - 1].v === '}') {
      const inner = tokens.slice(1, -1);
      const parts: Tok[][] = [];
      let cur: Tok[] = [];
      let depth = 0;
      for (const tk of inner) {
        if (tk.v === '(' || tk.v === '[' || tk.v === '{') depth++;
        if (tk.v === ')' || tk.v === ']' || tk.v === '}') depth--;
        if (tk.v === ',' && depth === 0) { parts.push(cur); cur = []; continue; }
        cur.push(tk);
      }
      if (cur.length) parts.push(cur);
      if (parts.length && parts.every((p) => p.length && p[0].v !== ':' && p.every((tk) => tk.v !== ':' || tk.t === 'op'))) {
        if (!inner.some((tk) => tk.t === 'op' && tk.v === ':')) {
          return parts.map((p) => this.evalTokens(p));
        }
      }
    }
    const sub = this.subRun(tokens);
    return sub.parseExprTokens();
  }

  evalTokensWithAssign(tokens: Tok[]): Val {
    if (!tokens.length) return null;
    const sub = this.subRun(tokens);
    // assignment detection at top level
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.v === '(' || t.v === '[' || t.v === '{') depth++;
      if (t.v === ')' || t.v === ']' || t.v === '}') depth--;
      if (depth === 0 && t.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '|=', '^=', '**=', '//='].includes(t.v)) {
        const targetToks = tokens.slice(0, i);
        const valueToks = tokens.slice(i + 1);
        const value = sub.evalTokens(valueToks);
        const op = t.v;
        sub.assignTo(targetToks, op, value);
        return value;
      }
      if (depth === 0 && t.v === '+=' || depth === 0 && t.v === '-=') {
        // handled above
      }
    }
    return sub.parseExprTokens();
  }

  assignTo(targetToks: Tok[], op: string, value: Val): void {
    const sub = this.subRun(targetToks);
    // simple name
    if (targetToks.length === 1 && targetToks[0].t === 'id') {
      const name = targetToks[0].v;
      if (op === '=') { this.global.vars.set(name, value); return; }
      const cur = this.global.vars.get(name) ?? null;
      this.global.vars.set(name, this.applyOp(op.slice(0, -1), cur, value));
      return;
    }
    // Index / member: evaluate prefix, then set
    const lastIdx = targetToks.length - 1;
    const t = targetToks[lastIdx];
    if (t.v === ']') {
      // find matching '['
      let depth = 0;
      let open = -1;
      for (let i = lastIdx; i >= 0; i--) {
        if (targetToks[i].v === ']') depth++;
        if (targetToks[i].v === '[') { depth--; if (depth === 0) { open = i; break; } }
      }
      if (open > 0) {
        const obj = sub.evalTokens(targetToks.slice(0, open));
        const idx = sub.evalTokens(targetToks.slice(open + 1, lastIdx));
        if (Array.isArray(obj)) {
          const i = toInt(idx);
          const cur = obj[i] ?? null;
          obj[i < 0 ? obj.length + i : i] = op === '=' ? value : this.applyOp(op.slice(0, -1), cur, value);
        } else if (obj instanceof Map) {
          const key = toStr(idx);
          const cur = obj.get(key) ?? null;
          obj.set(key, op === '=' ? value : this.applyOp(op.slice(0, -1), cur, value));
        } else if (obj && typeof obj === 'object') {
          const key = toStr(idx);
          (obj as any)[key] = op === '=' ? value : this.applyOp(op.slice(0, -1), (obj as any)[key], value);
        }
        return;
      }
    }
    if (t.v === '.' && targetToks.length >= 3) {
      const obj = sub.evalTokens(targetToks.slice(0, lastIdx - 1));
      const prop = targetToks[lastIdx].v;
      if (obj && typeof obj === 'object') {
        (obj as any)[prop] = op === '=' ? value : this.applyOp(op.slice(0, -1), (obj as any)[prop], value);
      }
      return;
    }
    // `*p = v` — assign through a reference cell (`&x`). The `*` is the *first* token.
    if (targetToks.length >= 2 && targetToks[0].t === 'op' && targetToks[0].v === '*') {
      const target = sub.evalTokens(targetToks.slice(1));
      if (target && typeof target === 'object' && (target as any).__ref) {
        const cell = (target as any).vars as Map<string, Val>;
        const name = (target as any).name;
        const cur = cell.get(name) ?? null;
        cell.set(name, op === '=' ? value : this.applyOp(op.slice(0, -1), cur, value));
      }
      return;
    }
    // fallback: property name
    if (t.t === 'id') this.global.vars.set(t.v, value);
  }

  applyOp(op: string, a: Val, b: Val): Val {
    switch (op) {
      case '+': return this.add(a, b);
      case '-': return toNum(a) - toNum(b);
      case '*': return toNum(a) * toNum(b);
      case '/': return toNum(b) === 0 ? (this.opts.dialect === 'php' ? Infinity : (() => { throw new RtError('DivisionByZero: division by zero'); })()) : toNum(a) / toNum(b);
      case '//': return Math.floor(toNum(a) / toNum(b));
      case '%': return toNum(a) % toNum(b);
      case '**': return Math.pow(toNum(a), toNum(b));
      case '&': return toInt(a) & toInt(b);
      case '|': return toInt(a) | toInt(b);
      case '^': return toInt(a) ^ toInt(b);
      case '<<': return toInt(a) << toInt(b);
      case '>>': return toInt(a) >> toInt(b);
      default: return b;
    }
  }

  add(a: Val, b: Val): Val {
    if (typeof a === 'string' || typeof b === 'string') {
      if (Array.isArray(a) || Array.isArray(b)) {
        if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      }
      return toStr(a) + toStr(b);
    }
    if (Array.isArray(a)) return [...a, b];
    return toNum(a) + toNum(b);
  }

  parseExprTokens(): Val {
    const v = this.parseTernary();
    return v;
  }

  atOps(...ops: string[]): boolean {
    const t = this.peek();
    return t.t === 'op' && ops.includes(t.v);
  }

  parseTernary(): Val {
    const cond = this.parseNullish();
    if (this.at('?') && !this.at('?.')) {
      this.next();
      // Only the taken arm may run: parsing the other arm with side effects
      // suppressed keeps the cursor moving without breaking short-circuit recursion.
      const takeA = truthy(cond);
      let a: Val = null;
      let b: Val = null;
      if (takeA) {
        a = this.parseTernary();
        this.expect(':');
        this.suppress++;
        try { b = this.parseTernary(); } finally { this.suppress--; }
        void b;
        return a;
      }
      this.suppress++;
      try { a = this.parseTernary(); } finally { this.suppress--; }
      void a;
      this.expect(':');
      b = this.parseTernary();
      return b;
    }
    if (this.at('?')) this.next(); // ? : shorthand
    return cond;
  }

  parseNullish(): Val {
    let left = this.parseOr();
    while (this.at('??')) {
      this.next();
      const right = this.parseOr();
      if (left === null || left === undefined) left = right;
    }
    return left;
  }

  parseOr(): Val {
    let left = this.parseAnd();
    while (this.at('||') || this.at('or') || this.at('|>')) {
      this.next();
      const right = this.parseAnd();
      left = truthy(left) ? left : right;
    }
    return left;
  }

  parseAnd(): Val {
    let left = this.parseBitOr();
    while (this.at('&&') || this.at('and')) {
      this.next();
      const right = this.parseBitOr();
      left = truthy(left) ? right : left;
    }
    return left;
  }

  parseBitOr(): Val {
    let left = this.parseBitXor();
    while (this.at('|')) {
      this.next();
      left = toInt(left) | toInt(this.parseBitXor());
    }
    return left;
  }
  parseBitXor(): Val {
    let left = this.parseBitAnd();
    while (this.at('^')) {
      this.next();
      left = toInt(left) ^ toInt(this.parseBitAnd());
    }
    return left;
  }
  parseBitAnd(): Val {
    let left = this.parseEquality();
    while (this.at('&')) {
      this.next();
      left = toInt(left) & toInt(this.parseEquality());
    }
    return left;
  }
  parseEquality(): Val {
    let left = this.parseRelational();
    let guard = 0;
    while (guard++ < 50 && (this.at('==') || this.at('!=') || this.at('===') || this.at('!==') || this.at('<>'))) {
      const op = this.next().v;
      const right = this.parseRelational();
      const eq = op === '==' || op === '===' ? this.looseEq(left, right) : !this.looseEq(left, right);
      left = eq;
    }
    return left;
  }

  looseEq(a: Val, b: Val): boolean {
    if (jsEq(a, b)) return true;
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (a instanceof Map && b instanceof Map) return false;
    if (typeof a === 'string' && typeof b === 'string') return a === b;
    if (typeof a === 'number' && typeof b === 'string') return toStr(a) === b;
    if (typeof a === 'string' && typeof b === 'number') return a === toStr(b);
    return false;
  }

  parseRelational(): Val {
    let left = this.parseShift();
    let guard = 0;
    while (guard++ < 50 && (this.at('<') || this.at('>') || this.at('<=') || this.at('>=') || this.at('instanceof') || this.at('in'))) {
      const op = this.next().v;
      const right = this.parseShift();
      switch (op) {
        case '<': left = toNum(left) < toNum(right); break;
        case '>': left = toNum(left) > toNum(right); break;
        case '<=': left = toNum(left) <= toNum(right); break;
        case '>=': left = toNum(left) >= toNum(right); break;
        case 'in':
          if (right instanceof Map) left = (right as Map<string, Val>).has(toStr(left));
          else if (Array.isArray(right)) left = right.some((x) => this.looseEq(x, left));
          else left = toStr(right).includes(toStr(left));
          break;
        case 'instanceof': left = true; break;
        default: left = false;
      }
    }
    return left;
  }

  parseShift(): Val {
    let left = this.parseAdd();
    while (this.at('<<') || this.at('>>') || this.at('..')) {
      const op = this.next().v;
      const right = this.parseAdd();
      if (op === '<<') left = toInt(left) << toInt(right);
      else if (op === '>>') left = toInt(left) >> toInt(right);
      else {
        const a = toInt(left), b = toInt(right);
        left = Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
      }
    }
    return left;
  }

  parseAdd(): Val {
    let left = this.parseMul();
    while (this.at('+') || this.at('-') || this.at('..')) {
      const op = this.next().v;
      const right = this.parseMul();
      if (this.suppress > 0) { left = null; continue; }
      if (op === '+') left = this.add(left, right);
      else if (op === '-') left = toNum(left) - toNum(right);
      else {
        const a = toInt(left), b = toInt(right);
        left = Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
      }
    }
    return left;
  }

  parseMul(): Val {
    let left = this.parseUnary();
    while (this.at('*') || this.at('/') || this.at('%') || this.at('//') || this.at('**')) {
      const op = this.next().v;
      const right = this.parseUnary();
      left = this.suppress > 0 ? null : this.applyOp(op, left, right);
    }
    return left;
  }

  parseUnary(): Val {
    const t = this.peek();
    if (t.v === '-' && t.t === 'op') { this.next(); const x = this.parseUnary(); return this.suppress > 0 ? null : -toNum(x); }
    if (t.v === '+' && t.t === 'op') { this.next(); const x = this.parseUnary(); return this.suppress > 0 ? null : toNum(x); }
    if (t.v === '!' && t.t === 'op') { this.next(); return !truthy(this.parseUnary()); }
    if (t.v === '~' && t.t === 'op') { this.next(); return ~toInt(this.parseUnary()); }
    if (t.t === 'id' && t.v === 'not') { this.next(); return !truthy(this.parseUnary()); }
    if (t.t === 'id' && ['new', 'delete', 'typeof', 'sizeof', 'await', 'mut', 'ref', '&'].includes(t.v)) {
      this.next();
      if (t.v === 'new') return this.parsePostfix();
      if (t.v === 'sizeof') return 8;
      if (t.v === 'typeof') return typeof this.parseUnary();
      return this.parseUnary();
    }
    if (t.t === 'op' && t.v === '&') {
      this.next();
      // `&x` makes a reference cell so `*p = v` can write back through it.
      if (this.peek().t === 'id' && this.peek(1).v !== '(') {
        const name = this.next().v;
        return { __ref: true, name, vars: this.global.vars } as any;
      }
      return this.parseUnary();
    }
    if (t.t === 'op' && t.v === '*') {
      this.next();
      const inner = this.parseUnary();
      if (inner && typeof inner === 'object' && (inner as any).__ref) return (inner as any).vars.get((inner as any).name) ?? null;
      return inner;
    }
    if (t.v === '++' || t.v === '--') {
      const op = this.next().v;
      const name = this.next().v;
      const cur = toNum(this.global.vars.get(name) ?? 0);
      const nv = op === '++' ? cur + 1 : cur - 1;
      this.global.vars.set(name, nv);
      return nv;
    }
    if (t.t === 'id' && (t.v === 'true' || t.v === 'True')) { this.next(); return true; }
    if (t.t === 'id' && (t.v === 'false' || t.v === 'False')) { this.next(); return false; }
    if (t.t === 'id' && (t.v === 'null' || t.v === 'nil' || t.v === 'None')) { this.next(); return null; }
    return this.parsePostfix();
  }

  parsePostfix(): Val {
    // remember a plain identifier so `i++` / `i--` can write the new value back
    let lvalueName: string | null = this.peek().t === 'id' && this.lookahead(1).v !== '(' ? this.peek().v : null;
    let v = this.parsePrimary();
    let guard = 0;
    while (guard++ < 200) {
      const t = this.peek();
      if (t.v === '(') {
        this.next();
        const args: Val[] = [];
        while (!this.at(')') && this.peek().t !== 'eof') {
          args.push(this.parseTernary());
          if (!this.eat(',')) break;
          this.skipNl();
        }
        this.expect(')');
        // Java's `s.length()` / Kotlin's `x.size()` — the member already yields the value.
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') { continue; }
        v = this.callValue(v, args);
        continue;
      }
      if (t.v === '[') {
        this.next();
        const idx = this.parseTernary();
        this.expect(']');
        v = this.suppress > 0 ? null : this.indexValue(v, idx);
        continue;
      }
      if (t.v === '.' || t.v === '->' || t.v === '::' || t.v === '?.') {
        this.next();
        if (this.at('.')) { this.next(); continue; }
        if (this.peek().t === 'id' || this.peek().t === 'num') {
          const name = this.next().v;
          v = this.getMember(v, name);
          continue;
        }
        continue;
      }
      if (t.v === '++' || t.v === '--') {
        this.next();
        const before = toNum(v);
        v = before + (t.v === '++' ? 1 : -1);
        if (lvalueName) this.global.vars.set(lvalueName, v);
        continue;
      }
      lvalueName = null; // any call/index/member access breaks the simple-name lvalue
      break;
    }
    return v;
  }

  lookahead(offset: number): Tok {
    return this.toks[this.pos + offset] ?? ({ t: 'eof', v: '', line: 0 } as Tok);
  }

  /** Detect a `( type )` cast starting at token index `i`; returns token count + base type name. */
  castAhead(i: number): { tokens: number; name: string } | null {
    const raw = this.toks[i];
    if (!raw || raw.v !== '(') return null;
    let j = i + 1;
    const words: string[] = [];
    while (j < this.toks.length) {
      const tk = this.toks[j];
      if (tk.v === ')') break;
      if (tk.t !== 'id' && !(tk.t === 'op' && (tk.v === '*' || tk.v === '&' || tk.v === '::'))) return null;
      if (tk.t === 'id') words.push(tk.v);
      j++;
    }
    if (this.toks[j]?.v !== ')') return null;
    const after = this.toks[j + 1];
    if (!after || after.t === 'eof') return null;
    // the next token must start an operand, not an operator/terminator
    const startsOperand = after.t === 'num' || after.t === 'str' || after.t === 'id' || after.v === '(' || after.v === '-' || after.v === '!';
    if (!startsOperand) return null;
    if (!words.length) return null;
    const base = words[0];
    const KNOWN = new Set(['int', 'long', 'short', 'char', 'float', 'double', 'unsigned', 'signed',
      'size_t', 'void', 'bool', 'uint', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
      'int8_t', 'int16_t', 'int32_t', 'int64_t', 'wchar_t', 'byte', 'string', 'auto']);
    const isTypedefish = /_t$/.test(base);
    if (!KNOWN.has(base) && !isTypedefish) return null;
    // `(x)` alone would be a paren expr; require a cast-looking token sequence
    if (words.length === 1 && words[0] === 'int' && this.toks[i + 2]?.t === 'id' && this.toks[i + 2]?.line === raw.line) {
      // `(int)foo` inside e.g. `printf("%d", (int)x)` — still a cast
      return { tokens: 3, name: 'int' };
    }
    return { tokens: j - i + 1, name: base };
  }

  parsePrimary(): Val {
    const t = this.peek();
    if (t.t === 'num') { this.next(); return t.n; }
    if (t.t === 'str') { this.next(); return this.interpolate(t.v); }
    if (t.v === '(') {
      // C-style cast: `(int)expr`, `(char*)p`, `(double)(x)` — type in parens, then an operand.
      const cast = this.castAhead(this.pos);
      if (cast) {
        for (let k = 0; k < cast.tokens; k++) this.next();
        this.skipNl();
        const inner = this.suppress > 0 ? (this.parseUnary(), null) : this.parseUnary();
        if (/^(int|long|short|char|unsigned|signed|size_t|uint\d+_t|int\d+_t)$/.test(cast.name)) return toInt(inner);
        if (/^(float|double)$/.test(cast.name)) return toNum(inner);
        return inner;
      }
      this.next();
      if (this.at(')')) { this.next(); return null; }
      const v = this.parseTernary();
      while (this.at(',')) {
        this.next();
        this.parseTernary();
      }
      this.expect(')');
      return v;
    }
    if (t.v === '[') {
      this.next();
      const arr: Val[] = [];
      while (!this.at(']') && this.peek().t !== 'eof') {
        this.skipNl();
        if (this.at(']')) break;
        if (this.at('...')) { this.next(); const sp = this.parseTernary(); if (Array.isArray(sp)) arr.push(...sp); continue; }
        arr.push(this.parseTernary());
        if (!this.eat(',')) break;
        this.skipNl();
      }
      this.expect(']');
      return arr;
    }
    if (t.v === '{') {
      this.next();
      const obj: any = {};
      while (!this.at('}') && this.peek().t !== 'eof') {
        this.skipNl();
        if (this.at('}')) break;
        if (this.at('...')) { this.next(); const sp = this.parseTernary(); if (sp && typeof sp === 'object') Object.assign(obj, sp); continue; }
        let key = '';
        if (this.peek().t === 'str') key = this.next().v;
        else if (this.at('[')) { this.next(); key = toStr(this.parseTernary()); this.expect(']'); }
        else key = this.next().v;
        let value: Val = true;
        if (this.at(':')) { this.next(); value = this.parseTernary(); }
        else if (this.peek().t === 'op' && this.peek().v === '(') { value = this.global.vars.get(key) ?? null; }
        obj[key] = value;
        if (!this.eat(',')) break;
        this.skipNl();
      }
      this.expect('}');
      return obj;
    }
    if (t.t === 'id') {
      // lambda / arrow functions
      if (this.peek(1).v === '=>') {
        const params = [this.next().v];
        this.next(); // =>
        const bodyStart = this.pos;
        const body = this.exprUntilTerm();
        void bodyStart;
        const self = this;
        return { __fn: true, name: 'lambda', params: params.map((p) => ({ name: p })), body, lambda: true, self };
      }
      if (t.v === 'function') {
        this.next();
        let name = 'anonymous';
        if (this.peek().t === 'id') name = this.next().v;
        const params: { name: string }[] = [];
        if (this.at('(')) {
          this.next();
          while (!this.at(')') && this.peek().t !== 'eof') {
            this.skipTypeAnnotations();
            if (this.peek().t === 'id') params.push({ name: this.next().v });
            if (!this.eat(',')) break;
          }
          this.expect(')');
        }
        let body: Tok[] = [];
        if (this.at('{')) body = this.captureBraces();
        else { body = [{ t: 'id', v: 'return', line: 0 } as Tok, ...this.exprUntilTerm()]; }
        const f = { __fn: true, name, params, body, globals: this.global };
        if (name !== 'anonymous') { this.global.vars.set(name, f); this.funcs.set(name, f); }
        return f;
      }
      // macro-style call: println!("...", x)
      if (this.peek(1).v === '!' && this.peek(2).v === '(') {
        this.next(); this.next(); this.next();
        const name = t.v + '!';
        const args: Val[] = [];
        while (!this.at(')') && this.peek().t !== 'eof') {
          args.push(this.parseTernary());
          if (!this.eat(',')) break;
        }
        this.expect(')');
        const f = this.funcs.get(name);
        if (f) return this.callValue(f, args);
        return args[0] ?? null;
      }
      // typed literal casts:  (int)x handled above; `new Type(args)`
      this.next();
      if (t.v === 'new') return null;
      const existing = this.lookupVar(t.v);
      if (existing !== undefined) return existing;
      // functions map fallback
      if (this.funcs.has(t.v)) return this.funcs.get(t.v);
      return null;
    }
    if (t.t === 'op' && t.v === '...') { this.next(); return this.parseTernary(); }
    // unknown token: skip
    this.next();
    return null;
  }

  interpolate(raw: string): string {
    const d = this.opts.dialect;
    const evalInline = (expr: string): string => {
      try {
        return toStr(new CFamilyRuntime({ ...this.opts, dialect: d }).evalExternal(expr, this.global));
      } catch {
        return '';
      }
    };
    let out = raw;
    if (d === 'ruby') out = out.replace(/#\{([^}]*)\}/g, (_m, inner: string) => evalInline(inner));
    if (d === 'julia') out = out.replace(/\$\(([^)]*)\)/g, (_m, inner: string) => evalInline(inner));
    if (d === 'swift') out = out.replace(/\{([^{}]*)\}/g, (_m, inner: string) => evalInline(inner));
    if (d === 'kotlin' || d === 'dart' || d === 'ruby') {
      out = out.replace(/\$\{([^}]*)\}/g, (_m, inner: string) => evalInline(inner));
    }
    if (d === 'php' || d === 'perl' || d === 'bash' || d === 'kotlin' || d === 'dart') {
      out = out.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_m, name: string) => {
        const v = this.lookupVar(name);
        return v === undefined ? '' : toStr(v);
      });
    }
    if (d === 'ruby') {
      out = out.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name: string) => {
        const v = this.lookupVar(name);
        return v === undefined ? '' : toStr(v);
      });
    }
    return out;
  }

  evalExternal(expr: string, ctx: Ctx): Val {
    this.toks = lex(expr, DIALECTS.java);
    this.pos = 0;
    this.global = ctx;
    return this.parseExprTokens();
  }

  lookupVar(name: string): Val {
    let cur: Ctx | undefined = this.global;
    while (cur) {
      if (cur.vars.has(name)) return cur.vars.get(name);
      cur = cur.parent;
    }
    return undefined;
  }

  indexValue(obj: Val, idx: Val): Val {
    if (obj === null || obj === undefined) return null;
    if (typeof obj === 'string') {
      const i = toInt(idx);
      const k = i < 0 ? obj.length + i : i;
      // C strings are NUL-terminated: past the end reads as 0, so `s[i] != 0` ends loops.
      if (k < 0 || k >= obj.length) return 0;
      return obj[k];
    }
    if (Array.isArray(obj)) {
      const i = toInt(idx);
      return obj[i < 0 ? obj.length + i : i] ?? null;
    }
    if (obj instanceof Map) return (obj as Map<string, Val>).get(toStr(idx)) ?? null;
    if (typeof obj === 'object') return (obj as any)[toStr(idx)] ?? null;
    return null;
  }

  getMember(obj: Val, name: string): Val {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
      switch (name) {
        case 'length': case 'size': case 'count': return obj.length;
        case 'push': case 'append': case 'add': return { __builtin: true, name: 'push', f: (v: Val) => { obj.push(v); return obj.length; } };
        case 'pop': return { __builtin: true, name: 'pop', f: () => obj.pop() ?? null };
        case 'shift': return { __builtin: true, name: 'shift', f: () => obj.shift() ?? null };
        case 'reverse': return { __builtin: true, name: 'reverse', f: () => { obj.reverse(); return obj; } };
        case 'sort': return { __builtin: true, name: 'sort', f: () => { obj.sort((a, b) => toNum(a) - toNum(b)); return obj; } };
        case 'join': return { __builtin: true, name: 'join', f: (sep: Val) => obj.map(toStr).join(toStr(sep ?? '')) };
        case 'map': return { __builtin: true, name: 'map', f: (cb: Val) => obj.map((x) => this.callValue(cb, [x])) };
        case 'filter': return { __builtin: true, name: 'filter', f: (cb: Val) => obj.filter((x) => truthy(this.callValue(cb, [x]))) };
        case 'forEach': return { __builtin: true, name: 'forEach', f: (cb: Val) => { obj.forEach((x) => this.callValue(cb, [x])); return null; } };
        case 'reduce': return { __builtin: true, name: 'reduce', f: (cb: Val, init: Val) => obj.reduce((acc, x) => this.callValue(cb, [acc, x]), init) };
        case 'includes': case 'contains': return { __builtin: true, name: 'includes', f: (v: Val) => obj.some((x) => this.looseEq(x, v)) };
        case 'indexOf': return { __builtin: true, name: 'indexOf', f: (v: Val) => obj.findIndex((x) => this.looseEq(x, v)) };
        case 'slice': return { __builtin: true, name: 'slice', f: (a: Val, b: Val) => obj.slice(toInt(a), b === undefined ? undefined : toInt(b)) };
        case 'clear': return { __builtin: true, name: 'clear', f: () => { obj.length = 0; return null; } };
        default: {
          const k = /^\d+$/.test(name) ? Number(name) : null;
          if (k !== null) return obj[k] ?? null;
          return null;
        }
      }
    }
    if (typeof obj === 'string') {
      switch (name) {
        case 'length': case 'size': case 'count': return obj.length;
        case 'toUpperCase': case 'upper': case 'upcase': return { __builtin: true, name, f: () => obj.toUpperCase() };
        case 'toLowerCase': case 'lower': case 'downcase': return { __builtin: true, name, f: () => obj.toLowerCase() };
        case 'trim': case 'strip': return { __builtin: true, name, f: () => obj.trim() };
        case 'split': case 'explode': return { __builtin: true, name, f: (sep: Val) => (sep === undefined || toStr(sep) === '' ? Array.from(obj) : obj.split(toStr(sep))) };
        case 'replace': return { __builtin: true, name, f: (a: Val, b: Val) => obj.split(toStr(a)).join(toStr(b)) };
        case 'substring': case 'substr': return { __builtin: true, name, f: (a: Val, b: Val) => obj.substr(toInt(a), b === undefined ? undefined : toInt(b)) };
        case 'startsWith': case 'startswith': return { __builtin: true, name, f: (v: Val) => obj.startsWith(toStr(v)) };
        case 'endsWith': case 'endswith': return { __builtin: true, name, f: (v: Val) => obj.endsWith(toStr(v)) };
        case 'includes': return { __builtin: true, name, f: (v: Val) => obj.includes(toStr(v)) };
        case 'indexOf': return { __builtin: true, name, f: (v: Val) => obj.indexOf(toStr(v)) };
        case 'repeat': return { __builtin: true, name, f: (n: Val) => obj.repeat(toInt(n)) };
        case 'toFixed': return { __builtin: true, name, f: (n: Val) => Number(obj).toFixed(toInt(n)) };
        case 'charAt': return { __builtin: true, name, f: (n: Val) => obj.charAt(toInt(n)) };
        default: return null;
      }
    }
    if (typeof obj === 'number') {
      switch (name) {
        case 'toString': return { __builtin: true, name, f: () => numStr(obj) };
        case 'toFixed': return { __builtin: true, name, f: (n: Val) => obj.toFixed(toInt(n)) };
        case 'to_s': return { __builtin: true, name, f: () => numStr(obj) };
        case 'abs': return Math.abs(obj);
        case 'floor': return Math.floor(obj);
        case 'round': return Math.round(obj);
        default: return null;
      }
    }
    if (obj instanceof Map) {
      if (name === 'size' || name === 'length' || name === 'count') return (obj as Map<string, Val>).size;
      if (name === 'get') return { __builtin: true, name: 'get', f: (k: Val) => (obj as Map<string, Val>).get(toStr(k)) ?? null };
      if (name === 'put' || name === 'set') return { __builtin: true, name, f: (k: Val, v: Val) => { (obj as Map<string, Val>).set(toStr(k), v); return null; } };
      if (name === 'has' || name === 'containsKey' || name === 'contains') return { __builtin: true, name, f: (k: Val) => (obj as Map<string, Val>).has(toStr(k)) };
      if (name === 'keys') return { __builtin: true, name: 'keys', f: () => [...(obj as Map<string, Val>).keys()] };
      if (name === 'values') return { __builtin: true, name: 'values', f: () => [...(obj as Map<string, Val>).values()] };
      if (name === 'entries' || name === 'items') return { __builtin: true, name, f: () => [...(obj as Map<string, Val>).entries()] };
      const v = (obj as Map<string, Val>).get(name);
      if (v !== undefined) return v;
      return null;
    }
    if (typeof obj === 'object') {
      if (name in (obj as any)) {
        const v = (obj as any)[name];
        if (typeof v === 'function') return { __builtin: true, name, f: (...args: Val[]) => v.apply(obj, args) };
        return v;
      }
      return null;
    }
    return null;
  }

  callValue(fnVal: Val, args: Val[]): Val {
    if (this.suppress > 0) return null;
    if (fnVal && typeof fnVal === 'object') {
      if ((fnVal as any).__builtin) return (fnVal as any).f(...args);
      if ((fnVal as any).__fn) {
        const f = fnVal as any;
        const sub = new CFamilyRuntime({ ...this.opts, dialect: this.opts.dialect });
        sub.global = { vars: new Map(this.global.vars), parent: this.global };
        f.params.forEach((p: any, i: number) => {
          if (args[i] !== undefined) { sub.global.vars.set(p.name, args[i]); return; }
          if (p.def && p.def.length) {
            try { sub.global.vars.set(p.name, sub.evalTokens(p.def)); return; } catch { /* default could not be evaluated */ }
          }
          sub.global.vars.set(p.name, null);
        });
        sub.funcs = this.funcs;
        sub.classes = this.classes;
        sub.toks = [...f.body, { t: 'eof', v: '', line: 0 } as Tok];
        sub.pos = 0;
        try {
          sub.execTokens();
        } catch (err) {
          if (err instanceof ReturnSignal) return err.value;
          throw err;
        }
        return null;
      }
    }
    if (typeof fnVal === 'function') return fnVal(...args);
    throw new RtError(`TypeError: ${toStr(fnVal)} is not a function`);
  }

  run(source: string): void {
    const spec = this.spec;
    // handle brace-less indentation-free line languages with `end`
    this.toks = lex(source, spec);
    this.pos = 0;
    try {
      // execute top-level statements (functions/classes registered on the fly)
      this.skipNl();
      while (this.peek().t !== 'eof') {
        const before = this.pos;
        this.parseTopLevel();
        this.skipNl();
        this.skipTerm();
        this.skipNl();
        if (this.pos === before) this.next();
      }
      // Java / C# / Kotlin entry point: run `main` after the class body is registered.
      // Every C-family program we support enters at `main` (Java/C#/Kotlin/C/C++ alike).
      const main = this.funcs.get('main') ?? null;
      if (main && !(main as any).__builtin) this.callValue(main, [[]]);
    } catch (err) {
      if (err instanceof ReturnSignal) return;
      if (err instanceof BreakSignal || err instanceof ContinueSignal) {
        this.err('SyntaxError: break/continue outside of loop\n');
        return;
      }
      if (err instanceof RtError) {
        this.err(`${err.message}\n`);
        return;
      }
      if (err instanceof RangeError && /call stack/i.test(err.message)) {
        this.err('StackOverflow: maximum recursion depth exceeded\n');
        return;
      }
      this.err(`${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

