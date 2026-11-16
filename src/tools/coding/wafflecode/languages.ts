export interface ProjectFile {
  name: string;
  content: string;
}

export type SyntaxGroup =
  | 'python'
  | 'html'
  | 'css'
  | 'javascript'
  | 'typescript'
  | 'cpp'
  | 'java'
  | 'rust'
  | 'sql'
  | 'php'
  | 'markdown'
  | 'wat'
  | 'plain';

export interface LanguageSpec {
  id: string;
  number: number;
  name: string;
  badge: string;
  runtimeLabel: string;
  defaultExt: string;
  syntax: SyntaxGroup;
  supportsPreview?: 'iframe' | 'markdown' | 'sqlite' | 'brainfuck';
  supportsPackages?: 'python' | 'esm';
  starterFiles: ProjectFile[];
}

/**
 * All 32 Supported Languages in WaffleCode (100% Local Browser WASM / JS Runtimes)
 */
export const WAFFLECODE_LANGUAGES: LanguageSpec[] = [
  {
    id: 'python',
    number: 1,
    name: 'Python',
    badge: 'PY',
    runtimeLabel: 'Pyodide WASM + micropip / Local Python Engine',
    defaultExt: '.py',
    syntax: 'python',
    supportsPackages: 'python',
    starterFiles: [
      {
        name: 'main.py',
        content: `# Python 3 — Local Browser Runtime
import math

def fibonacci(n):
    seq = [0, 1]
    for i in range(2, n):
        seq.append(seq[i - 1] + seq[i - 2])
    return seq[:n]

nums = fibonacci(12)
print("First 12 Fibonacci numbers:", nums)
print("Sum:", sum(nums))

squares = [x * x for x in range(1, 9)]
print("Squares 1..8:", squares)
print("Golden ratio approx:", round(nums[11] / nums[10], 6))
print("Circle area (r=5):", round(math.pi * 25, 4))
`,
      },
    ],
  },
  {
    id: 'html',
    number: 2,
    name: 'HTML / CSS / JS (3-in-1)',
    badge: 'WEB',
    runtimeLabel: 'Live Sandboxed Iframe + Console Interceptor',
    defaultExt: '.html',
    syntax: 'html',
    supportsPreview: 'iframe',
    starterFiles: [
      {
        name: 'index.html',
        content: `<div class="card">
  <h2>Live 3-in-1 Sandbox</h2>
  <p>Edit <code>index.html</code>, <code>style.css</code>, and <code>script.js</code>!</p>
  <button id="counterBtn">Clicked 0 times</button>
</div>
`,
      },
      {
        name: 'style.css',
        content: `body {
  font-family: system-ui, sans-serif;
  background: #FFF8EB;
  color: #3B2314;
  display: grid;
  place-items: center;
  min-height: 90vh;
  margin: 0;
}
.card {
  background: #FFFFFF;
  border: 2px solid #D97706;
  border-bottom-width: 6px;
  border-radius: 18px;
  padding: 24px 28px;
  text-align: center;
  box-shadow: 0 10px 24px rgba(120, 53, 15, 0.12);
}
button {
  margin-top: 10px;
  padding: 10px 20px;
  border-radius: 12px;
  border: 2px solid #166534;
  border-bottom-width: 5px;
  background: #22C55E;
  color: white;
  font-weight: 700;
  cursor: pointer;
}
button:active { transform: translateY(2px); }
`,
      },
      {
        name: 'script.js',
        content: `let count = 0;
const btn = document.getElementById('counterBtn');
console.log('3-in-1 preview booted successfully!');

btn.addEventListener('click', () => {
  count += 1;
  btn.textContent = \`Clicked \${count} \${count === 1 ? 'time' : 'times'}\`;
  console.log('Button clicked -> count =', count);
});
`,
      },
    ],
  },
  {
    id: 'javascript',
    number: 3,
    name: 'Node.js / JavaScript',
    badge: 'JS',
    runtimeLabel: 'Sandboxed Web Worker ES2024 + Virtual fs/path',
    defaultExt: '.js',
    syntax: 'javascript',
    supportsPackages: 'esm',
    starterFiles: [
      {
        name: 'index.js',
        content: `// Node.js / ES2024 Web Worker with virtual fs & path shims
const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync('data.json', 'utf8');
const items = JSON.parse(raw);

console.log('Loaded', items.length, 'records from', path.resolve('/project', 'data.json'));
const total = items.reduce((sum, item) => sum + item.score, 0);
console.log('Average score:', (total / items.length).toFixed(2));
console.log('Files in workspace:', fs.readdirSync('.'));
`,
      },
      {
        name: 'data.json',
        content: `[
  { "name": "Ada", "score": 98 },
  { "name": "Alan", "score": 95 },
  { "name": "Grace", "score": 99 }
]
`,
      },
    ],
  },
  {
    id: 'typescript',
    number: 4,
    name: 'TypeScript',
    badge: 'TS',
    runtimeLabel: 'In-Browser Sucrase TypeScript Transpiler + Worker',
    defaultExt: '.ts',
    syntax: 'typescript',
    supportsPackages: 'esm',
    starterFiles: [
      {
        name: 'main.ts',
        content: `// TypeScript — Instant Local Transpilation & Execution
interface Vector2D {
  x: number;
  y: number;
}

function magnitude(v: Vector2D): number {
  return Math.hypot(v.x, v.y);
}

function normalize(v: Vector2D): Vector2D {
  const len = magnitude(v) || 1;
  return { x: Number((v.x / len).toFixed(4)), y: Number((v.y / len).toFixed(4)) };
}

const points: Vector2D[] = [
  { x: 3, y: 4 },
  { x: 5, y: 12 },
  { x: 8, y: 15 },
];

for (const p of points) {
  console.log(\`vec(\${p.x}, \${p.y}) -> |v| = \${magnitude(p)}, unit =\`, normalize(p));
}
`,
      },
    ],
  },
  {
    id: 'c',
    number: 5,
    name: 'C',
    badge: 'C',
    runtimeLabel: 'Local Browser C17 Sandbox Interpreter',
    defaultExt: '.c',
    syntax: 'cpp',
    starterFiles: [
      {
        name: 'main.c',
        content: `#include <stdio.h>
#include <math.h>

int gcd(int a, int b) {
    while (b != 0) {
        int t = a % b;
        a = b;
        b = t;
    }
    return a;
}

int main() {
    printf("C17 Local Browser Runtime\\n");
    for (int i = 1; i <= 6; i++) {
        printf("  %d^2 = %d, gcd(%d, 12) = %d\\n", i, i * i, i, gcd(i, 12));
    }
    printf("Hypotenuse(3, 4) = %.2f\\n", sqrt(3.0 * 3.0 + 4.0 * 4.0));
    return 0;
}
`,
      },
    ],
  },
  {
    id: 'cpp',
    number: 6,
    name: 'C++',
    badge: 'C++',
    runtimeLabel: 'Local Browser C++20 Sandbox Runtime',
    defaultExt: '.cpp',
    syntax: 'cpp',
    starterFiles: [
      {
        name: 'main.cpp',
        content: `#include <iostream>
#include <vector>
#include <cmath>

int factorial(int n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
}

int main() {
    std::cout << "C++20 Browser Sandbox" << std::endl;
    std::vector<int> primes = {2, 3, 5, 7, 11, 13};
    int sum = 0;
    for (int p : primes) {
        sum += p;
    }
    std::cout << "Sum of first 6 primes: " << sum << std::endl;
    std::cout << "7! = " << factorial(7) << std::endl;
    return 0;
}
`,
      },
    ],
  },
  {
    id: 'csharp',
    number: 7,
    name: 'C#',
    badge: 'C#',
    runtimeLabel: 'Local Browser C# / .NET Sandbox Runtime',
    defaultExt: '.cs',
    syntax: 'java',
    starterFiles: [
      {
        name: 'Program.cs',
        content: `using System;

class Program {
    static bool IsPrime(int n) {
        if (n < 2) return false;
        for (int d = 2; d * d <= n; d++) {
            if (n % d == 0) return false;
        }
        return true;
    }

    static void Main() {
        Console.WriteLine("C# Local Runtime Ready!");
        for (int n = 2; n <= 25; n++) {
            if (IsPrime(n)) {
                Console.WriteLine($"Prime found: {n}");
            }
        }
    }
}
`,
      },
    ],
  },
  {
    id: 'lua',
    number: 8,
    name: 'Lua',
    badge: 'LUA',
    runtimeLabel: 'Lua 5.4 Local VM + Wasmoon WASM',
    defaultExt: '.lua',
    syntax: 'plain',
    starterFiles: [
      {
        name: 'main.lua',
        content: `-- Lua 5.4 Local VM
local function fib(n)
  if n <= 1 then
    return n
  end
  return fib(n - 1) + fib(n - 2)
end

local results = {}
for i = 0, 10 do
  table.insert(results, fib(i))
end

print("Lua 5.4 Fibonacci:", table.concat(results, ", "))
print("Length of table:", #results)
print(string.format("Pi rounded = %.5f", math.pi))
`,
      },
    ],
  },
  {
    id: 'luau',
    number: 9,
    name: 'Luau',
    badge: 'LUAU',
    runtimeLabel: 'Roblox Luau VM (--!strict Type Checker)',
    defaultExt: '.luau',
    syntax: 'plain',
    starterFiles: [
      {
        name: 'main.luau',
        content: `--!strict
-- Luau with strict type annotations enabled!
local function computeDamage(base: number, critMultiplier: number, isCrit: boolean): number
  if isCrit then
    return base * critMultiplier
  end
  return base
end

local basePower: number = 45
local multiplier: number = 2.5
local normalHit: number = computeDamage(basePower, multiplier, false)
local critHit: number = computeDamage(basePower, multiplier, true)

print("Luau --!strict check passed!")
print("Normal hit:", normalHit)
print("Critical hit:", critHit)
`,
      },
    ],
  },
  {
    id: 'ruby',
    number: 10,
    name: 'Ruby',
    badge: 'RB',
    runtimeLabel: 'CRuby WASM / Local Ruby Sandbox',
    defaultExt: '.rb',
    syntax: 'python',
    starterFiles: [
      {
        name: 'main.rb',
        content: `# Ruby Local Runtime
def collatz_steps(n)
  steps = 0
  cur = n
  while cur > 1
    if cur % 2 == 0
      cur = cur / 2
    else
      cur = 3 * cur + 1
    end
    steps = steps + 1
  end
  return steps
end

puts "Ruby Collatz Stopping Times:"
[6, 11, 19, 27].each do |num|
  puts "  n = #{num} -> #{collatz_steps(num)} steps"
end
`,
      },
    ],
  },
  {
    id: 'haskell',
    number: 11,
    name: 'Haskell',
    badge: 'HS',
    runtimeLabel: 'Local Pure Functional Haskell Interpreter',
    defaultExt: '.hs',
    syntax: 'plain',
    starterFiles: [
      {
        name: 'Main.hs',
        content: `-- Haskell Functional Evaluator
factorial 0 = 1
factorial n = n * factorial (n - 1)

square x = x * x

evens = filter even [1..16]
squares = map square [1..8]

main = do
  putStrLn "Haskell Functional Runtime"
  print (factorial 10)
  print squares
  print evens
  print (sum squares)
`,
      },
    ],
  },
  {
    id: 'php',
    number: 12,
    name: 'PHP',
    badge: 'PHP',
    runtimeLabel: 'php-wasm / Local PHP 8.3 Sandbox',
    defaultExt: '.php',
    syntax: 'php',
    starterFiles: [
      {
        name: 'index.php',
        content: `<?php
function formatPrice($cents) {
    return "$" . number_format($cents / 100, 2);
}

$prices = [1250, 2999, 450, 1895];
$total = 0;

foreach ($prices as $p) {
    $total += $p;
    echo "Item: " . formatPrice($p) . "\\n";
}

echo "Total (" . count($prices) . " items): " . formatPrice($total) . "\\n";
?>
`,
      },
    ],
  },
  {
    id: 'sql',
    number: 13,
    name: 'SQL',
    badge: 'SQL',
    runtimeLabel: 'ANSI SQL WebAssembly Query Engine (sql.js)',
    defaultExt: '.sql',
    syntax: 'sql',
    supportsPreview: 'sqlite',
    starterFiles: [
      {
        name: 'query.sql',
        content: `-- Standard ANSI SQL Query Sandbox (100% Local WASM)
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  dept_id INTEGER REFERENCES departments(id),
  salary INTEGER NOT NULL
);

INSERT INTO departments VALUES (1, 'Engineering'), (2, 'Design'), (3, 'Research');
INSERT INTO employees VALUES
  (1, 'Linnea', 1, 138000),
  (2, 'Mateo', 1, 126000),
  (3, 'Sora', 2, 118000),
  (4, 'Amira', 3, 145000),
  (5, 'Devon', 2, 112000);

SELECT
  d.name AS department,
  COUNT(e.id) AS headcount,
  ROUND(AVG(e.salary), 0) AS avg_salary,
  MAX(e.salary) AS top_salary
FROM departments d
JOIN employees e ON e.dept_id = d.id
GROUP BY d.id
ORDER BY avg_salary DESC;
`,
      },
    ],
  },
  {
    id: 'sqlite',
    number: 14,
    name: 'SQLite',
    badge: 'DB',
    runtimeLabel: 'sql.js Full In-Memory SQLite 3 WASM + Schema Viewer',
    defaultExt: '.sql',
    syntax: 'sql',
    supportsPreview: 'sqlite',
    starterFiles: [
      {
        name: 'schema.sql',
        content: `-- SQLite 3 In-Memory Relational Engine + Schema Inspector
CREATE TABLE books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  year INTEGER NOT NULL,
  rating REAL NOT NULL
);

CREATE INDEX idx_books_year ON books(year);

INSERT INTO books (title, author, year, rating) VALUES
  ('Structure and Interpretation of Computer Programs', 'Abelson & Sussman', 1985, 4.9),
  ('The Art of Computer Programming', 'Donald Knuth', 1968, 4.8),
  ('Designing Data-Intensive Applications', 'Martin Kleppmann', 2017, 4.9),
  ('Introduction to Algorithms', 'CLRS', 1990, 4.7);

SELECT sqlite_version() AS sqlite_wasm_version;
SELECT id, title, author, year, rating FROM books ORDER BY rating DESC, year ASC;
`,
      },
    ],
  },
  {
    id: 'java',
    number: 15,
    name: 'Java',
    badge: 'JAVA',
    runtimeLabel: 'Local Browser Java 21 Sandbox Runtime',
    defaultExt: '.java',
    syntax: 'java',
    starterFiles: [
      {
        name: 'Main.java',
        content: `public class Main {
    static int binarySearch(int[] arr, int target) {
        int lo = 0;
        int hi = arr.length - 1;
        while (lo <= hi) {
            int mid = (lo + hi) >> 1;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }

    public static void main(String[] args) {
        int[] sorted = {3, 8, 15, 23, 42, 56, 77, 91};
        System.out.println("Java 21 Local Runtime");
        System.out.println("Index of 42: " + binarySearch(sorted, 42));
        System.out.println("Index of 91: " + binarySearch(sorted, 91));
    }
}
`,
      },
    ],
  },
  {
    id: 'kotlin',
    number: 16,
    name: 'Kotlin',
    badge: 'KT',
    runtimeLabel: 'Local Browser Kotlin Sandbox Compiler',
    defaultExt: '.kt',
    syntax: 'java',
    starterFiles: [
      {
        name: 'Main.kt',
        content: `fun fizzBuzz(n: Int): String {
    if (n % 15 == 0) return "FizzBuzz"
    if (n % 3 == 0) return "Fizz"
    if (n % 5 == 0) return "Buzz"
    return "" + n
}

fun main() {
    println("Kotlin Local Runtime:")
    var out = ""
    for (i in 1..15) {
        out = out + fizzBuzz(i) + (if (i < 15) ", " else "")
    }
    println(out)
}
`,
      },
    ],
  },
  {
    id: 'rust',
    number: 17,
    name: 'Rust',
    badge: 'RS',
    runtimeLabel: 'Local Browser Rust Sandbox Interpreter',
    defaultExt: '.rs',
    syntax: 'rust',
    starterFiles: [
      {
        name: 'main.rs',
        content: `fn sum_of_squares(limit: i64) -> i64 {
    let mut acc = 0;
    for n in 1..=limit {
        acc += n * n;
    }
    return acc;
}

fn main() {
    let values = vec![10, 20, 30, 40, 50];
    let mut total = 0;
    for v in values {
        total += v;
    }
    println!("Rust Local Sandbox Ready!");
    println!("Vector sum = {}", total);
    println!("Sum of squares 1..=10 = {}", sum_of_squares(10));
}
`,
      },
    ],
  },
  {
    id: 'go',
    number: 18,
    name: 'Go',
    badge: 'GO',
    runtimeLabel: 'Yaegi / Local Go 1.23 Sandbox Interpreter',
    defaultExt: '.go',
    syntax: 'cpp',
    starterFiles: [
      {
        name: 'main.go',
        content: `package main

import "fmt"

func tribonacci(n int) int {
    if n == 0 { return 0 }
    if n <= 2 { return 1 }
    a, b, c := 0, 1, 1
    for i := 3; i <= n; i++ {
        next := a + b + c
        a = b
        b = c
        c = next
    }
    return c
}

func main() {
    fmt.Println("Go Local Runtime — Tribonacci Sequence:")
    for i := 0; i <= 10; i++ {
        fmt.Printf("T(%d) = %d\\n", i, tribonacci(i))
    }
}
`,
      },
    ],
  },
  {
    id: 'swift',
    number: 19,
    name: 'Swift',
    badge: 'SWIFT',
    runtimeLabel: 'SwiftWasm / Local Swift Sandbox Runtime',
    defaultExt: '.swift',
    syntax: 'cpp',
    starterFiles: [
      {
        name: 'main.swift',
        content: `func celsiusToFahrenheit(c: Double) -> Double {
    return c * 9.0 / 5.0 + 32.0
}

let samples = [0.0, 20.0, 37.0, 100.0]
print("Swift Temperature Table:")
for temp in samples {
    let f = celsiusToFahrenheit(c: temp)
    print("  \\(temp) °C = \\(f) °F")
}
`,
      },
    ],
  },
  {
    id: 'dart',
    number: 20,
    name: 'Dart',
    badge: 'DART',
    runtimeLabel: 'Local Browser Dart Compiler + Runner',
    defaultExt: '.dart',
    syntax: 'java',
    starterFiles: [
      {
        name: 'main.dart',
        content: `int digitalRoot(int n) {
  while (n >= 10) {
    int sum = 0;
    int temp = n;
    while (temp > 0) {
      sum += temp % 10;
      temp = (temp / 10).floor();
    }
    n = sum;
  }
  return n;
}

void main() {
  print('Dart Local Runtime');
  final nums = [38, 493, 9875, 123456];
  for (final x in nums) {
    print('digitalRoot($x) = \${digitalRoot(x)}');
  }
}
`,
      },
    ],
  },
  {
    id: 'r',
    number: 21,
    name: 'R',
    badge: 'R',
    runtimeLabel: 'webR / Local Statistical R Vector Engine',
    defaultExt: '.R',
    syntax: 'python',
    starterFiles: [
      {
        name: 'analysis.R',
        content: `# R Statistical Vector Environment
scores <- c(74, 88, 92, 81, 95, 69, 84, 90, 87, 93)

cat("Sample size (n):", length(scores), "\\n")
cat("Mean:", mean(scores), "\\n")
cat("Median:", median(scores), "\\n")
cat("Std Dev (sd):", round(sd(scores), 4), "\\n")
cat("Min / Max:", min(scores), "/", max(scores), "\\n")

z_scores <- round((scores - mean(scores)) / sd(scores), 2)
print(z_scores)
`,
      },
    ],
  },
  {
    id: 'perl',
    number: 22,
    name: 'Perl',
    badge: 'PL',
    runtimeLabel: 'WebPerl / Local Perl 5 Sandbox',
    defaultExt: '.pl',
    syntax: 'php',
    starterFiles: [
      {
        name: 'script.pl',
        content: `# Perl 5 Local Runtime
use strict;
use warnings;

sub is_palindrome {
    my ($word) = @_;
    my $rev = reverse($word);
    return $word eq $rev;
}

my @words = ("radar", "level", "algorithm", "civic", "kayak");
foreach my $w (@words) {
    my $status = is_palindrome($w) ? "PALINDROME" : "not palindrome";
    print "$w -> $status\\n";
}
`,
      },
    ],
  },
  {
    id: 'bash',
    number: 23,
    name: 'Bash / Shell',
    badge: 'SH',
    runtimeLabel: 'Local POSIX Shell + Pipes (grep, sort, uniq, wc)',
    defaultExt: '.sh',
    syntax: 'plain',
    starterFiles: [
      {
        name: 'script.sh',
        content: `#!/bin/sh
# POSIX Shell Interpreter with Virtual Files & Pipelines
GREETING="Local POSIX Shell"
echo "=== $GREETING ==="
echo "Workspace files: $(ls)"

echo "Unique sorted lines in fruits.txt:"
cat fruits.txt | sort | uniq

COUNT=$(cat fruits.txt | wc -l)
echo "Total raw lines: $COUNT"

SUM=0
for i in 1 2 3 4 5; do
  SUM=$((SUM + i * i))
done
echo "Sum of squares 1..5 = $SUM"
`,
      },
      {
        name: 'fruits.txt',
        content: `mango
apple
pear
apple
cherry
mango
`,
      },
    ],
  },
  {
    id: 'julia',
    number: 24,
    name: 'Julia',
    badge: 'JL',
    runtimeLabel: 'Local Julia Numerical Kernel',
    defaultExt: '.jl',
    syntax: 'python',
    starterFiles: [
      {
        name: 'main.jl',
        content: `# Julia Numerical Sandbox
function harmonic(n)
    total = 0.0
    for k in 1:n
        total += 1.0 / k
    end
    return total
end

println("Julia Harmonic Series H(n):")
for n in [1, 5, 10, 50, 100]
    println("  H(", n, ") = ", round(harmonic(n), digits=6))
end
`,
      },
    ],
  },
  {
    id: 'zig',
    number: 25,
    name: 'Zig',
    badge: 'ZIG',
    runtimeLabel: 'Local Browser Zig Sandbox Runner',
    defaultExt: '.zig',
    syntax: 'rust',
    starterFiles: [
      {
        name: 'main.zig',
        content: `const std = @import("std");

fn popcount(x: u32) u32 {
    var n = x;
    var count: u32 = 0;
    while (n > 0) {
        count += n & 1;
        n = n >> 1;
    }
    return count;
}

pub fn main() void {
    std.debug.print("Zig Local Runtime\\n", .{});
    const samples = [_]u32{ 7, 42, 255, 1023 };
    for (samples) |val| {
        std.debug.print("  popcount({d}) = {d} set bits\\n", .{ val, popcount(val) });
    }
}
`,
      },
    ],
  },
  {
    id: 'assemblyscript',
    number: 26,
    name: 'AssemblyScript',
    badge: 'AS',
    runtimeLabel: 'Browser AssemblyScript-to-WASM Runner',
    defaultExt: '.as.ts',
    syntax: 'typescript',
    starterFiles: [
      {
        name: 'module.ts',
        content: `// AssemblyScript — Strict Numeric WebAssembly Functions
export function add(a: i32, b: i32): i32 {
  return (a + b) | 0;
}

export function fastPow(base: i32, exp: i32): i32 {
  let result: i32 = 1;
  let b: i32 = base;
  let e: i32 = exp;
  while (e > 0) {
    if ((e & 1) === 1) result = Math.imul(result, b);
    b = Math.imul(b, b);
    e >>= 1;
  }
  return result;
}

export function main(): void {
  console.log("add(19, 23) =", add(19, 23));
  console.log("fastPow(3, 9) =", fastPow(3, 9));
  console.log("clz32(16) =", clz(16));
}
`,
      },
    ],
  },
  {
    id: 'wat',
    number: 27,
    name: 'WebAssembly Text (WAT)',
    badge: 'WAT',
    runtimeLabel: 'wabt.js Real WAT Assembler + Native WebAssembly VM',
    defaultExt: '.wat',
    syntax: 'wat',
    starterFiles: [
      {
        name: 'module.wat',
        content: `;; Genuine WebAssembly Text -> Binary WASM compiled via wabt.js!
(module
  (import "env" "print_i32" (func $print (param i32)))

  ;; Recursive factorial in pure WebAssembly
  (func $fact (export "fact") (param $n i32) (result i32)
    (if (result i32) (i32.le_s (local.get $n) (i32.const 1))
      (then (i32.const 1))
      (else
        (i32.mul
          (local.get $n)
          (call $fact (i32.sub (local.get $n) (i32.const 1)))))))

  ;; Entry point executed automatically on Run
  (func (export "main") (result i32)
    (call $print (call $fact (i32.const 5)))
    (call $print (call $fact (i32.const 8)))
    (call $fact (i32.const 10)))
)
`,
      },
    ],
  },
  {
    id: 'scheme',
    number: 28,
    name: 'Scheme / Lisp',
    badge: 'SCM',
    runtimeLabel: 'R7RS Scheme Lexical-Closure Interpreter',
    defaultExt: '.scm',
    syntax: 'plain',
    starterFiles: [
      {
        name: 'main.scm',
        content: `; R7RS Scheme / Lisp Interpreter
(define (fact n)
  (if (<= n 1)
      1
      (* n (fact (- n 1)))))

(define (range a b)
  (if (> a b)
      '()
      (cons a (range (+ a 1) b))))

(display "Scheme R7RS Runtime") (newline)
(display "10! = ") (display (fact 10)) (newline)
(display "Cubes 1..7 = ")
(display (map (lambda (x) (* x x x)) (range 1 7)))
(newline)
`,
      },
    ],
  },
  {
    id: 'prolog',
    number: 29,
    name: 'Prolog',
    badge: 'PRO',
    runtimeLabel: 'Unification & Backtracking Logic Engine',
    defaultExt: '.pl',
    syntax: 'plain',
    starterFiles: [
      {
        name: 'knowledge.pl',
        content: `% Prolog Horn-Clause Unification & Backtracking Engine
parent(ada, charles).
parent(ada, elena).
parent(charles, leo).
parent(charles, maya).
parent(elena, noah).

grandparent(X, Z) :- parent(X, Y), parent(Y, Z).

ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).

% Queries evaluated automatically:
?- grandparent(ada, Who).
?- ancestor(X, maya).
`,
      },
    ],
  },
  {
    id: 'forth',
    number: 30,
    name: 'Forth',
    badge: '4TH',
    runtimeLabel: 'WAForth-Compatible Stack VM',
    defaultExt: '.fs',
    syntax: 'plain',
    starterFiles: [
      {
        name: 'main.fs',
        content: `\\ Forth Stack-Based Virtual Machine
: SQUARE ( n -- n^2 ) DUP * ;
: CUBE   ( n -- n^3 ) DUP SQUARE * ;

: PRINT-SQUARES ( limit -- )
  1 + 1 DO
    I . ." ^2 = " I SQUARE . CR
  LOOP ;

." Forth Stack VM Online!" CR
6 PRINT-SQUARES
." 5 cubed = " 5 CUBE . CR
10 20 30 + *
`,
      },
    ],
  },
  {
    id: 'brainfuck',
    number: 31,
    name: 'Brainfuck',
    badge: 'BF',
    runtimeLabel: 'Optimizing JIT VM + Live Interactive Memory Tape',
    defaultExt: '.bf',
    syntax: 'plain',
    supportsPreview: 'brainfuck',
    starterFiles: [
      {
        name: 'hello.bf',
        content: `[ Prints "Hello World!" and leaves inspectable cells on the Memory Tape ]
++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]
>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.
`,
      },
    ],
  },
  {
    id: 'markdown',
    number: 32,
    name: 'Markdown + LaTeX Math',
    badge: 'MD+TeX',
    runtimeLabel: 'GitHub-Flavored Markdown (marked) + KaTeX Engine',
    defaultExt: '.md',
    syntax: 'markdown',
    supportsPreview: 'markdown',
    starterFiles: [
      {
        name: 'document.md',
        content: `# Scientific Notebook (GFM + KaTeX)

Write standard **GitHub-Flavored Markdown** alongside inline math like Euler's identity $e^{i\\pi} + 1 = 0$ and the quadratic formula:

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

## Gaussian Integral & Maxwell-Faraday Law

$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi} \\qquad \\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$

| Constant | Symbol | Approximate Value |
| :--- | :---: | ---: |
| Speed of light | $c$ | $2.9979 \\times 10^8\\text{ m/s}$ |
| Planck constant | $h$ | $6.6261 \\times 10^{-34}\\text{ J}\\cdot\\text{s}$ |
| Golden ratio | $\\varphi$ | $1.6180339887$ |
`,
      },
    ],
  },
];
