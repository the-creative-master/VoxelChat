/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WaffleCode Local Sandbox Core
 * Shared values, environments, tokenizer and standard-library shims used by all
 * hand-written in-browser language engines. 100% local, zero network calls.
 */

export type Val = any;

export interface Env {
  vars: Map<string, Val>;
  parent?: Env;
}

export const newEnv = (parent?: Env): Env => ({ vars: new Map(), parent });

export class RtError extends Error {
  line?: number;
  constructor(message: string, line?: number) {
    super(message);
    this.name = 'RuntimeError';
    this.line = line;
  }
}

export class BreakSignal extends Error {}
export class ContinueSignal extends Error {}
export class ReturnSignal extends Error {
  value: Val;
  constructor(value: Val) {
    super('return');
    this.value = value;
  }
}

export function lookup(env: Env, name: string): Val {
  let cur: Env | undefined = env;
  while (cur) {
    if (cur.vars.has(name)) return cur.vars.get(name);
    cur = cur.parent;
  }
  throw new RtError(`NameError: '${name}' is not defined`);
}

export function assign(env: Env, name: string, value: Val): void {
  let cur: Env | undefined = env;
  while (cur) {
    if (cur.vars.has(name)) {
      cur.vars.set(name, value);
      return;
    }
    cur = cur.parent;
  }
  env.vars.set(name, value);
}

export function define(env: Env, name: string, value: Val): void {
  env.vars.set(name, value);
}

export type OutSink = (stream: 'stdout' | 'stderr', text: string) => void;

/* ------------------------------------------------------------------ */
/* Value representations                                               */
/* ------------------------------------------------------------------ */

export const isObj = (v: any) => v !== null && typeof v === 'object';

export const truthy = (v: Val): boolean => {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map) return v.size > 0;
  if (typeof v === 'object' && v.__nil) return false;
  return true;
};

export const jsEq = (a: Val, b: Val): boolean => {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined || (isObj(b) && b.__nil);
  if (b === null || b === undefined) return isObj(a) && a.__nil;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => jsEq(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
};

export function numStr(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toPrecision(15)));
}

export function toStr(v: Val, depth = 0): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'object' && v.__nil) return 'nil';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numStr(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'function') return '<function>';
  if (v instanceof Map) {
    return '{' + [...v.entries()].map(([k, val]) => `${k}: ${toStr(val, depth + 1)}`).join(', ') + '}';
  }
  if (Array.isArray(v)) return '[' + v.map((x) => toStr(x, depth + 1)).join(', ') + ']';
  if (typeof v === 'object' && v.__fn) return '<function>';
  if (typeof v === 'object' && v.__class) {
    return v.__class + v.__user ? ' object' : ' object';
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const toNum = (v: Val): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (Number.isNaN(n)) throw new RtError(`ValueError: could not convert '${v}' to a number`);
    return n;
  }
  throw new RtError(`TypeError: cannot use ${toStr(v)} as a number`);
};

export const toInt = (v: Val): number => Math.trunc(toNum(v));

export const fn = (impl: (args: Val[], env: Env) => Val, name = 'lambda') => ({
  __fn: impl,
  __name: name,
});

export function callValue(f: Val, args: Val[], env: Env): Val {
  if (f && typeof f === 'object' && f.__fn) return f.__fn(args, env);
  if (typeof f === 'function') return f(args);
  throw new RtError(`TypeError: ${toStr(f)} is not callable`);
}

/** Deep-ish clone used for function arguments */
export function cloneVal(v: Val): Val {
  if (Array.isArray(v)) return v.map(cloneVal);
  if (v instanceof Map) return new Map(v);
  return v;
}

export const isMap = (v: any): v is Map<string, Val> => v instanceof Map;

/* ------------------------------------------------------------------ */
/* String helpers                                                      */
/* ------------------------------------------------------------------ */

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** printf-style formatter (C, Java, Perl, PHP, Bash's printf shim) */
export function printfFormat(fmt: string, args: Val[]): string {
  let i = 0;
  return fmt.replace(
    /%(-?\d+)?(?:\.(\d+))?(hh|h|ll|l|L|z|j|t)?([diouxXeEfgGcsprb%])/g,
    (_m, width: string | undefined, prec: string | undefined, _len: string | undefined, spec: string) => {
      if (spec === '%') return '%';
      const arg = args[i++];
      const w = width ? parseInt(width, 10) : 0;
      let out = '';
      switch (spec) {
        case 'd':
        case 'i':
          out = String(toInt(arg));
          break;
        case 'u':
          out = String(toInt(arg) >>> 0);
          break;
        case 'o':
          out = toInt(arg).toString(8);
          break;
        case 'x':
          out = toInt(arg).toString(16);
          break;
        case 'X':
          out = toInt(arg).toString(16).toUpperCase();
          break;
        case 'e':
        case 'E': {
          const s = toNum(arg).toExponential(prec !== undefined ? parseInt(prec, 10) : 6);
          out = spec === 'E' ? s.toUpperCase() : s;
          break;
        }
        case 'f':
        case 'F':
          out = toNum(arg).toFixed(prec !== undefined ? parseInt(prec, 10) : 6);
          break;
        case 'g':
        case 'G':
          out = numStr(parseFloat(toNum(arg).toPrecision(prec !== undefined ? parseInt(prec, 10) : 6)));
          break;
        case 'c':
          // C's %c takes an int, but a single-character string is the common case here.
          out = typeof arg === 'string' ? (arg.charAt(0) || '\0') : String.fromCharCode(toInt(arg));
          break;
        case 's':
          out = toStr(arg);
          break;
        case 'p':
          out = toStr(arg);
          break;
        case 'b':
          out = toInt(arg).toString(2);
          break;
        case 'r':
          out = toInt(arg).toString(2);
          break;
        default:
          out = toStr(arg);
      }
      if (w) {
        if (w < 0) out = out.padEnd(-w, ' ');
        else out = out.padStart(w, spec === 's' ? ' ' : ' ');
      }
      return out;
    }
  );
}

/* ------------------------------------------------------------------ */
/* Member access & standard library methods                            */
/* ------------------------------------------------------------------ */

export const MAX_LOOP = 5_000_000;

export function memberKeys(v: Val): string[] {
  if (Array.isArray(v)) return ['length', 'size', 'count', 'append', 'push', 'pop', 'map', 'filter', 'reduce', 'join', 'slice', 'sort', 'reverse', 'includes', 'indexOf', 'insert', 'remove', 'shift', 'unshift', 'forEach', 'concat', 'every', 'some', 'find', 'findIndex', 'fill'];
  if (typeof v === 'string') return ['length', 'size', 'upper', 'lower', 'split', 'trim', 'replace', 'startsWith', 'endsWith', 'includes', 'substring', 'charAt', 'indexOf', 'repeat', 'padStart', 'padEnd'];
  if (v instanceof Map) return ['size', 'get', 'set', 'has', 'keys', 'values', 'items', 'delete', 'clear'];
  return [];
}

/** Property read that does not produce a callable for methods (used for iteration etc.) */
export function getProp(obj: Val, key: string | number): Val {
  if (obj === null || obj === undefined) throw new RtError(`TypeError: cannot read property '${String(key)}' of null`);
  if (Array.isArray(obj)) {
    if (key === 'length' || key === 'size' || key === 'count') return obj.length;
    if (typeof key === 'number') return key < 0 ? obj[obj.length + key] : obj[key];
    const k = String(key);
    if (/^\d+$/.test(k)) return obj[Number(k)];
    if (k === 'first') return obj[0];
    if (k === 'last') return obj[obj.length - 1];
  }
  if (typeof obj === 'string') {
    if (key === 'length' || key === 'size' || key === 'count') return obj.length;
    if (typeof key === 'number') return obj[key] ?? '';
    const k = String(key);
    if (/^\d+$/.test(k)) return obj[Number(k)];
  }
  if (obj instanceof Map) {
    if (key === 'size' || key === 'length' || key === 'count') return obj.size;
    return obj.get(String(key));
  }
  if (typeof obj === 'object') {
    if (key === '__nil') return obj.__nil;
    if (key in obj && typeof obj[key] !== 'function') return obj[key];
    return obj[key as string];
  }
  if (typeof obj === 'number') {
    if (key === 'length') return toStr(obj).length;
  }
  return undefined;
}

export function setProp(obj: Val, key: string | number, value: Val): void {
  if (Array.isArray(obj)) {
    if (typeof key === 'number' || /^-?\d+$/.test(String(key))) {
      let idx = Number(key);
      if (idx < 0) idx = obj.length + idx;
      obj[idx] = value;
      return;
    }
    (obj as any)[String(key)] = value;
    return;
  }
  if (obj instanceof Map) {
    obj.set(String(key), value);
    return;
  }
  if (isObj(obj)) {
    obj[key as string] = value;
    return;
  }
  throw new RtError(`TypeError: cannot set property '${String(key)}'`);
}

type MethodHandler = (receiver: Val, args: Val[]) => Val;

const arrEnsure = (r: any): any[] => (Array.isArray(r) ? r : (() => { throw new RtError('TypeError: value is not an array'); })());

export function pyFormatNumber(n: number, spec: string): string {
  const m = /^([<^>]?)([+\- ]?)(0?)(\d*)(?:\.(\d+))?([fFeEgGd%])?$/.exec(spec);
  if (!m) return toStr(n);
  const [, align, sign, zero, width, prec, type] = m;
  let body: string;
  const p = prec !== undefined ? parseInt(prec, 10) : undefined;
  if (type === 'f' || type === 'F') body = n.toFixed(p ?? 6);
  else if (type === 'e' || type === 'E') body = n.toExponential(p ?? 6).replace('e', type === 'E' ? 'E' : 'e');
  else if (type === 'g' || type === 'G') body = numStr(parseFloat(n.toPrecision(p ?? 6)));
  else if (type === 'd') body = String(Math.trunc(n));
  else if (type === '%') body = (n * 100).toFixed(p ?? 6) + '%';
  else body = typeof n === 'number' ? numStr(n) : String(n);
  if (sign === '+' && n >= 0) body = '+' + body;
  const w = width ? parseInt(width, 10) : 0;
  if (w > body.length) {
    const pad = zero ? '0' : ' ';
    if (align === '<') body = body.padEnd(w, pad);
    else if (align === '^') {
      const total = w - body.length;
      body = pad.repeat(Math.floor(total / 2)) + body + pad.repeat(Math.ceil(total / 2));
    } else body = pad.repeat(w - body.length) + body;
  }
  return body;
}

export function pyFormat(value: Val, spec: string): string {
  if (!spec) return toStr(value);
  if (typeof value === 'number') return pyFormatNumber(value, spec);
  if (typeof value === 'string') {
    const m = /^([<^>]?)(\d+)$/.exec(spec);
    if (m) {
      const w = parseInt(m[2], 10);
      if (m[1] === '<') return value.padEnd(w);
      if (m[1] === '^') {
        const total = w - value.length;
        return ' '.repeat(Math.floor(total / 2)) + value + ' '.repeat(Math.ceil(total / 2));
      }
      return value.padStart(w);
    }
  }
  return toStr(value);
}

const arrayMethods: Record<string, MethodHandler> = {
  append: (r, a) => {
    arrEnsure(r).push(a[0]);
    return undefined;
  },
  push: (r, a) => {
    const arr = arrEnsure(r);
    arr.push(a[0]);
    return arr.length;
  },
  add: (r, a) => {
    const arr = arrEnsure(r);
    arr.push(a[0]);
    return true;
  },
  push_back: (r, a) => {
    arrEnsure(r).push(a[0]);
    return undefined;
  },
  pop: (r, a) => {
    const arr = arrEnsure(r);
    if (a.length) return arr.splice(toInt(a[0]), 1)[0];
    return arr.pop();
  },
  remove: (r, a) => {
    const arr = arrEnsure(r);
    const i = arr.indexOf(a[0]);
    if (i >= 0) arr.splice(i, 1);
    else if (typeof a[0] === 'number') arr.splice(toInt(a[0]), 1);
    return undefined;
  },
  insert: (r, a) => {
    arrEnsure(r).splice(toInt(a[0]), 0, a[1]);
    return undefined;
  },
  shift: (r) => arrEnsure(r).shift(),
  unshift: (r) => arrEnsure(r).unshift(),
  length: (r) => arrEnsure(r).length,
  size: (r) => arrEnsure(r).length,
  count: (r, a) => (a.length ? arrEnsure(r).filter((x) => jsEq(x, a[0])).length : arrEnsure(r).length),
  map: (r, a) => arrEnsure(r).map((x, i) => callValue(a[0], [x, i], newEnv())),
  filter: (r, a) => arrEnsure(r).filter((x, i) => truthy(callValue(a[0], [x, i], newEnv()))),
  reduce: (r, a) => {
    const arr = arrEnsure(r);
    if (a.length > 1) return arr.reduce((acc, x, i) => callValue(a[0], [acc, x, i], newEnv()), a[1]);
    return arr.reduce((acc, x, i) => callValue(a[0], [acc, x, i], newEnv()));
  },
  forEach: (r, a) => {
    arrEnsure(r).forEach((x, i) => callValue(a[0], [x, i], newEnv()));
    return undefined;
  },
  join: (r, a) => arrEnsure(r).map((x) => toStr(x)).join(a.length ? toStr(a[0]) : ','),
  slice: (r, a) => {
    const arr = arrEnsure(r);
    const start = a.length ? toInt(a[0]) : 0;
    const end = a.length > 1 && a[1] !== undefined && a[1] !== null ? toInt(a[1]) : arr.length;
    return arr.slice(start < 0 ? arr.length + start : start, end < 0 ? arr.length + end : end);
  },
  sort: (r, a) => {
    const arr = arrEnsure(r);
    if (a.length && a[0]) {
      const cmp = a[0];
      arr.sort((x, y) => {
        const res = callValue(cmp, [x, y], newEnv());
        return typeof res === 'number' ? res : truthy(res) ? 1 : -1;
      });
    } else {
      arr.sort((x, y) => {
        if (typeof x === 'number' && typeof y === 'number') return x - y;
        return toStr(x).localeCompare(toStr(y));
      });
    }
    return arr;
  },
  sorted: (r: Val) => [...arrEnsure(r)].sort((x: Val, y: Val) => (typeof x === 'number' && typeof y === 'number' ? x - y : toStr(x).localeCompare(toStr(y)))),
  reverse: (r) => {
    const arr = arrEnsure(r);
    arr.reverse();
    return arr;
  },
  includes: (r, a) => arrEnsure(r).some((x) => jsEq(x, a[0])),
  contains: (r, a) => arrEnsure(r).some((x) => jsEq(x, a[0])),
  indexOf: (r, a) => arrEnsure(r).findIndex((x) => jsEq(x, a[0])),
  find: (r, a) => arrEnsure(r).find((x, i) => truthy(callValue(a[0], [x, i], newEnv()))),
  findIndex: (r, a) => arrEnsure(r).findIndex((x, i) => truthy(callValue(a[0], [x, i], newEnv()))),
  concat: (r, a) => [...arrEnsure(r), ...(Array.isArray(a[0]) ? a[0] : [a[0]])],
  every: (r, a) => arrEnsure(r).every((x, i) => truthy(callValue(a[0], [x, i], newEnv()))),
  some: (r, a) => arrEnsure(r).some((x, i) => truthy(callValue(a[0], [x, i], newEnv()))),
  fill: (r, a) => {
    const arr = arrEnsure(r);
    arr.fill(a[0]);
    return arr;
  },
  extend: (r, a) => {
    arrEnsure(r).push(...arrEnsure(a[0]));
    return undefined;
  },
  keys: (r) => arrEnsure(r).map((_, i) => i),
  values: (r) => arrEnsure(r),
  items: (r) => arrEnsure(r),
};

const stringMethods: Record<string, MethodHandler> = {
  upper: (r) => String(r).toUpperCase(),
  lower: (r) => String(r).toLowerCase(),
  toUpperCase: (r) => String(r).toUpperCase(),
  toLowerCase: (r) => String(r).toLowerCase(),
  to_upper: (r) => String(r).toUpperCase(),
  to_lower: (r) => String(r).toLowerCase(),
  split: (r, a) => (a.length && toStr(a[0]) !== '' ? String(r).split(toStr(a[0])) : Array.from(String(r))),
  trim: (r) => String(r).trim(),
  strip: (r) => String(r).trim(),
  lstrip: (r) => String(r).replace(/^\s+/, ''),
  rstrip: (r) => String(r).replace(/\s+$/, ''),
  replace: (r, a) => {
    const src = String(r);
    if (a.length > 1) return src.split(toStr(a[0])).join(toStr(a[1]));
    return src;
  },
  replaceFirst: (r, a) => String(r).replace(toStr(a[0]), toStr(a[1])),
  startsWith: (r, a) => String(r).startsWith(toStr(a[0])),
  starts_with: (r, a) => String(r).startsWith(toStr(a[0])),
  endsWith: (r, a) => String(r).endsWith(toStr(a[0])),
  ends_with: (r, a) => String(r).endsWith(toStr(a[0])),
  includes: (r, a) => String(r).includes(toStr(a[0])),
  contains: (r, a) => String(r).includes(toStr(a[0])),
  substring: (r, a) => {
    const start = toInt(a[0]);
    return a.length > 1 ? String(r).substring(start, toInt(a[1])) : String(r).substring(start);
  },
  substr: (r, a) => {
    const start = toInt(a[0]);
    return a.length > 1 ? String(r).substr(start, toInt(a[1])) : String(r).substr(start);
  },
  slice: (r, a) => {
    const s = String(r);
    const start = a.length ? toInt(a[0]) : 0;
    const end = a.length > 1 && a[1] !== undefined ? toInt(a[1]) : s.length;
    return s.slice(start < 0 ? s.length + start : start, end < 0 ? s.length + end : end);
  },
  charAt: (r, a) => String(r).charAt(toInt(a[0])),
  at: (r, a) => String(r).charAt(toInt(a[0])),
  indexOf: (r, a) => String(r).indexOf(toStr(a[0])),
  find: (r, a) => String(r).indexOf(toStr(a[0])),
  lastIndexOf: (r, a) => String(r).lastIndexOf(toStr(a[0])),
  repeat: (r, a) => String(r).repeat(toInt(a[0])),
  padStart: (r, a) => String(r).padStart(toInt(a[0]), a.length > 1 ? toStr(a[1]) : ' '),
  padEnd: (r, a) => String(r).padEnd(toInt(a[0]), a.length > 1 ? toStr(a[1]) : ' '),
  zfill: (r, a) => String(r).padStart(toInt(a[0]), '0'),
  ljust: (r, a) => String(r).padEnd(toInt(a[0]), a.length > 1 ? toStr(a[1]) : ' '),
  rjust: (r, a) => String(r).padStart(toInt(a[0]), a.length > 1 ? toStr(a[1]) : ' '),
  center: (r, a) => {
    const s = String(r);
    const w = toInt(a[0]);
    if (w <= s.length) return s;
    const total = w - s.length;
    return ' '.repeat(Math.floor(total / 2)) + s + ' '.repeat(Math.ceil(total / 2));
  },
  capitalize: (r) => {
    const s = String(r);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  },
  title: (r) => String(r).replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
  format: (r, a) => {
    let idx = 0;
    return String(r).replace(/\{(\d*)\}/g, (_m, i: string) => (i === '' ? toStr(a[idx++]) : toStr(a[parseInt(i, 10)])));
  },
  stripPrefix: (r, a) => String(r).replace(new RegExp('^' + escapeRegExp(toStr(a[0]))), ''),
  toString: (r: Val) => String(r),
  toFixed: (r: Val, a: Val[]) => Number(r).toFixed(toInt(a[0])),
};

const mapMethods: Record<string, MethodHandler> = {
  get: (r, a) => (r as Map<string, Val>).get(toStr(a[0])),
  getOrDefault: (r, a) => (r as Map<string, Val>).get(toStr(a[0])) ?? a[1],
  set: (r, a) => {
    (r as Map<string, Val>).set(toStr(a[0]), a[1]);
    return undefined;
  },
  put: (r, a) => {
    const prev = (r as Map<string, Val>).get(toStr(a[0]));
    (r as Map<string, Val>).set(toStr(a[0]), a[1]);
    return prev;
  },
  has: (r, a) => (r as Map<string, Val>).has(toStr(a[0])),
  containsKey: (r, a) => (r as Map<string, Val>).has(toStr(a[0])),
  contains: (r, a) => (r as Map<string, Val>).has(toStr(a[0])),
  keys: (r) => [...(r as Map<string, Val>).keys()],
  values: (r) => [...(r as Map<string, Val>).values()],
  items: (r) => [...(r as Map<string, Val>).entries()].map(([k, v]) => [k, v]),
  entries: (r) => [...(r as Map<string, Val>).entries()].map(([k, v]) => [k, v]),
  delete: (r, a) => (r as Map<string, Val>).delete(toStr(a[0])),
  clear: (r) => (r as Map<string, Val>).clear(),
  size: (r) => (r as Map<string, Val>).size,
};

function objectMethod(r: any, name: string, a: Val[]): Val | undefined {
  if (name === '__fields') return undefined;
  if (name in r && typeof r[name] === 'object' && r[name]?.__fn) {
    const f = r[name];
    return f.__fn([r, ...a], newEnv());
  }
  if (a.length === 0) {
    const v = r[name];
    if (typeof v !== 'function') return v;
  }
  return undefined;
}

export function callMethod(receiver: Val, name: string, args: Val[]): Val {
  if (name === 'length' || name === 'size' || name === 'count' || name === 'len') {
    if (typeof receiver === 'string') return receiver.length;
    if (Array.isArray(receiver)) return receiver.length;
    if (receiver instanceof Map) return receiver.size;
  }
  if (Array.isArray(receiver) && arrayMethods[name]) return arrayMethods[name](receiver, args);
  if (typeof receiver === 'string' && stringMethods[name]) return stringMethods[name](receiver, args);
  if (receiver instanceof Map) {
    if (mapMethods[name]) return mapMethods[name](receiver, args);
    const v = receiver.get(name);
    if (v !== undefined) return v;
  }
  if (isObj(receiver)) {
    const res = objectMethod(receiver, name, args);
    if (res !== undefined) return res;
    const own = receiver[name];
    if (typeof own === 'object' && own?.__fn) return own.__fn(args, newEnv());
    if (typeof own !== 'function') return own;
  }
  // Number helpers
  if (typeof receiver === 'number') {
    if (name === 'toFixed') return receiver.toFixed(toInt(args[0] ?? 0));
    if (name === 'toString' || name === 'to_s') return toStr(receiver);
    if (name === 'toInt' || name === 'to_i') return Math.trunc(receiver);
    if (name === 'toFloat' || name === 'to_f') return receiver;
    if (name === 'abs') return Math.abs(receiver);
    if (name === 'floor') return Math.floor(receiver);
    if (name === 'ceil') return Math.ceil(receiver);
    if (name === 'round') return Math.round(receiver);
    if (name === 'times') {
      for (let i = 0; i < receiver; i++) callValue(args[0], [i], newEnv());
      return receiver;
    }
  }
  throw new RtError(`AttributeError: '${typeof receiver}' object has no method '${name}'`);
}

/* ------------------------------------------------------------------ */
/* Tokenizer                                                           */
/* ------------------------------------------------------------------ */

export type TokType = 'num' | 'str' | 'id' | 'op' | 'nl' | 'indent' | 'dedent' | 'eof';

export interface Tok {
  t: TokType;
  v: string;
  n?: number;
  line: number;
  col: number;
  /** raw string literal quote + interpolation marker */
  q?: string;
}

export interface LexOpts {
  lineComments?: string[];
  blockComments?: [string, string][];
  quotes?: string[];
  newlines?: boolean;
  indent?: boolean;
  preprocessor?: boolean;
  hashIsComment?: boolean;
  dollarVars?: boolean;
  multiOps?: string[];
}

const DEFAULT_OPS = [
  '>>>=', '...', '===', '!==', '**=', '//=', '<<=', '>>=', '..=', '<=>', '&&=', '||=', '=>', '->', '==', '!=', '<=', '>=',
  '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '//', '<<', '>>', '..', '::', ':=', '??',
  '?.', '&.', '%%', '<>', '<=', '=~', '!~', '|>', '<-',
];

export function tokenize(src: string, opts: LexOpts = {}): Tok[] {
  const lineComments = opts.lineComments ?? ['//'];
  const blockComments = opts.blockComments ?? [['/*', '*/']];
  const quotes = opts.quotes ?? ['"', "'"];
  const newlines = opts.newlines ?? false;
  const indent = opts.indent ?? false;
  const multiOps = opts.multiOps ?? DEFAULT_OPS;
  const toks: Tok[] = [];
  const indentStack: number[] = [0];
  let i = 0;
  let line = 1;
  let col = 1;
  let atLineStart = true;
  const srcLen = src.length;

  while (i < srcLen) {
    if (atLineStart && indent) {
      // measure indentation
      let j = i;
      let width = 0;
      while (j < srcLen && (src[j] === ' ' || src[j] === '\t')) {
        width += src[j] === '\t' ? 4 : 1;
        j++;
      }
      // blank or comment-only line: copy through newline
      if (j < srcLen && src[j] !== '\n' && src[j] !== '\r' && !lineComments.some((c) => src.startsWith(c, j))) {
        if (width > indentStack[indentStack.length - 1]) {
          indentStack.push(width);
          toks.push({ t: 'indent', v: '', line, col: 1 });
        } else {
          while (width < indentStack[indentStack.length - 1]) {
            indentStack.pop();
            toks.push({ t: 'dedent', v: '', line, col: 1 });
          }
        }
      }
      i = j;
      col = width + 1;
      atLineStart = false;
      if (i >= srcLen) break;
    }

    const ch = src[i];

    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      i++;
      line++;
      col = 1;
      atLineStart = true;
      if (newlines && toks.length && toks[toks.length - 1].t !== 'nl' && toks[toks.length - 1].t !== 'indent') {
        toks.push({ t: 'nl', v: '\n', line, col });
      }
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      i++;
      col++;
      continue;
    }

    // comments
    let matchedComment = false;
    for (const [start, end] of blockComments) {
      if (src.startsWith(start, i)) {
        const endIdx = src.indexOf(end, i + start.length);
        const stop = endIdx < 0 ? srcLen : endIdx + end.length;
        for (let k = i; k < stop; k++) {
          if (src[k] === '\n') {
            line++;
            col = 1;
            atLineStart = true;
            if (newlines) {
              toks.push({ t: 'nl', v: '\n', line, col });
            }
          } else col++;
        }
        i = stop;
        matchedComment = true;
        break;
      }
    }
    if (matchedComment) continue;

    const lineComment = lineComments.find((c) => src.startsWith(c, i));
    if (lineComment) {
      while (i < srcLen && src[i] !== '\n') i++;
      continue;
    }

    if (opts.preprocessor && ch === '#' && atLineStart) {
      while (i < srcLen && src[i] !== '\n') i++;
      continue;
    }

    // Strings (with optional prefix like f"", r"", b"")
    const prefixMatch = /^(f|r|b|rb|br|fr|rf)(["'])/i.exec(src.slice(i, i + 3));
    let strQuote: string | null = null;
    let interp = false;
    if (prefixMatch && (quotes.includes(prefixMatch[2]) || prefixMatch[2] === '"')) {
      interp = /f/i.test(prefixMatch[1]);
      strQuote = prefixMatch[2];
      i += prefixMatch[1].length;
      col += prefixMatch[1].length;
    } else if (quotes.includes(ch)) {
      strQuote = ch;
    } else if (ch === '`' && quotes.includes('`')) {
      strQuote = ch;
    }

    if (strQuote) {
      const startLine = line;
      const startCol = col;
      i++; // opening quote
      col++;
      let raw = '';
      // triple quotes
      if (src.startsWith(strQuote.repeat(2), i)) {
        i += 2;
        col += 2;
        const triple = strQuote.repeat(3);
        const endIdx = src.indexOf(triple, i);
        const stop = endIdx < 0 ? srcLen : endIdx;
        raw = src.slice(i, stop);
        for (let k = i; k < stop; k++) {
          if (src[k] === '\n') {
            line++;
            col = 1;
          } else col++;
        }
        i = stop + 3;
        col += 3;
        toks.push({ t: 'str', v: raw, line: startLine, col: startCol, q: interp ? 'f' : 'raw' });
        continue;
      }
      while (i < srcLen) {
        const c = src[i];
        if (c === '\\') {
          raw += c + (src[i + 1] ?? '');
          if (src[i + 1] === '\n') {
            line++;
            col = 1;
            i += 2;
            continue;
          }
          i += 2;
          col += 2;
          continue;
        }
        if (c === strQuote) {
          i++;
          col++;
          break;
        }
        if (c === '\n') {
          line++;
          col = 1;
          raw += c;
          i++;
          continue;
        }
        raw += c;
        i++;
        col++;
      }
      toks.push({ t: 'str', v: raw, line: startLine, col: startCol, q: interp ? 'f' : strQuote });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      if (ch === '0' && /[xXbBoO]/.test(src[i + 1] ?? '')) {
        j += 2;
        while (j < srcLen && /[0-9a-fA-F_]/.test(src[j])) j++;
      } else {
        while (j < srcLen && /[0-9_]/.test(src[j])) j++;
        if (src[j] === '.') {
          if (src[j + 1] === '.' && src[j + 2] === '.') {
            // spread
          } else if (/[0-9]/.test(src[j + 1] ?? '') || !/[a-zA-Z]/.test(src[j + 1] ?? '')) {
            j++;
            while (j < srcLen && /[0-9_]/.test(src[j])) j++;
          }
        }
        if (/[eE]/.test(src[j] ?? '') && /[0-9+\-]/.test(src[j + 1] ?? '')) {
          j += 2;
          while (j < srcLen && /[0-9]/.test(src[j])) j++;
        }
        while (j < srcLen && /[uUlLfFdDnNiI]/.test(src[j])) j++;
      }
      const text = src.slice(i, j).replace(/_/g, '').replace(/[uUlLfFdDnNiI]+$/, '');
      let value: number;
      if (/^0[xX]/.test(text)) value = parseInt(text.slice(2), 16);
      else if (/^0[bB]/.test(text)) value = parseInt(text.slice(2), 2);
      else if (/^0[oO]/.test(text)) value = parseInt(text.slice(2), 8);
      else value = Number(text);
      toks.push({ t: 'num', v: text, n: value, line, col });
      col += j - i;
      i = j;
      continue;
    }

    // Variables with $ prefix (PHP, Bash, Perl)
    if (ch === '$' && opts.dollarVars && /[A-Za-z_]/.test(src[i + 1] ?? '')) {
      let j = i + 1;
      while (j < srcLen && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ t: 'id', v: '$' + src.slice(i + 1, j), line, col });
      col += j - i;
      i = j;
      continue;
    }

    // Identifiers / keywords
    if (/[A-Za-z_@]/.test(ch)) {
      let j = i;
      while (j < srcLen && /[A-Za-z0-9_@]/.test(src[j])) j++;
      const word = src.slice(i, j);
      toks.push({ t: 'id', v: word, line, col });
      col += j - i;
      i = j;
      continue;
    }

    // Operators
    let op = '';
    for (const candidate of multiOps) {
      if (src.startsWith(candidate, i)) {
        op = candidate;
        break;
      }
    }
    if (!op) op = ch;
    toks.push({ t: 'op', v: op, line, col });
    col += op.length;
    i += op.length;
  }

  if (indent) {
    while (indentStack.length > 1) {
      indentStack.pop();
      toks.push({ t: 'dedent', v: '', line, col: 1 });
    }
  }
  toks.push({ t: 'eof', v: '', line, col });
  return toks;
}

export function tokenizeSafe(src: string, opts: LexOpts): { toks?: Tok[]; error?: string } {
  try {
    return { toks: tokenize(src, opts) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
