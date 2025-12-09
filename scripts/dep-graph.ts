#!/usr/bin/env bun
import ts from "typescript"
import path from "node:path"
import fs from "node:fs"

const rootDir = path.join(import.meta.dir, "..")

interface ModuleInfo {
  format: "esm" | "cjs" | "mixed"
  dependencies: string[]
}

interface DependencyGraph {
  entryPoint: string
  modules: Record<string, ModuleInfo>
  circular: string[][]
  order: string[]
}

function loadTsConfig(): ts.CompilerOptions {
  const configPath = path.join(rootDir, "tsconfig.json")
  if (!fs.existsSync(configPath)) {
    return { moduleResolution: ts.ModuleResolutionKind.Bundler }
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) {
    console.error("Error reading tsconfig.json:", configFile.error.messageText)
    return { moduleResolution: ts.ModuleResolutionKind.Bundler }
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    rootDir,
  )
  return parsed.options
}

function isLocalImport(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../")
}

function detectFormat(content: string): "esm" | "cjs" | "mixed" {
  const hasEsm = /\b(import|export)\s/.test(content)
  const hasCjs = /\b(require\s*\(|module\.exports|exports\.)/.test(content)

  if (hasEsm && hasCjs) return "mixed"
  if (hasEsm) return "esm"
  return "cjs"
}

function extractImports(content: string): string[] {
  const info = ts.preProcessFile(content, true, true)
  return info.importedFiles.map((f) => f.fileName).filter(isLocalImport)
}

function resolveImport(
  fromFile: string,
  specifier: string,
  compilerOptions: ts.CompilerOptions,
): string | null {
  const fromDir = path.dirname(path.join(rootDir, fromFile))

  const resolved = ts.resolveModuleName(
    specifier,
    path.join(rootDir, fromFile),
    compilerOptions,
    ts.sys,
  )

  if (resolved.resolvedModule) {
    const resolvedPath = resolved.resolvedModule.resolvedFileName
    return path.relative(rootDir, resolvedPath)
  }

  // Fallback: manual resolution for .js/.ts files
  const basePath = path.resolve(fromDir, specifier)
  const extensions = ["", ".ts", ".js", ".json"]

  for (const ext of extensions) {
    const candidate = basePath + ext
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.relative(rootDir, candidate)
    }
  }

  return null
}

function buildGraph(
  entryPoint: string,
  compilerOptions: ts.CompilerOptions,
): DependencyGraph {
  const modules: Record<string, ModuleInfo> = {}
  const queue: string[] = [entryPoint]
  const visited = new Set<string>()

  // For cycle detection
  const adjacency: Record<string, string[]> = {}

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    const fullPath = path.join(rootDir, current)
    if (!fs.existsSync(fullPath)) {
      console.error(`Warning: File not found: ${current}`)
      continue
    }

    const content = fs.readFileSync(fullPath, "utf-8")
    const format = detectFormat(content)
    const importSpecifiers = extractImports(content)

    const dependencies: string[] = []
    for (const specifier of importSpecifiers) {
      const resolved = resolveImport(current, specifier, compilerOptions)
      if (resolved && !resolved.includes("node_modules")) {
        dependencies.push(resolved)
        if (!visited.has(resolved)) {
          queue.push(resolved)
        }
      }
    }

    modules[current] = { format, dependencies }
    adjacency[current] = dependencies
  }

  const circular = detectCycles(adjacency)
  const order = topologicalSort(adjacency)

  return { entryPoint, modules, circular, order }
}

function detectCycles(adjacency: Record<string, string[]>): string[][] {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  const path: string[] = []

  function dfs(node: string): void {
    visited.add(node)
    recursionStack.add(node)
    path.push(node)

    for (const neighbor of adjacency[node] || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor)
      } else if (recursionStack.has(neighbor)) {
        // Found cycle
        const cycleStart = path.indexOf(neighbor)
        const cycle = path.slice(cycleStart)
        cycles.push(cycle)
      }
    }

    path.pop()
    recursionStack.delete(node)
  }

  for (const node of Object.keys(adjacency)) {
    if (!visited.has(node)) {
      dfs(node)
    }
  }

  return cycles
}

function topologicalSort(adjacency: Record<string, string[]>): string[] {
  const nodes = Object.keys(adjacency)
  const visited = new Set<string>()
  const result: string[] = []

  // DFS post-order gives us reverse topological order
  // We want leaves first, so post-order is exactly what we need
  function dfs(node: string): void {
    if (visited.has(node)) return
    visited.add(node)

    // Visit all dependencies first
    for (const dep of adjacency[node] || []) {
      dfs(dep)
    }

    // Add node after all its dependencies
    result.push(node)
  }

  for (const node of nodes) {
    dfs(node)
  }

  return result
}

// Main
const entryPoint = process.argv[2] || "index.js"
const compilerOptions = loadTsConfig()
const graph = buildGraph(entryPoint, compilerOptions)

console.log(JSON.stringify(graph, null, 2))
