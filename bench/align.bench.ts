import { Bench } from "tinybench"
import { Buffer } from "node:buffer"

/**
 * Realistic PutStream implementation that matches lib/put.js behavior.
 * Collects buffer chunks and tracks offset like the real implementation.
 */
class RealisticPutStream {
  _offset: number
  private words: Array<{ buffer?: Buffer; bytes?: number; value?: number }>
  private length: number

  constructor(initialOffset: number) {
    this._offset = initialOffset
    this.words = []
    this.length = 0
  }

  put(buffer: Buffer): this {
    this.words.push({ buffer })
    this.length += buffer.length
    return this
  }

  word8(value: number): this {
    this.words.push({ bytes: 1, value })
    this.length += 1
    return this
  }

  reset(offset: number) {
    this._offset = offset
    this.words = []
    this.length = 0
  }
}

// =============================================================================
// Implementation 1: Current (Buffer.alloc each time)
// =============================================================================
function alignCurrent(ps: RealisticPutStream, alignment: number) {
  const pad = alignment - (ps._offset % alignment)
  if (pad === 0 || pad === alignment) return
  const padBuffer = Buffer.alloc(pad)
  ps.put(padBuffer)
  ps._offset += pad
}

// =============================================================================
// Implementation 2: Loop-based (word8 calls)
// =============================================================================
function alignLoop(ps: RealisticPutStream, alignment: number) {
  const pad = alignment - (ps._offset % alignment)
  if (pad === 0 || pad === alignment) return
  for (let i = 0; i < pad; i++) {
    ps.word8(0)
  }
  ps._offset += pad
}

// =============================================================================
// Implementation 3: Pre-allocated buffer (reuse a single buffer)
// =============================================================================
const MAX_PAD_SIZE = 7 // Max padding for 8-byte alignment
const PREALLOC_BUFFER = Buffer.alloc(MAX_PAD_SIZE)

function alignPrealloc(ps: RealisticPutStream, alignment: number) {
  const pad = alignment - (ps._offset % alignment)
  if (pad === 0 || pad === alignment) return
  // Use subarray to get a view of the pre-allocated buffer
  ps.put(PREALLOC_BUFFER.subarray(0, pad))
  ps._offset += pad
}

// =============================================================================
// Implementation 4: Pre-allocated with copy (safer, no shared references)
// =============================================================================
function alignPreallocCopy(ps: RealisticPutStream, alignment: number) {
  const pad = alignment - (ps._offset % alignment)
  if (pad === 0 || pad === alignment) return
  // Copy from pre-allocated buffer to avoid shared references
  const padBuffer = Buffer.from(PREALLOC_BUFFER.subarray(0, pad))
  ps.put(padBuffer)
  ps._offset += pad
}

// =============================================================================
// Benchmark configuration
// =============================================================================

// D-Bus alignment boundaries: 2, 4, 8 bytes
// (1-byte alignment never needs padding)
const ALIGNMENTS = [2, 4, 8] as const

// Run benchmarks
const bench = new Bench({ time: 100 })

// Group benchmarks by implementation for easier comparison
const implementations = [
  { name: "current", fn: alignCurrent },
  { name: "loop", fn: alignLoop },
  { name: "prealloc", fn: alignPrealloc },
  { name: "prealloc-copy", fn: alignPreallocCopy },
] as const

for (const alignment of ALIGNMENTS) {
  for (let offset = 0; offset < alignment; offset++) {
    const padSize = (alignment - (offset % alignment)) % alignment
    if (padSize === 0) continue // Skip no-op cases (already aligned)

    for (const impl of implementations) {
      const stream = new RealisticPutStream(offset)
      const label = `${impl.name}: align=${alignment}, offset=${offset}, pad=${padSize}`

      bench.add(label, () => {
        stream.reset(offset)
        impl.fn(stream, alignment)
      })
    }
  }
}

// Also benchmark no-op cases to see overhead of the early return
for (const alignment of ALIGNMENTS) {
  for (const impl of implementations) {
    const stream = new RealisticPutStream(0) // offset=0 means already aligned
    const label = `${impl.name}: align=${alignment}, offset=0, pad=0 (no-op)`

    bench.add(label, () => {
      stream.reset(0)
      impl.fn(stream, alignment)
    })
  }
}

console.log("Running alignment benchmarks...")
console.log("D-Bus uses 2, 4, and 8-byte alignment boundaries.\n")

await bench.run()

console.table(bench.table())

// Summary: find fastest implementation for each scenario
console.log("\n=== Summary: Fastest implementation per scenario ===\n")

type TaskWithResult = {
  name: string
  result?: { latency?: { mean: number } }
}

const results = bench.tasks as TaskWithResult[]
const scenarios = new Map<
  string,
  { impl: string; latency: number; name: string }[]
>()

for (const task of results) {
  if (!task.result?.latency) continue

  // Extract scenario (alignment, offset, pad) from task name
  const match = task.name.match(/align=(\d+), offset=(\d+), pad=(\d+)/)
  if (!match) continue

  const scenario = `align=${match[1]}, offset=${match[2]}, pad=${match[3]}`
  const implName = task.name.split(":")[0]
  if (!implName) continue

  if (!scenarios.has(scenario)) {
    scenarios.set(scenario, [])
  }
  scenarios.get(scenario)!.push({
    impl: implName,
    latency: task.result.latency.mean,
    name: task.name,
  })
}

// Convert milliseconds to nanoseconds for display
const msToNs = (ms: number) => ms * 1_000_000

for (const [scenario, impls] of scenarios) {
  impls.sort((a, b) => a.latency - b.latency)
  const fastest = impls[0]
  const slowest = impls[impls.length - 1]
  if (!fastest || !slowest) continue

  const speedup = ((slowest.latency / fastest.latency - 1) * 100).toFixed(1)

  console.log(`${scenario}`)
  console.log(
    `  Fastest: ${fastest.impl} (${msToNs(fastest.latency).toFixed(2)} ns)`,
  )
  console.log(
    `  Slowest: ${slowest.impl} (${msToNs(slowest.latency).toFixed(2)} ns) [${speedup}% slower]`,
  )
  console.log()
}
