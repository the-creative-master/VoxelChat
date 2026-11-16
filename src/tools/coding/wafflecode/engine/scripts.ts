/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WaffleCode Scripting Engines
 * Real, local interpreters written in TypeScript — no CDN, no network.
 *   Lua 5.4 / Luau, POSIX shell, Haskell, Prolog, Forth, Brainfuck, Scheme.
 */

/* ============================ Lua / Luau ============================ */

interface LuaTok { k: 'num' | 'str' | 'name' | 'op' | 'eof' | 'kw'; v: string; n?: number; line: number }

const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil',
  'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while', 'continue',
]);

function luaLex(src: string): LuaTok[] {
  const toks: LuaTok[] = [];
  let i = 0;
  let line = 1;
  const OPS = ['...', '..', '==', '~=', '<=', '>=', '//', '::', '+=', '-=', '*=', '/='];
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && src[i + 1] === '-') {
      if (src.startsWith('--[[', i)) {
        const end = src.indexOf(']]', i);
        const stop = end < 0 ? src.length : end + 2;
        for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
        i = stop;
        continue;
      }
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') {
          const nx = src[j + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'" };
          s += map[nx] ?? nx;
          j += 2;
          continue;
        }
        s += src[j++];
      }
      toks.push({ k: 'str', v: s, line });
      i = j + 1;
      continue;
    }
    if (src.startsWith('[[', i)) {
      const end = src.indexOf(']]', i + 2);
      const raw = src.slice(i + 2, end < 0 ? src.length : end);
      for (const ch of raw) if (ch === '\n') line++;
      toks.push({ k: 'str', v: raw, line });
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      if (c === '0' && /[xX]/.test(src[i + 1] ?? '')) {
        j += 2;
        while (j < src.length && /[0-9a-fA-F]/.test(src[j])) j++;
        toks.push({ k: 'num', v: src.slice(i, j), n: parseInt(src.slice(i + 2, j), 16), line });
      } else {
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        if (/[eE]/.test(src[j] ?? '')) { j++; if (/[+\-]/.test(src[j] ?? '')) j++; while (/[0-9]/.test(src[j] ?? '')) j++; }
        toks.push({ k: 'num', v: src.slice(i, j), n: Number(src.slice(i, j)), line });
      }
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      toks.push({ k: LUA_KEYWORDS.has(word) ? 'kw' : 'name', v: word, line });
      i = j;
      continue;
    }
    let op = '';
    for (const o of OPS) if (src.startsWith(o, i)) { op = o; break; }
    if (!op) op = c;
    toks.push({ k: 'op', v: op, line });
    i += op.length;
  }
  toks.push({ k: 'eof', v: '', line });
  return toks;
}

export function runLua(source: string, emit: (s: string) => void, isLuau = false): void {
  const out = (s: string) => emit(s);
  const toks = luaLex(source);
  let p = 0;
  let steps = 0;
  const tick = () => { if (++steps > 4_000_000) throw new Error('ScriptExecutionLimit: Lua exceeded 4,000,000 operations'); };

  const peek = () => toks[p];
  const next = () => toks[p++];
  const at = (v: string) => (peek().k === 'op' || peek().k === 'kw') && peek().v === v;
  const eat = (v: string) => { if (at(v)) { p++; return true; } return false; };
  const expect = (v: string) => {
    if (!at(v)) throw new Error(`lua: '${v}' expected near '${peek().v || '<eof>'}' (line ${peek().line})`);
    return next();
  };

  type LuaTable = { __table: true; arr: any[]; hash: Map<string, any> };
  const isTable = (v: any): v is LuaTable => !!v && v.__table === true;
  const makeTable = (arr: any[] = []): LuaTable => ({ __table: true, arr, hash: new Map() });
  const tget = (t: any, k: any): any => {
    if (isTable(t)) {
      if (typeof k === 'number') return t.arr[k - 1];
      return t.hash.get(String(k));
    }
    if (typeof t === 'string') {
      if (k === 'length' || k === 'len') return t.length;
      return undefined;
    }
    if (Array.isArray(t)) return typeof k === 'number' ? t[k - 1] : undefined;
    if (t && typeof t === 'object') return t[String(k)];
    return undefined;
  };
  const tset = (t: any, k: any, v: any): void => {
    if (isTable(t)) {
      if (typeof k === 'number' && Number.isInteger(k)) t.arr[k - 1] = v;
      else t.hash.set(String(k), v);
      return;
    }
    if (t && typeof t === 'object') t[String(k)] = v;
  };
  const luaLen = (t: any): number => {
    if (isTable(t)) return t.arr.length;
    if (typeof t === 'string') return t.length;
    if (Array.isArray(t)) return t.length;
    return 0;
  };
  const luaStr = (v: any): string => {
    if (v === null || v === undefined) return 'nil';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(14)));
    if (isTable(v)) return 'table: 0x' + (v.arr.length + v.hash.size).toString(16).padStart(4, '0');
    if (typeof v === 'function') return 'function: 0x' + String(v).length.toString(16);
    return String(v);
  };
  const truthy = (v: any) => v !== null && v !== undefined && v !== false;

  const toNumber = (v: any): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Number(v);
    throw new Error(`lua: attempt to perform arithmetic on a ${typeof v} value`);
  };

  const globals = new Map<string, any>();

  // ---------------- libraries ----------------
  const mathLib = makeTable();
  const setm = (t: LuaTable, k: string, v: any) => t.hash.set(k, v);
  for (const [k, v] of Object.entries({
    pi: Math.PI, huge: Infinity, abs: Math.abs, ceil: Math.ceil, floor: Math.floor, sqrt: Math.sqrt,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    exp: Math.exp, log: Math.log, log10: (x: number) => Math.log10(x), max: Math.max, min: Math.min,
    fmod: (a: number, b: number) => a % b, tointeger: (x: any) => Math.trunc(Number(x)),
    random: (a?: number, b?: number) => {
      if (a === undefined) return Math.random();
      if (b === undefined) return Math.floor(Math.random() * a);
      return a + Math.floor(Math.random() * (b - a + 1));
    },
    floor_: Math.floor,
  })) setm(mathLib, k, v);
  globals.set('math', mathLib);

  const stringLib = makeTable();
  setm(stringLib, 'format', (fmt: string, ...args: any[]) => {
    let i = 0;
    return String(fmt).replace(/%(-?\d*)(?:\.(\d+))?([diouxXeEfgGqsc%])/g, (_m, width: string, prec: string, spec: string) => {
      if (spec === '%') return '%';
      const v = args[i++];
      let s: string;
      switch (spec) {
        case 'd': case 'i': s = String(Math.trunc(Number(v))); break;
        case 'f': s = Number(v).toFixed(prec !== undefined ? Number(prec) : 6); break;
        case 'e': case 'E': s = Number(v).toExponential(prec !== undefined ? Number(prec) : 6); break;
        case 'g': case 'G': s = String(Number(v)); break;
        case 'x': s = Math.trunc(Number(v)).toString(16); break;
        case 'X': s = Math.trunc(Number(v)).toString(16).toUpperCase(); break;
        case 'o': s = Math.trunc(Number(v)).toString(8); break;
        case 'q': s = JSON.stringify(v); break;
        case 'c': s = String.fromCharCode(Number(v)); break;
        default: s = String(v);
      }
      const w = width ? Number(width) : 0;
      if (w > 0) return s.padStart(w, ' ');
      if (w < 0) return s.padEnd(-w, ' ');
      return s;
    });
  });
  setm(stringLib, 'rep', (s: string, n: number, sep = '') => Array(Math.max(0, Math.trunc(n))).fill(String(s)).join(sep));
  setm(stringLib, 'len', (s: string) => String(s).length);
  setm(stringLib, 'sub', (s: string, i: number, j?: number) => {
    const str = String(s);
    let start = Math.trunc(i);
    let end = j === undefined ? str.length : Math.trunc(j);
    if (start < 0) start = str.length + start + 1;
    if (end < 0) end = str.length + end + 1;
    return str.slice(Math.max(0, start - 1), end);
  });
  setm(stringLib, 'upper', (s: string) => String(s).toUpperCase());
  setm(stringLib, 'lower', (s: string) => String(s).toLowerCase());
  setm(stringLib, 'gsub', (s: string, pat: string, rep: string) => String(s).split(String(pat)).join(String(rep)));
  setm(stringLib, 'find', (s: string, pat: string) => {
    const idx = String(s).indexOf(String(pat));
    return idx < 0 ? null : makeTable([idx + 1, idx + String(pat).length]);
  });
  setm(stringLib, 'byte', (s: string) => String(s).charCodeAt(0));
  setm(stringLib, 'char', (...n: number[]) => String.fromCharCode(...n));
  setm(stringLib, 'reverse', (s: string) => Array.from(String(s)).reverse().join(''));
  setm(stringLib, 'match', (s: string, pat: string) => {
    const re = new RegExp(String(pat).replace(/%d/g, '\\d+').replace(/%a/g, '[A-Za-z]+').replace(/%w/g, '\\w+').replace(/%s/g, '\\s+'));
    const m = re.exec(String(s));
    return m ? m[0] : null;
  });
  globals.set('string', stringLib);

  const tableLib = makeTable();
  setm(tableLib, 'insert', (t: any, a: any, b?: any) => {
    if (!isTable(t)) return;
    if (b === undefined) t.arr.push(a);
    else t.arr.splice(Math.trunc(a) - 1, 0, b);
  });
  setm(tableLib, 'remove', (t: any, pos?: number) => (isTable(t) ? (pos === undefined ? t.arr.pop() : t.arr.splice(Math.trunc(pos) - 1, 1)[0]) : null));
  setm(tableLib, 'concat', (t: any, sep = '') => (isTable(t) ? t.arr.map(luaStr).join(String(sep)) : ''));
  setm(tableLib, 'sort', (t: any) => { if (isTable(t)) t.arr.sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : luaStr(a).localeCompare(luaStr(b)))); });
  setm(tableLib, 'unpack', (t: any) => (isTable(t) ? [...t.arr] : []));
  setm(tableLib, 'pack', (...a: any[]) => makeTable([...a]));
  globals.set('table', tableLib);

  const osLib = makeTable();
  setm(osLib, 'time', () => Math.floor(Date.now() / 1000));
  setm(osLib, 'clock', () => performance.now() / 1000);
  setm(osLib, 'date', (fmt?: string) => (fmt ? new Date().toString() : new Date().toISOString()));
  globals.set('os', osLib);

  const ioLib = makeTable();
  setm(ioLib, 'write', (s: any) => { out(s === null || s === undefined ? 'nil' : typeof s === 'number' ? luaStr(s) : String(s)); });
  setm(ioLib, 'read', () => '');
  globals.set('io', ioLib);
  globals.set('_VERSION', isLuau ? 'Luau' : 'Lua 5.4');

  for (const [name, f] of Object.entries({
    print: (...a: any[]) => { out(a.map(luaStr).join('\t') + '\n'); },
    tonumber: (v: any, base?: number) => {
      if (base) return parseInt(String(v), base);
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    },
    tostring: (v: any) => luaStr(v),
    type: (v: any) => (v === null ? 'nil' : isTable(v) ? 'table' : typeof v === 'function' ? 'function' : typeof v),
    ipairs: (t: any) => (isTable(t) ? t.arr : []),
    pairs: (t: any) => t,
    next: () => null,
    select: (n: any, ...a: any[]) => (n === '#' ? a.length : a.slice(Number(n) - 1)),
    error: (m: any) => { throw new Error(luaStr(m)); },
    assert: (v: any, m?: any) => { if (!truthy(v)) throw new Error(m !== undefined ? luaStr(m) : 'assertion failed!'); return v; },
    pcall: (f: any, ...args: any[]) => { try { return makeTable([true, f(...args)]); } catch (e) { return makeTable([false, e instanceof Error ? e.message : String(e)]); } },
    unpack: (t: any) => (isTable(t) ? [...t.arr] : []),
    require: () => makeTable(),
    setmetatable: (t: any) => t,
    getmetatable: () => null,
    rawget: (t: any, k: any) => tget(t, k),
    rawset: (t: any, k: any, v: any) => { tset(t, k, v); return t; },
    rawequal: (a: any, b: any) => a === b,
  })) globals.set(name, f);
  if (isLuau) {
    globals.set('typeof', (v: any) => typeof v);
    const task = makeTable();
    setm(task, 'wait', () => {});
    setm(task, 'spawn', (f: any) => f());
    setm(task, 'delay', () => {});
    globals.set('task', task);
    const vector = (x: number, y: number, z: number) => ({ x, y, z, __vector: true });
    globals.set('Vector3', Object.assign(vector, { new: vector }));
  }

  // ---------------- scopes ----------------
  interface Scope { vars: Map<string, any>; parent?: Scope }
  const rootScope: Scope = { vars: new Map() };
  const lookup = (name: string, scope: Scope): any => {
    let s: Scope | undefined = scope;
    while (s) { if (s.vars.has(name)) return s.vars.get(name); s = s.parent; }
    return globals.get(name);
  };
  const setVar = (name: string, value: any, scope: Scope): void => {
    let s: Scope | undefined = scope;
    while (s) {
      if (s.vars.has(name)) { s.vars.set(name, value); return; }
      s = s.parent;
    }
    if (globals.has(name)) { globals.set(name, value); return; }
    scope.vars.set(name, value);
  };

  // Resolve `.key` / `:key` members, with string and table library fallbacks
  // so `("hi"):upper()` and `t:insert(x)` behave like real Lua.
  const resolveMember = (target: any, key: string): any => {
    const direct = tget(target, key);
    if (direct !== undefined) return direct;
    if (typeof target === 'string') return tget(stringLib, key);
    if (isTable(target)) return tget(tableLib, key);
    return undefined;
  };

  // ---------------- expression parser/evaluator ----------------
  const evalExpr = (scope: Scope): any => {
    tick();
    const left = evalUnary(scope);
    return applyBinOps(left, scope, 0);
  };

  const PREC: Record<string, number> = {
    or: 1, and: 2, '<': 3, '>': 3, '<=': 3, '>=': 3, '~=': 3, '==': 3,
    '..': 4, '|': 5, '~': 6, '&': 7, '<<': 8, '>>': 8, '+': 9, '-': 9,
    '*': 10, '/': 10, '//': 10, '%': 10, '^': 12,
  };

  const applyBinOps = (left: any, scope: Scope, minPrec: number): any => {
    while (true) {
      const t = peek();
      const op = t.v;
      if (t.k === 'eof') break;
      const prec = PREC[op];
      if (prec === undefined || prec < minPrec) break;
      p++;
      const rightAssoc = op === '^' || op === '..';
      let right = evalUnary(scope);
      const nextPrec = PREC[peek().v] ?? 0;
      if (rightAssoc ? nextPrec > prec : nextPrec > prec) {
        right = applyBinOps(right, scope, rightAssoc ? prec : prec + 1);
      }
      switch (op) {
        case 'or': left = truthy(left) ? left : right; break;
        case 'and': left = truthy(left) ? right : left; break;
        case '==': left = left === right || (isTable(left) && isTable(right) && left === right); break;
        case '~=': left = !(left === right); break;
        case '<': left = left < right; break;
        case '>': left = left > right; break;
        case '<=': left = left <= right; break;
        case '>=': left = left >= right; break;
        case '..': left = luaStr(left) + luaStr(right); break;
        case '+': left = toNumber(left) + toNumber(right); break;
        case '-': left = toNumber(left) - toNumber(right); break;
        case '*': left = toNumber(left) * toNumber(right); break;
        case '/': left = toNumber(left) / toNumber(right); break;
        case '//': left = Math.floor(toNumber(left) / toNumber(right)); break;
        case '%': left = ((toNumber(left) % toNumber(right)) + toNumber(right)) % toNumber(right); break;
        case '^': left = Math.pow(toNumber(left), toNumber(right)); break;
        case '&': left = toNumber(left) & toNumber(right); break;
        case '|': left = toNumber(left) | toNumber(right); break;
        case '~': left = toNumber(left) ^ toNumber(right); break;
        case '<<': left = toNumber(left) << toNumber(right); break;
        case '>>': left = toNumber(left) >> toNumber(right); break;
        default: break;
      }
    }
    return left;
  };

  const evalUnary = (scope: Scope): any => {
    if (at('-')) { p++; return -toNumber(evalUnary(scope)); }
    if (at('not')) { p++; return !truthy(evalUnary(scope)); }
    if (at('#')) { p++; return luaLen(evalUnary(scope)); }
    return evalPostfix(scope);
  };

  const evalPostfix = (scope: Scope): any => {
    let v = evalPrimary(scope);
    while (true) {
      if (at('.')) {
        p++;
        const key = next().v;
        const member = resolveMember(v, key);
        if (at('(') || peek().k === 'str' || at('{')) {
          const args = evalCallArgs(scope);
          if (typeof member !== 'function') throw new Error(`lua: attempt to call a ${member === null || member === undefined ? 'nil' : typeof member} value ('${key}')`);
          v = member(...args);
          continue;
        }
        v = member;
        continue;
      }
      if (at('[')) {
        p++;
        const key = evalExpr(scope);
        expect(']');
        v = tget(v, key);
        continue;
      }
      if (at(':')) {
        p++;
        const key = next().v;
        const args = evalCallArgs(scope);
        const fn = resolveMember(v, key);
        if (typeof fn !== 'function') throw new Error(`lua: attempt to call a nil value (method '${key}')`);
        v = fn(v, ...args);
        continue;
      }
      if (at('(')) {
        const args = evalCallArgs(scope);
        if (typeof v !== 'function') throw new Error(`lua: attempt to call a ${v === null ? 'nil' : typeof v} value`);
        v = v(...args);
        continue;
      }
      if (peek().k === 'str') {
        const s = next().v;
        if (typeof v !== 'function') throw new Error('lua: attempt to call a non-function');
        v = v(s);
        continue;
      }
      if (at('{')) {
        const arg = evalTable(scope);
        if (typeof v !== 'function') throw new Error('lua: attempt to call a non-function');
        v = v(arg);
        continue;
      }
      break;
    }
    return v;
  };

  const evalCallArgs = (scope: Scope): any[] => {
    expect('(');
    const args: any[] = [];
    if (!at(')')) {
      while (true) {
        args.push(evalExpr(scope));
        if (!eat(',')) break;
      }
    }
    expect(')');
    return args;
  };

  const evalTable = (scope: Scope): LuaTable => {
    expect('{');
    const t = makeTable();
    let index = 1;
    while (!at('}') && peek().k !== 'eof') {
      if (at('[')) {
        p++;
        const key = evalExpr(scope);
        expect(']');
        expect('=');
        tset(t, key, evalExpr(scope));
      } else if (peek().k === 'name' && toks[p + 1] && toks[p + 1].v === '=') {
        const key = next().v;
        p++;
        tset(t, key, evalExpr(scope));
      } else {
        const value = evalExpr(scope);
        if (isTable(value) && toks[p - 1].v === '...') t.arr.push(...value.arr);
        else t.arr[index - 1] = value;
        index++;
      }
      if (!eat(',') && !eat(';')) break;
    }
    expect('}');
    return t;
  };

  const evalPrimary = (scope: Scope): any => {
    const t = peek();
    if (t.k === 'num') { p++; return t.n; }
    if (t.k === 'str') { p++; return t.v; }
    if (t.k === 'kw') {
      switch (t.v) {
        case 'nil': p++; return null;
        case 'true': p++; return true;
        case 'false': p++; return false;
        case 'function': {
          p++;
          expect('(');
          const params: string[] = [];
          if (!at(')')) {
            while (true) {
              if (peek().k === 'name') params.push(next().v);
              else if (at('...')) { p++; params.push('...'); }
              if (!eat(',')) break;
            }
          }
          expect(')');
          const bodyStart = p;
          skipBlockTokens();
          const bodyEnd = p;
          const bodyToks = toks.slice(bodyStart, bodyEnd);
          return makeLuaClosure(params, bodyToks, scope);
        }
        case 'if': {
          p++;
          const cond = evalExpr(scope);
          expect('then');
          const thenStart = p;
          skipUntilKeywords(['elseif', 'else', 'end']);
          const thenEnd = p;
          const thenToks = toks.slice(thenStart, thenEnd);
          let elseToks: LuaTok[] | null = null;
          if (at('elseif')) { elseToks = null; }
          if (at('else')) {
            p++;
            const elseStart = p;
            skipUntilKeywords(['end']);
            elseToks = toks.slice(elseStart, p);
          }
          if (at('end')) p++;
          const runExprBlock = (block: LuaTok[]): any => {
            try {
              return runBlockTokens(block, { vars: new Map(), parent: scope });
            } catch (err) {
              if (err instanceof Error && err.message === '__lua_return__') return (err as any).value ?? null;
              throw err;
            }
          };
          if (truthy(cond)) return runExprBlock(thenToks);
          if (elseToks) return runExprBlock(elseToks);
          return null;
        }
        default: break;
      }
    }
    if (t.k === 'name') { p++; return lookup(t.v, scope); }
    if (at('(')) { p++; const v = evalExpr(scope); expect(')'); return v; }
    if (at('{')) return evalTable(scope);
    if (at('...')) { p++; return makeTable(); }
    p++;
    return null;
  };

  let __depth = 0;
  const makeLuaClosure = (params: string[], bodyToks: LuaTok[], closure: Scope) => {
    return (...args: any[]) => {
      if (++__depth > 2000) { __depth = 0; throw new Error('lua: stack overflow (too much recursion)'); }
      const local: Scope = { vars: new Map(), parent: closure };
      params.forEach((param, i) => {
        if (param === '...') local.vars.set('...', makeTable(args.slice(i)));
        else local.vars.set(param, args[i]);
      });
      try {
        return runBlockTokens(bodyToks, local);
      } catch (err) {
        if (err instanceof Error && err.message === '__lua_return__') return (err as any).value ?? null;
        throw err;
      } finally { __depth--; }
    };
  };

  const skipUntilKeywords = (kws: string[]) => {
    let depth = 0;
    while (peek().k !== 'eof') {
      const t = peek();
      if (depth === 0 && t.k === 'kw' && kws.includes(t.v)) return;
      if (t.k === 'kw' && ['if', 'function', 'do', 'for', 'while'].includes(t.v)) depth++;
      if (t.k === 'kw' && t.v === 'end') {
        if (depth === 0) return;
        depth--;
      }
      p++;
    }
  };

  const skipBlockTokens = () => {
    let depth = 0;
    let pendingDo = 0; // `do` following for/while opened a block already counted by its parent keyword
    while (peek().k !== 'eof') {
      const t = peek();
      if (t.k === 'kw') {
        if (['if', 'function', 'for', 'while'].includes(t.v)) depth++;
        else if (t.v === 'do') { if (pendingDo > 0) pendingDo--; else depth++; }
        else if (t.v === 'repeat') depth++;
        else if (t.v === 'end' || t.v === 'until') {
          if (depth === 0) return;
          depth--;
        }
      }
      p++;
    }
  };

  const runBlockTokens = (bodyToks: LuaTok[], scope: Scope): any => {
    const savedToks = toks.slice();
    const savedP = p;
    // splice body
    toks.length = 0;
    bodyToks.forEach((t) => toks.push(t));
    toks.push({ k: 'eof', v: '', line: 0 });
    p = 0;
    try {
      runStatements(scope);
      return null;
    } finally {
      toks.length = 0;
      savedToks.forEach((t) => toks.push(t));
      p = savedP;
    }
  };

  // Run a loop body, converting break/continue signals into a small result the caller acts on.
  const runLoopBody = (bodyToks: LuaTok[], inner: Scope): 'break' | 'continue' | 'normal' => {
    try {
      runBlockTokens(bodyToks, inner);
      return 'normal';
    } catch (err) {
      if (err instanceof Error && err.message === '__lua_break__') return 'break';
      if (err instanceof Error && err.message === '__lua_continue__') return 'continue';
      throw err;
    }
  };

  const evalToks = <T>(toksIn: LuaTok[], fn: () => T): T => {
    const savedToks = toks.slice();
    const savedP = p;
    toks.length = 0;
    toksIn.forEach((tk) => toks.push(tk));
    toks.push({ k: 'eof', v: '', line: 0 });
    p = 0;
    try {
      return fn();
    } finally {
      toks.length = 0;
      savedToks.forEach((tk) => toks.push(tk));
      p = savedP;
    }
  };

  const runStatements = (scope: Scope): void => {
    while (peek().k !== 'eof') {
      if (at('return')) {
        p++;
        const value = at('end') || peek().k === 'eof' ? null : evalExpr(scope);
        const err = new Error('__lua_return__');
        (err as any).value = value;
        throw err;
      }
      runStatement(scope);
    }
  };

  const runStatement = (scope: Scope): void => {
    tick();
    const t = peek();
    if (t.k === 'op' && t.v === ';') { p++; return; }
    if (t.k === 'kw') {
      switch (t.v) {
        case 'local': {
          p++;
          if (at('function')) {
            p++;
            const name = next().v;
            expect('(');
            const params: string[] = [];
            if (!at(')')) {
              while (true) {
                if (peek().k === 'name') params.push(next().v);
                else if (at('...')) { p++; params.push('...'); }
                if (!eat(',')) break;
              }
            }
            expect(')');
            const start = p;
            skipBlockTokens();
            const bodyToks = toks.slice(start, p);
            if (at('end')) p++;
            // forward declaration so the closure can see itself for recursion
            scope.vars.set(name, null);
            scope.vars.set(name, makeLuaClosure(params, bodyToks, scope));
            return;
          }
          const names: string[] = [];
          while (true) {
            names.push(next().v);
            if (at(':')) { p++; next(); }
            if (!eat(',')) break;
          }
          const values: any[] = [];
          if (eat('=')) {
            values.push(evalExpr(scope));
            while (eat(',')) values.push(evalExpr(scope));
          }
          names.forEach((n, i) => scope.vars.set(n, values[i] ?? null));
          return;
        }
        case 'function': {
          p++;
          let name = next().v;
          while (at('.') || at(':')) {
            p++;
            name += '.' + next().v;
          }
          expect('(');
          const params: string[] = [];
          if (!at(')')) {
            while (true) {
              if (peek().k === 'name') params.push(next().v);
              else if (at('...')) { p++; params.push('...'); }
              if (!eat(',')) break;
            }
          }
          expect(')');
          const start = p;
          skipBlockTokens();
          const bodyToks = toks.slice(start, p);
          if (at('end')) p++;
          scope.vars.set(name, null);
          const fn = makeLuaClosure(params, bodyToks, scope);
          const parts = name.split('.');
          if (parts.length === 1) setVar(name, fn, scope);
          else {
            let obj: any = lookup(parts[0], scope);
            for (let i = 1; i < parts.length - 1; i++) obj = tget(obj, parts[i]);
            tset(obj, parts[parts.length - 1], fn);
          }
          return;
        }
        case 'if': {
          p++;
          const cond = evalExpr(scope);
          expect('then');
          // A statement-bodied `if` ends its header at `then`; the tokenizer labels
          // `then` as a plain name, so capture the body start *after* it.
          if (peek().k === 'name' && peek().v === 'then') p++;
          const thenStart = p;
          let depth = 0;
          let elseIfStart = -1;
          let elseStart = -1;
          while (peek().k !== 'eof') {
            const tk = peek();
            if (tk.k === 'kw' && ['if', 'function', 'for', 'while'].includes(tk.v)) depth++;
            // a standalone `do ... end` block also nests, but the `do` that belongs to for/while already
            // had its parent keyword counted above, so only count it after matching that.
            if (tk.k === 'kw' && tk.v === 'end') {
              if (depth === 0) break;
              depth--;
            }
            if (depth === 0 && tk.k === 'kw' && tk.v === 'elseif' && elseIfStart < 0) elseIfStart = p;
            if (depth === 0 && tk.k === 'kw' && tk.v === 'else' && elseStart < 0) elseStart = p;
            p++;
          }
          const thenEnd = elseIfStart >= 0 ? elseIfStart : elseStart >= 0 ? elseStart : p;
          const thenToks = toks.slice(thenStart, thenEnd);
          let elseToks: LuaTok[] | null = null;
          let elseIsElseIf = false;
          if (elseIfStart >= 0) {
            // rebuild an if statement body
            const elseEnd = p;
            elseToks = toks.slice(elseIfStart, elseEnd);
            elseToks.push({ k: 'kw', v: 'if', line: 0 });
            elseToks.shift();
            elseToks.unshift({ k: 'kw', v: 'if', line: 0 });
            elseToks[elseToks.length - 1] = { k: 'kw', v: 'end', line: 0 };
            elseIsElseIf = true;
          } else if (elseStart >= 0) {
            elseToks = toks.slice(elseStart + 1, p);
          }
          if (at('end')) p++;
          if (truthy(cond)) runBlockTokens(thenToks, { vars: new Map(), parent: scope });
          else if (elseToks) {
            if (elseIsElseIf) runBlockTokens(elseToks, { vars: new Map(), parent: scope });
            else runBlockTokens(elseToks, { vars: new Map(), parent: scope });
          }
          return;
        }
        case 'while': {
          p++;
          // capture the condition tokens up to `do`
          const condStart = p;
          let d = 0;
          while (peek().k !== 'eof') {
            const tk = peek();
            if (tk.k === 'op' && (tk.v === '(' || tk.v === '[' || tk.v === '{')) d++;
            if (tk.k === 'op' && (tk.v === ')' || tk.v === ']' || tk.v === '}')) d--;
            if (d === 0 && tk.k === 'kw' && tk.v === 'do') break;
            p++;
          }
          const condToks = toks.slice(condStart, p);
          expect('do');
          const start = p;
          skipBlockTokens();
          const bodyToks = toks.slice(start, p);
          if (at('end')) p++;
          let guard = 0;
          while (truthy(evalToks(condToks, () => evalExpr(scope)))) {
            if (++guard > 200000) throw new Error('ScriptExecutionLimit: while loop exceeded 200,000 iterations');
            if (runLoopBody(bodyToks, { vars: new Map(), parent: scope }) === 'break') break;
          }
          return;
        }
        case 'repeat': {
          p++;
          const start = p;
          while (peek().k !== 'eof' && !(peek().k === 'kw' && peek().v === 'until')) p++;
          const bodyToks = toks.slice(start, p);
          expect('until');
          // Probe exactly one expression to find where the condition ends, then rewind:
          // the loop below re-evaluates that token slice on every iteration.
          const condStart = p;
          try { evalExpr(scope); } catch { /* probe only */ }
          const condEnd = p;
          p = condStart;
          const condToks = toks.slice(condStart, condEnd);
          let guard = 0;
          do {
            if (++guard > 200000) throw new Error('ScriptExecutionLimit: repeat loop exceeded 200,000 iterations');
            if (runLoopBody(bodyToks, { vars: new Map(), parent: scope }) === 'break') break;
            if (truthy(evalToks(condToks, () => evalExpr(scope)))) break;
          } while (true);
          return;
        }
        case 'for': {
          p++;
          const firstName = next().v;
          if (at('=')) {
            p++;
            const from = evalExpr(scope);
            expect(',');
            const to = evalExpr(scope);
            let step = 1;
            if (eat(',')) step = evalExpr(scope);
            expect('do');
            const start = p;
            skipBlockTokens();
            const bodyToks = toks.slice(start, p);
            if (at('end')) p++;
            let guard = 0;
            for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
              if (++guard > 500000) throw new Error('ScriptExecutionLimit: numeric for loop exceeded 500,000 iterations');
              if (runLoopBody(bodyToks, { vars: new Map([['__loopvar__', firstName], [firstName, v]]), parent: scope }) === 'break') break;
            }
            return;
          }
          const names = [firstName];
          while (eat(',')) names.push(next().v);
          expect('in');
          const iter = evalExpr(scope);
          expect('do');
          const start = p;
          skipBlockTokens();
          const bodyToks = toks.slice(start, p);
          if (at('end')) p++;
          const items: any[] = [];
          if (isTable(iter)) {
            if (iter.arr.length) iter.arr.forEach((v, i) => items.push([i + 1, v]));
            else iter.hash.forEach((v, k) => items.push([k, v]));
          } else if (Array.isArray(iter)) iter.forEach((v, i) => items.push([i + 1, v]));
          for (const item of items) {
            const local: Scope = { vars: new Map(), parent: scope };
            if (names.length > 1) { local.vars.set(names[0], item[0]); local.vars.set(names[1], item[1]); }
            else local.vars.set(names[0], item);
            if (runLoopBody(bodyToks, local) === 'break') break;
          }
          return;
        }
        case 'do': {
          p++;
          const start = p;
          skipBlockTokens();
          const bodyToks = toks.slice(start, p);
          if (at('end')) p++;
          runBlockTokens(bodyToks, { vars: new Map(), parent: scope });
          return;
        }
        case 'break': {
          p++;
          throw new Error('__lua_break__');
        }
        case 'continue': {
          p++;
          throw new Error('__lua_continue__');
        }
        case 'return': {
          p++;
          const value = at('end') || peek().k === 'eof' ? null : evalExpr(scope);
          const err = new Error('__lua_return__');
          (err as any).value = value;
          throw err;
        }
        default: break;
      }
    }
    // assignment or call
    const exprStart = p;
    // Fast path: `name = ...` — decided from the token stream before evaluating anything,
    // so `s = s + 5` is a plain assignment rather than a member lookup.
    if (peek().k === 'name' && toks[p + 1] && toks[p + 1].k === 'op' && toks[p + 1].v === '=') {
      const name = next().v;
      p++; // '='
      const values: any[] = [evalExpr(scope)];
      while (eat(',')) values.push(evalExpr(scope));
      setVar(name, values[0] ?? null, scope);
      return;
    }
    // Multiple assignment to plain names: `a, b = 1, 2`
    if (peek().k === 'name' && toks[p + 1] && toks[p + 1].k === 'op' && toks[p + 1].v === ',') {
      const names: string[] = [next().v];
      while (eat(',')) {
        if (peek().k === 'name') names.push(next().v);
        else break;
      }
      expect('=');
      const values: any[] = [evalExpr(scope)];
      while (eat(',')) values.push(evalExpr(scope));
      names.forEach((n, i) => setVar(n, values[i] ?? null, scope));
      return;
    }
    const target = evalPostfix(scope);
    if (at('=')) {
      p++;
      const value = evalExpr(scope);
      const savedP = p;
      p = exprStart;
      assignTarget(scope, value);
      p = savedP;
      void target;
      return;
    }
    void target;
    return;
  };

  const assignTarget = (scope: Scope, value: any): void => {
    // parse a base then chain of .name / [expr] then '='
    let base = evalPrimary(scope);
    const path: { kind: 'key' | 'idx'; key?: string; idx?: any }[] = [];
    while (true) {
      if (at('.')) { p++; path.push({ kind: 'key', key: next().v }); continue; }
      if (at('[')) { p++; const idx = evalExpr(scope); expect(']'); path.push({ kind: 'idx', idx }); continue; }
      break;
    }
    if (!path.length) { return; }
    let obj = base;
    for (let i = 0; i < path.length - 1; i++) {
      const step = path[i];
      obj = step.kind === 'key' ? tget(obj, step.key) : tget(obj, step.idx);
    }
    const last = path[path.length - 1];
    if (last.kind === 'key') tset(obj, last.key, value);
    else tset(obj, last.idx, value);
    void base;
  };

  try {
    runStatements(rootScope);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === '__lua_return__' || err.message === '__lua_break__') return;
      if (err.message === '__lua_continue__') return;
      emit(`lua: ${err.message}\n`);
    }
  }
}

/* ============================ POSIX shell =========================== */

export function runBash(source: string, emit: (s: string) => void, files: Record<string, string>): void {
  const vars = new Map<string, string>();
  const filesmap: Record<string, string> = { ...files };
  const funcs = new Map<string, string[]>();
  const aliases = new Map<string, string>();
  let lastStatus = 0;

  const esc = (s: string) => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');

  const evalArith = (expr: string): number => {
    let e = expr.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, n: string) => vars.get(n) ?? '0');
    e = e.replace(/\$([0-9]+)/g, (_m, n: string) => vars.get(n) ?? '0');
    e = e.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, n: string) => vars.get(n) ?? '0');
    e = e.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (_m, n: string) => (/^(true|false)$/.test(n) ? n : vars.get(n) ?? '0'));
    e = e.replace(/\*\*/g, '**');
    if (!/^[\d\s+\-*/%().<>=!&|^~?:]*$/.test(e)) return 0;
    try {
      // eslint-disable-next-line no-new-func
      return Number(Function(`"use strict";return (${e.startsWith('-') ? '0' : ''}${e})`)());
    } catch { return 0; }
  };

  const capture = (line: string): string => {
    let buf = '';
    execPipeline(line, (s) => { buf += s; }, '');
    return buf;
  };

  const expand = (raw: string): string => {
    let s = raw;
    s = s.replace(/\$\(\(([^)]*)\)\)/g, (_m, e: string) => String(evalArith(e)));
    s = s.replace(/\$\(([^)]*)\)/g, (_m, cmd: string) => capture(cmd.trim()).replace(/\n+$/, ''));
    s = s.replace(/`([^`]*)`/g, (_m, cmd: string) => capture(cmd.trim()).replace(/\n+$/, ''));
    s = s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*):-([^}]*)\}/g, (_m, n: string, d: string) => vars.get(n) ?? d);
    s = s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, n: string) => vars.get(n) ?? '');
    s = s.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, n: string) => vars.get(n) ?? '');
    s = s.replace(/\$#/g, String(vars.get('#') ?? 0));
    s = s.replace(/\$\?/g, String(lastStatus));
    s = s.replace(/\$@/g, vars.get('1') ?? '');
    s = s.replace(/\$([1-9])/g, (_m, n: string) => vars.get(n) ?? '');
    s = s.replace(/\$0/g, 'script.sh');
    return s;
  };

  const shellWordSplit = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      if (c === '"' || c === "'") {
        const q = c;
        i++;
        while (i < line.length && line[i] !== q) {
          // shell keeps the backslash inside double quotes unless it escapes " \\ $ `
          if (q === '"' && line[i] === '\\') {
            const nxt = line[i + 1] ?? '';
            cur += '"\\$`'.includes(nxt) ? nxt : '\\' + nxt;
            i += 2;
            continue;
          }
          cur += line[i++];
        }
        i++;
        continue;
      }
      // command / arithmetic substitution: keep the whole group as one word
      if (c === '$' && line[i + 1] === '(') {
        const st = i;
        i += 2;
        let depth = 1;
        while (i < line.length && depth > 0) {
          if (line[i] === '(') depth++;
          else if (line[i] === ')') depth--;
          i++;
        }
        cur += line.slice(st, i);
        continue;
      }
      if (c === '\\') { cur += line[i + 1] ?? ''; i += 2; continue; }
      if (c === '#' && !cur) break;
      if (/\s/.test(c)) {
        if (cur) { out.push(cur); cur = ''; }
        i++;
        continue;
      }
      cur += c;
      i++;
    }
    if (cur) out.push(cur);
    return out;
  };

  const expandWord = (w: string): string[] => {
    const expanded = expand(w);
    // glob for files
    if (/[*?]/.test(expanded)) {
      const re = new RegExp('^' + expanded.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      const matches = Object.keys(filesmap).filter((f) => re.test(f));
      if (matches.length) return matches.sort();
    }
    return [expanded];
  };

  const processEscapes = (s: string) => esc(s);

  const runBuiltin = (cmd: string, args: string[], stdin: string, write: (s: string) => void): boolean => {
    switch (cmd) {
      case 'echo': {
        let idx = 0;
        let noNewline = false;
        while (args[idx] === '-n' || args[idx] === '-e' || args[idx] === '-ne' || args[idx] === '-en') {
          if (args[idx].includes('n')) noNewline = true;
          idx++;
        }
        write(processEscapes(args.slice(idx).join(' ')) + (noNewline ? '' : '\n'));
        return true;
      }
      case 'printf': {
        const fmt = args[0] ?? '';
        const rest = args.slice(1);
        let ai = 0;
        let result = fmt.replace(/%(-?\d*)(?:\.(\d+))?([sdifxX%cn])/g, (_m, w: string, prec: string, spec: string) => {
          if (spec === '%') return '%';
          const val = rest[ai++];
          let s: string;
          switch (spec) {
            case 'd': case 'i': s = String(Math.trunc(Number(val ?? 0))); break;
            case 'f': s = Number(val ?? 0).toFixed(prec ? Number(prec) : 2); break;
            case 'x': s = Math.trunc(Number(val ?? 0)).toString(16); break;
            case 'X': s = Math.trunc(Number(val ?? 0)).toString(16).toUpperCase(); break;
            case 'c': s = String(val ?? '').charAt(0); break;
            case 'n': s = '\n'; break;
            default: s = String(val ?? '');
          }
          const width = w ? Number(w) : 0;
          if (width > 0) return s.padStart(width, ' ');
          if (width < 0) return s.padEnd(-width, ' ');
          return s;
        });
        result = processEscapes(result);
        write(result);
        return true;
      }
      case 'cat': {
        if (!args.length) { write(stdin); return true; }
        for (const a of args) {
          const name = a.replace(/^\.\//, '');
          if (name in filesmap) write(filesmap[name].endsWith('\n') ? filesmap[name] : filesmap[name] + '\n');
          else { write(`cat: ${name}: No such file or directory\n`); lastStatus = 1; }
        }
        return true;
      }
      case 'ls': {
        const showAll = args.includes('-a') || args.includes('-la') || args.includes('-l');
        const hasLong = args.includes('-l') || args.includes('-la');
        let names = Object.keys(filesmap);
        if (!showAll) names = names.filter((n) => !n.startsWith('.'));
        names.sort();
        if (args.some((a) => a === '-1')) write(names.join('\n') + (names.length ? '\n' : ''));
        else if (hasLong) write(names.map((n) => `-rw-r--r-- 1 waffle waffle ${String(filesmap[n].length).padStart(4)} ${n}`).join('\n') + '\n');
        else write(names.join('  ') + (names.length ? '\n' : ''));
        return true;
      }
      case 'pwd': write('/home/waffle/project\n'); return true;
      case 'cd': case 'export': case 'unset': case 'set': case 'alias': case 'touch': case 'mkdir': case 'chmod': case 'sleep': case 'true': return true;
      case 'false': lastStatus = 1; return true;
      case 'rm': {
        for (const a of args.filter((x) => !x.startsWith('-'))) delete filesmap[a];
        return true;
      }
      case 'wc': {
        const src = stdin;
        const linesArr = src.split('\n');
        if (linesArr[linesArr.length - 1] === '') linesArr.pop();
        const words = src.trim() ? src.trim().split(/\s+/).length : 0;
        const flag = args.find((a) => a.startsWith('-')) ?? '-l';
        if (flag === '-l') write(String(linesArr.length).padStart(7) + '\n');
        else if (flag === '-w') write(String(words).padStart(7) + '\n');
        else if (flag === '-c') write(String(src.length).padStart(7) + '\n');
        else write(`${String(linesArr.length).padStart(7)} ${String(words).padStart(7)} ${String(src.length).padStart(7)}\n`);
        return true;
      }
      case 'sort': {
        const linesArr = stdin.split('\n').filter((l) => l !== '');
        const numeric = args.includes('-n');
        const unique = args.includes('-u');
        const desc = args.includes('-r');
        linesArr.sort((a, b) => (numeric ? Number(a) - Number(b) : a.localeCompare(b)));
        if (desc) linesArr.reverse();
        const final = unique ? linesArr.filter((l, i) => i === 0 || l !== linesArr[i - 1]) : linesArr;
        write(final.join('\n') + (final.length ? '\n' : ''));
        return true;
      }
      case 'uniq': {
        const linesArr = stdin.split('\n').filter((l) => l !== '');
        const res: string[] = [];
        for (const l of linesArr) if (res[res.length - 1] !== l) res.push(l);
        write(res.join('\n') + (res.length ? '\n' : ''));
        return true;
      }
      case 'head': case 'tail': {
        const nArg = args.find((a) => /^-\d+$/.test(a));
        const n = nArg ? Number(nArg.slice(1)) : 10;
        const linesArr = stdin.split('\n');
        if (linesArr[linesArr.length - 1] === '') linesArr.pop();
        write((cmd === 'head' ? linesArr.slice(0, n) : linesArr.slice(-n)).join('\n') + '\n');
        return true;
      }
      case 'grep': {
        let pattern = '';
        let icase = false; let invert = false; let countOnly = false; let lineNum = false;
        const fileArgs: string[] = [];
        for (const a of args) {
          if (a.startsWith('-') && !pattern) {
            if (a.includes('i')) icase = true;
            if (a.includes('v')) invert = true;
            if (a.includes('c')) countOnly = true;
            if (a.includes('n')) lineNum = true;
            continue;
          }
          if (!pattern) { pattern = a; continue; }
          fileArgs.push(a);
        }
        let content = stdin;
        if (fileArgs.length) {
          content = fileArgs.map((f) => (f in filesmap ? filesmap[f] : '')).join('\n');
          if (fileArgs.some((f) => !(f in filesmap))) { write(`grep: ${fileArgs.find((f) => !(f in filesmap))}: No such file\n`); lastStatus = 2; return true; }
        }
        let re: RegExp;
        try { re = new RegExp(pattern, icase ? 'i' : ''); } catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), icase ? 'i' : ''); }
        const matched = content.split('\n').map((l, i) => ({ l, i: i + 1 })).filter(({ l }) => (invert ? !re.test(l) : re.test(l)));
        if (countOnly) write(String(matched.length) + '\n');
        else write(matched.map(({ l, i }) => (lineNum ? `${i}:${l}` : l)).join('\n') + (matched.length ? '\n' : ''));
        lastStatus = matched.length ? 0 : 1;
        return true;
      }
      case 'tr': {
        const [from, to] = args;
        if (!from) { write(stdin); return true; }
        const exp = (s: string) => s.replace(/([a-zA-Z])-([a-zA-Z])/g, (_m, a: string, b: string) => {
          let r = '';
          for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) r += String.fromCharCode(c);
          return r;
        });
        const f = exp(from);
        const t = exp(to ?? '');
        const del = args.includes('-d');
        if (del) write(Array.from(stdin).filter((c) => !f.includes(c)).join(''));
        else write(Array.from(stdin).map((c) => { const i = f.indexOf(c); return i >= 0 ? t[i] ?? t[t.length - 1] ?? '' : c; }).join(''));
        return true;
      }
      case 'seq': {
        const nums = args.filter((a) => /^-?\d+$/.test(a)).map(Number);
        if (nums.length === 1) for (let k = 1; k <= nums[0]; k++) write(k + '\n');
        else if (nums.length === 2) for (let k = nums[0]; k <= nums[1]; k++) write(k + '\n');
        else if (nums.length >= 3) for (let k = nums[0]; k <= nums[2]; k += nums[1]) write(k + '\n');
        return true;
      }
      case 'expr': {
        const [a, op, b] = args;
        const x = Number(a), y = Number(b);
        const result = op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : op === '/' ? Math.floor(x / y) : op === '%' ? x % y : op === '<' ? Number(x < y) : op === '>' ? Number(x > y) : 0;
        write(String(result) + '\n');
        return true;
      }
      case 'test': case '[': {
        const cleaned = args.filter((a) => a !== ']');
        lastStatus = evalTest(cleaned) ? 0 : 1;
        return true;
      }
      case 'date': write(new Date().toISOString() + '\n'); return true;
      case 'whoami': write('waffle\n'); return true;
      case 'uname': write(args.includes('-a') ? 'WaffleCode 1.0 local-browser sandbox x86_64\n' : 'WaffleCode\n'); return true;
      case 'basename': write((args.find((a) => !a.startsWith('-')) ?? '').split('/').filter(Boolean).pop() + '\n'); return true;
      case 'dirname': write((args[0] ?? '').split('/').slice(0, -1).join('/') || '.'); write('\n'); return true;
      case 'rev': write(Array.from(stdin).reverse().join('') + '\n'); return true;
      case 'cut': {
        // accept `-d:`, `-d :`, `-f2`, `-f 2` and combined forms like `-d: -f2`
        let delim = '\t';
        let fieldSpec = '1';
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (/^-d./.test(a) && !/^-d$/.test(a)) delim = a.slice(2);
          else if (a === '-d') { delim = args[++i] ?? '\t'; }
          else if (/^-f./.test(a) && !/^-f$/.test(a)) fieldSpec = a.slice(2);
          else if (a === '-f') { fieldSpec = args[++i] ?? '1'; }
        }
        const fields = fieldSpec.split(',').map(Number);
        const endsNl = stdin.endsWith('\n');
        const linesArr = stdin.split('\n');
        if (endsNl) linesArr.pop();
        write(linesArr.map((l) => fields.map((f) => l.split(delim)[f - 1] ?? '').join(delim)).join('\n') + (endsNl ? '\n' : ''));
        return true;
      }
      case 'sed': {
        const prog = args.find((a) => a.startsWith('s')) ?? '';
        const m = /^s(.)(.*?)\1(.*?)\1(g?)$/.exec(prog);
        if (m) {
          const g = m[4] === 'g';
          write(stdin.split('\n').map((l) => (g ? l.split(m[2]).join(m[3]) : l.replace(m[2], m[3]))).join('\n'));
        } else write(stdin);
        return true;
      }
      case 'awk': {
        const prog = args.find((a) => a.startsWith('{')) ?? args[0] ?? '';
        const body = prog.replace(/^\{|\}$/g, '');
        write(stdin.split('\n').filter((l) => l !== '').map((l) => {
          const f = l.trim().split(/\s+/);
          let expr = body;
          expr = expr.replace(/\$(\d+)/g, (_m, n: string) => f[Number(n) - 1] ?? '');
          expr = expr.replace(/\bNR\b/g, String(stdin.split('\n').indexOf(l) + 1));
          expr = expr.replace(/\bNF\b/g, String(f.length));
          expr = expr.replace(/\bprint\b/g, '');
          try {
            // eslint-disable-next-line no-new-func
            const v = Function(`"use strict";return (${expr.trim()})`)();
            return v === undefined ? '' : String(v);
          } catch { return expr; }
        }).join('\n') + '\n');
        return true;
      }
      case 'read': {
        const varname = args[0] ?? 'REPLY';
        vars.set(varname, stdin.split('\n')[0] ?? '');
        return true;
      }
      case 'source': case '.': {
        const file = filesmap[args[0]];
        if (file) execLines(file.split('\n'));
        return true;
      }
      case 'exit': throw new Error('__shell_exit__');
      case 'help': write('WaffleCode POSIX shell — builtins: echo printf cat ls grep sort uniq head tail tr sed awk cut wc seq expr test date pwd cd export source exit\n'); return true;
      default: return false;
    }
  };

  const evalTest = (parts: string[]): boolean => {
    if (!parts.length) return false;
    let negate = false;
    if (parts[0] === '!') { negate = true; parts = parts.slice(1); }
    let result: boolean;
    if (parts.length === 1 && parts[0] === '-n') result = false;
    else if (parts.length === 1) result = parts[0] !== '' && parts[0] !== '0';
    else if (parts.length === 2) {
      const [flag, target] = parts;
      if (flag === '-z') result = target === '';
      else if (flag === '-n') result = target !== '';
      else if (flag === '-f' || flag === '-e') result = target in filesmap;
      else if (flag === '-d') result = false;
      else if (flag === '-s') result = (filesmap[target] ?? '').length > 0;
      else result = evalArith(parts.join(' ')) !== 0;
    } else if (parts.length === 3) {
      const [a, op, b] = parts;
      switch (op) {
        case '=': case '==': result = a === b; break;
        case '!=': result = a !== b; break;
        case '-eq': result = Number(a) === Number(b); break;
        case '-ne': result = Number(a) !== Number(b); break;
        case '-lt': result = Number(a) < Number(b); break;
        case '-gt': result = Number(a) > Number(b); break;
        case '-le': result = Number(a) <= Number(b); break;
        case '-ge': result = Number(a) >= Number(b); break;
        default: result = false;
      }
    } else result = evalArith(expand(parts.join(' '))) !== 0;
    return negate ? !result : result;
  };

  const execCommand = (words: string[], stdin: string, write: (s: string) => void, emitOut: boolean): void => {
    if (!words.length) return;
    const cmd = words[0];
    const args = words.slice(1).flatMap(expandWord);
    // variable assignment prefix: FOO=bar cmd
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(cmd) && !args.length && words.length === 1) {
      const eq = cmd.indexOf('=');
      vars.set(cmd.slice(0, eq), expand(cmd.slice(eq + 1)));
      return;
    }
    if (aliases.has(cmd)) {
      execCommand([...shellWordSplit(aliases.get(cmd)!), ...args], stdin, write, emitOut);
      return;
    }
    if (funcs.has(cmd)) {
      const saved = new Map(vars);
      args.forEach((a, i) => vars.set(String(i + 1), a));
      vars.set('#', String(args.length));
      vars.set('@', args.join(' '));
      try {
        execLines(funcs.get(cmd)!);
      } finally {
        const positionalKeys = new Set(['#', '@', ...Array.from({ length: args.length }, (_, i) => String(i + 1))]);
        for (const k of positionalKeys) { const old = saved.get(k); if (old === undefined) vars.delete(k); else vars.set(k, old); }
      }
      return;
    }
    if (runBuiltin(cmd, args, stdin, write)) return;
    if (emitOut) emitOutPlaceholder(write, `${cmd}: command not found\n`);
    lastStatus = 127;
  };

  const emitOutPlaceholder = (write: (s: string) => void, s: string) => write(s);

  const execPipeline = (line: string, write: (s: string) => void, stdin: string): void => {
    // split top-level pipes
    const segments: string[] = [];
    let depth = 0;
    let quote = '';
    let cur = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) { cur += c; if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; cur += c; continue; }
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === '|' && depth === 0) { segments.push(cur); cur = ''; continue; }
      cur += c;
    }
    segments.push(cur);
    let buffer = stdin;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i].trim();
      const words = shellWordSplit(seg);
      const isLast = i === segments.length - 1;
      if (isLast) {
        execCommand(words, buffer, write, true);
      } else {
        let out = '';
        execCommand(words, buffer, (s) => { out += s; }, false);
        buffer = out;
      }
    }
  };

  // ---- statement normalizer -------------------------------------------------
  // Turn a bash source into one statement per line: `;`-joined lists in for/if/case
  // headers get split, and block openers/terminators (do/then/{, done/fi/}) become
  // their own lines so the recursive parser below can see structure.
  const normalize = (src: string): string[] => {
    const raw: string[] = [];
    let cur = '';
    let quote = '';
    const push = () => { const t = cur.trim(); if (t) raw.push(t); cur = ''; };
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        cur += c;
        if (c === '\\' && quote === '"') { cur += src[i + 1] ?? ''; i++; continue; }
        if (c === quote) quote = '';
        continue;
      }
      if (c === '"' || c === "'") { quote = c; cur += c; continue; }
      if (c === '\\') { cur += c + (src[i + 1] ?? ''); i++; continue; }
      if (c === '#' && (cur === '' || /\s$/.test(cur))) { while (i < src.length && src[i] !== '\n') i++; push(); continue; }
      if (c === '\n') { push(); continue; }
      if (c === ';') {
        // `;;` terminates a case branch; keep it as its own marker
        if (src[i + 1] === ';') { push(); raw.push(';;'); i++; continue; }
        push(); continue;
      }
      // `{` opens a command group only when it stands alone; `{1..3}` is brace expansion.
      if (c === '{' && /(^|\s)$/.test(cur) && !/\{.*\.\..*\}/.test(src.slice(i))) { push(); raw.push('{'); continue; }
      if (c === '}' && /(^|\s)$/.test(cur)) { push(); raw.push('}'); continue; }
      cur += c;
    }
    push();
    // Split off block keywords that appear at the tail of a header line.
    const out: string[] = [];
    for (const stmt of raw) {
      const m = /^(for|while|until|if|elif|case)\b/.exec(stmt);
      if (m) {
        const kw = m[1];
        const tail =
          kw === 'if' || kw === 'elif' ? /\s+then$/
          : kw === 'case' ? /\s+in$/
          : /\s+do$/;
        const mt = tail.exec(stmt);
        if (mt) {
          out.push(stmt.slice(0, mt.index));
          out.push(mt[0].trim());
          continue;
        }
        // for/while/until with `do` on the next line: nothing to split
        out.push(stmt);
        continue;
      }
      const kwOnly = /^(do|then|else|elif|in|done|fi|esac|\{|\}|;;)$/.exec(stmt);
      if (kwOnly) { out.push(stmt); continue; }
      // `do echo hi` / `then echo hi` — keyword glued to a following command
      const lead = /^(do|then|else|in)\s+(\S.*)$/.exec(stmt);
      if (lead) { out.push(lead[1]); out.push(lead[2]); continue; }
      // a header line that is one word (e.g. `go` from `if x; go; then`) stays put
      out.push(stmt);
    }
    return out;
  };

  // ---- recursive statement parser -------------------------------------------
  const parseBlock = (ls: string[], pos: { i: number }, stopAt: RegExp): void => {
    while (pos.i < ls.length) {
      const line = ls[pos.i];
      if (stopAt.test(line)) return;
      pos.i++;
      execStmt(line, ls, pos);
    }
  };

  const execStmt = (line: string, ls: string[], pos: { i: number }): void => {
    // ---- function definition
    const fnDef = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*\{?$/.exec(line);
    if (fnDef) {
      const body: string[] = [];
      if (pos.i < ls.length && ls[pos.i] === '{') {
        pos.i++;
        while (pos.i < ls.length && ls[pos.i] !== '}') body.push(ls[pos.i++]);
        pos.i++;
      } else {
        // collect until a lone `}` (function defined with `{ ... }` on later lines)
        while (pos.i < ls.length && ls[pos.i] !== '}') body.push(ls[pos.i++]);
        if (pos.i < ls.length && ls[pos.i] === '}') pos.i++;
      }
      funcs.set(fnDef[1], body);
      return;
    }
    if (/^alias\s+/.test(line)) {
      const m = /^alias\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (m) aliases.set(m[1], m[2].replace(/^["']|["']$/g, ''));
      return;
    }
    // ---- if / elif
    if (/^(if|elif)\b/.test(line)) { runIf(line, ls, pos); return; }
    if (line === 'then' || line === 'else' || line === 'fi' || line === '{' || line === '}') return;
    if (line === 'do') return;
    // ---- for / while / until
    if (/^(for|while|until)\b/.test(line)) { runLoop(line, ls, pos); return; }
    if (line === 'done') return;
    // ---- case
    if (/^case\b/.test(line)) { runCase(line, ls, pos); return; }
    if (line === 'esac') return;
    if (/^(export)\s+/.test(line)) {
      const rest = line.replace(/^export\s+/, '').trim();
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(rest);
      if (m) vars.set(m[1], expand(m[2].replace(/^["']|["']$/g, '')));
      return;
    }
    // ---- plain variable assignment
    const assign = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (assign) {
      const val = assign[2];
      const arith = /^\$\(\((.*)\)\)$/.exec(val);
      if (arith) vars.set(assign[1], String(evalArith(arith[1])));
      else if (/^["']/.test(val)) vars.set(assign[1], expand(val.slice(1, val.endsWith(val[0]) ? -1 : undefined)));
      else vars.set(assign[1], expand(val));
      return;
    }
    // ---- `&&` / `||` lists
    const parts = splitControl(line);
    for (const part of parts) {
      if (!part.cmd) continue;
      if (part.op === '&&' && lastStatus !== 0) continue;
      if (part.op === '||' && lastStatus === 0) continue;
      execPipeline(part.cmd, (s) => emit(s), '');
    }
  };

  const collectBody = (ls: string[], pos: { i: number }, endKw: string): string[] => {
    const body: string[] = [];
    let depth = 0;
    while (pos.i < ls.length) {
      const l = ls[pos.i];
      if (depth === 0 && (l === endKw || new RegExp(`^${endKw}\\b`).test(l))) return body;
      if (/^(if|for|while|until|case)\b/.test(l)) depth++;
      if (l === 'fi' || l === 'done' || l === 'esac') depth--;
      body.push(l);
      pos.i++;
    }
    return body;
  };

  const runIf = (header: string, ls: string[], pos: { i: number }): void => {
    // Evaluate this branch; if it fails, walk `elif`/`else` chains in place.
    const cond = header.replace(/^(if|elif)\s+/, '').trim();
    let body: string[] = [];
    let next: string | null = null;
    const collectBranch = () => {
      body = [];
      while (pos.i < ls.length) {
        const l = ls[pos.i];
        if (/^(else|elif|fi)\b/.test(l)) { next = l; return; }
        if (/^(if|for|while|until|case)\b/.test(l)) {
          // Nested block: record its extent WITHOUT running it here — execLinesNow
          // executes the collected branch later, so running it now would double-execute.
          const start2 = pos.i;
          const probe = { i: pos.i };
          skipArm(ls, probe);
          for (let k = start2; k < probe.i; k++) body.push(ls[k]);
          pos.i = probe.i;
          continue;
        }
        body.push(l);
        pos.i++;
      }
      next = null;
    };
    collectBranch();
    if (evalCond(cond)) {
      execLinesNow(body);
      // skip the remaining elif/else arms and the closing `fi`
      while (pos.i < ls.length) {
        const l = ls[pos.i];
        if (/^fi\b/.test(l)) { pos.i++; return; }
        pos.i++;
        const probe = { i: pos.i };
        if (/^elif\b/.test(l)) { skipArm(ls, probe); pos.i = probe.i; continue; }
        if (/^else\b/.test(l)) { skipArm(ls, probe); pos.i = probe.i; continue; }
      }
      return;
    }
    // this branch failed → follow the chain
    while (next) {
      const l: string = next;
      if (/^elif\b/.test(l)) {
        pos.i++; // consume the elif line
        const subCond = l.replace(/^elif\s+/, '').trim();
        collectBranch();
        if (evalCond(subCond)) {
          execLinesNow(body);
          while (pos.i < ls.length && !/^fi\b/.test(ls[pos.i])) pos.i++;
          if (pos.i < ls.length) pos.i++;
          return;
        }
        continue;
      }
      if (/^else\b/.test(l)) {
        pos.i++;
        collectBranch();
        execLinesNow(body);
        while (pos.i < ls.length && !/^fi\b/.test(ls[pos.i])) pos.i++;
        if (pos.i < ls.length) pos.i++;
        return;
      }
      if (/^fi\b/.test(l)) { pos.i++; return; }
    }
  };

  /** Advance past one arm (or one nested block) without executing it. */
  const skipArm = (ls: string[], probe: { i: number }): void => {
    let depth = 0;
    while (probe.i < ls.length) {
      const l = ls[probe.i];
      const isOpen = /^(if|for|while|until|case)\b/.test(l) || l === '{';
      const isClose = /^(fi|done|esac)\b/.test(l) || l === '}';
      if (depth === 0 && /^(elif|else|fi)\b/.test(l)) {
        if (/^fi\b/.test(l)) probe.i++;
        return;
      }
      if (isOpen) depth++;
      else if (isClose) {
        if (depth === 0) { probe.i++; return; }
        depth--;
        if (depth === 0) { probe.i++; return; }
      }
      probe.i++;
    }
  };

  const runLoop = (header: string, ls: string[], pos: { i: number }): void => {
    const kw = /^(\w+)/.exec(header)![1];
    // C-style for ((init; test; incr))
    const cstyle = /^for\s*\(\((.*?);(.*?);(.*?)\)\)$/.exec(header);
    if (cstyle) {
      const [, init, test, incr] = cstyle;
      const initM = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)/.exec(init);
      if (initM) vars.set(initM[1], String(evalArith(initM[2])));
      const body = collectBody(ls, pos, 'done');
      if (pos.i < ls.length) pos.i++;
      let guard = 0;
      while (evalArith(test) !== 0) {
        if (++guard > 100000) { emit('for: loop limit exceeded\n'); break; }
        execLinesNow(body);
        const incrM = /([A-Za-z_][A-Za-z0-9_]*)\s*(\+\+|--)/.exec(incr);
        if (incrM) {
          const cur = Number(vars.get(incrM[1]) ?? 0);
          vars.set(incrM[1], String(incrM[2] === '++' ? cur + 1 : cur - 1));
        }
      }
      return;
    }
    if (kw === 'for') {
      const m = /^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.*)$/.exec(header) ?? /^for\s+([A-Za-z_][A-Za-z0-9_\-*?]*)$/.exec(header);
      let varName = 'i';
      let listSrc = '';
      if (m) { varName = m[1]; listSrc = (m[2] ?? '').trim(); }
      const body = collectBody(ls, pos, 'done');
      if (pos.i < ls.length) pos.i++;
      let items: string[];
      const braceMatch = /^\{(-?\d+)\.\.(-?\d+)\}$/.exec(listSrc);
      if (braceMatch) {
        const a = Number(braceMatch[1]), b = Number(braceMatch[2]);
        items = [];
        for (let v = a; a <= b ? v <= b : v >= b; v += a <= b ? 1 : -1) items.push(String(v));
      } else if (listSrc === '') {
        items = ['1', '2', '3']; // `for x` with no list iterates positionals-ish
      } else {
        items = shellWordSplit(listSrc).flatMap((w) => {
          const bm = /^(.*?)\{(\d+)\.\.(\d+)\}(.*)$/.exec(w);
          if (bm) {
            const a = Number(bm[2]), b = Number(bm[3]);
            const out2: string[] = [];
            for (let v = a; a <= b ? v <= b : v >= b; v += a <= b ? 1 : -1) out2.push(expand(bm[1] + v + bm[4]));
            return out2;
          }
          return expandWord(w);
        });
      }
      for (const item of items) {
        vars.set(varName, item);
        execLinesNow(body);
      }
      // `for x in ...` from stdin is not modelled; empty list is honest
      return;
    }
    const cond = header.replace(/^(while|until)\s+/, '').trim();
    const body = collectBody(ls, pos, 'done');
    if (pos.i < ls.length) pos.i++;
    let guard = 0;
    const test = kw === 'while' ? () => evalCond(cond) : () => !evalCond(cond);
    while (test()) {
      if (++guard > 100000) { emit(`${kw}: loop limit exceeded\n`); break; }
      execLinesNow(body);
    }
  };

  const runCase = (header: string, ls: string[], pos: { i: number }): void => {
    const subject = expand(header.replace(/^case\s+/, '').trim());
    // gather the whole case block
    const block: string[] = [];
    let depth = 0;
    while (pos.i < ls.length) {
      const l = ls[pos.i];
      if (l === 'esac' && depth === 0) { pos.i++; break; }
      if (/^case\b/.test(l)) depth++;
      if (l === 'esac') depth--;
      block.push(l);
      pos.i++;
    }
    // split into patterns and bodies
    const branches: { pats: string[]; body: string[] }[] = [];
    let curPats: string[] | null = null;
    let curBody: string[] = [];
    const patsOf = (src: string) => src.split('|').map((x) => x.trim().replace(/^["']|["']$/g, ''));
    for (const l of block) {
      if (l === 'in') continue;
      if (l === ';;') {
        if (curPats) branches.push({ pats: curPats, body: curBody });
        curPats = null; curBody = [];
        continue;
      }
      const head = /^([^()]*?)\)\s*(.*)$/.exec(l);
      if (head && curPats === null) {
        curPats = patsOf(head[1]);
        if (head[2].trim()) curBody.push(head[2].trim());
        continue;
      }
      if (head && curPats !== null && curBody.length === 0) {
        branches.push({ pats: curPats, body: curBody });
        curPats = patsOf(head[1]);
        if (head[2].trim()) curBody.push(head[2].trim());
        continue;
      }
      curBody.push(l);
    }
    if (curPats) branches.push({ pats: curPats, body: curBody });
    for (const b of branches) {
      const hit = b.pats.some((p) => p === '*' || new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$').test(subject));
      if (hit) { execLinesNow(b.body); return; }
    }
  };

  const execLinesNow = (ls: string[]): void => {
    const pos = { i: 0 };
    parseBlock(ls, pos, /^$/);
  };

  const execLines = (ls: string[]): void => {
    const normalized = normalize(ls.join('\n'));
    execLinesNow(normalized);
  };

  const splitControl = (line: string): { op: string; cmd: string }[] => {
    const parts: { op: string; cmd: string }[] = [];
    let cur = '';
    let quote = '';
    let pendingOp = ';';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) { cur += c; if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; cur += c; continue; }
      if (line.startsWith('&&', i) || line.startsWith('||', i)) {
        parts.push({ op: pendingOp, cmd: cur.trim() });
        pendingOp = line.substr(i, 2);
        cur = '';
        i++;
        continue;
      }
      if (c === ';') {
        parts.push({ op: pendingOp, cmd: cur.trim() });
        pendingOp = ';';
        cur = '';
        continue;
      }
      cur += c;
    }
    if (cur.trim()) parts.push({ op: pendingOp, cmd: cur.trim() });
    return parts;
  };

  const evalCond = (cond: string): boolean => {
    const cleaned = cond.trim();
    if (/^true$/.test(cleaned)) return true;
    if (/^false$/.test(cleaned)) return false;
    if (/^\(\(.*\)\)$/.test(cleaned)) return evalArith(cleaned.slice(2, -2)) !== 0;
    const testWords = shellWordSplit(expand(cleaned));
    let words = testWords;
    if (words[0] === '[') words = words.slice(1);
    if (words[words.length - 1] === ']') words = words.slice(0, -1);
    if (words[0] === 'test') words = words.slice(1);
    if (words.includes('&&')) {
      const idx = words.indexOf('&&');
      return evalCond(words.slice(0, idx).join(' ')) && evalCond(words.slice(idx + 1).join(' '));
    }
    if (words.includes('||')) {
      const idx = words.indexOf('||');
      return evalCond(words.slice(0, idx).join(' ')) || evalCond(words.slice(idx + 1).join(' '));
    }
    if (words[0] === '!') return !evalTest(words.slice(1));
    return evalTest(words);
  };

  try {
    execLines(source.split('\n'));
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === '__shell_exit__') return;
      emit(`${err.message}\n`);
    }
  }
}

/* ============================ Haskell ============================== */

export function runHaskell(source: string, emit: (s: string) => void): void {
  const out = (s: string) => emit(s);
  const equations = new Map<string, { patterns: string[]; guard?: string; body: string }[]>();
  const letBindings = new Map<string, string>();
  const lines = source.split('\n');
  let doActions: string[] = [];
  let inMainDo = false;

  // Join continuation lines that belong to a `| guard` chain onto the defining equation.
  const joined: string[] = [];
  for (let li = 0; li < lines.length; li++) {
    const cur = lines[li].replace(/--.*$/, '').replace(/\s+$/, '');
    const nxt = (lines[li + 1] ?? '').replace(/--.*$/, '');
    if (cur.trim() && /^\s+\|/.test(nxt) && !/^main\s*=/.test(cur.trim()) === false) {
      // never join guards onto `main = do`
    }
    if (cur.trim() && /^\s+\|/.test(nxt) && !/^\s/.test(cur) && !/\bdo\s*$/.test(cur.trim())) {
      // `name args` header followed by guarded equations: fold them into one line
      const parts = [cur.trim()];
      let j = li + 1;
      while (j < lines.length && /^\s+\|/.test(lines[j])) {
        parts.push(lines[j].replace(/--.*$/, '').trim());
        j++;
      }
      li = j - 1;
      // `f n | c1 = e1 | c2 = e2` — one guarded equation per alternative
      const header = parts[0];
      for (const g of parts.slice(1)) {
        // Split on a single `=` that is not part of ==, /=, <=, >=, !=
        const body0 = g.replace(/^\|\s*/, '');
        let cut = -1;
        for (let ci = 0; ci < body0.length; ci++) {
          if (body0[ci] !== '=') continue;
          const prev = body0[ci - 1] ?? '';
          const next = body0[ci + 1] ?? '';
          if (next === '=' || '=<>!'.includes(prev)) continue;
          cut = ci;
          break;
        }
        if (cut < 0) continue;
        const cond = body0.slice(0, cut).trim();
        const val = body0.slice(cut + 1).trim();
        if (cond && val) joined.push(`${header} = ${val} | ${cond}`);
      }
      continue;
    }
    joined.push(lines[li]);
  }
  const srcLines = joined;

  for (const raw of srcLines) {
    const line = raw.replace(/--.*$/, '').replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (/^main\s*=\s*do\s*$/.test(line.trim())) { inMainDo = true; continue; }
    if (inMainDo) {
      if (/^\s/.test(raw)) { doActions.push(line.trim()); continue; }
      inMainDo = false;
    }
    const letM = /^let\s+([a-zA-Z_][A-Za-z0-9_']*)\s*=\s*(.+)$/.exec(line.trim());
    if (letM) { letBindings.set(letM[1], letM[2].trim()); continue; }
    const defM = /^([a-zA-Z_][A-Za-z0-9_']*)\s*(.*?)\s*=\s*(.+)$/.exec(line.trim());
    if (!defM) continue;
    const name = defM[1];
    const patternSrc = defM[2].trim();
    const body = defM[3].trim();
    let guard: string | undefined;
    let realBody = body;
    // A guard only counts when `|` sits at bracket depth 0 (not inside a list comprehension).
    const guardBar = indexOfTopLevel(body, '|');
    if (guardBar >= 0 && /(==|<|>|otherwise|elem|not)/.test(body)) {
      guard = body.slice(guardBar + 1).trim();
      realBody = body.slice(0, guardBar).trim();
    }
    const patterns = patternSrc ? tokenizeHsPatterns(patternSrc) : [];
    const arr = equations.get(name) ?? [];
    arr.push({ patterns, guard, body: realBody });
    equations.set(name, arr);
  }

  function tokenizeHsPatterns(src: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const c of src) {
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (/\s/.test(c) && depth === 0) { if (cur) { out.push(cur); cur = ''; } continue; }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }

  const num = (v: any): number => Number(v);
  const fmt = (v: any): string => {
    if (Array.isArray(v)) return '[' + v.map(fmt).join(',') + ']';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(12)));
    if (typeof v === 'string') return v;
    return String(v);
  };

  const builtins: Record<string, (...a: any[]) => any> = {
    show: (v) => (typeof v === 'string' ? JSON.stringify(v) : fmt(v)),
    print: (v) => { out(fmt(v) + '\n'); },
    putStrLn: (v) => { out(String(v) + '\n'); },
    putStr: (v) => { out(String(v)); },
    sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceiling: Math.ceil, round: Math.round,
    negate: (x) => -x, signum: Math.sign, even: (x) => x % 2 === 0, odd: (x) => Math.abs(x % 2) === 1,
    max: Math.max, min: Math.min, exp: Math.exp, log: Math.log, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    length: (l) => (l ? l.length : 0),
    sum: (l) => l.reduce((a: number, b: any) => a + Number(b), 0),
    product: (l) => l.reduce((a: number, b: any) => a * Number(b), 1),
    maximum: (l) => Math.max(...l.map(Number)),
    minimum: (l) => Math.min(...l.map(Number)),
    reverse: (l) => (typeof l === 'string' ? Array.from(l).reverse().join('') : [...l].reverse()),
    head: (l) => l[0],
    tail: (l) => l.slice(1),
    last: (l) => l[l.length - 1],
    init: (l) => l.slice(0, -1),
    null: (l) => !l || l.length === 0,
    take: (n, l) => l.slice(0, Math.max(0, n)),
    drop: (n, l) => l.slice(Math.max(0, n)),
    elem: (x, l) => l.includes(x),
    concat: (l) => l.flat(),
    replicate: (n, v) => Array(Math.max(0, n)).fill(v),
    zip: (a, b) => a.map((x: any, i: number) => [x, b[i]]).slice(0, Math.min(a.length, b.length)),
    map: (f, l) => l.map((x: any) => applyN(f, [x])),
    filter: (f, l) => l.filter((x: any) => applyN(f, [x])),
    foldl: (f, acc, l) => l.reduce((a: any, x: any) => applyN(f, [a, x]), acc),
    foldr: (f, acc, l) => [...l].reverse().reduce((a: any, x: any) => applyN(f, [x, a]), acc),
    div: (a, b) => Math.trunc(a / b),
    mod: (a, b) => ((a % b) + b) % b,
    rem: (a, b) => a % b,
    gcd: (a, b) => { let x = Math.abs(a), y = Math.abs(b); while (y) { [x, y] = [y, x % y]; } return x; },
    lcm: (a, b) => Math.abs(a * b) / (a && b ? (() => { let x = a, y = b; while (y) { [x, y] = [y, x % y]; } return x; })() : 1),
    not: (b) => !b,
    and: (l) => l.every(Boolean),
    or: (l) => l.some(Boolean),
    any: (f, l) => l.some((x: any) => applyN(f, [x])),
    all: (f, l) => l.every((x: any) => applyN(f, [x])),
    fromIntegral: (n) => n,
    realToFrac: (n) => n,
  };

  // Arity table for partial application (Haskell currying) of the shared builtins.
  const BUILTIN_ARITY: Record<string, number> = {
    replicate: 2, take: 2, drop: 2, elem: 2, map: 2, filter: 2, zip: 2, any: 2, all: 2,
    foldl: 3, foldr: 3, div: 2, mod: 2, rem: 2, gcd: 2, lcm: 2, max: 2, min: 2,
    show: 1, print: 1, putStrLn: 1, putStr: 1, length: 1, sum: 1, product: 1,
    maximum: 1, minimum: 1, reverse: 1, head: 1, tail: 1, last: 1, init: 1, null: 1,
    concat: 1, sqrt: 1, abs: 1, floor: 1, ceiling: 1, round: 1, negate: 1, signum: 1,
    even: 1, odd: 1, exp: 1, log: 1, sin: 1, cos: 1, tan: 1, not: 1, and: 1, or: 1,
    fromIntegral: 1, realToFrac: 1,
  };

  const splitTop = (src: string, op: string): string[] | null => {
    let depth = 0;
    let inStr = false;
    let quote = '';
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (inStr) { if (c === quote && src[i - 1] !== '\\') inStr = false; continue; }
      if (c === '"') { inStr = true; quote = c; continue; }
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (depth === 0 && src.startsWith(op, i)) {
        if (op === '-' && (i === 0 || /[+\-*/<>=&|(]/.test(src[i - 1]))) continue;
        if (op === '//' || op === '/=' || /[<>=!]/.test(op)) {
          // don't split inside operators
          const prev = src[i - 1] ?? ' ';
          const nxt = src[i + op.length] ?? ' ';
          if (/[<>=!]/.test(prev) || /[<>=!]/.test(nxt)) continue;
          // `<-` is a generator arrow in list comprehensions, not `<`
          if (op[0] === '<' && nxt === '-') continue;
          if (op[0] === '>' && prev === '-') continue;
        }
        return [src.slice(0, i), src.slice(i + op.length)];
      }
    }
    return null;
  };

  /** Apply arguments to a possibly-curried function, returning the final value. */
  const applyN = (f: any, args: any[]): any => {
    let cur = f;
    for (const a of args) {
      if (typeof cur !== 'function') return cur;
      cur = cur(a);
    }
    return cur;
  };

  const evalExpr = (expr: string, env: Map<string, any>): any => {
    let src = expr.trim();
    if (!src) return null;
    // A bare operator (`+`, `(*)` already handled below) is a first-class binary function.
    if (/^(\+\+|\+|\-|\*|\/|\/\/|%|==|\/=|<=|>=|<|>|&&|\|\||\^)$/.test(src)) {
      const o = src;
      const inner0 = (a: any, b: any) => {
        switch (o) {
          case '+': return typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : num(a) + num(b);
          case '++': return (Array.isArray(a) ? a : Array.from(String(a))).concat(Array.isArray(b) ? b : Array.from(String(b)));
          case '-': return num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': return num(a) / num(b);
          case '//': return Math.trunc(num(a) / num(b));
          case '%': return ((num(a) % num(b)) + num(b)) % num(b);
          case '==': return fmt(a) === fmt(b);
          case '/=': return fmt(a) !== fmt(b);
          case '<=': return num(a) <= num(b);
          case '>=': return num(a) >= num(b);
          case '<': return num(a) < num(b);
          case '>': return num(a) > num(b);
          case '&&': return Boolean(a) && Boolean(b);
          case '||': return Boolean(a) || Boolean(b);
          default: return Math.pow(num(a), num(b));
        }
      };
      const curried: any = (a: any) => (b: any) => inner0(a, b);
      curried.__arity = 2;
      return curried;
    }
    if (src.startsWith('(') && src.endsWith(')') && balanceOk(src)) {
      // `(+)` is an operator function, not a parenthesised expression — check before stripping.
      const inner0 = src.slice(1, -1).trim();
      if (/^(\+\+|\+|\-|\*|\/|\/\/|%|==|\/=|<=|>=|<|>|&&|\|\||\^)$/.test(inner0)) {
        return evalExpr(inner0, env);
      }
      src = inner0;
      // A stripped section like `(*2)` is now `*2`: build it before the binary-operator loop
      // sees a leading `*` and splits it into an empty left operand.
      const secM = /^([+*/^])\s*(\S.*)$/s.exec(src);
      if (secM) {
        const op = secM[1];
        const rhs = evalExpr(secM[2], env);
        return (x: any) => {
          switch (op) {
            case '+': return typeof x === 'string' ? x + String(rhs) : num(x) + num(rhs);
            case '*': return num(x) * num(rhs);
            case '/': return num(x) / num(rhs);
            default: return Math.pow(num(x), num(rhs));
          }
        };
      }
      const rsecM = /^(.+?)\s*([+*/])$/.exec(src);
      if (rsecM) {
        const op = rsecM[2];
        const lhs = evalExpr(rsecM[1], env);
        return (x: any) => {
          switch (op) {
            case '+': return typeof lhs === 'string' ? String(lhs) + String(x) : num(lhs) + num(x);
            case '*': return num(lhs) * num(x);
            default: return num(lhs) / num(x);
          }
        };
      }
    }
    if (!src) return null;

    // if-then-else
    const ifM = /^if\s+(.+?)\s+then\s+(.+?)\s+else\s+(.+)$/s.exec(src);
    if (ifM) return evalExpr(ifM[1], env) ? evalExpr(ifM[2], env) : evalExpr(ifM[3], env);
    // case of (basic)
    const caseM = /^case\s+(.+?)\s+of\s+(.+)$/s.exec(src);
    if (caseM) {
      const subject = evalExpr(caseM[1], env);
      const alts = caseM[2].split(';').map((a) => a.trim()).filter(Boolean);
      for (const alt of alts) {
        const arrow = alt.indexOf('->');
        if (arrow < 0) continue;
        const pat = alt.slice(0, arrow).trim();
        const body = alt.slice(arrow + 2).trim();
        const local = new Map(env);
        if (pat === '_' || pat === fmt(subject) || pat === String(subject)) return evalExpr(body, local);
        if (/^[a-z]/.test(pat)) { local.set(pat, subject); return evalExpr(body, local); }
      }
      return null;
    }
    // let ... in
    const letM = /^let\s+(.+?)\s+in\s+(.+)$/s.exec(src);
    if (letM) {
      const m = /^([a-z][A-Za-z0-9_']*)\s*=\s*(.+)$/.exec(letM[1].trim());
      if (m) {
        const local = new Map(env);
        local.set(m[1], evalExpr(m[2], local));
        return evalExpr(letM[2], local);
      }
    }
    // lambda
    const lambdaM = /^\\\s*([a-z][A-Za-z0-9_']*(?:\s+[a-z][A-Za-z0-9_']*)*)\s*->\s*(.+)$/s.exec(src);
    if (lambdaM) {
      const params = lambdaM[1].trim().split(/\s+/);
      const body = lambdaM[2];
      const make = (bound: Map<string, any>, idx: number): any => (x: any) => {
        const local = new Map(bound);
        local.set(params[idx], x);
        return idx + 1 === params.length ? evalExpr(body, local) : make(local, idx + 1);
      };
      const fn0 = make(env, 0);
      (fn0 as any).__arity = params.length;
      return fn0;
    }

    // right-assoc operators handled in order of low precedence
    for (const op of ['$', '||', '&&', '==', '/=', '<=', '>=', '<', '>', '++', ':', '+', '-', '*', '/', '^', '`div`', '`mod`']) {
      if (op === ':' && /^\[/.test(src)) continue;
      const split = splitTop(src, op);
      if (split) {
        const a = evalExpr(split[0], env);
        const b = evalExpr(split[1], env);
        switch (op) {
          case '$': return evalExpr(split[1], env);
          case '||': return Boolean(a) || Boolean(b);
          case '&&': return Boolean(a) && Boolean(b);
          case '==': return fmt(a) === fmt(b);
          case '/=': return fmt(a) !== fmt(b);
          case '<=': return num(a) <= num(b);
          case '>=': return num(a) >= num(b);
          case '<': return num(a) < num(b);
          case '>': return num(a) > num(b);
          case '++': return (Array.isArray(a) ? a : Array.from(String(a))).concat(Array.isArray(b) ? b : Array.from(String(b)));
          case ':': return [a, ...(Array.isArray(b) ? b : [])];
          case '+': return typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : num(a) + num(b);
          case '-': return num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': return num(a) / num(b);
          case '^': return Math.pow(num(a), num(b));
          case '`div`': return Math.trunc(num(a) / num(b));
          case '`mod`': return ((num(a) % num(b)) + num(b)) % num(b);
          default: break;
        }
      }
    }

    // string
    if (/^".*"$/.test(src)) return src.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    // char
    if (/^'.'$/.test(src)) return src.charAt(1);
    // number
    if (/^-?\d+(\.\d+)?$/.test(src)) return Number(src);
    if (src === 'True') return true;
    if (src === 'False') return false;
    // list literal + ranges
    if (/^\[.*\]$/s.test(src) && balanceOk(src)) {
      const inner = src.slice(1, -1).trim();
      if (!inner) return [];
      // list comprehension: [ expr | x <- xs, guard, y <- ys ]
      const bar = indexOfTopLevel(inner, '|');
      if (bar >= 0) {
        const head = inner.slice(0, bar).trim();
        const quals = splitList(inner.slice(bar + 1));
        const results: any[] = [];
        const walk = (qi: number, env2: Map<string, any>): void => {
          if (qi >= quals.length) { results.push(evalExpr(head, env2)); return; }
          const q = quals[qi].trim();
          const genM = /^([a-z][A-Za-z0-9_']*)\s*<-\s*(.+)$/s.exec(q);
          if (genM) {
            const list = evalExpr(genM[2], env2);
            const items = Array.isArray(list) ? list : typeof list === 'string' ? Array.from(list) : [];
            for (const item of items) {
              const e2 = new Map(env2);
              e2.set(genM[1], item);
              walk(qi + 1, e2);
            }
            return;
          }
          if (evalExpr(q, env2)) walk(qi + 1, env2);
        };
        walk(0, env);
        return results;
      }
      const range = /^(.*?)\s*\.\.\s*(.*)$/s.exec(inner);
      if (range) {
        const hasStep = range[1].includes(',') && range[1].includes('..');
        const stepM = /^(.+?)\s*,\s*(.+?)$/s.exec(range[1]);
        const from = num(evalExpr(stepM ? stepM[1] : range[1], env));
        const step = stepM ? num(evalExpr(stepM[2], env)) - from : 1;
        const to = range[2].trim() ? num(evalExpr(range[2], env)) : from;
        const result: number[] = [];
        if (step > 0) for (let v = from; v <= to && result.length < 10000; v += step) result.push(v);
        else if (step < 0) for (let v = from; v >= to && result.length < 10000; v += step) result.push(v);
        void hasStep;
        return result;
      }
      const items = splitList(inner).map((x) => evalExpr(x, env));
      return items;
    }
    // bare operator in parens — with or without applied arguments: `(+)`, `(+) 2 3`
    const opFn = /^\(\s*(\+\+|\+|\-|\*|\/|\/\/|%|==|\/=|<=|>=|<|>|&&|\|\||\^)\s*\)\s*(.*)$/.exec(src);
    if (opFn) {
      const o = opFn[1];
      const binop0 = (a: any, b: any) => {
        switch (o) {
          case '+': return typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : num(a) + num(b);
          case '++': return (Array.isArray(a) ? a : Array.from(String(a))).concat(Array.isArray(b) ? b : Array.from(String(b)));
          case '-': return num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': return num(a) / num(b);
          case '//': return Math.trunc(num(a) / num(b));
          case '%': return ((num(a) % num(b)) + num(b)) % num(b);
          case '==': return fmt(a) === fmt(b);
          case '/=': return fmt(a) !== fmt(b);
          case '<=': return num(a) <= num(b);
          case '>=': return num(a) >= num(b);
          case '<': return num(a) < num(b);
          case '>': return num(a) > num(b);
          case '&&': return Boolean(a) && Boolean(b);
          case '||': return Boolean(a) || Boolean(b);
          default: return Math.pow(num(a), num(b));
        }
      };
      const rest = opFn[2].trim();
      // Curried so partial application and applyN() both behave.
      const curried: any = (a: any) => (b: any) => binop0(a, b);
      curried.__arity = 2;
      if (!rest) return curried;
      return applyN(curried, splitApplication(rest).map((p) => evalExpr(p, env)));
    }
    if (opFn) {
      const o = opFn[1];
      return (a: any, b: any) => {
        switch (o) {
          case '+': return typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : num(a) + num(b);
          case '++': return (Array.isArray(a) ? a : Array.from(String(a))).concat(Array.isArray(b) ? b : Array.from(String(b)));
          case '-': return num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': return num(a) / num(b);
          case '//': return Math.trunc(num(a) / num(b));
          case '%': return ((num(a) % num(b)) + num(b)) % num(b);
          case '==': return fmt(a) === fmt(b);
          case '/=': return fmt(a) !== fmt(b);
          case '<=': return num(a) <= num(b);
          case '>=': return num(a) >= num(b);
          case '<': return num(a) < num(b);
          case '>': return num(a) > num(b);
          case '&&': return Boolean(a) && Boolean(b);
          case '||': return Boolean(a) || Boolean(b);
          default: return Math.pow(num(a), num(b));
        }
      };
    }
    // operator sections: (*2), (+ 1), (2*), (/3), (`div` 2)
    const leftSec = /^([+*/^])\s*(\S.*)$/s.exec(src);
    if (leftSec) {
      const op = leftSec[1];
      const rhs = evalExpr(leftSec[2], env);
      const apply = (x: any) => {
        switch (op) {
          case '+': return typeof x === 'string' ? x + String(rhs) : num(x) + num(rhs);
          case '*': return num(x) * num(rhs);
          case '/': return num(x) / num(rhs);
          default: return Math.pow(num(x), num(rhs));
        }
      };
      return apply;
    }
    const leftSecDiv = /^`(div|mod)`\s+(.+)$/s.exec(src);
    if (leftSecDiv) {
      const rhs = num(evalExpr(leftSecDiv[2], env));
      return leftSecDiv[1] === 'div' ? (x: any) => Math.trunc(num(x) / rhs) : (x: any) => ((num(x) % rhs) + rhs) % rhs;
    }
    const rightSec = /^(.+?)\s*([+*/]|\^\^?)$/s.exec(src);
    if (rightSec) {
      const op = rightSec[2];
      const lhs = evalExpr(rightSec[1], env);
      return (x: any) => {
        switch (op) {
          case '+': return typeof lhs === 'string' ? String(lhs) + String(x) : num(lhs) + num(x);
          case '*': return num(lhs) * num(x);
          case '/': return num(lhs) / num(x);
          default: return Math.pow(num(lhs), num(x));
        }
      };
    }
    // function application
    const parts = splitApplication(src);
    if (parts.length > 1) {
      const maybeFn = evalExpr(parts[0], env);
      if (typeof maybeFn === 'function') {
        const args = parts.slice(1).map((p) => evalExpr(p, env));
        // Haskell functions are curried: too few arguments yield a partial application.
        const want = (maybeFn as any).__arity ?? BUILTIN_ARITY[parts[0]] ?? 0;
        if (want > args.length) {
          const partial = (...more: any[]) => (maybeFn as any)(...args, ...more);
          (partial as any).__arity = want - args.length;
          return partial;
        }
        return (maybeFn as any)(...args);
      }
      // operator section like (subtract 3)
      if (parts[0] === 'subtract') return (x: number) => num(x) - num(evalExpr(parts[1], env));
    }
    // negative literal / subtraction fallback
    if (/^-\s*\d/.test(src) || /^-\s*[a-z(]/i.test(src)) return -num(evalExpr(src.slice(1), env));
    // variable lookup
    if (env.has(src)) return env.get(src);
    if (builtins[src]) return builtins[src];
    if (equations.has(src)) return makeFunction(src, []);
    // bare operator (the `(+)` path inside a parenthesised form)
    if (/^(\+\+|\+|\-|\*|\/|\/\/|%|==|\/=|<=|>=|<|>|&&|\|\||\^)$/.test(src)) return evalExpr(`(${src})`, env);
    return src;
  };

  const balanceOk = (src: string): boolean => {
    let depth = 0;
    for (const c of src) {
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (depth < 0) return false;
    }
    return depth === 0;
  };

  function indexOfTopLevel(src: string, ch: string): number {
    let depth = 0;
    let inStr = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (depth === 0 && c === ch) {
        if (ch === '|' && (src[i + 1] === '|' || src[i - 1] === '|')) continue;
        return i;
      }
    }
    return -1;
  }

  const splitList = (src: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    let inStr = false;
    for (const c of src) {
      if (c === '"') inStr = !inStr;
      if (!inStr) {
        if (c === '(' || c === '[') depth++;
        if (c === ')' || c === ']') depth--;
        if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      }
      cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };

  const splitApplication = (src: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    let inStr = false;
    for (const c of src) {
      if (c === '"') { inStr = !inStr; cur += c; continue; }
      if (!inStr) {
        if (c === '(' || c === '[') depth++;
        if (c === ')' || c === ']') depth--;
        if (/\s/.test(c) && depth === 0) { if (cur) { parts.push(cur); cur = ''; } continue; }
      }
      cur += c;
    }
    if (cur) parts.push(cur);
    return parts;
  };

  const makeFunction = (name: string, bound: any[]): any => {
    const eqs = equations.get(name) ?? [];
    return (...args: any[]) => {
      const allArgs = [...bound, ...args];
      for (const eq of eqs) {
        if (eq.patterns.length > allArgs.length) continue;
        const local = new Map<string, any>();
        let ok = true;
        for (let i = 0; i < eq.patterns.length && ok; i++) {
          const pat = eq.patterns[i];
          const arg = allArgs[i];
          if (pat === '_') continue;
          if (/^-?\d+(\.\d+)?$/.test(pat)) { if (num(arg) !== Number(pat)) ok = false; continue; }
          // `(x:xs)` cons pattern
          const consM = /^\(\s*([A-Za-z_][A-Za-z0-9_']*|_)\s*:\s*([A-Za-z_][A-Za-z0-9_']*|_)\s*\)$/.exec(pat.replace(/^\s+/, ''));
          if (consM) {
            if (!Array.isArray(arg) || arg.length === 0) { ok = false; continue; }
            if (consM[1] !== '_') local.set(consM[1], arg[0]);
            if (consM[2] !== '_') local.set(consM[2], arg.slice(1));
            continue;
          }
          if (/^\[.*\]$/.test(pat)) {
            if (!Array.isArray(arg)) { ok = false; continue; }
            const inner = pat.slice(1, -1).trim();
            if (!inner) { if (arg.length !== 0) ok = false; continue; }
            const pats = splitList(inner);
            if (pats.length !== arg.length) { ok = false; continue; }
            pats.forEach((p, idx) => { if (/^[a-z]/.test(p)) local.set(p, arg[idx]); else if (p === '_') { /* wildcard */ } else if (num(p) !== num(arg[idx])) ok = false; });
            continue;
          }
          if (/^".*"$/.test(pat)) { if (String(arg) !== pat.slice(1, -1)) ok = false; continue; }
          if (/^[a-z][A-Za-z0-9_']*$/.test(pat)) { local.set(pat, arg); continue; }
          ok = false;
        }
        if (!ok) continue;
        const merged = new Map(local);
        letBindings.forEach((expr, k) => merged.set(k, evalExpr(expr, merged)));
        // guard (already split off at parse time — just evaluate the condition)
        const body = eq.body;
        if (eq.guard && !evalExpr(eq.guard, merged)) continue;
        const result = evalExpr(body, merged);
        if (eqs.length > 1 || eq.patterns.length < allArgs.length) {
          if (typeof result === 'function' && eq.patterns.length < allArgs.length) return result;
        }
        return typeof result === 'function' && allArgs.length < eq.patterns.length ? result : result;
      }
      // partial application
      if (allArgs.length < (eqs[0]?.patterns.length ?? 0)) return makeFunction(name, allArgs);
      return null;
    };
  };

  try {
    if (doActions.length) {
      for (const action of doActions) {
        const cmdMatch = /^([a-zA-Z_][A-Za-z0-9_']*)\s*(.*)$/.exec(action);
        if (!cmdMatch) continue;
        const [, cmd, argSrc] = cmdMatch;
        if (cmd === 'let') continue;
        const fn = builtins[cmd];
        if (fn) {
          if (argSrc.trim()) fn(evalExpr(argSrc, new Map()));
          else fn();
          continue;
        }
        const userFn = equations.has(cmd) ? makeFunction(cmd, []) : null;
        if (userFn) {
          const args = splitApplication(argSrc).map((a) => evalExpr(a, new Map()));
          userFn(...args);
        }
      }
    } else {
      const mainEq = equations.get('main');
      if (mainEq) {
        // Top-level, pattern-less bindings (`r = ...`) act as values, not 0-ary functions.
        const globals = new Map<string, any>();
        for (const [name, eqs] of equations) {
          if (name === 'main' || !eqs.length) continue;
          if (eqs.length !== 1 || eqs[0].patterns.length !== 0 || eqs[0].guard) continue;
          globals.set(name, evalExpr(eqs[0].body, globals));
        }
        const v = evalExpr(mainEq[0].body, globals);
        if (v !== null && v !== undefined && typeof v !== 'function') out(fmt(v) + '\n');
      }
    }
  } catch (err) {
    emit(`prog: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

/* ============================ Prolog =============================== */

export function runProlog(source: string, emit: (s: string) => void): void {
  interface Goal { raw: string; name: string; args: string[]; infix?: { op: string; a: string; b: string } }
  interface Clause { head: Goal; body: Goal[] }

  const clauses: Clause[] = [];
  const queries: string[] = [];

  /* ------------------------------ parsing ------------------------------ */

  /** Split on `sep` at bracket depth 0, respecting quoted atoms ('...'). */
  const splitTop = (src: string, sep: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    let inQuote = false;
    for (const c of src) {
      if (c === "'") inQuote = !inQuote;
      if (!inQuote) {
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
      }
      cur += c;
    }
    if (cur.trim()) out.push(cur);
    return out;
  };

  /** Split a clause stream into statements on `.` at depth 0. */
  const splitStatements = (text: string): string[] => {
    const out: string[] = [];
    let buf = '';
    let depth = 0;
    let inQuote = false;
    for (const ch of text) {
      if (ch === "'") inQuote = !inQuote;
      if (!inQuote) {
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (ch === '.' && depth === 0) {
          const t = buf.trim();
          if (t) out.push(t);
          buf = '';
          continue;
        }
      }
      buf += ch;
    }
    const tail = buf.trim();
    if (tail) out.push(tail);
    return out;
  };

  const INFIX = ['=\\=', '=:=', '\\==', '>=', '=<', '\\=', '==', '=', '>', '<'];

  const parseGoal = (rawIn: string): Goal => {
    const raw = rawIn.trim();
    // strip a leading negation-as-failure marker so `\+ goal` parses sensibly
    if (raw.startsWith('\\+')) return { raw, name: '\\+', args: [raw.slice(2).trim()] };
    if (raw.startsWith('not(') && raw.endsWith(')')) return { raw, name: '\\+', args: [raw.slice(4, -1).trim()] };
    // top-level infix
    let depth = 0;
    let quote = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === "'") quote = !quote;
      if (quote) continue;
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      if (depth !== 0) continue;
      for (const op of INFIX) {
        if (raw.startsWith(op, i)) {
          // make sure `>` inside `>=` etc. is only matched by the longest op above
          if (op === '=' && raw[i + 1] === '=') continue;
          return { raw, name: op, args: [], infix: { op, a: raw.slice(0, i).trim(), b: raw.slice(i + op.length).trim() } };
        }
      }
      if (raw.startsWith('is', i) && (i === 0 || /\s/.test(raw[i - 1] ?? ' ')) && /\s/.test(raw[i + 2] ?? ' ')) {
        return { raw, name: 'is', args: [], infix: { op: 'is', a: raw.slice(0, i).trim(), b: raw.slice(i + 2).trim() } };
      }
    }
    const m = /^([a-zA-Z_][A-Za-z0-9_]*)\s*\((.*)\)$/s.exec(raw);
    if (m) return { raw, name: m[1], args: splitTop(m[2], ',').map((x) => x.trim()) };
    return { raw, name: raw.replace(/\(.*$/, '').trim(), args: [] };
  };

  /* ---------------------------- clause store --------------------------- */

  const text = source.replace(/%[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const st of splitStatements(text)) {
    if (st.startsWith('?-')) { queries.push(st.slice(2).trim()); continue; }
    if (st.startsWith(':-')) continue; // directives such as :- dynamic/1
    const bodySep = st.indexOf(':-');
    if (bodySep > 0) {
      const head = parseGoal(st.slice(0, bodySep));
      const body = splitTop(st.slice(bodySep + 2), ',').map((g) => g.trim()).filter(Boolean).map(parseGoal);
      clauses.push({ head, body });
    } else {
      clauses.push({ head: parseGoal(st), body: [] });
    }
  }

  /* ---------------------------- unification ---------------------------- */

  type Bindings = Map<string, string>;
  const isVar = (t: string) => /^[A-Z_]/.test(t.trim());

  const deref = (t: string, b: Bindings): string => {
    let cur = t.trim();
    let guard = 0;
    while (isVar(cur) && b.has(cur) && guard++ < 400) cur = b.get(cur)!.trim();
    return cur;
  };

  const unify = (a: string, b: string, binds: Bindings): boolean => {
    const x = deref(a, binds);
    const y = deref(b, binds);
    if (x === y) return true;
    // `_` is anonymous: match anything, bind nothing, and never share across uses.
    if (x === '_') return true;
    if (y === '_') return true;
    if (isVar(x)) { binds.set(x, y); return true; }
    if (isVar(y)) { binds.set(y, x); return true; }
    const decompose = (t: string): { name: string; args: string[] } | null => {
      // `.` is the Prolog cons functor, so it must be an accepted functor name.
      const m = /^([a-zA-Z_][A-Za-z0-9_]*|\.)\s*\((.*)\)$/s.exec(t);
      if (m) return { name: m[1], args: splitTop(m[2], ',').map((v) => v.trim()) };
      if (t.startsWith('[') && t.endsWith(']')) {
        const inner = t.slice(1, -1).trim();
        if (!inner) return { name: '[]', args: [] };
        // Cons cell: `[H|T]` is '.'(H, T). A plain list `[a,b,c]` desugars the same way.
        const bar = splitTop(inner, '|');
        if (bar.length === 2) return { name: '.', args: [bar[0].trim(), bar[1].trim()] };
        const items = splitTop(inner, ',').map((v) => v.trim()).filter(Boolean);
        if (items.length === 1) return { name: '.', args: [items[0], '[]'] };
        // Right-nested cons chain: [a,b,c] ≡ '.'(a, '.'(b, '.'(c, []))).
        let tail = '[]';
        for (let i = items.length - 1; i >= 0; i--) tail = `.(${items[i]},${tail})`;
        return decompose(tail);
      }
      return null;
    };
    const xd = decompose(x);
    const yd = decompose(y);
    if (xd && yd && xd.name === yd.name && xd.args.length === yd.args.length) {
      for (let i = 0; i < xd.args.length; i++) if (!unify(xd.args[i], yd.args[i], binds)) return false;
      return true;
    }
    return false;
  };

  const ground = (t: string, b: Bindings): string => {
    const v = deref(t, b);
    if (v === '_') return '_';
    if (isVar(v)) return `_G${Math.abs(hashCode(v) % 1000)}`;
    // Render a cons chain back as proper list syntax.
    if (v.startsWith('.')) {
      const items: string[] = [];
      let cur: string = v;
      let guard = 0;
      let tail = '[]';
      while (cur.startsWith('.(') && guard++ < 5000) {
        const d = /^\.\((.*)\)$/s.exec(cur);
        if (!d) break;
        const parts = splitTop(d[1], ',');
        if (parts.length !== 2) break;
        items.push(ground(parts[0], b));
        cur = deref(parts[1].trim(), b);
        if (cur === '[]') { tail = ''; break; }
        if (!cur.startsWith('.(')) { tail = '|' + ground(cur, b); break; }
      }
      return `[${items.join(',')}${tail}]`;
    }
    const m = /^([a-zA-Z_][A-Za-z0-9_]*)\s*\((.*)\)$/s.exec(v);
    if (m) return `${m[1]}(${splitTop(m[2], ',').map((x) => ground(x, b)).join(',')})`;
    if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1).trim();
      if (!inner) return '[]';
      return `[${splitTop(inner, ',').map((x) => ground(x, b)).join(',')}]`;
    }
    return v;
  };

  const hashCode = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };

  /* --------------------- variable freshening (apart) -------------------- */

  // Each clause invocation must use its own copy of the variables, otherwise
  // nested goals capture each other's bindings (`ancestor(X, Y)` inside
  // `ancestor(X, Z) :- parent(X, Y), ancestor(Y, Z)`).
  let freshCounter = 0;
  const renameTerm = (term: string, map: Map<string, string>): string =>
    term.replace(/\b[A-Z_][A-Za-z0-9_]*\b/g, (name) => {
      if (name === '_') return name;
      const found = map.get(name);
      if (found) return found;
      const fresh = `${name}__${++freshCounter}`;
      map.set(name, fresh);
      return fresh;
    });

  const freshenClause = (clause: Clause): Clause => {
    const map = new Map<string, string>();
    freshCounter++;
    return {
      head: { raw: clause.head.raw, name: clause.head.name, args: clause.head.args.map((a) => renameTerm(a, map)) },
      body: clause.body.map((g) => ({
        raw: g.raw,
        name: g.name,
        args: g.args.map((a) => renameTerm(a, map)),
        infix: g.infix ? { op: g.infix.op, a: renameTerm(g.infix.a, map), b: renameTerm(g.infix.b, map) } : undefined,
      })),
    };
  };

  /* ----------------------------- arithmetic ---------------------------- */

  const evalArith = (expr: string, binds: Bindings): number => {
    // Ground variables first (unbound variables are a Prolog instantiation error),
    // then translate the arithmetic functors into JavaScript.
    const grounded = expr.replace(/\b[A-Z_][A-Za-z0-9_]*\b/g, (v) => {
      const d = deref(v, binds);
      if (/^[A-Z_]/.test(d)) throw new Error(`uninstantiated variable in ${expr.trim()}`);
      return d;
    });
    const js = grounded
      .replace(/\bmod\b/g, '%')
      .replace(/\brem\b/g, '%')
      .replace(/\bdiv\b/g, '/')
      .replace(/\babs\(/g, 'Math.abs(')
      .replace(/\bsqrt\(/g, 'Math.sqrt(')
      .replace(/\bmax\(/g, 'Math.max(')
      .replace(/\bmin\(/g, 'Math.min(')
      .replace(/\bpi\b/gi, 'Math.PI')
      .replace(/\bsign\(/g, 'Math.sign(')
      .replace(/\btruncate\(/g, 'Math.trunc(')
      .replace(/\bround\(/g, 'Math.round(')
      .replace(/\bfloat\(/g, '(')
      .replace(/\bfloat_integer_part\(/g, 'Math.trunc(')
      .replace(/\bfloor\(/g, 'Math.floor(')
      .replace(/\bceiling\(/g, 'Math.ceil(')
      .replace(/\blog\(/g, 'Math.log(')
      .replace(/\bexp\(/g, 'Math.exp(')
      .replace(/\b\*\*/g, '**');
    if (!/^[\d\s+\-*/%().eE]+$/.test(js)) throw new Error(`cannot evaluate ${expr}`);
    const value = Function(`"use strict";return (${js});`)();
    if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(`cannot evaluate ${expr}`);
    return value;
  };

  const num = (t: string, b: Bindings): number => {
    const g = ground(t, b);
    const n = Number(g);
    if (Number.isNaN(n)) throw new Error(`cannot use ${g} as a number`);
    return n;
  };

  const listItems = (t: string, b: Bindings): string[] => {
    const g = ground(t, b);
    if (!g.startsWith('[')) return [];
    return splitTop(g.slice(1, -1), ',').map((x) => x.trim()).filter(Boolean);
  };

  /* ------------------------------- solver ------------------------------ */

  let steps = 0;
  const bump = () => { if (++steps > 2_000_000) throw new Error('inference limit reached'); };

  type Cont = () => boolean;

  const solveGoal = (goal: Goal, binds: Bindings, depth: number, k: Cont): boolean => {
    if (depth > 800) throw new Error('depth limit exceeded');
    bump();

    const builtin = (): boolean | null => {
      const op = goal.infix?.op ?? goal.name;
      switch (op) {
        case 'true': return true;
        case 'fail': case 'false': return false;
        case '=': return unify(goal.infix!.a, goal.infix!.b, binds);
        case '\\=': {
          const snapshot = new Map(binds);
          const ok = unify(goal.infix!.a, goal.infix!.b, binds);
          binds.clear(); snapshot.forEach((v, key) => binds.set(key, v));
          return !ok;
        }
        case '==': return ground(goal.infix!.a, binds) === ground(goal.infix!.b, binds);
        case '\\==': return ground(goal.infix!.a, binds) !== ground(goal.infix!.b, binds);
        case '=:=': return num(goal.infix!.a, binds) === num(goal.infix!.b, binds);
        case '=\\=': return num(goal.infix!.a, binds) !== num(goal.infix!.b, binds);
        case '>': return num(goal.infix!.a, binds) > num(goal.infix!.b, binds);
        case '<': return num(goal.infix!.a, binds) < num(goal.infix!.b, binds);
        case '>=': return num(goal.infix!.a, binds) >= num(goal.infix!.b, binds);
        case '=<': case '<=': return num(goal.infix!.a, binds) <= num(goal.infix!.b, binds);
        case 'is': {
          const value = evalArith(goal.infix!.b, binds);
          return unify(goal.infix!.a, String(Number.isInteger(value) ? value : Math.round(value * 1e10) / 1e10), binds);
        }
        case '\\+': {
          const snapshot = new Map(binds);
          let succeeded = false;
          try {
            succeeded = solveGoal(parseGoal(goal.args[0] ?? ''), binds, depth + 1, () => { throw new StopSignal(); });
          } catch (e) {
            if (e instanceof StopSignal) succeeded = true;
            else throw e;
          }
          binds.clear(); snapshot.forEach((v, key) => binds.set(key, v));
          return !succeeded;
        }
        case 'write': emit(ground(goal.args[0] ?? '', binds)); return true;
        case 'writeln': emit(ground(goal.args[0] ?? '', binds) + '\n'); return true;
        case 'nl': emit('\n'); return true;
        case 'length': {
          const n = listItems(goal.args[0] ?? '', binds).length;
          return unify(goal.args[1] ?? '', String(n), binds);
        }
        case 'member': {
          const items = listItems(goal.args[1] ?? '', binds);
          for (const item of items) {
            const snapshot = new Map(binds);
            if (unify(goal.args[0] ?? '', item, binds)) {
              if (k()) return true;
            }
            binds.clear(); snapshot.forEach((v, key) => binds.set(key, v));
          }
          return false;
        }
        case 'append': {
          const l1 = listItems(goal.args[0] ?? '', binds);
          const l2 = listItems(goal.args[1] ?? '', binds);
          return unify(goal.args[2] ?? '', `[${[...l1, ...l2].join(',')}]`, binds);
        }
        case 'reverse': {
          const items = [...listItems(goal.args[0] ?? '', binds)].reverse();
          return unify(goal.args[1] ?? '', `[${items.join(',')}]`, binds);
        }
        case 'atom_length': return unify(goal.args[1] ?? '', String(ground(goal.args[0] ?? '', binds).length), binds);
        case 'succ': return unify(goal.args[1] ?? '', String(num(goal.args[0] ?? '', binds) + 1), binds);
        case 'between': {
          const lo = num(goal.args[0] ?? '', binds);
          const hi = num(goal.args[1] ?? '', binds);
          for (let v = lo; v <= hi; v++) {
            const snapshot = new Map(binds);
            if (unify(goal.args[2] ?? '', String(v), binds)) {
              if (k()) return true;
            }
            binds.clear(); snapshot.forEach((val, key) => binds.set(key, val));
          }
          return false;
        }
        case 'memberchk': {
          const items = listItems(goal.args[1] ?? '', binds);
          return items.some((item) => unify(goal.args[0] ?? '', item, binds));
        }
        default: return null;
      }
    };

    const result = builtin();
    if (result === true) return k();
    if (result === false) return false;

    const candidates = clauses.filter((c) => c.head.name === goal.name && c.head.args.length === goal.args.length);
    for (const original of candidates) {
      const clause = freshenClause(original);
      const snapshot = new Map(binds);
      let ok = true;
      for (let i = 0; i < clause.head.args.length; i++) {
        if (!unify(clause.head.args[i], goal.args[i], binds)) { ok = false; break; }
      }
      if (ok && solveGoals(clause.body, binds, depth + 1, k)) return true;
      binds.clear(); snapshot.forEach((v, key) => binds.set(key, v));
    }
    return false;
  };

  const solveGoals = (goals: Goal[], binds: Bindings, depth: number, k: Cont): boolean => {
    if (!goals.length) return k();
    return solveGoal(goals[0], binds, depth, () => solveGoals(goals.slice(1), binds, depth + 1, k));
  };

  const collect = (goalSrc: string, limit: number): Bindings[] => {
    const solutions: Bindings[] = [];
    const binds: Bindings = new Map();
    const goals = splitTop(goalSrc, ',').map((g) => g.trim()).filter(Boolean).map(parseGoal);
    try {
      solveGoals(goals, binds, 0, () => {
        solutions.push(new Map(binds));
        // Continue exploring for more solutions; only abort once the limit is reached.
        if (solutions.length >= limit) throw new StopSignal();
        return false;
      });
    } catch (err) {
      if (!(err instanceof StopSignal)) throw err;
    }
    return solutions;
  };

  /* ------------------------------ queries ------------------------------ */

  for (const q of queries) {
    const vars = Array.from(new Set((q.match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? [])));
    let solutions: Bindings[] = [];
    try { solutions = collect(q, 12); } catch (err) { emit(`${err instanceof Error ? err.message : String(err)}\n`); continue; }
    if (!solutions.length) { emit('false.\n'); continue; }
    if (!vars.length) { emit('true.\n'); continue; }
    const lines = solutions
      .map((b) => vars.filter((v) => b.has(v)).map((v) => `${v} = ${ground(v, b).replace(/__\d+/g, '')}`).join(', '))
      .filter((line) => line && !line.includes('_G'));
    if (!lines.length) { emit('true.\n'); continue; }
    const uniq = Array.from(new Set(lines));
    uniq.forEach((line, i) => emit(i === uniq.length - 1 ? `${line}.` : `${line} ;\n`));
    if (solutions.length >= 12) emit('\n… (truncated at 12 solutions)\n');
    else emit('\n');
  }
}

class StopSignal extends Error {}

/* ============================ Forth =============================== */

interface ForthTok { v: string; str?: boolean }

/**
 * Tokenise Forth: keywords are case-insensitive (normalised to upper case),
 * `( ... )` to `)` comments are dropped, and `."` / `S"` capture their literal
 * text — including the closing quote, which is usually glued to the last word.
 */
function forthTokenize(source: string): ForthTok[] {
  const out: ForthTok[] = [];
  let i = 0;
  const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  while (i < source.length) {
    const c = source[i];
    if (isSpace(c)) { i++; continue; }
    if (c === '\\') { while (i < source.length && source[i] !== '\n') i++; continue; }
    // ( comment ) — a bare paren must be followed by whitespace to count as a comment
    if (c === '(' && (i + 1 >= source.length || isSpace(source[i + 1]))) {
      let depth = 1;
      i++;
      while (i < source.length && depth > 0) {
        if (source[i] === '(') depth++;
        else if (source[i] === ')') depth--;
        i++;
      }
      continue;
    }
    // ." string"  /  S" string"
    const three = source.slice(i, i + 2);
    if ((three === '."') || (three === 'S"') || (three === 's"')) {
      const word = three === '."' ? '."' : 'S"';
      i += 2;
      let text = '';
      while (i < source.length && source[i] !== '"') { text += source[i]; i++; }
      i++; // closing quote
      out.push({ v: word });
      out.push({ v: text, str: true });
      continue;
    }
    // plain token
    let j = i;
    while (j < source.length && !isSpace(source[j])) j++;
    const raw = source.slice(i, j);
    i = j;
    out.push({ v: raw.toUpperCase() });
  }
  return out;
}

export function runForth(source: string, emit: (s: string) => void): void {
  const stack: number[] = [];
  const words = new Map<string, ForthTok[]>();
  const loopStack: number[] = [];
  const out = (s: string) => emit(s);
  const tokens = forthTokenize(source);
  let steps = 0;
  let lastString = '';
  let prevWasDotQuote = false;
  void lastString;

  const pop = (): number => {
    const v = stack.pop();
    if (v === undefined) throw new Error('stack underflow');
    return v;
  };
  const popAny = (): number | undefined => stack.pop();
  const flag = (b: boolean) => (b ? -1 : 0);

  const exec = (list: ForthTok[]): void => {
    let i = 0;
    while (i < list.length) {
      if (++steps > 2_000_000) throw new Error('execution limit reached');
      const raw = list[i++];
      const tok = raw.v;
      if (raw.str) {
        // a literal captured by ." / S" — push it for S", print for ."
        lastString = tok;
        if (prevWasDotQuote) { out(tok); prevWasDotQuote = false; }
        continue;
      }
      switch (tok) {
        case '.': out(String(pop()) + ' '); break;
        case '."': prevWasDotQuote = true; break;
        case 'S"': break;
        case '.S': out(`<${stack.length}> ${stack.join(' ')} `); break;
        case 'CR': out('\n'); break;
        case 'SPACE': out(' '); break;
        case 'SPACES': out(' '.repeat(Math.max(0, popAny() ?? 0))); break;
        case '.R': { const w = pop(); out(String(pop()).padStart(w)); break; }
        case 'EMIT': out(String.fromCharCode(pop())); break;
        case 'ABORT"': { if (pop() !== 0) throw new Error('aborted'); break; }
        case '\\': break;
        case 'DUP': stack.push(stack[stack.length - 1] ?? 0); break;
        case 'DROP': popAny(); break;
        case 'SWAP': { const b = pop(), a = pop(); stack.push(b, a); break; }
        case 'OVER': stack.push(stack[stack.length - 2] ?? 0); break;
        case 'ROT': { const c = pop(), b = pop(), a = pop(); stack.push(b, c, a); break; }
        case 'NIP': { const b = popAny(); popAny(); if (b !== undefined) stack.push(b); break; }
        case 'TUCK': { const b = pop(), a = pop(); stack.push(b, a, b); break; }
        case '?DUP': if (stack[stack.length - 1]) stack.push(stack[stack.length - 1]); break;
        case '2DUP': { const b = stack[stack.length - 1] ?? 0, a = stack[stack.length - 2] ?? 0; stack.push(a, b); break; }
        case '2DROP': popAny(); popAny(); break;
        case '+': { const b = pop(), a = pop(); stack.push(a + b); break; }
        case '-': { const b = pop(), a = pop(); stack.push(a - b); break; }
        case '*': { const b = pop(), a = pop(); stack.push(a * b); break; }
        case '/': { const b = pop(), a = pop(); stack.push(b === 0 ? 0 : Math.trunc(a / b)); break; }
        case 'MOD': { const b = pop(), a = pop(); stack.push(b === 0 ? 0 : a % b); break; }
        case '/MOD': { const b = pop(), a = pop(); stack.push(Math.trunc(a / b), a % b); break; }
        case 'NEGATE': stack.push(-pop()); break;
        case 'ABS': stack.push(Math.abs(pop())); break;
        case 'MIN': { const b = pop(), a = pop(); stack.push(Math.min(a, b)); break; }
        case 'MAX': { const b = pop(), a = pop(); stack.push(Math.max(a, b)); break; }
        case '1+': stack.push(pop() + 1); break;
        case '1-': stack.push(pop() - 1); break;
        case '2*': stack.push(pop() * 2); break;
        case '2/': stack.push(Math.trunc(pop() / 2)); break;
        case 'SQUARE': { const a = pop(); stack.push(a * a); break; }
        case 'DUP*': { const a = pop(); stack.push(a * a); break; }
        case '=': { const b = pop(), a = pop(); stack.push(flag(a === b)); break; }
        case '<>': { const b = pop(), a = pop(); stack.push(flag(a !== b)); break; }
        case '<': { const b = pop(), a = pop(); stack.push(flag(a < b)); break; }
        case '>': { const b = pop(), a = pop(); stack.push(flag(a > b)); break; }
        case '<=': { const b = pop(), a = pop(); stack.push(flag(a <= b)); break; }
        case '>=': { const b = pop(), a = pop(); stack.push(flag(a >= b)); break; }
        case '0=': stack.push(flag(pop() === 0)); break;
        case '0<': stack.push(flag(pop() < 0)); break;
        case '0>': stack.push(flag(pop() > 0)); break;
        case 'NOT': stack.push(flag(popAny() === 0)); break;
        case 'AND': { const b = pop(), a = pop(); stack.push(a & b); break; }
        case 'OR': { const b = pop(), a = pop(); stack.push(a | b); break; }
        case 'XOR': { const b = pop(), a = pop(); stack.push(a ^ b); break; }
        case 'INVERT': stack.push(~pop()); break;
        case 'SQRT': stack.push(Math.sqrt(pop())); break;
        case 'DO': {
          const start = pop(), limit = pop();
          loopStack.push(start);
          const body: ForthTok[] = [];
          let depth = 1;
          while (i < list.length) {
            const tk = list[i];
            if (tk.v === 'DO') depth++;
            if (tk.v === 'LOOP' || tk.v === '+LOOP') { depth--; if (depth === 0) { i++; break; } }
            body.push(tk); i++;
          }
          try {
            let guard = 0;
            while ((loopStack[loopStack.length - 1] ?? 0) < limit) {
              if (++guard > 500000) throw new Error('loop limit');
              exec(body);
              loopStack[loopStack.length - 1] = (loopStack[loopStack.length - 1] ?? 0) + 1;
            }
          } finally {
            loopStack.pop();
          }
          break;
        }
        case 'I': stack.push(loopStack[loopStack.length - 1] ?? 0); break;
        case 'BEGIN': {
          const body: ForthTok[] = [];
          let depth = 1;
          let terminator = 'UNTIL';
          while (i < list.length) {
            const tk = list[i];
            if (tk.v === 'BEGIN' || tk.v === 'IF') depth++;
            if (tk.v === 'UNTIL' || tk.v === 'REPEAT' || tk.v === 'THEN' || tk.v === 'WHILE') {
              depth--;
              if (depth === 0) { terminator = tk.v; i++; break; }
            }
            body.push(tk);
            i++;
          }
          let guard = 0;
          if (terminator === 'UNTIL') {
            do {
              if (++guard > 500000) throw new Error('loop limit');
              exec(body);
            } while (popAny() === 0);
          } else if (terminator === 'REPEAT') {
            while (true) {
              if (++guard > 500000) throw new Error('loop limit');
              exec(body);
              if (popAny() !== 0) break;
            }
          } else if (terminator === 'WHILE') {
            const after: ForthTok[] = [];
            let d2 = 1;
            while (i < list.length) {
              const tk = list[i];
              if (tk.v === 'WHILE') d2++;
              if (tk.v === 'REPEAT') { d2--; if (d2 === 0) { i++; break; } }
              after.push(tk);
              i++;
            }
            while (true) {
              if (++guard > 500000) throw new Error('loop limit');
              exec(body);
              if (popAny() === 0) break;
              exec(after);
            }
          } else {
            exec(body);
          }
          break;
        }
        case 'REPEAT': case 'UNTIL': case 'WHILE': case 'THEN': case 'ELSE': case 'EXIT': break;
        case 'IF': {
          const thenBody: ForthTok[] = [];
          const elseBody: ForthTok[] = [];
          let depth = 1;
          let inElse = false;
          while (i < list.length) {
            const tk = list[i];
            if (tk.v === 'IF') depth++;
            if (tk.v === 'THEN') { depth--; if (depth === 0) { i++; break; } }
            if (tk.v === 'ELSE' && depth === 1) { inElse = true; i++; continue; }
            (inElse ? elseBody : thenBody).push(tk);
            i++;
          }
          if (pop() !== 0) exec(thenBody);
          else exec(elseBody);
          break;
        }
        case 'VARIABLE': { const name = list[i++]?.v ?? '?'; words.set(name, [{ v: '0' }]); break; }
        case 'CONSTANT': { const name = list[i++]?.v ?? '?'; words.set(name, [{ v: String(popAny() ?? 0) }]); break; }
        case 'VALUE': { const name = list[i++]?.v ?? '?'; words.set(name, [{ v: String(popAny() ?? 0) }]); break; }
        case 'TO': { const name = list[i++]?.v ?? '?'; words.set(name, [{ v: String(popAny() ?? 0) }]); break; }
        case ':': {
          const name = list[i++]?.v ?? 'ANON';
          const body: ForthTok[] = [];
          while (i < list.length && list[i].v !== ';') { body.push(list[i]); i++; }
          i++;
          words.set(name, body);
          break;
        }
        case ';': break;
        case 'BYE': case 'QUIT': return;
        default: {
          if (/^-?\d+$/.test(tok)) { stack.push(Number(tok)); break; }
          if (/^0X[0-9A-F]+$/i.test(tok)) { stack.push(parseInt(tok.slice(2), 16)); break; }
          if (words.has(tok)) { exec(words.get(tok)!); break; }
          if (words.has(raw.v)) { exec(words.get(raw.v)!); break; }
          out(`${raw.v} ? `);
        }
      }
    }
  };

  try {
    exec(tokens);
  } catch (err) {
    emit(`\n${err instanceof Error ? err.message : String(err)}\n`);
  }
}

/* ========================== Brainfuck ============================== */

export interface BrainfuckResult { output: string; tape: number[]; pointer: number; steps: number; error?: string }

export function runBrainfuck(source: string, emit: (s: string) => void, tapeLimit = 48): BrainfuckResult {
  const code = source.replace(/[^+\-<>\[\].,]/g, '');
  const TAPE = 30000;
  const tape = new Uint8Array(TAPE);
  const jump = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '[') stack.push(i);
    else if (code[i] === ']') {
      const open = stack.pop();
      if (open === undefined) return { output: '', tape: [], pointer: 0, steps: 0, error: `Unmatched ']' at position ${i}` };
      jump.set(open, i);
      jump.set(i, open);
    }
  }
  if (stack.length) return { output: '', tape: [], pointer: 0, steps: 0, error: `Unmatched '[' at position ${stack[stack.length - 1]}` };

  let ptr = 0;
  let pc = 0;
  let steps = 0;
  let output = '';
  const maxSteps = 8_000_000;
  let error: string | undefined;
  try {
    while (pc < code.length) {
      if (++steps > maxSteps) throw new Error(`Instruction limit (${maxSteps.toLocaleString()}) — possible infinite loop`);
      switch (code[pc]) {
        case '+': tape[ptr] = (tape[ptr] + 1) & 0xff; break;
        case '-': tape[ptr] = (tape[ptr] + 255) & 0xff; break;
        case '>': ptr = (ptr + 1) % TAPE; break;
        case '<': ptr = (ptr - 1 + TAPE) % TAPE; break;
        case '.': {
          const ch = String.fromCharCode(tape[ptr]);
          output += ch;
          emit(ch);
          break;
        }
        case ',': tape[ptr] = 0; break;
        case '[': if (tape[ptr] === 0) pc = jump.get(pc) ?? pc; break;
        case ']': if (tape[ptr] !== 0) pc = jump.get(pc) ?? pc; break;
        default: break;
      }
      pc++;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    output += `\n${error}`;
    emit(`\n${error}\n`);
  }
  // find last non-zero cell to size the tape view
  let last = 0;
  for (let i = 0; i < TAPE; i++) if (tape[i] !== 0) last = i;
  const size = Math.max(tapeLimit, Math.min(last + 1, 120));
  return { output, tape: Array.from(tape.slice(0, size)), pointer: ptr, steps, error };
}

/* ============================ Scheme =============================== */

export function runScheme(source: string, emit: (s: string) => void): void {
  const out = (s: string) => emit(s);
  let src = source.replace(/;.*$/gm, '');
  src = src.replace(/'(\w[\w-]*)/g, '(quote $1)');
  src = src.replace(/'\(/g, '(list ');

  type Value = any;
  let pos = 0;
  const tokens = src.match(/\(|\)|"[^"]*"|[^\s()]+/g) ?? [];

  const parse = (): Value => {
    if (pos >= tokens.length) return null;
    const t = tokens[pos++];
    if (t === '(') {
      const list: Value[] = [];
      while (pos < tokens.length && tokens[pos] !== ')') list.push(parse());
      pos++;
      return list;
    }
    if (t === ')') return null;
    if (/^-?\d+$/.test(t)) return Number(t);
    if (/^-?\d+\.\d+$/.test(t)) return Number(t);
    if (t === '#t') return true;
    if (t === '#f') return false;
    if (t.startsWith('"')) return t.slice(1, -1);
    return { __sym: t };
  };

  const symName = (v: any): string => (v && typeof v === 'object' && v.__sym ? v.__sym : String(v));
  const fmt = (v: any): string => {
    if (v === null || v === undefined) return '()';
    if (v === true) return '#t';
    if (v === false) return '#f';
    if (Array.isArray(v)) return '(' + v.map(fmt).join(' ') + ')';
    if (typeof v === 'object' && v.__sym) return v.__sym;
    if (typeof v === 'object' && v.__closure) return '#<procedure>';
    return String(v);
  };

  const global = new Map<string, Value>();
  const def = (name: string, f: any) => global.set(name, f);

  for (const [k, v] of Object.entries({
    '+': (...a: any[]) => a.reduce((x, y) => x + Number(y), 0),
    '-': (...a: any[]) => (a.length === 1 ? -Number(a[0]) : a.slice(1).reduce((x, y) => x - Number(y), Number(a[0]))),
    '*': (...a: any[]) => a.reduce((x, y) => x * Number(y), 1),
    '/': (...a: any[]) => (a.length === 1 ? 1 / Number(a[0]) : a.slice(1).reduce((x, y) => x / Number(y), Number(a[0]))),
    'modulo': (a: number, b: number) => a % b,
    'quotient': (a: number, b: number) => Math.trunc(a / b),
    'remainder': (a: number, b: number) => a % b,
    'abs': Math.abs, 'min': Math.min, 'max': Math.max,
    'expt': (a: number, b: number) => Math.pow(a, b),
    'sqrt': Math.sqrt, 'floor': Math.floor, 'ceiling': Math.ceil, 'round': Math.round, 'truncate': Math.trunc,
    'exact->inexact': (n: number) => n, 'inexact->exact': (n: number) => n,
    'display': (v: any) => { out(fmt(v)); return null; },
    'write': (v: any) => { out(fmt(v)); return null; },
    'newline': () => { out('\n'); return null; },
    'string-length': (s: any) => String(s).length,
    'string-append': (...a: any[]) => a.map(String).join(''),
    'string->number': (s: any) => Number(s),
    'number->string': (n: any) => String(n),
    'string->list': (s: any) => Array.from(String(s)),
    'list->string': (l: any[]) => l.join(''),
    'substring': (s: any, a: number, b: number) => String(s).slice(a, b),
    'list': (...a: any[]) => a,
    'cons': (a: any, b: any) => [a, ...(Array.isArray(b) ? b : [])],
    'car': (l: any[]) => (Array.isArray(l) ? l[0] : null),
    'cdr': (l: any[]) => (Array.isArray(l) ? l.slice(1) : []),
    'cadr': (l: any[]) => l[1],
    'caddr': (l: any[]) => l[2],
    'list-ref': (l: any[], n: number) => l[n],
    'length': (l: any) => (Array.isArray(l) ? l.length : 0),
    'append': (...ls: any[][]) => ls.flat(),
    'reverse': (l: any[]) => [...l].reverse(),
    'null?': (l: any) => !Array.isArray(l) || l.length === 0,
    'pair?': (l: any) => Array.isArray(l) && l.length > 0,
    'list?': (l: any) => Array.isArray(l),
    'number?': (v: any) => typeof v === 'number',
    'string?': (v: any) => typeof v === 'string',
    'boolean?': (v: any) => typeof v === 'boolean',
    'procedure?': (v: any) => typeof v === 'function',
    'symbol?': (v: any) => !!v && typeof v === 'object' && !!v.__sym,
    '=': (...a: any[]) => a.every((x) => Number(x) === Number(a[0])),
    '<': (...a: any[]) => a.every((x, i) => i === 0 || Number(a[i - 1]) < Number(x)),
    '>': (...a: any[]) => a.every((x, i) => i === 0 || Number(a[i - 1]) > Number(x)),
    '<=': (...a: any[]) => a.every((x, i) => i === 0 || Number(a[i - 1]) <= Number(x)),
    '>=': (...a: any[]) => a.every((x, i) => i === 0 || Number(a[i - 1]) >= Number(x)),
    'string=?': (a: any, b: any) => String(a) === String(b),
    'string<?': (a: any, b: any) => String(a) < String(b),
    'string>?': (a: any, b: any) => String(a) > String(b),
    'string-ci=?': (a: any, b: any) => String(a).toLowerCase() === String(b).toLowerCase(),
    'string-upcase': (s: any) => String(s).toUpperCase(),
    'string-downcase': (s: any) => String(s).toLowerCase(),
    'string-ref': (s: any, i: number) => String(s).charAt(i),
    'string': (...a: any[]) => a.map((c) => String.fromCharCode(Number(c))).join(''),
    'char->integer': (c: any) => String(c).charCodeAt(0),
    'integer->char': (n: number) => String.fromCharCode(n),
    'zero?': (v: number) => v === 0,
    'even?': (v: number) => v % 2 === 0,
    'odd?': (v: number) => Math.abs(v % 2) === 1,
    'positive?': (v: number) => v > 0,
    'negative?': (v: number) => v < 0,
    'eq?': (a: any, b: any) => a === b || fmt(a) === fmt(b),
    'eqv?': (a: any, b: any) => a === b,
    'equal?': (a: any, b: any) => fmt(a) === fmt(b),
    'not': (v: any) => v === false || v === null,
    'apply': (f: any, ...args: any[]) => f(...args.flat()),
    'map': (f: any, l: any[]) => l.map((x) => f(x)),
    'for-each': (f: any, l: any[]) => { l.forEach((x) => f(x)); return null; },
    'filter': (f: any, l: any[]) => l.filter((x) => f(x)),
    'fold-left': (f: any, acc: any, l: any[]) => l.reduce((a, x) => f(a, x), acc),
    'fold-right': (f: any, acc: any, l: any[]) => [...l].reverse().reduce((a, x) => f(a, x), acc),
    'max-list': (l: number[]) => Math.max(...l),
    'vector': (...a: any[]) => a,
    'error': (msg: any) => { throw new Error(fmt(msg)); },
    'exact': (n: number) => n,
  })) def(k, v);

  let steps = 0;
  const evalS = (expr: Value, env: Map<string, Value>): Value => {
    if (++steps > 2_000_000) throw new Error('evaluation limit reached');
    if (expr === null || typeof expr !== 'object' || typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
      if (typeof expr === 'string' && env.has(expr)) return env.get(expr);
      return expr;
    }
    if (expr.__sym) {
      const name = expr.__sym;
      if (env.has(name)) return env.get(name);
      if (global.has(name)) return global.get(name);
      return expr;
    }
    if (!Array.isArray(expr) || expr.length === 0) return expr;
    const [head, ...rest] = expr;
    const op = symName(head);
    switch (op) {
      case 'define': {
        const target = rest[0];
        if (Array.isArray(target)) {
          const name = symName(target[0]);
          const params = target.slice(1).map(symName);
          const body = rest.slice(1);
          const fn = (...args: any[]): Value => {
            const local = new Map(env);
            params.forEach((p, i) => local.set(p, args[i] ?? null));
            let result: Value = null;
            for (const b of body) result = evalS(b, local);
            return result;
          };
          env.set(name, fn);
          return null;
        }
        const name = symName(target);
        const value = evalS(rest[1], env);
        env.set(name, value);
        return null;
      }
      case 'define-syntax': return null;
      case 'lambda': {
        const params = (rest[0] as any[]).map(symName);
        const body = rest.slice(1);
        const fn = (...args: any[]): Value => {
          const local = new Map(env);
          params.forEach((p, i) => {
            if (p === '.') return;
            local.set(p, args[i] ?? null);
          });
          let result: Value = null;
          for (const b of body) result = evalS(b, local);
          return result;
        };
        return fn;
      }
      case 'if': {
        const test = evalS(rest[0], env);
        if (test !== false) return evalS(rest[1], env);
        return rest.length > 2 ? evalS(rest[2], env) : null;
      }
      case 'cond': {
        for (const clause of rest as any[][]) {
          if (symName(clause[0]) === 'else') {
            let result: Value = null;
            for (const b of clause.slice(1)) result = evalS(b, env);
            return result;
          }
          const value = evalS(clause[0], env);
          if (value !== false) {
            if (clause.length === 1) return value; // (cond (test)) returns the test value
            let result: Value = null;
            for (const b of clause.slice(1)) result = evalS(b, env);
            return result;
          }
        }
        return null;
      }
      case 'case': {
        const key = evalS(rest[0], env);
        for (const clause of rest.slice(1) as any[][]) {
          const datums = clause[0];
          const match = datums === 'else' || symName(datums) === 'else' || (Array.isArray(datums) && datums.some((d: any) => fmt(d) === fmt(key)));
          if (match) {
            let result: Value = null;
            for (const b of clause.slice(1)) result = evalS(b, env);
            return result;
          }
        }
        return null;
      }
      case 'and': {
        let result: Value = true;
        for (const e of rest) { result = evalS(e, env); if (result === false) return false; }
        return result;
      }
      case 'or': {
        for (const e of rest) { const v = evalS(e, env); if (v !== false) return v; }
        return false;
      }
      case 'when': {
        if (evalS(rest[0], env) !== false) {
          let result: Value = null;
          for (const b of rest.slice(1)) result = evalS(b, env);
          return result;
        }
        return null;
      }
      case 'unless': {
        if (evalS(rest[0], env) === false) {
          let result: Value = null;
          for (const b of rest.slice(1)) result = evalS(b, env);
          return result;
        }
        return null;
      }
      case 'let': case 'let*': case 'letrec': {
        const local = new Map(env);
        const bindings = rest[0];
        const body = rest.slice(1);
        const evalBody = (scope: Map<string, Value>): Value => {
          let result: Value = null;
          for (const b of body) result = evalS(b, scope);
          return result;
        };
        // named let:  (let loop ((i 0)) body)
        if (Array.isArray(bindings) && bindings.length === 0) return evalBody(local);
        if (Array.isArray(bindings) && bindings.length && !Array.isArray(bindings[0])) {
          const name = symName(bindings[0]);
          const paramList = (bindings[1] ?? []) as any[];
          const initial = bindings.slice(2).map((x: any) => evalS(x, env));
          const fn = (...args: any[]): Value => {
            const inner = new Map(env);
            paramList.forEach((p, i) => inner.set(symName(p), args[i]));
            return evalBody(inner);
          };
          local.set(name, fn);
          return fn(...initial);
        }
        for (const pair of bindings as any[][]) {
          const name = symName(pair[0]);
          const value = evalS(pair[1], op === 'let*' ? local : env);
          local.set(name, value);
        }
        return evalBody(local);
      }
      case 'let-values': case 'let*-values': {
        let result: Value = null;
        for (const b of rest.slice(1)) result = evalS(b, env);
        return result;
      }
      case 'begin': {
        let result: Value = null;
        for (const b of rest) result = evalS(b, env);
        return result;
      }
      case 'set!': {
        const name = symName(rest[0]);
        const value = evalS(rest[1], env);
        if (env.has(name)) env.set(name, value);
        else global.set(name, value);
        return null;
      }
      case 'quote': return rest[0];
      case 'quasiquote': return rest[0];
      case 'do': {
        // (do ((var init step)...) (test result...) body...)
        const specs = rest[0] as any[][];
        const testClause = rest[1] as any[];
        const body = rest.slice(2);
        const loopEnv = new Map(env);
        const names: string[] = [];
        specs.forEach(([n, init]: any[]) => {
          names.push(symName(n));
          loopEnv.set(symName(n), evalS(init, env));
        });
        let guard = 0;
        while (evalS(testClause[0], loopEnv) === false) {
          if (++guard > 100000) throw new Error('do loop limit');
          for (const b of body) evalS(b, loopEnv);
          const newVals = specs.map((s: any[]) => (s[2] ? evalS(s[2], loopEnv) : loopEnv.get(symName(s[0]))));
          names.forEach((n, i) => loopEnv.set(n, newVals[i]));
        }
        let result: Value = null;
        for (const b of testClause.slice(1)) result = evalS(b, loopEnv);
        return result;
      }
      default: {
        const fn = evalS(head, env);
        const args = rest.map((a) => evalS(a, env));
        if (typeof fn !== 'function') throw new Error(`application: not a procedure: ${fmt(fn)}`);
        return fn(...args);
      }
    }
  };

  try {
    const forms: Value[] = [];
    while (pos < tokens.length) forms.push(parse());
    for (const form of forms) {
      if (form === null) continue;
      evalS(form, global);
    }
  } catch (err) {
    emit(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
