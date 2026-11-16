/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WaffleCode Python 3 interpreter (local, no network).
 * Implements a practical Python subset: functions, classes, comprehensions,
 * exceptions, f-strings, slicing, imports (math/random/json/statistics/collections/
 * itertools/functools/re/string/datetime/time) and a virtual file system using
 * files from the WaffleCode project explorer.
 */
import {
  Env, Val, RtError, BreakSignal, ContinueSignal, ReturnSignal, OutSink,
  newEnv, fn, toStr, toNum, toInt, truthy, jsEq, printfFormat, callValue, callMethod,
  getProp, setProp, tokenize, pyFormat, cloneVal, numStr, escapeRegExp,
} from './core';

/* ==================================================================== */
/* AST types                                                            */
/* ==================================================================== */

interface Node { kind: string; line?: number }
type Expr = Node & any;
type Stmt = Node & any;

interface PyParam { name: string; def?: Expr; kind: 'pos' | 'vararg' | 'kwarg' | 'kwonly'; }

interface PyFunction {
  __pyfunc: true;
  name: string;
  params: PyParam[];
  body: Stmt[];
  closure: PyEnv;
  isLambda: boolean;
  defaults?: Map<string, Val>;
}

interface PyClass {
  __pyclass: true;
  name: string;
  bases: PyClass[];
  body: Stmt[];
  closure: PyEnv;
  env: Map<string, Val>;
}

interface PyInstance {
  __pyinst: true;
  cls: PyClass;
  fields: Map<string, Val>;
}

interface PyException { __pyexc: true; cls: string; value: Val }

type PyEnv = Env & { globals?: PyEnv };

const isPyFunction = (v: any): v is PyFunction => !!v && v.__pyfunc === true;
const isPyClass = (v: any): v is PyClass => !!v && v.__pyclass === true;
const isPyInstance = (v: any): v is PyInstance => !!v && v.__pyinst === true;
const isPyExc = (v: any): v is PyException => !!v && v.__pyexc === true;

class PyRaise extends Error {
  exc: PyException;
  constructor(exc: PyException) {
    super(exc.cls);
    this.exc = exc;
  }
}

export interface PyOptions {
  sink: OutSink;
  files: { read(name: string): string | undefined; list(): string[] };
  stdin?: string;
  argv?: string[];
}

/* ==================================================================== */
/* Parser                                                               */
/* ==================================================================== */

const KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
  'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

class Parser {
  toks: any[];
  pos = 0;
  constructor(src: string) {
    this.toks = tokenize(src, {
      lineComments: ['#'],
      blockComments: [],
      quotes: ['"', "'"],
      newlines: true,
      indent: true,
      multiOps: ['**=', '//=', '>>=', '<<=', '...', '!=', '==', '<=', '>=', '->', ':=', '**', '//', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '..'],
    });
  }

  peek(offset = 0): any { return this.toks[Math.min(this.pos + offset, this.toks.length - 1)]; }
  next(): any { return this.toks[this.pos++]; }
  at(v: string): boolean { const t = this.peek(); return (t.t === 'op' || t.t === 'id') && t.v === v; }
  atType(t: string): boolean { return this.peek().t === t; }
  eat(v: string): boolean { if (this.at(v)) { this.pos++; return true; } return false; }
  expect(v: string): any {
    if (!this.at(v)) {
      const t = this.peek();
      throw new RtError(`SyntaxError: expected '${v}' but found '${t.v || t.t}' on line ${t.line}`, t.line);
    }
    return this.next();
  }
  skipNl(): void { while (this.peek().t === 'nl') this.pos++; }

  parseFile(): Stmt[] {
    const stmts: Stmt[] = [];
    this.skipNl();
    while (!this.atType('eof')) {
      const s = this.parseStatement();
      if (s) stmts.push(...(Array.isArray(s) ? s : [s]));
      this.skipNl();
    }
    return stmts;
  }

  parseBlock(): Stmt[] {
    this.expect(':');
    this.skipNl();
    const body: Stmt[] = [];
    if (this.peek().t === 'indent') {
      this.pos++;
      this.skipNl();
      while (!this.atType('dedent') && !this.atType('eof')) {
        const s = this.parseStatement();
        if (s) body.push(...(Array.isArray(s) ? s : [s]));
        this.skipNl();
      }
      if (this.atType('dedent')) this.pos++;
    } else {
      // single-line suite:  if x: y
      const s = this.parseSimpleLine();
      body.push(...s);
    }
    return body;
  }

  parseStatement(): Stmt | Stmt[] {
    const t = this.peek();
    if (t.t === 'id') {
      switch (t.v) {
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'for': return this.parseFor();
        case 'def': return this.parseDef([]);
        case 'class': return this.parseClass();
        case 'try': return this.parseTry();
        case 'with': return this.parseWith();
        case 'async':
          this.next();
          if (this.at('def')) return this.parseDef([]);
          return this.parseSimpleLine();
        case 'elif':
        case 'else':
          throw new RtError(`SyntaxError: '${t.v}' without matching if/try on line ${t.line}`, t.line);
        default:
          break;
      }
    }
    if (t.t === 'op' && t.v === '@') {
      const decorators: Expr[] = [];
      while (this.at('@')) {
        this.next();
        decorators.push(this.parseExpr());
        this.skipNl();
      }
      if (this.at('def')) return this.parseDef(decorators);
      return this.parseSimpleLine();
    }
    return this.parseSimpleLine();
  }

  /** one or more small statements separated by ';' */
  parseSimpleLine(): Stmt[] {
    const out: Stmt[] = [];
    let guard = 0;
    while (!this.atType('nl') && !this.atType('eof') && !this.atType('dedent') && guard++ < 500) {
      out.push(this.parseSmall());
      if (!this.eat(';')) break;
    }
    this.eat('\n');
    if (this.atType('nl')) this.pos++;
    return out.filter(Boolean);
  }

  parseSmall(): Stmt {
    const t = this.peek();
    const line = t.line;
    if (t.t === 'id') {
      switch (t.v) {
        case 'pass': this.next(); return { kind: 'Pass', line };
        case 'break': this.next(); return { kind: 'Break', line };
        case 'continue': this.next(); return { kind: 'Continue', line };
        case 'return': {
          this.next();
          if (this.atType('nl') || this.atType('eof') || this.atType(';') || this.atType('dedent')) return { kind: 'Return', value: null, line };
          return { kind: 'Return', value: this.parseExprList(), line };
        }
        case 'raise': {
          this.next();
          if (this.atType('nl') || this.atType('eof')) return { kind: 'Raise', exc: null, line };
          return { kind: 'Raise', exc: this.parseExpr(), line };
        }
        case 'import': return this.parseImport();
        case 'from': return this.parseFromImport();
        case 'global': {
          this.next();
          const names: string[] = [];
          while (this.peek().t === 'id') {
            names.push(this.next().v);
            if (!this.eat(',')) break;
          }
          return { kind: 'Global', names, line };
        }
        case 'nonlocal': {
          this.next();
          const names: string[] = [];
          while (this.peek().t === 'id') { names.push(this.next().v); if (!this.eat(',')) break; }
          return { kind: 'Global', names, line };
        }
        case 'del': {
          this.next();
          const dl = this.parseExprList();
          return { kind: 'Del', targets: (dl as any).items ?? [dl], line };
        }
        case 'assert': {
          this.next();
          const test = this.parseExpr();
          let msg: Expr | null = null;
          if (this.eat(',')) msg = this.parseExpr();
          return { kind: 'Assert', test, msg, line };
        }
        case 'yield': {
          this.next();
          return { kind: 'Expr', e: { kind: 'Const', v: null }, line };
        }
        default: break;
      }
    }
    return this.parseExprStatement();
  }

  parseImport(): Stmt {
    const line = this.next().line ?? 0;
    const names: { name: string; alias?: string }[] = [];
    while (true) {
      let name = '';
      while (this.peek().t === 'id') {
        name += this.next().v;
        if (!this.at('.')) break;
        this.next();
        name += '.';
      }
      let alias: string | undefined;
      if (this.at('as')) { this.next(); alias = this.next().v; }
      names.push({ name, alias });
      if (!this.eat(',')) break;
    }
    return { kind: 'Import', names, line };
  }

  parseFromImport(): Stmt {
    const line = this.next().line ?? 0;
    let module = '';
    while (this.peek().t === 'id') {
      module += this.next().v;
      if (!this.at('.')) break;
      this.next();
      module += '.';
    }
    this.expect('import');
    const names: { name: string; alias?: string }[] = [];
    if (this.at('*')) { this.next(); return { kind: 'FromImport', module, names: [{ name: '*' }], line }; }
    if (this.at('(')) this.next();
    let guard = 0;
    while (guard++ < 200) {
      if (this.at(')')) { this.next(); break; }
      if (this.peek().t !== 'id') break;
      const name = this.next().v;
      let alias: string | undefined;
      if (this.at('as')) { this.next(); alias = this.next().v; }
      names.push({ name, alias });
      if (!this.eat(',')) break;
      if (this.at(')')) { this.next(); break; }
    }
    return { kind: 'FromImport', module, names, line };
  }

  parseIf(): Stmt {
    const line = this.peek().line ?? 0;
    this.next();
    const test = this.parseExpr();
    const body = this.parseBlock();
    this.skipNl();
    let orelse: Stmt[] = [];
    if (this.at('elif')) {
      orelse = [this.parseIf()];
    } else if (this.at('else')) {
      this.next();
      orelse = this.parseBlock();
    }
    return { kind: 'If', test, body, orelse, line };
  }

  parseWhile(): Stmt {
    const line = this.next().line ?? 0;
    const test = this.parseExpr();
    const body = this.parseBlock();
    this.skipNl();
    let orelse: Stmt[] = [];
    if (this.at('else')) { this.next(); orelse = this.parseBlock(); }
    return { kind: 'While', test, body, orelse, line };
  }

  parseFor(): Stmt {
    const line = this.next().line ?? 0;
    const target = this.parseTarget();
    if (!this.at('in')) throw new RtError(`SyntaxError: expected 'in' on line ${line}`, line);
    this.next();
    const iter = this.parseExprList();
    const body = this.parseBlock();
    this.skipNl();
    let orelse: Stmt[] = [];
    if (this.at('else')) { this.next(); orelse = this.parseBlock(); }
    return { kind: 'For', target, iter, body, orelse, line };
  }

  parseTarget(): Expr {
    // `for i, v in ...` / `for a, (b, c) in ...` — a bare target list is a Tuple.
    const first = this.parsePrimaryForTarget();
    if (!this.at(',')) return first;
    const items: Expr[] = [first];
    while (this.eat(',')) {
      if (this.at('in')) break; // trailing comma
      items.push(this.parsePrimaryForTarget());
    }
    return { kind: 'Tuple', items };
  }

  parsePrimaryForTarget(): Expr {
    // targets are simple: NAME | (a, b) | [a, b] | obj.attr | obj[idx]
    if (this.at('(') || this.at('[')) {
      const open = this.next().v;
      const close = open === '(' ? ')' : ']';
      const items: Expr[] = [];
      while (!this.at(close)) {
        items.push(this.parsePrimaryForTarget());
        if (!this.eat(',')) break;
      }
      this.expect(close);
      return { kind: open === '(' ? 'Tuple' : 'List', items };
    }
    let e: Expr = { kind: 'Name', id: this.next().v };
    while (true) {
      if (this.at('.')) {
        this.next();
        e = { kind: 'Attr', obj: e, name: this.next().v };
      } else if (this.at('[')) {
        this.next();
        const idx = this.parseExpr();
        this.expect(']');
        e = { kind: 'Index', obj: e, idx };
      } else break;
    }
    return e;
  }

  parseDef(decorators: Expr[]): Stmt {
    const line = this.next().line ?? 0;
    const name = this.next().v;
    this.expect('(');
    const params = this.parseParams();
    let returns: Expr | null = null;
    if (this.at('->')) { this.next(); returns = this.parseExpr(); }
    const body = this.parseBlock();
    return { kind: 'FuncDef', name, params, body, decorators, returns, line };
  }

  parseParams(): PyParam[] {
    const params: PyParam[] = [];
    while (!this.at(')')) {
      if (this.at('*')) { this.next(); params.push({ name: this.peek().t === 'id' ? this.next().v : '', kind: 'vararg' }); }
      else if (this.at('**')) { this.next(); params.push({ name: this.next().v, kind: 'kwarg' }); }
      else {
        const name = this.next().v;
        let def: Expr | undefined;
        if (this.eat(':')) this.parseExpr(); // annotation
        if (this.at('=')) { this.next(); def = this.parseExpr(); }
        params.push({ name, def, kind: 'pos' });
      }
      if (!this.eat(',')) break;
    }
    this.expect(')');
    return params;
  }

  parseClass(): Stmt {
    const line = this.next().line ?? 0;
    const name = this.next().v;
    const bases: Expr[] = [];
    if (this.eat('(')) {
      while (!this.at(')')) {
        bases.push(this.parseExpr());
        if (!this.eat(',')) break;
      }
      this.expect(')');
    }
    const body = this.parseBlock();
    return { kind: 'ClassDef', name, bases, body, line };
  }

  parseTry(): Stmt {
    const line = this.next().line ?? 0;
    const body = this.parseBlock();
    const handlers: any[] = [];
    let finalbody: Stmt[] = [];
    let orelse: Stmt[] = [];
    this.skipNl();
    while (this.at('except')) {
      this.next();
      let type: Expr | null = null;
      let bind: string | null = null;
      if (!this.at(':')) {
        type = this.parseExpr();
        if (this.at('as')) { this.next(); bind = this.next().v; }
      }
      const hbody = this.parseBlock();
      handlers.push({ type, bind, body: hbody });
      this.skipNl();
    }
    if (this.at('else')) { this.next(); orelse = this.parseBlock(); this.skipNl(); }
    if (this.at('finally')) { this.next(); finalbody = this.parseBlock(); }
    return { kind: 'Try', body, handlers, orelse, finalbody, line };
  }

  parseWith(): Stmt {
    const line = this.next().line ?? 0;
    const items: any[] = [];
    while (true) {
      const ctx = this.parseExpr();
      let bind: string | null = null;
      if (this.at('as')) { this.next(); bind = this.next().v; }
      items.push({ ctx, bind });
      if (!this.eat(',')) break;
    }
    const body = this.parseBlock();
    return { kind: 'With', items, body, line };
  }

  parseExprStatement(): Stmt {
    const line = this.peek().line ?? 0;
    // Annotation-only statement:  x: int = 5  (we ignore annotation)
    const expr = this.parseExprList();
    const augOps = ['+=', '-=', '*=', '/=', '//=', '%=', '**=', '&=', '|=', '^=', '>>=', '<<=', '@='];
    const t = this.peek();
    if (t.t === 'op' && augOps.includes(t.v)) {
      this.next();
      const value = this.parseExprList();
      return { kind: 'AugAssign', target: expr, op: t.v.slice(0, -1), value, line };
    }
    if (t.t === 'op' && t.v === '=') {
      const targets: Expr[] = [expr];
      let value: Expr = expr;
      while (this.at('=')) {
        this.next();
        value = this.parseExprList();
        targets.push(value);
      }
      targets.pop(); // last parsed is the value
      return { kind: 'Assign', targets, value, line };
    }
    if (t.t === 'op' && t.v === ':') {
      // annotated assignment
      this.next();
      this.parseExpr();
      if (this.eat('=')) {
        const value = this.parseExprList();
        return { kind: 'Assign', targets: [expr], value, line };
      }
      return { kind: 'Pass', line };
    }
    return { kind: 'Expr', e: expr, line };
  }

  /** expression list: `a, b, c` becomes Tuple */
  parseExprList(): Expr {
    const first = this.parseExpr();
    if (!this.at(',')) return first;
    const items: Expr[] = [first];
    while (this.eat(',')) {
      if (this.atType('nl') || this.atType('eof') || this.at('=') || this.atType('dedent') || this.at(')') || this.at(']') || this.at('}')) break;
      items.push(this.parseExpr());
    }
    return { kind: 'Tuple', items };
  }

  parseExpr(): Expr {
    return this.parseTernary();
  }

  parseTernary(): Expr {
    const value = this.parseLambda();
    if (this.at('if')) {
      this.next();
      const test = this.parseOr();
      this.expect('else');
      const alt = this.parseTernary();
      return { kind: 'IfExp', test, then: value, else: alt };
    }
    return value;
  }

  parseLambda(): Expr {
    if (this.at('lambda')) {
      this.next();
      const params: PyParam[] = [];
      while (!this.at(':')) {
        if (this.at('*')) { this.next(); params.push({ name: this.next().v, kind: 'vararg' }); }
        else if (this.at('**')) { this.next(); params.push({ name: this.next().v, kind: 'kwarg' }); }
        else {
          const name = this.next().v;
          let def: Expr | undefined;
          if (this.eat('=')) def = this.parseExpr();
          params.push({ name, def, kind: 'pos' });
        }
        if (!this.eat(',')) break;
      }
      this.expect(':');
      const body = this.parseTernary();
      return { kind: 'Lambda', params, body };
    }
    return this.parseOr();
  }

  parseOr(): Expr {
    let left = this.parseAnd();
    while (this.at('or')) {
      this.next();
      left = { kind: 'Bool', op: 'or', l: left, r: this.parseAnd() };
    }
    return left;
  }

  parseAnd(): Expr {
    let left = this.parseNot();
    while (this.at('and')) {
      this.next();
      left = { kind: 'Bool', op: 'and', l: left, r: this.parseNot() };
    }
    return left;
  }

  parseNot(): Expr {
    if (this.at('not')) {
      this.next();
      return { kind: 'Unary', op: 'not', e: this.parseNot() };
    }
    return this.parseComparison();
  }

  parseComparison(): Expr {
    const first = this.parseBitOr();
    const ops: string[] = [];
    const rest: Expr[] = [];
    let guard = 0;
    while (guard++ < 100) {
      const t = this.peek();
      let op: string | null = null;
      if (t.t === 'op' && ['<', '>', '==', '!=', '<=', '>=', '<>'].includes(t.v)) op = t.v === '<>' ? '!=' : t.v;
      else if (t.t === 'id' && t.v === 'in') op = 'in';
      else if (t.t === 'id' && t.v === 'is') op = 'is';
      else if (t.t === 'id' && t.v === 'not' && this.peek(1).v === 'in') op = 'not in';
      if (!op) break;
      if (op === 'not in') { this.next(); this.next(); }
      else if (op === 'is') {
        this.next();
        if (this.at('not')) { this.next(); op = 'is not'; }
      } else this.next();
      ops.push(op);
      rest.push(this.parseBitOr());
    }
    if (!ops.length) return first;
    return { kind: 'Compare', first, ops, rest };
  }

  binLevel(ops: string[], sub: () => Expr): Expr {
    let left = sub();
    let guard = 0;
    while (guard++ < 500) {
      const t = this.peek();
      if (t.t === 'op' && ops.includes(t.v)) {
        this.next();
        left = { kind: 'Bin', op: t.v, l: left, r: sub() };
      } else break;
    }
    return left;
  }

  parseBitOr(): Expr { return this.binLevel(['|'], () => this.parseBitXor()); }
  parseBitXor(): Expr { return this.binLevel(['^'], () => this.parseBitAnd()); }
  parseBitAnd(): Expr { return this.binLevel(['&'], () => this.parseShift()); }
  parseShift(): Expr { return this.binLevel(['<<', '>>'], () => this.parseAdd()); }
  parseAdd(): Expr { return this.binLevel(['+', '-'], () => this.parseMul()); }
  parseMul(): Expr { return this.binLevel(['*', '/', '//', '%', '@'], () => this.parseUnary()); }

  parseUnary(): Expr {
    const t = this.peek();
    if (t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '~')) {
      this.next();
      return { kind: 'Unary', op: t.v, e: this.parseUnary() };
    }
    return this.parsePower();
  }

  parsePower(): Expr {
    const base = this.parsePostfix();
    if (this.at('**')) {
      this.next();
      const exp = this.parseUnary();
      return { kind: 'Bin', op: '**', l: base, r: exp };
    }
    return base;
  }

  parsePostfix(): Expr {
    let e = this.parseAtom();
    let guard = 0;
    while (guard++ < 400) {
      if (this.at('(')) {
        this.next();
        const args = this.parseCallArgs();
        e = { kind: 'Call', fn: e, args };
      } else if (this.at('[')) {
        this.next();
        e = this.parseSubscript(e);
      } else if (this.at('.')) {
        this.next();
        const name = this.next().v;
        e = { kind: 'Attr', obj: e, name };
      } else break;
    }
    return e;
  }

  parseCallArgs(): any[] {
    const args: any[] = [];
    while (!this.at(')')) {
      if (this.at('*')) { this.next(); args.push({ kind: 'star', value: this.parseExpr() }); }
      else if (this.at('**')) { this.next(); args.push({ kind: 'dstar', value: this.parseExpr() }); }
      else if (this.peek().t === 'id' && this.peek(1).t === 'op' && this.peek(1).v === '=') {
        const name = this.next().v;
        this.next();
        args.push({ kind: 'kw', name, value: this.parseExpr() });
      } else {
        // A bare generator expression: sum(x for x in xs)
        const first = this.parseExpr();
        if (this.at('for') || this.at('async')) {
          const gens = this.parseCompFors();
          args.push({ kind: 'pos', value: { kind: 'GenExp', elt: first, fors: gens } });
        } else {
          args.push({ kind: 'pos', value: first });
        }
      }
      if (!this.eat(',')) break;
    }
    this.expect(')');
    return args;
  }

  parseSubscript(obj: Expr): Expr {
    const parts: any[] = [];
    let isSlice = false;
    while (!this.at(']')) {
      if (this.at(':')) { isSlice = true; parts.push(null); }
      else parts.push(this.parseExpr());
      if (this.at(':')) { isSlice = true; this.next(); continue; }
      if (!this.eat(',')) break;
    }
    this.expect(']');
    if (!isSlice) {
      if (parts.length === 1) return { kind: 'Index', obj, idx: parts[0] };
      return { kind: 'Index', obj, idx: { kind: 'Tuple', items: parts } };
    }
    // slice syntax: a[lo:hi:step]
    const lo = parts[0] ?? null;
    let hi: Expr | null = null;
    let step: Expr | null = null;
    if (parts.length > 1) hi = parts[1];
    if (parts.length > 2) step = parts[2];
    return { kind: 'Slice', obj, lo, hi, step };
  }

  parseAtom(): Expr {
    const t = this.peek();
    if (t.t === 'num') { this.next(); return { kind: 'Num', v: t.n }; }
    if (t.t === 'str') {
      this.next();
      let parts: any[];
      if (t.q === 'f') parts = parseFString(t.v);
      else parts = [{ lit: unescapePy(t.v) }];
      // adjacent string concatenation
      while (this.peek().t === 'str') {
        const nt = this.next();
        if (nt.q === 'f') parts = parts.concat(parseFString(nt.v));
        else parts.push({ lit: unescapePy(nt.v) });
      }
      if (parts.length === 1 && parts[0].lit !== undefined) return { kind: 'Str', v: parts[0].lit };
      return { kind: 'FStr', parts };
    }
    if (t.t === 'id') {
      if (t.v === 'None') { this.next(); return { kind: 'Const', v: null }; }
      if (t.v === 'True') { this.next(); return { kind: 'Const', v: true }; }
      if (t.v === 'False') { this.next(); return { kind: 'Const', v: false }; }
      if (t.v === 'lambda') return this.parseLambda();
      if (KEYWORDS.has(t.v)) throw new RtError(`SyntaxError: unexpected keyword '${t.v}' on line ${t.line}`, t.line);
      this.next();
      return { kind: 'Name', id: t.v };
    }
    if (t.t === 'op') {
      if (t.v === '(') {
        this.next();
        if (this.at(')')) { this.next(); return { kind: 'Tuple', items: [] }; }
        const first = this.parseExpr();
        if (this.at('for') || this.at('async')) {
          const gens = this.parseCompFors();
          this.expect(')');
          return { kind: 'GenExp', elt: first, fors: gens };
        }
        if (this.at(',')) {
          const items = [first];
          while (this.eat(',')) {
            if (this.at(')')) break;
            items.push(this.parseExpr());
          }
          this.expect(')');
          return { kind: 'Tuple', items };
        }
        this.expect(')');
        return first;
      }
      if (t.v === '[') {
        this.next();
        if (this.at(']')) { this.next(); return { kind: 'List', items: [] }; }
        const first = this.parseExpr();
        if (this.at('for') || this.at('async')) {
          const gens = this.parseCompFors();
          this.expect(']');
          return { kind: 'ListComp', elt: first, fors: gens };
        }
        const items = [first];
        while (this.eat(',')) {
          if (this.at(']')) break;
          items.push(this.parseExpr());
        }
        this.expect(']');
        return { kind: 'List', items };
      }
      if (t.v === '{') {
        this.next();
        if (this.at('}')) { this.next(); return { kind: 'Dict', pairs: [] }; }
        const firstKey = this.parseExpr();
        if (this.at(':')) {
          this.next();
          const firstVal = this.parseExpr();
          if (this.at('for')) {
            const gens = this.parseCompFors();
            this.expect('}');
            return { kind: 'DictComp', key: firstKey, value: firstVal, fors: gens };
          }
          const pairs: any[] = [[firstKey, firstVal]];
          while (this.eat(',')) {
            if (this.at('}')) break;
            const k = this.parseExpr();
            this.expect(':');
            pairs.push([k, this.parseExpr()]);
          }
          this.expect('}');
          return { kind: 'Dict', pairs };
        }
        if (this.at('for')) {
          const gens = this.parseCompFors();
          this.expect('}');
          return { kind: 'SetComp', elt: firstKey, fors: gens };
        }
        const items = [firstKey];
        while (this.eat(',')) {
          if (this.at('}')) break;
          items.push(this.parseExpr());
        }
        this.expect('}');
        return { kind: 'Set', items };
      }
      if (t.v === '...') { this.next(); return { kind: 'Const', v: null }; }
    }
    throw new RtError(`SyntaxError: unexpected token '${t.v || t.t}' on line ${t.line}`, t.line);
  }

  parseCompFors(): any[] {
    const gens: any[] = [];
    while (this.at('for')) {
      this.next();
      const target = this.parseTarget();
      this.expect('in');
      const iter = this.parseOr();
      const ifs: Expr[] = [];
      while (this.at('if')) { this.next(); ifs.push(this.parseOr()); }
      gens.push({ target, iter, ifs });
    }
    return gens;
  }
}

function unescapePy(raw: string): string {
  return raw.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[nrt0\\'"abfv])/g, (_m, code: string) => {
    if (code[0] === 'x') return String.fromCharCode(parseInt(code.slice(1), 16));
    if (code[0] === 'u') return String.fromCharCode(parseInt(code.slice(1), 16));
    if (code[0] === 'U') return String.fromCodePoint(parseInt(code.slice(1), 16));
    const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', '0': '\0', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', f: '\f', v: '\v' };
    return map[code] ?? code;
  });
}

function parseFString(raw: string): any[] {
  const parts: any[] = [];
  let lit = '';
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === '{' && raw[i + 1] === '{') { lit += '{'; i += 2; continue; }
    if (c === '}' && raw[i + 1] === '}') { lit += '}'; i += 2; continue; }
    if (c === '{') {
      if (lit) { parts.push({ lit: unescapePy(lit) }); lit = ''; }
      let depth = 1;
      let j = i + 1;
      let inner = '';
      while (j < raw.length && depth > 0) {
        const ch = raw[j];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) break; }
        else if (ch === '"' || ch === "'") {
          const quote = ch;
          inner += ch;
          j++;
          while (j < raw.length && raw[j] !== quote) { inner += raw[j]; j++; }
          inner += raw[j] ?? '';
          j++;
          continue;
        }
        inner += ch;
        j++;
      }
      i = j + 1;
      // split conversion and format spec (only at top-level ':' or '!')
      let exprText = inner;
      let conv = '';
      let spec = '';
      let d = 0;
      let sIdx = -1;
      let cIdx = -1;
      for (let k = 0; k < inner.length; k++) {
        const ch = inner[k];
        if (ch === '(' || ch === '[' || ch === '{') d++;
        else if (ch === ')' || ch === ']' || ch === '}') d--;
        else if (ch === '!' && d === 0 && inner[k + 1] !== '=' && cIdx < 0) { cIdx = k; }
        else if (ch === ':' && d === 0 && sIdx < 0) { sIdx = k; break; }
      }
      if (cIdx >= 0) {
        const stop = sIdx >= 0 ? sIdx : inner.length;
        conv = inner.slice(cIdx + 1, stop);
        exprText = inner.slice(0, cIdx);
      }
      if (sIdx >= 0) spec = inner.slice(sIdx + 1);
      parts.push({ expr: parseExpressionText(exprText), conv, spec });
      continue;
    }
    lit += c;
    i++;
  }
  if (lit) parts.push({ lit: unescapePy(lit) });
  return parts;
}

export function parseExpressionText(text: string): Expr {
  const p = new Parser(text);
  p.skipNl();
  const e = p.parseExprList();
  return e;
}

/* ==================================================================== */
/* Runtime helpers                                                      */
/* ==================================================================== */

const pyRepr = (v: Val): string => {
  if (typeof v === 'string') {
    const escaped = v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/'/g, "\\'");
    return `'${escaped}'`;
  }
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (Array.isArray(v)) return '[' + v.map(pyRepr).join(', ') + ']';
  if (v instanceof Map) return '{' + [...v.entries()].map(([k, val]) => `${pyRepr(pyUnhash(k))}: ${pyRepr(val)}`).join(', ') + '}';
  if (isPyInstance(v)) {
    const r = callDunder(v, '__repr', []);
    if (r !== undefined) return toStr(r);
    const s = callDunder(v, '__str', []);
    if (s !== undefined) return toStr(s);
    return `<${v.cls.name} object>`;
  }
  if (isPyClass(v)) return `<class '${v.name}'>`;
  if (isPyFunction(v)) return `<function ${v.name}>`;
  return toStr(v);
};

const pyStrOf = (v: Val): string => {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'string') return v;
  if (isPyInstance(v)) {
    const s = callDunder(v, '__str', []);
    if (s !== undefined) return toStr(s);
  }
  if (Array.isArray(v) || v instanceof Map) return pyRepr(v);
  return toStr(v);
};

const pyHashKey = (v: Val): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return '\u0002n' + String(v);
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (v === null) return 'None';
  if (Array.isArray(v)) return '\u0002t[' + v.map(pyHashKey).join('\u0001') + ']';
  return JSON.stringify(v);
};

/** Recover the original value of a map key from its hash-key encoding. */
const pyUnhash = (k: string): Val => {
  if (k.startsWith('\u0002n')) { const n = Number(k.slice(2)); return Number.isNaN(n) ? k.slice(2) : n; }
  if (k.startsWith('\u0002t[')) return k.slice(3, -1).split('\u0001').map(pyUnhash);
  if (k === 'True') return true;
  if (k === 'False') return false;
  if (k === 'None') return null;
  return k;
};

function findMethod(cls: PyClass, name: string): Val | undefined {
  if (cls.env.has(name)) return cls.env.get(name);
  for (const base of cls.bases) {
    const found = findMethod(base, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

function callDunder(inst: PyInstance, name: string, args: Val[]): Val | undefined {
  const m = findMethod(inst.cls, name);
  if (m && isPyFunction(m)) {
    const env = newEnv(m.closure);
    bindParams(m, [inst, ...args], {}, env);
    const runner = new PythonRuntime({ sink: () => {}, files: { read: () => undefined, list: () => [] } });
    runner.moduleEnv = m.closure;
    try {
      runner.execStmts(m.body, env);
    } catch (err) {
      if (err instanceof ReturnSignal) return err.value;
      throw err;
    }
    return null;
  }
  return undefined;
}

function newException(cls: string, value: Val): PyException {
  return { __pyexc: true, cls, value };
}

function raiseTypeError(msg: string): never {
  throw new PyRaise(newException('TypeError', msg));
}

/* ==================================================================== */
/* Interpreter                                                          */
/* ==================================================================== */

export class PythonRuntime {
  opts: PyOptions;
  moduleEnv: PyEnv;
  steps = 0;
  stdoutBuf = '';

  constructor(opts: PyOptions) {
    this.opts = opts;
    this.moduleEnv = newEnv();
    this.moduleEnv.globals = this.moduleEnv;
    this.installBuiltins();
  }

  write(text: string): void {
    this.stdoutBuf += text;
    this.opts.sink('stdout', text);
  }

  err(text: string): void {
    this.opts.sink('stderr', text);
  }

  tick(): void {
    if (++this.steps > 20_000_000) throw new RtError('ExecutionLimit: program ran too long (stopped after 20M operations)');
  }

  /* ---------------------------- builtins ---------------------------- */

  installBuiltins(): void {
    const g = this.moduleEnv.vars;
    const def = (name: string, f: (args: Val[], kwargs: Record<string, Val>) => Val) => {
      g.set(name, fn((args, _env, kwargs?: any) => f(args, kwargs ?? {}), name));
    };

    def('print', (args, kw) => {
      const sep = kw.sep !== undefined ? pyStrOf(kw.sep) : ' ';
      const end = kw.end !== undefined ? pyStrOf(kw.end) : '\n';
      this.write(args.map(pyStrOf).join(sep) + end);
      return null;
    });
    def('len', (a) => {
      const v = a[0];
      if (typeof v === 'string' || Array.isArray(v)) return v.length;
      if (v instanceof Map) return v.size;
      if (isPyInstance(v)) {
        const r = callDunder(v, '__len__', []);
        if (r !== undefined) return r;
      }
      raiseTypeError(`object of type '${typeof v}' has no len()`);
    });
    def('repr', (a) => pyRepr(a[0]));
    def('str', (a) => (a.length ? pyStrOf(a[0]) : ''));
    def('int', (a) => {
      if (a.length === 0) return 0;
      const v = a[0];
      if (typeof v === 'string') {
        const base = a.length > 1 ? toInt(a[1]) : 10;
        const cleaned = v.trim().replace(/_/g, '');
        const parsed = parseInt(cleaned, base);
        if (Number.isNaN(parsed)) throw new PyRaise(newException('ValueError', `invalid literal for int() with base ${base}: '${v}'`));
        return parsed;
      }
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'number') return Math.trunc(v);
      return Math.trunc(toNum(v));
    });
    def('float', (a) => {
      if (a.length === 0) return 0;
      const v = a[0];
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'inf' || s === 'infinity') return Infinity;
        if (s === '-inf') return -Infinity;
        if (s === 'nan') return NaN;
        const n = Number(s.replace(/_/g, ''));
        if (Number.isNaN(n)) throw new PyRaise(newException('ValueError', `could not convert string to float: '${v}'`));
        return n;
      }
      return toNum(v);
    });
    def('bool', (a) => (a.length ? truthy(a[0]) : false));
    def('abs', (a) => Math.abs(toNum(a[0])));
    def('round', (a) => {
      const n = toNum(a[0]);
      const d = a.length > 1 ? toInt(a[1]) : 0;
      const f = Math.pow(10, d);
      const scaled = n * f;
      const floor = Math.floor(scaled);
      const diff = scaled - floor;
      let rounded = Math.round(scaled);
      if (Math.abs(diff - 0.5) < 1e-9) rounded = floor % 2 === 0 ? floor : floor + 1;
      return d <= 0 ? rounded : rounded / f;
    });
    def('min', (a, kw) => {
      const items = a.length === 1 && Array.isArray(a[0]) ? a[0] : a.length === 1 && a[0] instanceof Map ? [...a[0].keys()] : a;
      if (!items.length) throw new PyRaise(newException('ValueError', 'min() arg is an empty sequence'));
      if (kw.key) {
        let best = items[0];
        for (const it of items) if (toNum(this.pyCall(kw.key, [it])) < toNum(this.pyCall(kw.key, [best]))) best = it;
        return best;
      }
      return items.reduce((x, y) => (this.compare(y, x) < 0 ? y : x));
    });
    def('max', (a, kw) => {
      const items = a.length === 1 && Array.isArray(a[0]) ? a[0] : a.length === 1 && a[0] instanceof Map ? [...a[0].keys()] : a;
      if (!items.length) throw new PyRaise(newException('ValueError', 'max() arg is an empty sequence'));
      if (kw.key) {
        let best = items[0];
        for (const it of items) if (toNum(this.pyCall(kw.key, [it])) > toNum(this.pyCall(kw.key, [best]))) best = it;
        return best;
      }
      return items.reduce((x, y) => (this.compare(y, x) > 0 ? y : x));
    });
    def('sum', (a) => {
      const items = a[0];
      if (!Array.isArray(items)) raiseTypeError('sum() argument must be an iterable');
      let total = a.length > 1 ? a[1] : 0;
      for (const it of items) total = this.binop('+', total, it);
      return total;
    });
    def('sorted', (a, kw) => {
      const items = this.iterate(a[0]);
      const key = kw.key;
      const reverse = truthy(kw.reverse);
      const arr = [...items];
      arr.sort((x, y) => {
        const kx = key ? this.pyCall(key, [x]) : x;
        const ky = key ? this.pyCall(key, [y]) : y;
        return this.compare(kx, ky);
      });
      if (reverse) arr.reverse();
      return arr;
    });
    def('reversed', (a) => [...this.iterate(a[0])].reverse());
    def('list', (a) => (a.length ? [...this.iterate(a[0])] : []));
    def('tuple', (a) => (a.length ? [...this.iterate(a[0])] : []));
    def('set', (a) => {
      const out: Val[] = [];
      for (const v of a.length ? this.iterate(a[0]) : []) {
        if (!out.some((o) => jsEq(o, v))) out.push(v);
      }
      return out;
    });
    def('dict', (a) => {
      if (!a.length) return new Map();
      if (a[0] instanceof Map) return new Map(a[0]);
      const m = new Map<string, Val>();
      for (const pair of this.iterate(a[0])) {
        if (Array.isArray(pair) && pair.length >= 2) m.set(pyHashKey(pair[0]), pair[1]);
      }
      return m;
    });
    def('range', (a) => {
      const nums = a.map(toInt);
      let start = 0, stop = 0, step = 1;
      if (nums.length === 1) { stop = nums[0]; }
      else if (nums.length === 2) { start = nums[0]; stop = nums[1]; }
      else { start = nums[0]; stop = nums[1]; step = nums[2] || 1; }
      const out: number[] = [];
      if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
      else for (let i = start; i > stop; i += step) out.push(i);
      return out;
    });
    def('enumerate', (a) => this.iterate(a[0]).map((v, i) => [i + (a.length > 1 ? toInt(a[1]) : 0), v]));
    def('zip', (a) => {
      const lists = a.map((x) => this.iterate(x));
      const len = Math.min(...lists.map((l) => l.length));
      const out: Val[] = [];
      for (let i = 0; i < len; i++) out.push(lists.map((l) => l[i]));
      return out;
    });
    def('map', (a) => this.iterate(a[1]).map((x) => this.pyCall(a[0], [x])));
    def('filter', (a) => this.iterate(a[1]).filter((x) => (a[0] === null ? truthy(x) : truthy(this.pyCall(a[0], [x])))));
    def('any', (a) => this.iterate(a[0]).some((x) => truthy(x)));
    def('all', (a) => this.iterate(a[0]).every((x) => truthy(x)));
    def('chr', (a) => String.fromCodePoint(toInt(a[0])));
    def('ord', (a) => {
      const s = toStr(a[0]);
      if (!s.length) raiseTypeError('ord() expected a character');
      return s.codePointAt(0) ?? 0;
    });
    def('hex', (a) => '0x' + (toInt(a[0]) >>> 0).toString(16));
    def('bin', (a) => '0b' + (toInt(a[0]) >>> 0).toString(2));
    def('oct', (a) => '0o' + (toInt(a[0]) >>> 0).toString(8));
    def('pow', (a) => Math.pow(toNum(a[0]), toNum(a[1])));
    def('divmod', (a) => {
      const x = toNum(a[0]), y = toNum(a[1]);
      if (y === 0) throw new PyRaise(newException('ZeroDivisionError', 'integer division or modulo by zero'));
      return [Math.floor(x / y), x - Math.floor(x / y) * y];
    });
    def('type', (a) => {
      const v = a[0];
      if (isPyInstance(v)) return v.cls.name;
      if (typeof v === 'number') return Number.isInteger(v) ? "<class 'int'>" : "<class 'float'>";
      if (typeof v === 'string') return "<class 'str'>";
      if (typeof v === 'boolean') return "<class 'bool'>";
      if (Array.isArray(v)) return "<class 'list'>";
      if (v instanceof Map) return "<class 'dict'>";
      if (v === null) return "<class 'NoneType'>";
      return "<class 'object'>";
    });
    def('isinstance', (a) => {
      const v = a[0];
      const target = a[1];
      const names = Array.isArray(target) ? target.map(toStr) : [toStr(target)];
      let actual = 'object';
      if (typeof v === 'number') actual = Number.isInteger(v) ? 'int' : 'float';
      else if (typeof v === 'string') actual = 'str';
      else if (typeof v === 'boolean') actual = 'bool';
      else if (Array.isArray(v)) actual = 'list';
      else if (v instanceof Map) actual = 'dict';
      else if (isPyInstance(v)) actual = v.cls.name;
      else if (v === null) actual = 'NoneType';
      if (names.includes(actual)) return true;
      if ((actual === 'int' || actual === 'float') && names.includes('Number')) return true;
      if (isPyInstance(v)) {
        let c: PyClass | undefined = v.cls;
        while (c) {
          if (names.includes(c.name)) return true;
          c = c.bases[0];
        }
      }
      return false;
    });
    def('format', (a) => pyFormat(a[0], a.length > 1 ? toStr(a[1]) : ''));
    def('id', (a) => Math.abs(JSON.stringify(a[0] ?? 'x').split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)));
    def('hash', (a) => {
      const s = pyHashKey(a[0]);
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return h;
    });
    def('callable', (a) => isPyFunction(a[0]) || isPyClass(a[0]) || (a[0] && a[0].__fn));
    def('getattr', (a) => this.getAttr(a[0], toStr(a[1])));
    def('hasattr', (a) => {
      try { return this.getAttr(a[0], toStr(a[1])) !== undefined; } catch { return false; }
    });
    def('setattr', (a) => { setProp(a[0], toStr(a[1]), a[2]); return null; });
    def('input', (a) => {
      if (a.length) this.write(pyStrOf(a[0]));
      return this.opts.stdin ?? '';
    });
    def('open', (a) => {
      const name = toStr(a[0]);
      const content = this.opts.files.read(name);
      if (content === undefined) throw new PyRaise(newException('FileNotFoundError', `[Errno 2] No such file or directory: '${name}'`));
      const lines = content.split('\n');
      let idx = 0;
      const self = this;
      return {
        read: fn(() => content),
        readlines: fn(() => lines.map((l) => l + '\n')),
        readline: fn(() => (idx < lines.length ? lines[idx++] + '\n' : '')),
        write: fn(() => content.length),
        close: fn(() => null),
        __enter__: fn(() => self.getAttr),
        __iter__: fn(() => lines),
      };
    });
    def('iter', (a) => this.iterate(a[0]));
    def('next', (a) => {
      const arr = a[0];
      if (Array.isArray(arr)) return arr.length ? arr.shift() : (a.length > 1 ? a[1] : null);
      return null;
    });
    def('exit', () => { throw new PyRaise(newException('SystemExit', 0)); });
    def('quit', () => { throw new PyRaise(newException('SystemExit', 0)); });

    // exceptions
    for (const name of [
      'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError', 'ZeroDivisionError', 'NameError',
      'AttributeError', 'RuntimeError', 'StopIteration', 'AssertionError', 'FileNotFoundError', 'OSError',
      'NotImplementedError', 'OverflowError', 'ArithmeticError', 'LookupError', 'ImportError', 'SystemExit',
    ]) {
      g.set(name, { __pyclass: true, name, bases: [], body: [], closure: this.moduleEnv, env: new Map() } as PyClass);
    }
    // math / random / json / statistics modules are installed lazily via import

    // builtin modules
    g.set('math', this.makeMath());
    g.set('json', this.makeJson());
    g.set('random', this.makeRandom());
    g.set('statistics', this.makeStatistics());
    g.set('time', this.makeTime());
    g.set('sys', this.makeSys());
    g.set('re', this.makeRe());
    g.set('string', this.makeStringModule());
    g.set('collections', this.makeCollections());
    g.set('itertools', this.makeItertools());
    g.set('functools', this.makeFunctools());
    g.set('datetime', this.makeDatetime());
    g.set('os', new Map<string, Val>([['getcwd', fn(() => '/project')], ['listdir', fn(() => this.opts.files.list())]]));
    g.set('__name__', '__main__');
  }

  /** A `super()` proxy: attribute lookups start at the instance's base classes. */
  makeSuper(inst: PyInstance): Val {
    return {
      __super: true,
      __get: (name: string): Val => {
        for (const base of inst.cls.bases) {
          const bm = findMethod(base, name);
          if (bm !== undefined) {
            if (isPyFunction(bm)) {
              return this.makeFt(name, (args) => {
                const env = newEnv(bm.closure);
                bindParams(bm, [inst, ...args], {}, env);
                try { this.execStmts(bm.body, env); }
                catch (err) { if (err instanceof ReturnSignal) return err.value; throw err; }
                return null;
              });
            }
            return bm;
          }
        }
        throw new PyRaise(newException('AttributeError', `'super' object has no attribute '${name}'`));
      },
    } as any;
  }

  makeFt(name: string, f: (args: Val[], kwargs?: Record<string, Val>) => Val): Val {
    return { __fn: (args: Val[], _env: any, kwargs?: Record<string, Val>) => f(args, kwargs), __name: name };
  }

  makeMath(): Map<string, Val> {
    const m = new Map<string, Val>();
    const one = (name: string, f: (x: number) => number) => m.set(name, this.makeFt(name, (a) => f(toNum(a[0]))));
    one('sqrt', Math.sqrt);
    one('sin', Math.sin);
    one('cos', Math.cos);
    one('tan', Math.tan);
    one('asin', Math.asin);
    one('acos', Math.acos);
    one('atan', Math.atan);
    one('sinh', Math.sinh);
    one('cosh', Math.cosh);
    one('tanh', Math.tanh);
    one('exp', Math.exp);
    one('log2', Math.log2);
    one('log10', Math.log10);
    one('fabs', Math.abs);
    one('floor', Math.floor);
    one('ceil', Math.ceil);
    one('trunc', Math.trunc);
    one('degrees', (x) => (x * 180) / Math.PI);
    one('radians', (x) => (x * Math.PI) / 180);
    m.set('log', this.makeFt('log', (a) => (a.length > 1 ? Math.log(toNum(a[0])) / Math.log(toNum(a[1])) : Math.log(toNum(a[0])))));
    m.set('atan2', this.makeFt('atan2', (a) => Math.atan2(toNum(a[0]), toNum(a[1]))));
    m.set('hypot', this.makeFt('hypot', (a) => Math.hypot(...a.map(toNum))));
    m.set('pow', this.makeFt('pow', (a) => Math.pow(toNum(a[0]), toNum(a[1]))));
    m.set('gcd', this.makeFt('gcd', (a) => a.map(toInt).reduce((x, y) => (y ? ((x % y) + Math.abs(y)) % Math.abs(y) : Math.abs(x)), 0)));
    m.set('lcm', this.makeFt('lcm', (a) => a.map(toInt).reduce((x, y) => Math.abs(x * y) / (x && y ? ((x % y) + Math.abs(y)) % Math.abs(y) : Math.abs(y || x)) || 0)));
    m.set('factorial', this.makeFt('factorial', (a) => {
      const n = toInt(a[0]);
      if (n < 0) throw new PyRaise(newException('ValueError', 'factorial() not defined for negative values'));
      let r = 1;
      for (let i = 2; i <= n; i++) r *= i;
      return r;
    }));
    m.set('isqrt', this.makeFt('isqrt', (a) => Math.floor(Math.sqrt(toInt(a[0])))));
    m.set('comb', this.makeFt('comb', (a) => {
      const n = toInt(a[0]), k = toInt(a[1]);
      let r = 1;
      for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
      return Math.round(r);
    }));
    m.set('perm', this.makeFt('perm', (a) => {
      const n = toInt(a[0]), k = toInt(a[1]);
      let r = 1;
      for (let i = 0; i < k; i++) r *= n - i;
      return r;
    }));
    m.set('fmod', this.makeFt('fmod', (a) => toNum(a[0]) % toNum(a[1])));
    m.set('isnan', this.makeFt('isnan', (a) => Number.isNaN(toNum(a[0]))));
    m.set('isinf', this.makeFt('isinf', (a) => !Number.isFinite(toNum(a[0]))));
    m.set('isfinite', this.makeFt('isfinite', (a) => Number.isFinite(toNum(a[0]))));
    m.set('pi', Math.PI);
    m.set('e', Math.E);
    m.set('tau', Math.PI * 2);
    m.set('inf', Infinity);
    m.set('nan', NaN);
    return m;
  }

  makeJson(): Map<string, Val> {
    const m = new Map<string, Val>();
    m.set('dumps', this.makeFt('dumps', (a, kw) => {
      const indent = kw?.indent !== undefined && kw.indent !== null ? Number(kw.indent) : undefined;
      const sortKeys = truthy(kw?.sort_keys);
      const normalize = (v: any): any => {
        if (isPyInstance(v) || isPyClass(v) || isPyFunction(v)) return pyStrOf(v);
        if (Array.isArray(v)) return v.map(normalize);
        if (v instanceof Map) {
          const keys = [...v.keys()];
          if (sortKeys) keys.sort();
          const o: any = {};
          for (const k of keys) o[toStr(k)] = normalize(v.get(k));
          return o;
        }
        if (v === null) return null;
        return v;
      };
      return JSON.stringify(normalize(a[0]), null, indent);
    }));
    m.set('loads', this.makeFt('loads', (a) => {
      try {
        return fromJsonToPy(JSON.parse(toStr(a[0])));
      } catch (e) {
        throw new PyRaise(newException('ValueError', `Expecting value: ${e instanceof Error ? e.message : String(e)}`));
      }
    }));
    m.set('dump', this.makeFt('dump', () => null));
    m.set('load', this.makeFt('load', (a) => {
      const path = toStr(a[0]);
      const content = this.opts.files.read(path);
      if (content === undefined) throw new PyRaise(newException('FileNotFoundError', `'${path}'`));
      return fromJsonToPy(JSON.parse(content));
    }));
    return m;
  }

  makeRandom(): Map<string, Val> {
    let seed = 123456789;
    const rand = () => {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5; seed >>>= 0;
      return seed / 4294967296;
    };
    const m = new Map<string, Val>();
    m.set('random', this.makeFt('random', () => rand()));
    m.set('seed', this.makeFt('seed', (a) => { seed = toInt(a[0] ?? 0) || 1; return null; }));
    m.set('randint', this.makeFt('randint', (a) => {
      const lo = toInt(a[0]), hi = toInt(a[1]);
      return lo + Math.floor(rand() * (hi - lo + 1));
    }));
    m.set('uniform', this.makeFt('uniform', (a) => toNum(a[0]) + rand() * (toNum(a[1]) - toNum(a[0]))));
    m.set('choice', this.makeFt('choice', (a) => {
      const arr = this.iterate(a[0]);
      return arr[Math.floor(rand() * arr.length)];
    }));
    m.set('shuffle', this.makeFt('shuffle', (a) => {
      const arr = a[0];
      if (!Array.isArray(arr)) raiseTypeError('shuffle expects a list');
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return null;
    }));
    m.set('sample', this.makeFt('sample', (a) => {
      const arr = [...this.iterate(a[0])];
      const k = toInt(a[1]);
      const out: Val[] = [];
      for (let i = 0; i < k && arr.length; i++) out.push(arr.splice(Math.floor(rand() * arr.length), 1)[0]);
      return out;
    }));
    m.set('gauss', this.makeFt('gauss', (a) => {
      const mu = toNum(a[0]), sigma = toNum(a[1]);
      let u = 0, v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }));
    return m;
  }

  makeStatistics(): Map<string, Val> {
    const m = new Map<string, Val>();
    const nums = (v: Val): number[] => this.iterate(v).map(toNum);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    m.set('mean', this.makeFt('mean', (a) => mean(nums(a[0]))));
    m.set('median', this.makeFt('median', (a) => {
      const xs = nums(a[0]).sort((x, y) => x - y);
      const mid = Math.floor(xs.length / 2);
      return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
    }));
    m.set('mode', this.makeFt('mode', (a) => {
      const xs = this.iterate(a[0]);
      const counts = new Map<string, number>();
      let best = xs[0];
      let bestCount = 0;
      for (const x of xs) {
        const k = pyHashKey(x);
        const c = (counts.get(k) ?? 0) + 1;
        counts.set(k, c);
        if (c > bestCount) { bestCount = c; best = x; }
      }
      return best;
    }));
    m.set('variance', this.makeFt('variance', (a) => {
      const xs = nums(a[0]);
      const mu = mean(xs);
      return xs.reduce((acc, x) => acc + (x - mu) ** 2, 0) / (xs.length - 1);
    }));
    m.set('pstdev', this.makeFt('pstdev', (a) => {
      const xs = nums(a[0]);
      const mu = mean(xs);
      return Math.sqrt(xs.reduce((acc, x) => acc + (x - mu) ** 2, 0) / xs.length);
    }));
    m.set('stdev', this.makeFt('stdev', (a) => {
      const xs = nums(a[0]);
      const mu = mean(xs);
      return Math.sqrt(xs.reduce((acc, x) => acc + (x - mu) ** 2, 0) / (xs.length - 1));
    }));
    m.set('pvariance', this.makeFt('pvariance', (a) => {
      const xs = nums(a[0]);
      const mu = mean(xs);
      return xs.reduce((acc, x) => acc + (x - mu) ** 2, 0) / xs.length;
    }));
    m.set('fmean', this.makeFt('fmean', (a) => mean(nums(a[0]))));
    m.set('harmonic_mean', this.makeFt('harmonic_mean', (a) => {
      const xs = nums(a[0]);
      return xs.length / xs.reduce((acc, x) => acc + 1 / x, 0);
    }));
    m.set('geometric_mean', this.makeFt('geometric_mean', (a) => {
      const xs = nums(a[0]);
      return Math.pow(xs.reduce((acc, x) => acc * x, 1), 1 / xs.length);
    }));
    return m;
  }

  makeTime(): Map<string, Val> {
    const m = new Map<string, Val>();
    const start = Date.now();
    m.set('time', this.makeFt('time', () => Date.now() / 1000));
    m.set('perf_counter', this.makeFt('perf_counter', () => (Date.now() - start) / 1000));
    m.set('monotonic', this.makeFt('monotonic', () => (Date.now() - start) / 1000));
    m.set('sleep', this.makeFt('sleep', () => null));
    m.set('strftime', this.makeFt('strftime', () => new Date().toISOString()));
    return m;
  }

  makeSys(): Map<string, Val> {
    const m = new Map<string, Val>();
    m.set('version', '3.12.0 (WaffleCode local interpreter)');
    m.set('platform', 'wafflecode-browser');
    m.set('argv', this.opts.argv ?? ['main.py']);
    m.set('stdout', new Map<string, Val>());
    m.set('maxsize', Number.MAX_SAFE_INTEGER);
    m.set('exit', this.makeFt('exit', () => { throw new PyRaise(newException('SystemExit', 0)); }));
    return m;
  }

  makeRe(): Map<string, Val> {
    const m = new Map<string, Val>();
    const compilePattern = (pattern: string, flags = '') => new RegExp(pattern, flags.replace(/[^gimsuy]/g, '') + (flags.includes('g') ? '' : 'g'));
    m.set('search', this.makeFt('search', (a) => {
      const re = compilePattern(toStr(a[0]), a.length > 1 ? toStr(a[1]) : '');
      const mt = re.exec(toStr(a[2]));
      return mt ? { group: fn((args: Val[]) => mt[toInt(args[0])] ?? null), groups: fn(() => mt.slice(1)), start: fn(() => mt.index), end: fn(() => mt.index + mt[0].length) } : null;
    }));
    m.set('match', this.makeFt('match', (a) => {
      const re = new RegExp('^(?:' + toStr(a[0]) + ')', a.length > 1 ? toStr(a[1]) : '');
      const mt = re.exec(toStr(a[2]));
      return mt ? { group: fn((args: Val[]) => mt[toInt(args[0])] ?? null), groups: fn(() => mt.slice(1)) } : null;
    }));
    m.set('fullmatch', this.makeFt('fullmatch', (a) => {
      const re = new RegExp('^(?:' + toStr(a[0]) + ')$', a.length > 1 ? toStr(a[1]) : '');
      const mt = re.exec(toStr(a[2]));
      return mt ? { group: fn((args: Val[]) => mt[toInt(args[0])] ?? null), groups: fn(() => mt.slice(1)) } : null;
    }));
    m.set('findall', this.makeFt('findall', (a) => {
      const re = compilePattern(toStr(a[0]), a.length > 1 ? toStr(a[1]) : '');
      return [...toStr(a[2]).matchAll(re)].map((x) => (x.length > 2 ? x.slice(1) : x[0]));
    }));
    m.set('sub', this.makeFt('sub', (a) => {
      const re = compilePattern(toStr(a[0]), 'g' + (a.length > 3 ? toStr(a[3]) : ''));
      const fnOrStr = a[1];
      return toStr(a[2]).replace(re, (...args: any[]) => {
        if (isPyFunction(fnOrStr)) {
          const mt = args[0];
          const groups = args.slice(1, -2);
          const matchObj = { group: fn((ga: Val[]) => (toInt(ga[0]) === 0 ? mt : groups[toInt(ga[0]) - 1]) ?? null) };
          return toStr(this.callFunction(fnOrStr, [matchObj], {}));
        }
        return toStr(fnOrStr).replace(/\\(\d)/g, (_m, d: string) => args[Number(d)] ?? '');
      });
    }));
    m.set('split', this.makeFt('split', (a) => toStr(a[1]).split(new RegExp(toStr(a[0])))));
    m.set('escape', this.makeFt('escape', (a) => escapeRegExp(toStr(a[0]))));
    return m;
  }

  makeStringModule(): Map<string, Val> {
    const m = new Map<string, Val>();
    m.set('ascii_lowercase', 'abcdefghijklmnopqrstuvwxyz');
    m.set('ascii_uppercase', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    m.set('ascii_letters', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
    m.set('digits', '0123456789');
    m.set('hexdigits', '0123456789abcdefABCDEF');
    m.set('octdigits', '01234567');
    m.set('punctuation', '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
    m.set('whitespace', ' \t\n\r\x0b\x0c');
    m.set('printable', '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ \t\n\r\x0b\x0c');
    return m;
  }

  makeCollections(): Map<string, Val> {
    const m = new Map<string, Val>();
    m.set('Counter', this.makeFt('Counter', (a) => {
      const c = new Map<string, Val>();
      const items = a.length ? this.iterate(a[0]) : [];
      for (const it of items) {
        const k = pyHashKey(it);
        c.set(k, ((c.get(k) as number) ?? 0) + 1);
      }
      (c as any).__counter = items;
      return c;
    }));
    m.set('defaultdict', this.makeFt('defaultdict', () => new Map<string, Val>()));
    m.set('OrderedDict', this.makeFt('OrderedDict', () => new Map<string, Val>()));
    m.set('deque', this.makeFt('deque', (a) => (a.length ? [...this.iterate(a[0])] : [])));
    m.set('namedtuple', this.makeFt('namedtuple', (a) => {
      const fields = this.iterate(a[1]).map(toStr);
      return this.makeFt(toStr(a[0]), (args) => {
        const o: any = { __class: toStr(a[0]) };
        fields.forEach((f, i) => { o[f] = args[i]; });
        return o;
      });
    }));
    return m;
  }

  makeItertools(): Map<string, Val> {
    const m = new Map<string, Val>();
    m.set('product', this.makeFt('product', (a) => {
      const lists = a.map((x) => this.iterate(x).map((y) => [y]));
      let acc: Val[][] = [[]];
      for (const list of lists) acc = acc.flatMap((prefix) => list.map((item) => [...prefix, ...item]));
      return acc;
    }));
    m.set('permutations', this.makeFt('permutations', (a) => {
      const items = this.iterate(a[0]);
      const r = a.length > 1 ? toInt(a[1]) : items.length;
      const out: Val[][] = [];
      const walk = (cur: Val[]) => {
        if (cur.length === r) { out.push([...cur]); return; }
        items.forEach((it, i) => {
          if (cur.includes(it) && items.indexOf(it) !== i) return;
          cur.push(it); walk(cur); cur.pop();
        });
      };
      walk([]);
      return out;
    }));
    m.set('combinations', this.makeFt('combinations', (a) => {
      const items = this.iterate(a[0]);
      const r = toInt(a[1]);
      const out: Val[][] = [];
      const walk = (start: number, cur: Val[]) => {
        if (cur.length === r) { out.push([...cur]); return; }
        for (let i = start; i < items.length; i++) { cur.push(items[i]); walk(i + 1, cur); cur.pop(); }
      };
      walk(0, []);
      return out;
    }));
    m.set('chain', this.makeFt('chain', (a) => a.flatMap((x) => this.iterate(x))));
    m.set('accumulate', this.makeFt('accumulate', (a) => {
      const items = this.iterate(a[0]);
      const out: Val[] = [];
      let acc: Val = items[0];
      out.push(acc);
      for (let i = 1; i < items.length; i++) { acc = this.binop('+', acc, items[i]); out.push(acc); }
      return out;
    }));
    m.set('repeat', this.makeFt('repeat', (a) => Array.from({ length: toInt(a[1] ?? 1) }, () => a[0])));
    m.set('count', this.makeFt('count', (a) => {
      const start = toNum(a[0] ?? 0), step = toNum(a[1] ?? 1);
      return Array.from({ length: 20 }, (_, i) => start + i * step);
    }));
    return m;
  }

  makeFunctools(): Map<string, Val> {
    const m = new Map<string, Val>();
    m.set('reduce', this.makeFt('reduce', (a) => {
      const items = this.iterate(a[1]);
      let acc: Val = a.length > 2 ? a[2] : items[0];
      for (let i = a.length > 2 ? 0 : 1; i < items.length; i++) acc = this.pyCall(a[0], [acc, items[i]]);
      return acc;
    }));
    m.set('partial', this.makeFt('partial', (a) => this.makeFt('partial', (args) => this.callFunction(a[0], [...a.slice(1), ...args], {}))));
    return m;
  }

  makeDatetime(): Map<string, Val> {
    const m = new Map<string, Val>();
    m.set('datetime', new Map<string, Val>([
      ['now', this.makeFt('now', () => this.dateObj(new Date()))],
      ['utcnow', this.makeFt('utcnow', () => this.dateObj(new Date()))],
      ['fromtimestamp', this.makeFt('fromtimestamp', (a) => this.dateObj(new Date(toNum(a[0]) * 1000)))],
    ]));
    m.set('date', new Map<string, Val>([
      ['today', this.makeFt('today', () => this.dateObj(new Date()))],
    ]));
    return m;
  }

  dateObj(d: Date): Val {
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    return {
      __class: 'datetime',
      isoformat: fn(() => iso),
      strftime: fn(() => iso),
      timestamp: fn(() => d.getTime() / 1000),
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
    };
  }

  /* ---------------------------- iteration ---------------------------- */

  iterate(v: Val): Val[] {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return Array.from(v);
    if (v instanceof Map) return [...v.keys()].map(pyUnhash);
    if (typeof v === 'number') raiseTypeError(`'${typeof v}' object is not iterable`);
    if (v === null) raiseTypeError("'NoneType' object is not iterable");
    if (isPyInstance(v)) {
      const iter = callDunder(v, '__iter__', []);
      if (iter !== undefined) return this.iterate(iter);
      const getitem = findMethod(v.cls, '__getitem__');
      if (getitem) {
        const out: Val[] = [];
        for (let i = 0; i < 10000; i++) {
          try {
            out.push(callDunder(v, '__getitem__', [i]) as Val);
          } catch { break; }
        }
        return out;
      }
    }
    if (isObjDict(v)) return Object.keys(v);
    raiseTypeError('object is not iterable');
  }

  /* ------------------------- operators ------------------------------ */

  compare(a: Val, b: Val): number {
    if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const c = this.compare(a[i], b[i]);
        if (c !== 0) return c;
      }
      return a.length - b.length;
    }
    if (isPyInstance(a)) {
      const r = callDunder(a, '__lt__', [b]);
      if (r !== undefined) return truthy(r) ? -1 : 1;
    }
    const sa = pyStrOf(a), sb = pyStrOf(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  eq(a: Val, b: Val): boolean {
    if (isPyInstance(a)) {
      const r = callDunder(a, '__eq__', [b]);
      if (r !== undefined) return truthy(r);
    }
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      for (const [k, v] of a) if (!this.eq(v, b.get(k))) return false;
      return true;
    }
    return jsEq(a, b);
  }

  binop(op: string, left: Val, right: Val): Val {
    if (isPyInstance(left)) {
      const dunder: Record<string, string> = { '+': '__add__', '-': '__sub__', '*': '__mul__', '/': '__truediv__', '//': '__floordiv__', '%': '__mod__', '**': '__pow__', '<': '__lt__', '>': '__gt__' };
      const name = dunder[op];
      if (name) {
        const r = callDunder(left, name, [right]);
        if (r !== undefined) return r;
      }
    }
    switch (op) {
      case '+':
        if (typeof left === 'string' || typeof right === 'string') {
          if (typeof left !== 'string' || typeof right !== 'string') {
            if (Array.isArray(left) || Array.isArray(right)) raiseTypeError(`can only concatenate ${Array.isArray(left) ? 'list' : 'str'} to ${Array.isArray(right) ? 'list' : 'str'}`);
          }
          return pyStrOf(left) + pyStrOf(right);
        }
        if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right];
        return toNum(left) + toNum(right);
      case '-': return toNum(left) - toNum(right);
      case '*':
        if (typeof left === 'string' && typeof right === 'number') return left.repeat(Math.max(0, Math.floor(right)));
        if (typeof right === 'string' && typeof left === 'number') return right.repeat(Math.max(0, Math.floor(left)));
        if (Array.isArray(left) && typeof right === 'number') {
          const out: Val[] = [];
          for (let i = 0; i < right; i++) out.push(...left);
          return out;
        }
        if (left instanceof Map && right instanceof Map) return null;
        return toNum(left) * toNum(right);
      case '/': {
        const d = toNum(right);
        if (d === 0) throw new PyRaise(newException('ZeroDivisionError', 'division by zero'));
        return toNum(left) / d;
      }
      case '//': {
        const d = toNum(right);
        if (d === 0) throw new PyRaise(newException('ZeroDivisionError', 'integer division or modulo by zero'));
        return Math.floor(toNum(left) / d);
      }
      case '%': {
        // `"fmt" % (...)`: percent-style string formatting.
        if (typeof left === 'string') {
          const parts = Array.isArray(right) ? right : [right];
          let i = 0;
          return left.replace(/%(\d+\.\d+|\d+|\.\d+)?([sdifrxXeEgGc%])/g, (_m, spec: string | undefined, kind: string) => {
            if (kind === '%') return '%';
            const v = parts[i++];
            switch (kind) {
              case 'd': case 'i': return String(toInt(v));
              case 'f': case 'e': case 'E': case 'g': case 'G': {
                const n = toNum(v);
                const p = spec && /\.(\d+)/.test(spec) ? Number(/\.(\d+)/.exec(spec)![1]) : 6;
                return kind === 'f' ? n.toFixed(p) : n.toPrecision(p);
              }
              case 'x': return toInt(v).toString(16);
              case 'X': return toInt(v).toString(16).toUpperCase();
              case 'r': return pyRepr(v);
              case 'c': return typeof v === 'string' ? v.charAt(0) : String.fromCharCode(toInt(v));
              default: return pyStrOf(v);
            }
          });
        }
        const d = toNum(right);
        if (d === 0) throw new PyRaise(newException('ZeroDivisionError', 'integer division or modulo by zero'));
        const n = toNum(left);
        return ((n % d) + d) % d;
      }
      case '**': return Math.pow(toNum(left), toNum(right));
      case '&':
        if (Array.isArray(left) && Array.isArray(right)) return left.filter((v) => right.some((o) => this.eq(o, v)));
        return toInt(left) & toInt(right);
      case '|':
        if (left instanceof Map && right instanceof Map) {
          const out = new Map(left);
          for (const [k, v] of right) out.set(k, v);
          return out;
        }
        // set union on list-backed sets
        if (Array.isArray(left) && Array.isArray(right)) {
          const out: Val[] = [...left];
          for (const v of right) if (!out.some((o) => this.eq(o, v))) out.push(v);
          return out;
        }
        return toInt(left) | toInt(right);
      case '^':
        if (Array.isArray(left) && Array.isArray(right)) {
          return [...left.filter((v) => !right.some((o) => this.eq(o, v))), ...right.filter((v) => !left.some((o) => this.eq(o, v)))];
        }
        return toInt(left) ^ toInt(right);
      case '<<': return toInt(left) << toInt(right);
      case '>>': return toInt(left) >> toInt(right);
      case '@':
        raiseTypeError('matrix multiplication not supported for these operands');
        break;
      default: break;
    }
    throw new RtError(`TypeError: unsupported operand type(s) for ${op}`);
  }

  getAttr(obj: Val, name: string): Val {
    if (obj && typeof obj === 'object' && (obj as any).__super) return (obj as any).__get(name);
    if (obj instanceof Map) {
      if (name === 'keys') return this.makeFt('keys', () => [...(obj as Map<string, Val>).keys()].map(pyUnhash));
      if (name === 'values') return this.makeFt('values', () => [...(obj as Map<string, Val>).values()]);
      if (name === 'items') return this.makeFt('items', () => [...(obj as Map<string, Val>).entries()].map(([k, v]) => [pyUnhash(k), v]));
      if (name === 'get') return this.makeFt('get', (a) => (obj as Map<string, Val>).get(pyHashKey(a[0])) ?? (a.length > 1 ? a[1] : null));
      if (name === 'pop') return this.makeFt('pop', (a) => {
        const key = pyHashKey(a[0]);
        const v = (obj as Map<string, Val>).get(key);
        if (v === undefined) {
          if (a.length > 1) return a[1];
          throw new PyRaise(newException('KeyError', a[0]));
        }
        (obj as Map<string, Val>).delete(key);
        return v;
      });
      if (name === 'update') return this.makeFt('update', (a) => { const o = a[0] as Map<string, Val>; if (o instanceof Map) for (const [k, v] of o) (obj as Map<string, Val>).set(k, v); return null; });
      if (name === 'copy') return this.makeFt('copy', () => new Map(obj as Map<string, Val>));
      if (name === 'setdefault') return this.makeFt('setdefault', (a) => {
        const key = pyHashKey(a[0]);
        if (!(obj as Map<string, Val>).has(key)) (obj as Map<string, Val>).set(key, a.length > 1 ? a[1] : null);
        return (obj as Map<string, Val>).get(key);
      });
      if (name === 'clear') return this.makeFt('clear', () => (obj as Map<string, Val>).clear());
      if (name === 'size' || name === 'length') return (obj as Map<string, Val>).size;
      const v = (obj as Map<string, Val>).get(name);
      if (v !== undefined) return v;
      return undefined;
    }
    if (isPyInstance(obj)) {
      if (obj.fields.has(name)) return obj.fields.get(name);
      const m = findMethod(obj.cls, name);
      if (m && isPyFunction(m)) {
        const inst = obj;
        return fn((args) => {
          const env = newEnv(m.closure);
          bindParams(m, [inst, ...args], {}, env);
          // `super()` resolves against the instance's base classes.
          env.vars.set('super', fn(() => this.makeSuper(inst), 'super'));
          try {
            this.execStmts(m.body, env);
          } catch (err) {
            if (err instanceof ReturnSignal) return err.value;
            throw err;
          }
          return null;
        }, name);
      }
      if (m !== undefined) return m;
      throw new PyRaise(newException('AttributeError', `'${obj.cls.name}' object has no attribute '${name}'`));
    }
    if (typeof obj === 'string') {
      const passthrough = ['upper', 'lower', 'split', 'trim', 'replace', 'startsWith', 'endsWith', 'includes', 'substring', 'charAt', 'indexOf', 'repeat', 'padStart', 'padEnd', 'slice', 'capitalize', 'title', 'format', 'strip', 'lstrip', 'rstrip', 'zfill', 'ljust', 'rjust', 'center', 'find', 'count', 'startswith', 'endswith'];
      if (passthrough.includes(name)) return fn((args) => this.strMethod(obj, name, args), name);
      if (name === 'length') return obj.length;
      if (name === 'join') return fn((args) => this.iterate(args[0]).map(pyStrOf).join(obj), 'join');
      return undefined;
    }
    if (Array.isArray(obj)) {
      // list *and* set methods share the array representation
      if (['append', 'pop', 'insert', 'remove', 'index', 'count', 'reverse', 'sort', 'extend', 'copy', 'clear',
        'add', 'discard', 'union', 'intersection', 'difference', 'symmetric_difference', 'update', 'issubset', 'issuperset'].includes(name)) {
        return fn((args) => this.listMethod(obj, name, args), name);
      }
      if (name === 'length') return obj.length;
      return undefined;
    }
    if (typeof obj === 'number') {
      if (name === 'real' || name === 'numerator') return obj;
      if (name === 'is_integer') return this.makeFt('is_integer', () => Number.isInteger(obj));
      return undefined;
    }
    return getProp(obj, name);
  }

  strMethod(s: string, name: string, args: Val[]): Val {
    switch (name) {
      case 'upper': return s.toUpperCase();
      case 'lower': return s.toLowerCase();
      case 'split': {
        if (!args.length) return s.trim().split(/\s+/).filter(Boolean);
        const sep = toStr(args[0]);
        if (sep === '') return Array.from(s);
        return s.split(sep);
      }
      case 'rsplit': return s.split(toStr(args[0] ?? ' '));
      case 'join': return this.iterate(args[0]).map(pyStrOf).join(s);
      case 'trim':
      case 'strip': return s.trim();
      case 'lstrip': return s.replace(/^\s+/, '');
      case 'rstrip': return s.replace(/\s+$/, '');
      case 'replace': return args.length > 1 ? s.split(toStr(args[0])).join(toStr(args[1])) : s;
      case 'startswith':
      case 'startsWith': return s.startsWith(toStr(args[0]));
      case 'endswith':
      case 'endsWith': return s.endsWith(toStr(args[0]));
      case 'includes': return s.includes(toStr(args[0]));
      case 'find': return s.indexOf(toStr(args[0]));
      case 'rfind': return s.lastIndexOf(toStr(args[0]));
      case 'index': {
        const idx = s.indexOf(toStr(args[0]));
        if (idx < 0) throw new PyRaise(newException('ValueError', 'substring not found'));
        return idx;
      }
      case 'count': return s.split(toStr(args[0])).length - 1;
      case 'substring': return args.length > 1 ? s.substring(toInt(args[0]), toInt(args[1])) : s.substring(toInt(args[0]));
      case 'charAt': return s.charAt(toInt(args[0]));
      case 'repeat': return s.repeat(toInt(args[0]));
      case 'padStart': return s.padStart(toInt(args[0]), args.length > 1 ? toStr(args[1]) : ' ');
      case 'padEnd': return s.padEnd(toInt(args[0]), args.length > 1 ? toStr(args[1]) : ' ');
      case 'zfill': return (s.startsWith('-') ? '-' + s.slice(1).padStart(Math.max(0, toInt(args[0]) - 1), '0') : s.padStart(toInt(args[0]), '0'));
      case 'ljust': return s.padEnd(toInt(args[0]), args.length > 1 ? toStr(args[1]) : ' ');
      case 'rjust': return s.padStart(toInt(args[0]), args.length > 1 ? toStr(args[1]) : ' ');
      case 'center': {
        const w = toInt(args[0]);
        if (w <= s.length) return s;
        const total = w - s.length;
        return ' '.repeat(Math.floor(total / 2)) + s + ' '.repeat(Math.ceil(total / 2));
      }
      case 'capitalize': return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      case 'title': return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      case 'slice': return s.slice(toInt(args[0]), args.length > 1 ? toInt(args[1]) : undefined);
      case 'format': {
        let idx = 0;
        return s.replace(/\{(\d*)(?::([^}]*))?\}/g, (_m, i: string, spec: string) => {
          const val = i === '' ? args[idx++] : args[parseInt(i, 10)];
          return spec ? pyFormat(val, spec) : pyStrOf(val);
        });
      }
      default: return s;
    }
  }

  listMethod(arr: Val[], name: string, args: Val[]): Val {
    // set semantics (a Python set is represented as a deduped array)
    switch (name) {
      case 'add': {
        if (!arr.some((o) => this.eq(o, args[0]))) arr.push(args[0]);
        return null;
      }
      case 'discard': {
        const i = arr.findIndex((o) => this.eq(o, args[0]));
        if (i >= 0) arr.splice(i, 1);
        return null;
      }
      case 'union': {
        const out = [...arr];
        for (const v of this.iterate(args[0])) if (!out.some((o) => this.eq(o, v))) out.push(v);
        return out;
      }
      case 'intersection': return arr.filter((v) => this.iterate(args[0]).some((o) => this.eq(o, v)));
      case 'difference': return arr.filter((v) => !this.iterate(args[0]).some((o) => this.eq(o, v)));
      case 'symmetric_difference': {
        const other = this.iterate(args[0]);
        return [...arr.filter((v) => !other.some((o) => this.eq(o, v))), ...other.filter((v) => !arr.some((o) => this.eq(o, v)))];
      }
      case 'update': {
        for (const v of this.iterate(args[0])) if (!arr.some((o) => this.eq(o, v))) arr.push(v);
        return null;
      }
      case 'issubset': return arr.every((v) => this.iterate(args[0]).some((o) => this.eq(o, v)));
      case 'issuperset': return this.iterate(args[0]).every((v) => arr.some((o) => this.eq(o, v)));
      default: break;
    }
    return this.listMethodCore(arr, name, args);
  }

  listMethodCore(arr: Val[], name: string, args: Val[]): Val {
    switch (name) {
      case 'append': arr.push(args[0]); return null;
      case 'pop': return args.length ? arr.splice(toInt(args[0]), 1)[0] : arr.pop();
      case 'insert': arr.splice(toInt(args[0]), 0, args[1]); return null;
      case 'remove': {
        const i = arr.findIndex((x) => this.eq(x, args[0]));
        if (i < 0) throw new PyRaise(newException('ValueError', 'list.remove(x): x not in list'));
        arr.splice(i, 1);
        return null;
      }
      case 'index': {
        const i = arr.findIndex((x) => this.eq(x, args[0]));
        if (i < 0) throw new PyRaise(newException('ValueError', `${pyRepr(args[0])} is not in list`));
        return i;
      }
      case 'count': return arr.filter((x) => this.eq(x, args[0])).length;
      case 'reverse': arr.reverse(); return null;
      case 'sort': {
        const key = args.length > 1 && args[1] && args[1].key ? args[1].key : (args.length && isPyFunction(args[0]) ? args[0] : null);
        arr.sort((x, y) => {
          const kx = key ? callValue(key, [x], newEnv()) : x;
          const ky = key ? callValue(key, [y], newEnv()) : y;
          return this.compare(kx, ky);
        });
        return null;
      }
      case 'extend': arr.push(...this.iterate(args[0])); return null;
      case 'copy': return [...arr];
      case 'clear': arr.length = 0; return null;
      default: return null;
    }
  }

  setAttr(target: Expr, value: Val, env: PyEnv): void {
    switch (target.kind) {
      case 'Name': {
        const name = target.id;
        if ((env as any).__globalsDecl && (env as any).__globalsDecl.has(name)) {
          this.moduleEnv.vars.set(name, value);
        } else {
          env.vars.set(name, value);
        }
        return;
      }
      case 'Attr': {
        const obj = this.evalExpr(target.obj, env);
        if (isPyInstance(obj)) {
          obj.fields.set(target.name, value);
          return;
        }
        if (obj instanceof Map) {
          (obj as Map<string, Val>).set(target.name, value);
          return;
        }
        if (isPyClass(obj)) {
          obj.env.set(target.name, value);
          return;
        }
        setProp(obj, target.name, value);
        return;
      }
      case 'Index': {
        const obj = this.evalExpr(target.obj, env);
        const idx = this.evalExpr(target.idx, env);
        if (obj instanceof Map) {
          (obj as Map<string, Val>).set(pyHashKey(idx), value);
          return;
        }
        if (Array.isArray(obj)) {
          let i = toInt(idx);
          if (i < 0) i += obj.length;
          if (i < 0 || i >= obj.length) throw new PyRaise(newException('IndexError', 'list assignment index out of range'));
          obj[i] = value;
          return;
        }
        setProp(obj, idx as any, value);
        return;
      }
      case 'Tuple':
      case 'List': {
        const values = this.iterate(value);
        const items: Expr[] = target.items;
        if (items.length === 1) {
          this.setAttr(items[0], value, env);
          return;
        }
        items.forEach((it: Expr, i: number) => this.setAttr(it, values[i] ?? null, env));
        return;
      }
      case 'Starred': {
        this.setAttr(target.e, value, env);
        return;
      }
      default:
        throw new RtError('SyntaxError: cannot assign to this expression');
    }
  }

  /* ---------------------------- expressions ------------------------- */

  evalArgs(args: any[], env: PyEnv): { args: Val[]; kwargs: Record<string, Val> } {
    const out: Val[] = [];
    const kwargs: Record<string, Val> = {};
    for (const a of args) {
      if (a.kind === 'pos') out.push(this.evalExpr(a.value, env));
      else if (a.kind === 'kw') kwargs[a.name] = this.evalExpr(a.value, env);
      else if (a.kind === 'star') out.push(...this.iterate(this.evalExpr(a.value, env)));
      else if (a.kind === 'dstar') {
        const obj = this.evalExpr(a.value, env);
        if (obj instanceof Map) for (const [k, v] of obj) kwargs[k] = v;
      }
    }
    return { args: out, kwargs };
  }

  evalExpr(node: Expr, env: PyEnv): Val {
    this.tick();
    switch (node.kind) {
      case 'Num': return node.v;
      case 'Str': return node.v;
      case 'Const': return node.v;
      case 'FStr': {
        let out = '';
        for (const p of node.parts) {
          if (p.lit !== undefined) out += p.lit;
          else {
            let v = this.evalExpr(p.expr, env);
            if (p.conv === 'r') v = pyRepr(v);
            else if (p.conv === 'a') v = pyRepr(v);
            else if (p.conv === 's') v = pyStrOf(v);
            out += p.spec ? pyFormat(v, this.interpolateSpec(p.spec, env)) : (p.conv === 'r' ? pyRepr(v) : pyStrOf(v));
          }
        }
        return out;
      }
      case 'Name': {
        const v = lookupPy(env, node.id);
        if (v === undefined && !envHas(env, node.id)) throw new PyRaise(newException('NameError', `name '${node.id}' is not defined`));
        return v;
      }
      case 'List': return node.items.map((it: Expr) => this.evalExpr(it, env));
      case 'Tuple': return node.items.map((it: Expr) => this.evalExpr(it, env));
      case 'Set': {
        const out: Val[] = [];
        for (const it of node.items) {
          const v = this.evalExpr(it, env);
          if (!out.some((o) => this.eq(o, v))) out.push(v);
        }
        return out;
      }
      case 'Dict': {
        const m = new Map<string, Val>();
        for (const [k, v] of node.pairs) {
          const key = this.evalExpr(k, env);
          m.set(pyHashKey(key), this.evalExpr(v, env));
        }
        return m;
      }
      case 'Unary': {
        if (node.op === 'not') return !truthy(this.evalExpr(node.e, env));
        const v = this.evalExpr(node.e, env);
        if (node.op === '-') return -toNum(v);
        if (node.op === '+') return toNum(v);
        return ~toInt(v);
      }
      case 'Bin': {
        if (node.op === 'and') {
          const l = this.evalExpr(node.l, env);
          return truthy(l) ? this.evalExpr(node.r, env) : l;
        }
        if (node.op === 'or') {
          const l = this.evalExpr(node.l, env);
          return truthy(l) ? l : this.evalExpr(node.r, env);
        }
        return this.binop(node.op, this.evalExpr(node.l, env), this.evalExpr(node.r, env));
      }
      case 'Bool': {
        const l = this.evalExpr(node.l, env);
        if (node.op === 'and') return truthy(l) ? this.evalExpr(node.r, env) : l;
        return truthy(l) ? l : this.evalExpr(node.r, env);
      }
      case 'Compare': {
        let left = this.evalExpr(node.first, env);
        for (let i = 0; i < node.ops.length; i++) {
          const right = this.evalExpr(node.rest[i], env);
          if (!this.compareOp(node.ops[i], left, right)) return false;
          left = right;
        }
        return true;
      }
      case 'IfExp':
        return truthy(this.evalExpr(node.test, env)) ? this.evalExpr(node.then, env) : this.evalExpr(node.else, env);
      case 'Lambda': {
        const defaults = new Map<string, Val>();
        for (const p of node.params) {
          if (p.def) defaults.set(p.name, this.evalExpr(p.def, env));
        }
        const f: PyFunction = { __pyfunc: true, name: '<lambda>', params: node.params, body: [{ kind: 'Return', value: node.body }], closure: env, isLambda: true, defaults };
        return f;
      }
      case 'Call': {
        const fnVal = this.evalExpr(node.fn, env);
        const { args, kwargs } = this.evalArgs(node.args, env);
        return this.callFunction(fnVal, args, kwargs);
      }
      case 'Attr': return this.getAttr(this.evalExpr(node.obj, env), node.name);
      case 'Index': {
        const obj = this.evalExpr(node.obj, env);
        const idx = this.evalExpr(node.idx, env);
        return this.indexValue(obj, idx);
      }
      case 'Slice': {
        const obj = this.evalExpr(node.obj, env);
        const lo = node.lo ? toInt(this.evalExpr(node.lo, env)) : undefined;
        const hi = node.hi ? toInt(this.evalExpr(node.hi, env)) : undefined;
        const step = node.step ? toInt(this.evalExpr(node.step, env)) : undefined;
        if (typeof obj === 'string' || Array.isArray(obj)) {
          if (step === undefined || step === 1) return (obj as any).slice(lo, hi);
          const arr = Array.from(obj as any);
          const len = arr.length;
          const s = step;
          const out: Val[] = [];
          let start = lo ?? (s > 0 ? 0 : len - 1);
          let end = hi ?? (s > 0 ? len : -1);
          if (start < 0) start += len;
          if (end < 0 && hi !== undefined) end += len;
          if (s > 0) for (let i = start; i < end && i < len; i += s) out.push(arr[i]);
          else for (let i = start; i > end && i >= 0; i += s) out.push(arr[i]);
          // Slicing a str yields a str, slicing a list yields a list.
          return typeof obj === 'string' ? (out as string[]).join('') : out;
        }
        return obj;
      }
      case 'ListComp': {
        const out: Val[] = [];
        this.runComp(node.fors, 0, env, () => { out.push(this.evalExpr(node.elt, env)); });
        return out;
      }
      case 'SetComp': {
        const out: Val[] = [];
        this.runComp(node.fors, 0, env, () => {
          const v = this.evalExpr(node.elt, env);
          if (!out.some((o) => this.eq(o, v))) out.push(v);
        });
        return out;
      }
      case 'GenExp': {
        const out: Val[] = [];
        this.runComp(node.fors, 0, env, () => { out.push(this.evalExpr(node.elt, env)); });
        return out;
      }
      case 'DictComp': {
        const m = new Map<string, Val>();
        this.runComp(node.fors, 0, env, () => {
          const k = this.evalExpr(node.key, env);
          m.set(pyHashKey(k), this.evalExpr(node.value, env));
        });
        return m;
      }
      case 'Starred': return this.evalExpr(node.e, env);
      default:
        throw new RtError(`SyntaxError: unsupported expression '${node.kind}'`);
    }
  }

  interpolateSpec(spec: string, env: PyEnv): string {
    if (!spec.includes('{')) return spec;
    return spec.replace(/\{([^}]*)\}/g, (_m, inner: string) => pyStrOf(this.evalExpr(parseExpressionText(inner), env)));
  }

  runComp(fors: any[], idx: number, env: PyEnv, emit: () => void): void {
    if (idx >= fors.length) { emit(); return; }
    const gen = fors[idx];
    const iterable = this.iterate(this.evalExpr(gen.iter, env));
    for (const item of iterable) {
      this.setAttr(gen.target, item, env);
      let ok = true;
      for (const cond of gen.ifs) if (!truthy(this.evalExpr(cond, env))) { ok = false; break; }
      if (ok) this.runComp(fors, idx + 1, env, emit);
    }
  }

  compareOp(op: string, a: Val, b: Val): boolean {
    switch (op) {
      case '==': return this.eq(a, b);
      case '!=': return !this.eq(a, b);
      case '<': return this.compare(a, b) < 0;
      case '>': return this.compare(a, b) > 0;
      case '<=': return this.compare(a, b) <= 0;
      case '>=': return this.compare(a, b) >= 0;
      case 'in': {
        if (typeof b === 'string') return b.includes(pyStrOf(a));
        if (b instanceof Map) return (b as Map<string, Val>).has(pyHashKey(a));
        return this.iterate(b).some((x) => this.eq(x, a));
      }
      case 'not in': return !this.compareOp('in', a, b);
      case 'is': return a === b || (a === null && b === null);
      case 'is not': return !(a === b || (a === null && b === null));
      default: return false;
    }
  }

  indexValue(obj: Val, idx: Val): Val {
    if (obj instanceof Map) {
      const key = pyHashKey(idx);
      if (!(obj as Map<string, Val>).has(key)) {
        if ((obj as Map<string, Val>).has(toStr(idx))) return (obj as Map<string, Val>).get(toStr(idx));
        throw new PyRaise(newException('KeyError', pyRepr(idx)));
      }
      return (obj as Map<string, Val>).get(key);
    }
    if (Array.isArray(obj)) {
      if (Array.isArray(idx)) {
        const out: Val[] = [];
        for (const i of idx) out.push(this.indexValue(obj, i));
        return out;
      }
      let i = toInt(idx);
      if (i < 0) i += obj.length;
      if (i < 0 || i >= obj.length) throw new PyRaise(newException('IndexError', 'list index out of range'));
      return obj[i];
    }
    if (typeof obj === 'string') {
      let i = toInt(idx);
      if (i < 0) i += obj.length;
      if (i < 0 || i >= obj.length) throw new PyRaise(newException('IndexError', 'string index out of range'));
      return obj[i];
    }
    if (isPyInstance(obj)) {
      const r = callDunder(obj, '__getitem__', [idx]);
      if (r !== undefined) return r;
      throw new PyRaise(newException('TypeError', `'${obj.cls.name}' object is not subscriptable`));
    }
    return getProp(obj, idx as any);
  }

  /** Python-aware invocation used by higher-order builtins (map/filter/sorted key/…). */
  pyCall(f: Val, args: Val[]): Val {
    return this.callFunction(f, args, {});
  }

  callFunction(f: Val, args: Val[], kwargs: Record<string, Val>): Val {
    if (f && typeof f === 'object' && f.__fn) return f.__fn(args, newEnv(), kwargs);
    if (isPyFunction(f)) {
      const env = newEnv(f.closure);
      bindParams(f, args, kwargs, env);
      const globalsDecl = new Set<string>();
      (env as any).__globalsDecl = globalsDecl;
      collectGlobals(f.body, globalsDecl);
      try {
        this.execStmts(f.body, env);
      } catch (err) {
        if (err instanceof ReturnSignal) return err.value;
        throw err;
      }
      return null;
    }
    if (isPyClass(f)) return this.instantiate(f, args, kwargs);
    if (typeof f === 'function') return f(args);
    throw new PyRaise(newException('TypeError', `'${typeof f}' object is not callable`));
  }

  instantiate(cls: PyClass, args: Val[], kwargs: Record<string, Val>): Val {
    if (cls.name === 'Exception' || DATA_EXCEPTIONS.has(cls.name)) {
      return { __pyexc: true, cls: cls.name, value: args[0] ?? null };
    }
    const inst: PyInstance = { __pyinst: true, cls, fields: new Map() };
    const init = findMethod(cls, '__init__');
    if (init && isPyFunction(init)) {
      const env = newEnv(init.closure);
      bindParams(init, [inst, ...args], kwargs, env);
      try {
        this.execStmts(init.body, env);
      } catch (err) {
        if (!(err instanceof ReturnSignal)) throw err;
      }
    } else if (args.length && cls.bases.length === 0 && !findMethod(cls, '__init__')) {
      // dataclass-ish fallback: attach by field order from class-level annotations is unknown
    }
    return inst;
  }

  /* ---------------------------- statements -------------------------- */

  execStmts(stmts: Stmt[], env: PyEnv): void {
    for (const s of stmts) this.execStmt(s, env);
  }

  execStmt(node: Stmt, env: PyEnv): void {
    this.tick();
    switch (node.kind) {
      case 'Expr':
        this.evalExpr(node.e, env);
        return;
      case 'Pass':
        return;
      case 'Break':
        throw new BreakSignal();
      case 'Continue':
        throw new ContinueSignal();
      case 'Return':
        throw new ReturnSignal(node.value ? this.evalExpr(node.value, env) : null);
      case 'Assign': {
        const value = this.evalExpr(node.value, env);
        for (const target of node.targets) this.setAttr(target, value, env);
        return;
      }
      case 'AugAssign': {
        const target = node.target;
        if (target.kind === 'Name') {
          const cur = this.evalExpr(target, env);
          const value = this.binop(node.op, cur, this.evalExpr(node.value, env));
          this.setAttr(target, value, env);
        } else if (target.kind === 'Index') {
          const obj = this.evalExpr(target.obj, env);
          const idx = this.evalExpr(target.idx, env);
          const cur = this.indexValue(obj, idx);
          const value = this.binop(node.op, cur, this.evalExpr(node.value, env));
          if (obj instanceof Map) (obj as Map<string, Val>).set(pyHashKey(idx), value);
          else if (Array.isArray(obj)) obj[toInt(idx)] = value;
        } else if (target.kind === 'Attr') {
          const obj = this.evalExpr(target.obj, env);
          const cur = this.getAttr(obj, target.name);
          const value = this.binop(node.op, cur, this.evalExpr(node.value, env));
          this.setAttr(target, value, env);
        }
        return;
      }
      case 'If': {
        if (truthy(this.evalExpr(node.test, env))) this.execStmts(node.body, env);
        else if (node.orelse.length) this.execStmts(node.orelse, env);
        return;
      }
      case 'While': {
        let guard = 0;
        while (truthy(this.evalExpr(node.test, env))) {
          this.tick();
          if (++guard > MAX_ITER) throw new RtError('ExecutionLimit: while loop exceeded 5,000,000 iterations');
          try {
            this.execStmts(node.body, env);
          } catch (err) {
            if (err instanceof BreakSignal) { guard = -1; break; }
            if (err instanceof ContinueSignal) continue;
            throw err;
          }
        }
        if (guard >= 0 && node.orelse?.length) this.execStmts(node.orelse, env);
        return;
      }
      case 'For': {
        const items = this.iterate(this.evalExpr(node.iter, env));
        let broke = false;
        for (const item of items) {
          this.tick();
          this.setAttr(node.target, item, env);
          try {
            this.execStmts(node.body, env);
          } catch (err) {
            if (err instanceof BreakSignal) { broke = true; break; }
            if (err instanceof ContinueSignal) continue;
            throw err;
          }
        }
        if (!broke && node.orelse?.length) this.execStmts(node.orelse, env);
        return;
      }
      case 'FuncDef': {
        const defaults = new Map<string, Val>();
        for (const p of node.params) {
          if (p.def) defaults.set(p.name, this.evalExpr(p.def, env));
        }
        const f: PyFunction = { __pyfunc: true, name: node.name, params: node.params, body: node.body, closure: env, isLambda: false, defaults };
        let value: Val = f;
        if (node.decorators?.length) {
          for (const dec of node.decorators) {
            const d = this.evalExpr(dec, env);
            // staticmethod / classmethod pass-through
            if (toStr(d) === 'staticmethod' || toStr(d) === 'classmethod') continue;
            value = this.callFunction(d, [value], {});
          }
        }
        env.vars.set(node.name, value);
        return;
      }
      case 'ClassDef': {
        const bases = node.bases.map((b: Expr) => this.evalExpr(b, env)).filter(isPyClass);
        const cls: PyClass = { __pyclass: true, name: node.name, bases, body: node.body, closure: env, env: new Map() };
        const clsEnv = newEnv(env);
        clsEnv.vars.set('__name__', node.name);
        this.execStmts(node.body, clsEnv);
        for (const [k, v] of clsEnv.vars) cls.env.set(k, v);
        env.vars.set(node.name, cls);
        return;
      }
      case 'Import': {
        for (const spec of node.names) {
          const mod = this.moduleEnv.vars.get(spec.name.split('.')[0]);
          if (mod === undefined) throw new PyRaise(newException('ImportError', `No module named '${spec.name}'`));
          env.vars.set(spec.alias ?? spec.name.split('.')[0], mod);
        }
        return;
      }
      case 'FromImport': {
        const mod = this.moduleEnv.vars.get(node.module.split('.')[0]);
        if (mod === undefined) throw new PyRaise(newException('ImportError', `No module named '${node.module}'`));
        for (const spec of node.names) {
          if (spec.name === '*') {
            if (mod instanceof Map) for (const [k, v] of mod) env.vars.set(k, v);
            continue;
          }
          const v = mod instanceof Map ? mod.get(spec.name) : undefined;
          if (v === undefined) throw new PyRaise(newException('ImportError', `cannot import name '${spec.name}' from '${node.module}'`));
          env.vars.set(spec.alias ?? spec.name, v);
        }
        return;
      }
      case 'Global': {
        if (!(env as any).__globalsDecl) (env as any).__globalsDecl = new Set<string>();
        for (const n of node.names) (env as any).__globalsDecl.add(n);
        return;
      }
      case 'Del': {
        for (const target of node.targets) {
          if (target.kind === 'Name') env.vars.delete(target.id);
          else if (target.kind === 'Index') {
            const obj = this.evalExpr(target.obj, env);
            const idx = this.evalExpr(target.idx, env);
            if (Array.isArray(obj)) obj.splice(toInt(idx), 1);
            else if (obj instanceof Map) (obj as Map<string, Val>).delete(pyHashKey(idx));
          }
        }
        return;
      }
      case 'Assert': {
        if (!truthy(this.evalExpr(node.test, env))) {
          throw new PyRaise(newException('AssertionError', node.msg ? pyStrOf(this.evalExpr(node.msg, env)) : ''));
        }
        return;
      }
      case 'Raise': {
        if (!node.exc) throw new RtError('Re-raise without active exception is not supported');
        const exc = this.evalExpr(node.exc, env);
        if (isPyExc(exc)) throw new PyRaise(exc);
        if (isPyClass(exc)) throw new PyRaise(newException(exc.name, ''));
        throw new PyRaise(newException('Exception', pyStrOf(exc)));
      }
      case 'Try': {
        let raised: any = null;
        try {
          this.execStmts(node.body, env);
          if (node.orelse?.length) this.execStmts(node.orelse, env);
        } catch (err: any) {
          if (err instanceof BreakSignal || err instanceof ContinueSignal || err instanceof ReturnSignal) throw err;
          raised = err;
        }
        if (raised) {
          let handled = false;
              const excClass: string = raised instanceof PyRaise ? raised.exc.cls : (raised instanceof RtError ? mapErrorClass(raised.message) : 'RuntimeError');
          const message = raised instanceof PyRaise ? pyStrOf(raised.exc.value) : (raised instanceof Error ? raised.message : String(raised));
          for (const h of node.handlers) {
            let matches = !h.type;
            if (h.type) {
              const t = this.evalExpr(h.type, env);
              const names = Array.isArray(t) ? t.map(toStr) : [isPyClass(t) ? t.name : toStr(t)];
              matches = names.some((n) => excClass === n || n === 'Exception' || n === 'BaseException' || (n === 'ArithmeticError' && excClass === 'ZeroDivisionError') || (n === 'LookupError' && (excClass === 'KeyError' || excClass === 'IndexError')));
            }
            if (matches) {
              handled = true;
              if (h.bind) {
                const bound = raised instanceof PyRaise ? { __class: raised.exc.cls, args: [raised.exc.value], __str__: () => pyStrOf(raised.exc.value) } : { __class: excClass, args: [message], __str__: () => message };
                env.vars.set(h.bind, bound);
              }
              try {
                this.execStmts(h.body, env);
              } catch (inner) {
                if (inner instanceof BreakSignal || inner instanceof ContinueSignal || inner instanceof ReturnSignal) { if (node.finalbody?.length) this.execStmts(node.finalbody, env); throw inner; }
                if (node.finalbody?.length) this.execStmts(node.finalbody, env);
                throw inner;
              }
              break;
            }
          }
          if (!handled) {
            if (node.finalbody?.length) this.execStmts(node.finalbody, env);
            throw raised;
          }
        }
        if (node.finalbody?.length) this.execStmts(node.finalbody, env);
        return;
      }
      case 'With': {
        for (const item of node.items) {
          const ctx = this.evalExpr(item.ctx, env);
          let value = ctx;
          if (ctx instanceof Map && (ctx as Map<string, Val>).has('__enter__')) {
            value = this.callFunction((ctx as Map<string, Val>).get('__enter__') as Val, [], {});
          }
          if (item.bind) env.vars.set(item.bind, value);
        }
        this.execStmts(node.body, env);
        return;
      }
      default:
        throw new RtError(`SyntaxError: unsupported statement '${node.kind}'`);
    }
  }

  run(source: string): void {
    const parser = new Parser(source);
    const stmts = parser.parseFile();
    try {
      this.execStmts(stmts, this.moduleEnv);
    } catch (err) {
      if (err instanceof PyRaise) {
        const msg = err.exc.value !== null && err.exc.value !== '' ? `: ${pyStrOf(err.exc.value)}` : '';
        this.err(`${err.exc.cls}${msg}\n`);
        return;
      }
      if (err instanceof BreakSignal || err instanceof ContinueSignal) {
        this.err("SyntaxError: 'break'/'continue' outside loop\n");
        return;
      }
      if (err instanceof ReturnSignal) return;
      if (err instanceof RtError) {
        this.err(err.message.startsWith('SyntaxError') ? `${err.message}\n` : `Traceback (most recent call last):\n  ${err.message}\n`);
        return;
      }
      throw err;
    }
  }
}

const MAX_ITER = 3_000_000;

const DATA_EXCEPTIONS = new Set([
  'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError', 'ZeroDivisionError', 'NameError',
  'AttributeError', 'RuntimeError', 'StopIteration', 'AssertionError', 'FileNotFoundError', 'OSError',
  'NotImplementedError', 'OverflowError', 'ArithmeticError', 'LookupError', 'ImportError', 'SystemExit',
]);

function mapErrorClass(msg: string): string {
  if (msg.startsWith('ZeroDivisionError') || msg.includes('division by zero')) return 'ZeroDivisionError';
  if (msg.startsWith('NameError')) return 'NameError';
  if (msg.startsWith('TypeError')) return 'TypeError';
  if (msg.startsWith('SyntaxError')) return 'SyntaxError';
  if (msg.startsWith('ValueError')) return 'ValueError';
  return 'RuntimeError';
}

const isObjDict = (v: any): boolean => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Map) && !v.__pyinst;

function collectGlobals(stmts: Stmt[], out: Set<string>): void {
  for (const s of stmts) {
    if (!s) continue;
    if (s.kind === 'Global') for (const n of s.names) out.add(n);
    for (const key of ['body', 'orelse', 'finalbody']) {
      if (Array.isArray(s[key])) collectGlobals(s[key], out);
    }
    if (Array.isArray(s.handlers)) for (const h of s.handlers) collectGlobals(h.body, out);
  }
}

function lookupPy(env: PyEnv, name: string): Val {
  let cur: PyEnv | undefined = env;
  while (cur) {
    if (cur.vars.has(name)) return cur.vars.get(name);
    cur = cur.parent as PyEnv | undefined;
  }
  return undefined;
}

function envHas(env: PyEnv, name: string): boolean {
  let cur: PyEnv | undefined = env;
  while (cur) {
    if (cur.vars.has(name)) return true;
    cur = cur.parent as PyEnv | undefined;
  }
  return false;
}

function bindParams(f: PyFunction, args: Val[], kwargs: Record<string, Val>, env: PyEnv): void {
  let ai = 0;
  const positional = f.params.filter((p) => p.kind === 'pos');
  const vararg = f.params.find((p) => p.kind === 'vararg');
  const kwarg = f.params.find((p) => p.kind === 'kwarg');
  for (const p of positional) {
    if (ai < args.length) env.vars.set(p.name, args[ai++]);
    else if (kwargs[p.name] !== undefined) env.vars.set(p.name, kwargs[p.name]);
    else if (f.defaults && f.defaults.has(p.name)) env.vars.set(p.name, f.defaults.get(p.name));
    else env.vars.set(p.name, null);
  }
  if (vararg) env.vars.set(vararg.name, args.slice(ai));
  if (kwarg) {
    const extra = new Map<string, Val>();
    for (const [k, v] of Object.entries(kwargs)) {
      if (!positional.some((p) => p.name === k)) extra.set(k, v);
    }
    env.vars.set(kwarg.name, extra);
  }
}

export { pyRepr, pyStrOf };

/* Exposed helper used by the UI for "Run" dispatch */
export function runPython(source: string, opts: PyOptions): void {
  const runtime = new PythonRuntime(opts);
  runtime.run(source);
}

export function fromJsonToPy(v: any): Val {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(fromJsonToPy);
  if (typeof v === 'object') {
    const m = new Map<string, Val>();
    for (const [k, val] of Object.entries(v)) m.set(k, fromJsonToPy(val));
    return m;
  }
  return v;
}

/** Convert Python values back to plain JSON for the UI */
export function pyToJson(v: Val): any {
  if (isPyInstance(v)) return null;
  if (Array.isArray(v)) return v.map(pyToJson);
  if (v instanceof Map) {
    const o: any = {};
    for (const [k, val] of v) o[k] = pyToJson(val);
    return o;
  }
  return v;
}

export { callMethod, cloneVal, printfFormat, numStr, toNum, toInt, truthy, toStr };
