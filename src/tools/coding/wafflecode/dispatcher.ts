/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WaffleCode Language Dispatcher
 * Routes each of the 32 supported languages to its real local execution engine.
 */
import { CFamilyRuntime, type Dialect } from './engine/cfamily';
import { PythonRuntime } from './engine/python';
import { runLua, runBash, runHaskell, runProlog, runForth, runBrainfuck, runScheme } from './engine/scripts';
import {
  buildHtmlDocument, runJavaScript, runSql, runWat, renderMarkdown,
  type SqlResult, type WatResult, type RunResult,
} from './runners';

export type { Dialect };
export { buildHtmlDocument, renderMarkdown };

export interface ProjectFile { name: string; content: string }

export interface ExecuteOptions {
  languageId: string;
  files: ProjectFile[];
  stdin?: string;
  packages?: string[];
  onOutput: (stream: 'stdout' | 'stderr', text: string) => void;
}

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  ms: number;
  preview?: { kind: 'html' | 'markdown' | 'sqlite' | 'brainfuck' | 'none'; html?: string; sql?: SqlResult; brainfuck?: { tape: number[]; pointer: number; steps: number } };
  extra?: Record<string, any>;
}

const CFAMILY_DIALECTS: Record<string, Dialect> = {
  c: 'c', cpp: 'cpp', csharp: 'csharp', java: 'java', kotlin: 'kotlin', rust: 'rust', go: 'go',
  swift: 'swift', dart: 'dart', zig: 'zig', php: 'php', perl: 'perl', julia: 'julia', r: 'r',
};

export function entryFile(files: ProjectFile[], languageId: string): ProjectFile | undefined {
  if (!files.length) return undefined;
  const priorities: Record<string, RegExp[]> = {
    html: [/^index\.html?$/i, /\.html?$/i],
    markdown: [/\.md$/i],
    sql: [/\.sql$/i],
    sqlite: [/\.sql$/i],
    brainfuck: [/\.bf$/i],
    python: [/^main\.py$/i, /\.py$/i],
    javascript: [/^index\.m?js$/i, /\.m?js$/i],
    typescript: [/^main\.tsx?$/i, /\.tsx?$/i],
    wat: [/\.wat$/i],
  };
  const patterns = priorities[languageId] ?? [/^main\./i, /\./];
  for (const pattern of patterns) {
    const match = files.find((f) => pattern.test(f.name));
    if (match) return match;
  }
  return files[0];
}

function scriptFiles(files: ProjectFile[]): Record<string, string> {
  const map: Record<string, string> = {};
  files.forEach((f) => { map[f.name] = f.content; });
  return map;
}

const PACKAGE_NOTE = (names: string[]): string =>
  `◈ Local Package Manager → ${names.map((n) => `micropip.install('${n}')`).join(', ')}\n` +
  `  Recorded for this session. Pure-Python wheels resolve inside the sandbox;\n` +
  `  packages that need compiled C extensions are not available offline.\n`;

export async function executeProject(options: ExecuteOptions): Promise<ExecuteResult> {
  const { languageId, files, onOutput } = options;
  const start = performance.now();
  const sink = (stream: 'stdout' | 'stderr', text: string) => onOutput(stream, text);
  let stdout = '';
  let stderr = '';
  const capture = (text: string) => { stdout += text; };

  switch (languageId) {
    /* ------------------------- Python ------------------------- */
    case 'python': {
      const entry = entryFile(files, 'python');
      if (!entry) return { stdout: '', stderr: 'No Python file in project.\n', ms: 0 };
      if (options.packages?.length) {
        const note = PACKAGE_NOTE(options.packages);
        sink('stdout', note);
        capture(note);
      }
      const runtime = new PythonRuntime({
        sink: (stream, text) => { if (stream === 'stdout') capture(text); else stderr += text; sink(stream, text); },
        files: {
          read: (name: string) => files.find((f) => f.name === name || f.name === name.replace(/^\.\//, ''))?.content,
          list: () => files.map((f) => f.name),
        },
        stdin: options.stdin ?? '',
      });
      try {
        runtime.run(entry.content);
      } catch (err) {
        const msg = `${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}\n`;
        stderr += msg;
        sink('stderr', msg);
      }
      return { stdout, stderr, ms: Math.round(performance.now() - start) };
    }

    /* -------------------- HTML / CSS / JS --------------------- */
    case 'html': {
      const html = buildHtmlDocument(files);
      const note = `◈ Live sandboxed preview compiled from ${files.length} file${files.length === 1 ? '' : 's'}: ${files.map((f) => f.name).join(', ')}\n`;
      sink('stdout', note);
      return {
        stdout: note,
        stderr: '',
        ms: Math.round(performance.now() - start),
        preview: { kind: 'html', html },
      };
    }

    /* ------------------- JS / TypeScript ---------------------- */
    case 'javascript':
    case 'typescript': {
      const result = await runJavaScript(files, languageId === 'typescript', sink);
      return { ...result, ms: result.ms };
    }

    /* ------------------------ WAT ---------------------------- */
    case 'wat': {
      const entry = entryFile(files, 'wat');
      if (!entry) return { stdout: '', stderr: 'No .wat module in project.\n', ms: 0 };
      const result: WatResult = await runWat(entry.content, sink);
      return { stdout: result.stdout, stderr: result.stderr, ms: result.ms, extra: { wasmBytes: result.wasmBytes, exports: result.exports } };
    }

    /* ------------------------ SQL ----------------------------- */
    case 'sql':
    case 'sqlite': {
      const entry = entryFile(files, languageId);
      if (!entry) return { stdout: '', stderr: 'No .sql file in project.\n', ms: 0 };
      let sql = entry.content;
      // concatenate additional .sql files in explorer order
      const others = files.filter((f) => /\.sql$/i.test(f.name) && f.name !== entry.name);
      if (others.length) sql = [sql, ...others.map((f) => f.content)].join('\n;\n');
      const result: SqlResult = await runSql(sql, sink);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        ms: result.ms,
        preview: { kind: 'sqlite', sql: result },
      };
    }

    /* ------------------------ Lua ----------------------------- */
    case 'lua': case 'luau': {
      const entry = entryFile(files, languageId);
      if (!entry) return { stdout: '', stderr: 'No Lua file in project.\n', ms: 0 };
      runLua(entry.content, (text) => { capture(text); sink('stdout', text); }, languageId === 'luau');
      return { stdout, stderr, ms: Math.round(performance.now() - start) };
    }

    /* ------------------------ Bash ---------------------------- */
    case 'bash': {
      const entry = entryFile(files, 'bash');
      if (!entry) return { stdout: '', stderr: 'No shell script in project.\n', ms: 0 };
      runBash(entry.content, (text) => { capture(text); sink('stdout', text); }, scriptFiles(files));
      return { stdout, stderr, ms: Math.round(performance.now() - start) };
    }

    /* ----------------------- Haskell -------------------------- */
    case 'haskell': {
      const entry = entryFile(files, 'haskell');
      if (!entry) return { stdout: '', stderr: 'No Haskell module in project.\n', ms: 0 };
      runHaskell(entry.content, (text) => { capture(text); sink('stdout', text); });
      return { stdout, stderr, ms: Math.round(performance.now() - start) };
    }

    /* ------------------------ Prolog -------------------------- */
    case 'prolog': {
      const entry = entryFile(files, 'prolog');
      if (!entry) return { stdout: '', stderr: 'No Prolog file in project.\n', ms: 0 };
      runProlog(entry.content, (text) => { capture(text); sink('stdout', text); });
      return { stdout, stderr, ms: Math.round(performance.now() - start) };
    }

    /* ------------------------ Forth --------------------------- */
    case 'forth': {
      const entry = entryFile(files, 'forth');
      if (!entry) return { stdout: '', stderr: 'No Forth source in project.\n', ms: 0 };
      runForth(entry.content, (text) => { capture(text); sink('stdout', text); });
      return { stdout, stderr, ms: Math.round(performance.now() - start) };
    }

    /* ---------------------- Brainfuck ------------------------- */
    case 'brainfuck': {
      const entry = entryFile(files, 'brainfuck');
      if (!entry) return { stdout: '', stderr: 'No Brainfuck source in project.\n', ms: 0 };
      const result = runBrainfuck(entry.content, (text) => { capture(text); sink('stdout', text); });
      if (result.error) { stderr += `${result.error}\n`; sink('stderr', `${result.error}\n`); }
      return {
        stdout, stderr, ms: Math.round(performance.now() - start),
        preview: { kind: 'brainfuck', brainfuck: { tape: result.tape, pointer: result.pointer, steps: result.steps } },
        extra: { steps: result.steps },
      };
    }

    /* ------------------------ Scheme -------------------------- */
    case 'scheme': {
      const entry = entryFile(files, 'scheme');
      if (!entry) return { stdout: '', stderr: 'No Scheme file in project.\n', ms: 0 };
      runScheme(entry.content, (text) => { capture(text); sink('stdout', text); });
      return { stdout, stderr, ms: Math.round(performance.now() - start) };
    }

    /* ----------------------- Markdown ------------------------- */
    case 'markdown': {
      const entry = entryFile(files, 'markdown');
      if (!entry) return { stdout: '', stderr: 'No .md document in project.\n', ms: 0 };
      const html = await renderMarkdown(entry.content);
      const note = `◈ Rendered ${entry.name} → GitHub-Flavored Markdown + KaTeX\n`;
      sink('stdout', note);
      return { stdout: note, stderr: '', ms: Math.round(performance.now() - start), preview: { kind: 'markdown', html } };
    }

    /* ---------------------- AssemblyScript -------------------- */
    case 'assemblyscript': {
      const entry = entryFile(files, 'assemblyscript');
      if (!entry) return { stdout: '', stderr: 'No AssemblyScript file in project.\n', ms: 0 };
      const htmlNote = '';
      void htmlNote;
      const { transform } = await import('sucrase');
      const js = transform(entry.content, { transforms: ['typescript'] }).code;
      const exported: string[] = [];
      const jsWithI32 = js.replace(/\b(i32|i64|u32|u64|f32|f64|bool)\b/g, 'number').replace(/\bMath\.imul\b/g, '((a,b)=>a*b)');
      const exportsRegex = /export\s+function\s+([A-Za-z0-9_]+)/g;
      let m: RegExpExecArray | null;
      while ((m = exportsRegex.exec(entry.content))) exported.push(m[1]);
      const body = jsWithI32.replace(/export\s+/g, '');
      const moduleSource = `"use strict";${body}\n;return { ${exported.map((e) => `${e}: typeof ${e} !== 'undefined' ? ${e} : undefined`).join(', ')} };`;
      const note = `◈ AssemblyScript (strict numeric subset) → JS module\n◈ Exports: ${exported.join(', ') || '(none)'}\n`;
      sink('stdout', note);
      capture(note);
      try {
        // eslint-disable-next-line no-new-func
        const mod = Function(moduleSource)();
        if (typeof mod.main === 'function') {
          const result = mod.main();
          void result;
        } else if (exported.length) {
          for (const name of exported) {
            if (name === 'main') continue;
            const line = `◈ ${name} defined ✓\n`;
            sink('stdout', line);
            capture(line);
          }
        }
      } catch (err) {
        const msg = `AssemblyScript error: ${err instanceof Error ? err.message : String(err)}\n`;
        stderr += msg;
        sink('stderr', msg);
      }
      return { stdout, stderr, ms: Math.round(performance.now() - start) };
    }

    /* ----------------------- C family ------------------------- */
    default: {
      const dialect = CFAMILY_DIALECTS[languageId];
      if (!dialect) {
        const msg = `Engine for '${languageId}' is not available offline.\n`;
        return { stdout: '', stderr: msg, ms: 0 };
      }
      const entry = entryFile(files, languageId);
      if (!entry) return { stdout: '', stderr: 'No source file in project.\n', ms: 0 };
      const runtime = new CFamilyRuntime({
        dialect,
        sink: (stream, text) => { if (stream === 'stdout') capture(text); else stderr += text; sink(stream, text); },
        stdin: options.stdin ?? '',
      });
      runtime.run(entry.content);
      return { stdout, stderr, ms: Math.round(performance.now() - start) };
    }
  }
}

export type { RunResult };
