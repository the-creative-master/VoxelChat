/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WaffleCode execution runners that need real WaffleCode libraries:
 *   - Web Worker JavaScript / TypeScript (Sucrase transpile)
 *   - SQLite / ANSI SQL through sql.js (real WebAssembly)
 *   - WAT through wabt (real assembler) executed by the native WebAssembly VM
 *   - HTML/CSS/JS combined preview documents
 *   - Markdown + KaTeX rendering
 */

export interface RunResult {
  stdout: string;
  stderr: string;
  ms: number;
  extra?: Record<string, any>;
}

/* ------------------------------------------------------------------ */
/* HTML / CSS / JS combined document                                   */
/* ------------------------------------------------------------------ */

export function buildHtmlDocument(files: { name: string; content: string }[]): string {
  const html = files.find((f) => /\.html?$/i.test(f.name))?.content ?? '<h1>No index.html</h1>';
  const css = files.filter((f) => /\.css$/i.test(f.name)).map((f) => f.content).join('\n');
  const js = files.filter((f) => /\.(m?js)$/i.test(f.name)).map((f) => f.content).join('\n;\n');
  const consoleBridge = `
<script>
(function(){
  var send = function(level, args){ parent.postMessage({__wafflecode:true, type:'console', level:level, text:Array.from(args).map(function(a){
    try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e){ return String(a); }
  }).join(' ')}, '*'); };
  ['log','info','warn','error','debug'].forEach(function(k){
    var orig = console[k].bind(console);
    console[k] = function(){ send(k==='warn'?'warn':k==='error'?'error':'stdout', arguments); orig.apply(console, arguments); };
  });
  window.onerror = function(msg, src, line, col){ send('error', ['Uncaught ' + msg + ' (line ' + line + ':' + col + ')']); };
  window.addEventListener('unhandledrejection', function(e){ send('error', ['Unhandled promise rejection: ' + e.reason]); });
})();
</script>`;
  const alreadyHasConsole = /console\.(log|warn|error)/.test(js);
  void alreadyHasConsole;
  return html.includes('</head>')
    ? html.replace('</head>', `<style>\n${css}\n</style>${consoleBridge}</head>`).replace('</body>', `<script>\n${js}\n</script></body>`)
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style>${consoleBridge}</head><body>${html}<script>${js}<\/script></body></html>`;
}

/* ------------------------------------------------------------------ */
/* JavaScript / TypeScript in a real Worker                            */
/* ------------------------------------------------------------------ */

export async function runJavaScript(
  files: { name: string; content: string }[],
  transpile: boolean,
  sink: (stream: 'stdout' | 'stderr', text: string) => void
): Promise<RunResult> {
  const start = performance.now();
  let stdout = '';
  let stderr = '';
  const mainFile = files.find((f) => /\.(m?js|ts|tsx)$/i.test(f.name) && !/\.d\.ts$/.test(f.name));
  if (!mainFile) {
    return { stdout: '', stderr: 'No JavaScript or TypeScript entry file found in this project.\n', ms: 0 };
  }
  let code = mainFile.content;
  if (transpile || /\.tsx?$/i.test(mainFile.name)) {
    try {
      const { transform } = await import('sucrase');
      const isTsx = /\.tsx$/i.test(mainFile.name);
      code = transform(code, {
        transforms: isTsx ? ['typescript', 'jsx'] : ['typescript'],
        jsxPragma: 'h',
        jsxFragmentPragma: 'Fragment',
      }).code;
    } catch (err) {
      const msg = `TypeScript transpile error: ${err instanceof Error ? err.message : String(err)}\n`;
      sink('stderr', msg);
      return { stdout: '', stderr: msg, ms: performance.now() - start };
    }
  }

  const virtualFiles: Record<string, string> = {};
  for (const f of files) {
    if (f.name === mainFile.name) continue;
    virtualFiles[f.name] = f.content;
  }

  const workerSource = `
const FILES = ${JSON.stringify(virtualFiles)};
const queue = [];
const emit = (stream, text) => self.postMessage({ __wc: true, stream, text });

const listeners = [];
self.addEventListener('message', (e) => {
  if (e.data && e.data.__input !== undefined) { listeners.splice(0).forEach((cb) => cb(e.data.__input)); }
});

const require = (name) => {
  if (name === 'fs' || name === 'node:fs') {
    return {
      readFileSync: (p, enc) => {
        const clean = String(p).replace(/^\\.\\//, '');
        if (!(clean in FILES)) { const err = new Error("ENOENT: no such file or directory, open '" + p + "'"); err.code = 'ENOENT'; throw err; }
        return enc === 'utf8' || enc === 'utf-8' || enc === undefined ? FILES[clean] : Buffer.from(FILES[clean]);
      },
      writeFileSync: (p, content) => { FILES[String(p).replace(/^\\.\\//, '')] = String(content); },
      existsSync: (p) => String(p).replace(/^\\.\\//, '') in FILES,
      readdirSync: () => Object.keys(FILES),
      mkdirSync: () => {},
      statSync: () => ({ isFile: () => true, isDirectory: () => false, size: 0 }),
    };
  }
  if (name === 'path' || name === 'node:path') {
    return {
      resolve: (...parts) => '/' + parts.join('/').replace(/\\/+/g, '/').replace(/^\\//, ''),
      join: (...parts) => parts.join('/').replace(/\\/+/g, '/'),
      basename: (p, ext) => { const base = String(p).split('/').pop(); return ext ? base.replace(ext, '') : base; },
      dirname: (p) => String(p).split('/').slice(0, -1).join('/') || '.',
      extname: (p) => { const b = String(p).split('/').pop() || ''; const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
      sep: '/',
    };
  }
  if (name === 'util' || name === 'node:util') {
    return { format: (...a) => a.map((x) => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '), inspect: (x) => JSON.stringify(x, null, 2), inherits: () => {} };
  }
  if (name === 'crypto' || name === 'node:crypto') {
    return {
      randomUUID: () => crypto.randomUUID(),
      randomBytes: (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; },
      createHash: () => ({ update() { return this; }, digest: () => '' }),
    };
  }
  if (name === 'os' || name === 'node:os') {
    return { platform: () => 'browser', cpus: () => [], totalmem: () => 8e9, freemem: () => 4e9, EOL: '\\n', hostname: () => 'wafflecode' };
  }
  if (name === 'events' || name === 'node:events') {
    return class EventEmitter {
      constructor() { this.handlers = {}; }
      on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
      emit(ev, ...args) { (this.handlers[ev] || []).forEach((f) => f(...args)); return true; }
    };
  }
  if (name === 'assert' || name === 'node:assert') {
    const assert = (v, msg) => { if (!v) throw new Error(msg || 'AssertionError'); };
    assert.strictEqual = (a, b, m) => { if (a !== b) throw new Error(m || ('Expected ' + b + ' but got ' + a)); };
    assert.deepStrictEqual = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('Deep equality assertion failed'); };
    assert.ok = assert;
    return assert;
  }
  return {};
};

const g = (typeof globalThis !== 'undefined' ? globalThis : self);
g.global = g;
g.require = require;
g.module = { exports: {} };
g.exports = g.module.exports;
g.process = {
  argv: ['node', '${mainFile.name}'],
  env: { NODE_ENV: 'development' },
  platform: 'browser',
  version: 'v22.0.0 (WaffleCode)',
  stdout: { write: (s) => emit('stdout', String(s)) },
  stderr: { write: (s) => emit('stderr', String(s)) },
  exit: (code) => { throw { __exitCode: code ?? 0 }; },
  nextTick: (fn, ...a) => setTimeout(() => fn(...a), 0),
  cwd: () => '/project',
  hrtime: Object.assign(() => [0, 0], { bigint: () => 0n }),
  memoryUsage: () => ({ heapUsed: 0, heapTotal: 0, rss: 0 }),
};
g.Buffer = { from: (s) => ({ toString: () => String(s), length: String(s).length }) };
const consoleShim = {};
['log','info','warn','error','debug','trace','dir','table'].forEach((k) => {
  consoleShim[k] = (...a) => emit(k === 'error' || k === 'warn' ? 'stderr' : 'stdout', a.map((x) => {
    if (typeof x === 'string') return x;
    try { return JSON.stringify(x); } catch { return String(x); }
  }).join(' '));
});
g.console = consoleShim;

const stdinReader = () => {
  return new Promise((resolve) => {
    listeners.push(resolve);
    self.postMessage({ __wc: true, requestInput: true });
  });
};
g.prompt = (msg) => { if (msg) emit('stdout', String(msg)); return ''; };

(async () => {
  try {
    const fn = new Function('require', 'module', 'exports', 'process', 'console', '__filename', '__dirname', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      '"use strict";' + ${JSON.stringify(code)} + '\\n;return (typeof exports !== "undefined" ? exports : undefined);');
    const result = fn(require, g.module, g.module.exports, g.process, g.console, '${mainFile.name}', '/project', setTimeout, clearTimeout, setInterval, clearInterval);
    if (result && Object.keys(result).length) {
      emit('stdout', JSON.stringify(result, null, 2) + '\\n');
    }
  } catch (err) {
    const msg = err && err.__exitCode !== undefined
      ? ''
      : (err && err.stack ? String(err.stack).split('\\n').slice(0, 4).join('\\n') : String(err));
    if (msg) emit('stderr', msg + '\\n');
  } finally {
    await new Promise((r) => setTimeout(r, 60));
    self.postMessage({ __wc: true, done: true });
  }
})();
`;
  return new Promise<RunResult>((resolve) => {
    let worker: Worker | null = null;
    const blob = new Blob([workerSource], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (errText?: string) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      URL.revokeObjectURL(url);
      if (errText) {
        stderr += errText;
        sink('stderr', errText);
      }
      resolve({ stdout, stderr, ms: Math.round(performance.now() - start) });
    };
    const timeout = window.setTimeout(() => finish('ExecutionTimeout: worker did not finish within 8s (infinite loop?)\n'), 8000);
    try {
      worker = new Worker(url);
    } catch (err) {
      window.clearTimeout(timeout);
      finish(`WorkerError: ${err instanceof Error ? err.message : String(err)}\n`);
      return;
    }
    worker.onmessage = (e) => {
      const data = e.data;
      if (!data || !data.__wc) return;
      if (data.requestInput) {
        worker?.postMessage({ __input: '' });
        return;
      }
      if (data.done) {
        window.clearTimeout(timeout);
        finish();
        return;
      }
      if (data.stream === 'stderr') stderr += data.text;
      else stdout += data.text;
      sink(data.stream === 'stderr' ? 'stderr' : 'stdout', data.text);
    };
    worker.onerror = (e) => {
      window.clearTimeout(timeout);
      finish(`${e.message}\n`);
    };
  });
}

/* ------------------------------------------------------------------ */
/* SQL / SQLite through sql.js (real WASM)                             */
/* ------------------------------------------------------------------ */

let sqlModulePromise: Promise<any> | null = null;

async function loadSqlJs(): Promise<any> {
  if (!sqlModulePromise) {
    sqlModulePromise = (async () => {
      const initSqlJs = (await import('sql.js')).default;
      const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default;
      return initSqlJs({ locateFile: () => wasmUrl });
    })();
  }
  return sqlModulePromise;
}

export interface SqlResult extends RunResult {
  tables: { name: string; columns: { name: string; type: string; pk: boolean }[]; rows: number }[];
  resultSets: { statement: string; columns: string[]; rows: (string | number | null)[][] }[];
}

export async function runSql(source: string, sink: (stream: 'stdout' | 'stderr', text: string) => void): Promise<SqlResult> {
  const start = performance.now();
  let stdout = '';
  let stderr = '';
  const tables: SqlResult['tables'] = [];
  const resultSets: SqlResult['resultSets'] = [];
  try {
    const SQL = await loadSqlJs();
    const db = new SQL.Database();
    const statements = splitSqlStatements(source);
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      try {
        if (/^\s*(select|with|pragma|explain)\b/i.test(trimmed)) {
          const result = db.exec(trimmed);
          for (const rs of result) {
            const columns: string[] = rs.columns;
            const rows = rs.values as (string | number | null)[][];
            resultSets.push({ statement: trimmed, columns, rows });
            stdout += formatSqlTable(columns, rows) + '\n';
            sink('stdout', formatSqlTable(columns, rows) + '\n');
          }
          if (!result.length) {
            stdout += `-- ${trimmed.split('\n')[0].slice(0, 60)} → OK\n`;
            sink('stdout', `-- ${trimmed.split('\n')[0].slice(0, 60)} → OK\n`);
          }
        } else {
          db.run(trimmed);
          const head = trimmed.split('\n')[0].slice(0, 72);
          stdout += `-- ${head} → OK\n`;
          sink('stdout', `-- ${head} → OK\n`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stderr += `SQL error: ${message}\n  in: ${trimmed.split('\n')[0].slice(0, 90)}\n`;
        sink('stderr', `SQL error: ${message}\n`);
      }
    }
    // schema introspection
    try {
      const tableList = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      if (tableList.length) {
        for (const row of tableList[0].values as any[][]) {
          const name = String(row[0]);
          const info = db.exec(`PRAGMA table_info("${name.replace(/"/g, '""')}")`);
          const columns = info.length
            ? (info[0].values as any[][]).map((r) => ({ name: String(r[1]), type: String(r[2] || 'ANY'), pk: Number(r[5]) > 0 }))
            : [];
          let count = 0;
          try {
            const countRes = db.exec(`SELECT COUNT(*) FROM "${name.replace(/"/g, '""')}"`);
            count = Number(countRes[0]?.values?.[0]?.[0] ?? 0);
          } catch { count = 0; }
          tables.push({ name, columns, rows: count });
        }
      }
    } catch { /* schema introspection is best-effort */ }
    db.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr += `SQLite engine error: ${message}\n`;
    sink('stderr', `SQLite engine error: ${message}\n`);
  }
  return { stdout, stderr, ms: Math.round(performance.now() - start), tables, resultSets };
}

export function splitSqlStatements(source: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (inLineComment) {
      cur += c;
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      cur += c;
      if (c === '*' && next === '/') { cur += next; i++; inBlockComment = false; }
      continue;
    }
    if (inSingle) {
      cur += c;
      if (c === "'" && next === "'") { cur += next; i++; continue; }
      if (c === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      cur += c;
      if (c === '"') inDouble = false;
      continue;
    }
    if (c === '-' && next === '-') { inLineComment = true; cur += c; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; cur += c; continue; }
    if (c === "'") { inSingle = true; cur += c; continue; }
    if (c === '"') { inDouble = true; cur += c; continue; }
    if (c === ';') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function formatSqlTable(columns: string[], rows: (string | number | null)[][]): string {
  if (!columns.length) return '';
  const widths = columns.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i] ?? 'NULL').length), 4));
  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const line = (cells: string[]) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  const out = [sep, line(columns), sep, ...rows.map((r) => line(r.map((c) => (c === null ? 'NULL' : String(c))))), sep, `${rows.length} row${rows.length === 1 ? '' : 's'}`];
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* WebAssembly Text (WAT) through wabt                                 */
/* ------------------------------------------------------------------ */

let wabtPromise: Promise<any> | null = null;

async function loadWabt(): Promise<any> {
  if (!wabtPromise) {
    wabtPromise = (async () => {
      const mod = await import('wabt');
      const factory = (mod as any).default ?? mod;
      return factory();
    })();
  }
  return wabtPromise;
}

export interface WatResult extends RunResult {
  watSize: number;
  wasmBytes: number;
  exports: string[];
  returnValue: number | null;
}

export async function runWat(source: string, sink: (stream: 'stdout' | 'stderr', text: string) => void): Promise<WatResult> {
  const start = performance.now();
  let stdout = '';
  let stderr = '';
  let wasmBytes = 0;
  let exports: string[] = [];
  let returnValue: number | null = null;
  try {
    const wabt = await loadWabt();
    let wasm: Uint8Array;
    try {
      const module = wabt.parseWat('module.wat', source, { reference_types: true, bulk_memory: true, sat_float_to_int: true, sign_extension: true, multi_value: true, threads: true, simd: true, exceptions: true });
      const { buffer } = module.toBinary({ log: false, write_debug_names: true });
      wasm = new Uint8Array(buffer);
      module.destroy();
      wasmBytes = wasm.byteLength;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stderr += `WAT assemble error:\n${msg}\n`;
      sink('stderr', `WAT assemble error:\n${msg}\n`);
      return { stdout, stderr, ms: Math.round(performance.now() - start), watSize: source.length, wasmBytes: 0, exports: [], returnValue: null };
    }
    stdout += `◈ wabt assembled ${source.length.toLocaleString()} chars of WAT → ${wasmBytes.toLocaleString()} bytes of binary .wasm\n`;
    sink('stdout', `◈ wabt assembled ${source.length.toLocaleString()} chars of WAT → ${wasmBytes.toLocaleString()} bytes of binary .wasm\n`);

    const buffer = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer;
    const module = await WebAssembly.compile(buffer);
    let memory: WebAssembly.Memory | null = null;
    const imports: WebAssembly.Imports = {
      env: {
        print_i32: (v: number) => {
          const text = `${v >>> 0} (0x${(v >>> 0).toString(16)})\n`;
          stdout += text;
          sink('stdout', text);
        },
        print_i64: (v: bigint) => {
          const text = `${v}\n`;
          stdout += text;
          sink('stdout', text);
        },
        print_f64: (v: number) => {
          const text = `${v}\n`;
          stdout += text;
          sink('stdout', text);
        },
        print_char: (v: number) => {
          const text = String.fromCharCode(v);
          stdout += text;
          sink('stdout', text);
        },
        log: (v: number) => {
          const text = `${v}\n`;
          stdout += text;
          sink('stdout', text);
        },
        print_str: (ptr: number, len: number) => {
          if (!memory) return;
          const bytes = new Uint8Array(memory.buffer, ptr, len);
          const text = new TextDecoder().decode(bytes);
          stdout += text;
          sink('stdout', text);
        },
        print: (v: number) => {
          const text = `${v}\n`;
          stdout += text;
          sink('stdout', text);
        },
        abort: (_msg: number, _file: number, line: number, col: number) => {
          const text = `abort() called at ${line}:${col}\n`;
          stderr += text;
          sink('stderr', text);
        },
      },
      wasi_snapshot_preview1: {
        fd_write: () => 0,
        proc_exit: () => undefined,
        fd_close: () => 0,
        fd_seek: () => 0,
      },
    };
    // provide a standard memory import if the module declares one
    const importEntries = WebAssembly.Module.imports(module);
    for (const entry of importEntries) {
      if (entry.kind === 'memory') {
        memory = new WebAssembly.Memory({ initial: 2, maximum: 256 });
        if (entry.module === 'env') imports.env.memory = memory;
        else if (entry.module === 'wasi_snapshot_preview1') imports.wasi_snapshot_preview1.memory = memory;
        else imports[entry.module] = { ...(imports[entry.module] ?? {}), memory };
      }
    }
    const instance = await WebAssembly.instantiate(module, imports);
    const instanceExports = instance.exports as Record<string, any>;
    if (!memory && instanceExports.memory instanceof WebAssembly.Memory) memory = instanceExports.memory;
    exports = Object.keys(instanceExports).filter((k) => k !== 'memory');
    stdout += `◈ Exports: ${exports.join(', ') || '(none)'}\n`;
    sink('stdout', `◈ Exports: ${exports.join(', ') || '(none)'}\n`);
    if (typeof instanceExports.main === 'function') {
      const result = instanceExports.main();
      if (typeof result === 'number') {
        returnValue = result;
        const text = `◈ main() returned ${result} (0x${(result >>> 0).toString(16)})\n`;
        stdout += text;
        sink('stdout', text);
      } else if (typeof result === 'bigint') {
        const text = `◈ main() returned ${result}\n`;
        stdout += text;
        sink('stdout', text);
      }
    } else if (typeof instanceExports._start === 'function') {
      instanceExports._start();
    }
    stdout += `◈ Binary WASM module instantiated successfully\n`;
    sink('stdout', `◈ Binary WASM module instantiated successfully\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stderr += `WebAssembly error: ${msg}\n`;
    sink('stderr', `WebAssembly error: ${msg}\n`);
  }
  return { stdout, stderr, ms: Math.round(performance.now() - start), watSize: source.length, wasmBytes, exports, returnValue };
}

/* ------------------------------------------------------------------ */
/* Markdown + KaTeX                                                    */
/* ------------------------------------------------------------------ */

export async function renderMarkdown(source: string): Promise<string> {
  const { marked } = await import('marked');
  const katex = await import('katex');
  const mathBlocks: string[] = [];
  let text = source.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) => {
    mathBlocks.push(expr.trim());
    return `\n\n@@MATHBLOCK${mathBlocks.length - 1}@@\n\n`;
  });
  const inlineMath: string[] = [];
  text = text.replace(/(?<!\\)\$([^$\n]+?)\$/g, (_m, expr: string) => {
    inlineMath.push(expr.trim());
    return `@@INLINEMATH${inlineMath.length - 1}@@`;
  });
  let html = marked.parse(text, { gfm: true, breaks: false }) as string;
  html = html.replace(/@@MATHBLOCK(\d+)@@/g, (_m, i: string) => {
    try {
      return `<div class="bsu-math-block">${katex.renderToString(mathBlocks[Number(i)], { displayMode: true, throwOnError: false, strict: false })}</div>`;
    } catch {
      return `<pre>${mathBlocks[Number(i)]}</pre>`;
    }
  });
  html = html.replace(/@@INLINEMATH(\d+)@@/g, (_m, i: string) => {
    try {
      return katex.renderToString(inlineMath[Number(i)], { displayMode: false, throwOnError: false, strict: false });
    } catch {
      return inlineMath[Number(i)];
    }
  });
  return html;
}
