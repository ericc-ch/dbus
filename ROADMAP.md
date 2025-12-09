# Roadmap

## Replace `long` dependency with native `BigInt`

### Problem

The library uses [Long.js](https://github.com/dcodeIO/long.js) for 64-bit integer support (`x` and `t` D-Bus types). Modern JavaScript has native `BigInt` which handles this without external dependencies.

### Implementation

**Writing BigInt to buffer (split into low/high 32-bit words):**

```ts
const low = Number(bigint & 0xffffffffn)
const high = Number(bigint >> 32n)
ps.word32le(low)
ps.word32le(high)
```

**Reading BigInt from buffer:**

```ts
const low = this.readInt32()
const high = this.readInt32()
const bigint = (BigInt(high) << 32n) | BigInt(low >>> 0)
```

### Breaking changes

- Users passing `Long` objects would need to switch to `BigInt`
- `ReturnLongjs` option would be removed or renamed
- Return type for 64-bit integers changes from `number | Long` to `bigint`

### Open questions

1. Should `BigInt` always be returned, or keep an option like `ReturnBigInt: true`?
2. Accept both `BigInt` and `number` for input, or require `BigInt` for 64-bit types?

---

## Auto-serialization of JS objects as `a{sv}` variants

### Problem

D-Bus variants (`v` type) require explicit type information. Currently, marshalling `a{sv}` is verbose:

```js
// Current API
marshall("a{sv}", [
  [
    ["key1", ["s", "hello"]],
    ["key2", ["i", 123]],
  ],
])

// Desired API
marshall("a{sv}", { key1: "hello", key2: 123 }, { hashAsObject: true })
```

### Implementation

**Type inference** — infer D-Bus signature from JS value:

```ts
function inferDBusType(value: unknown): string {
  if (typeof value === "string") return "s"
  if (typeof value === "boolean") return "b"
  if (typeof value === "number") {
    return Number.isInteger(value) ? "i" : "d"
  }
  if (typeof value === "bigint") return "x"
  if (Buffer.isBuffer(value)) return "ay"
  if (Array.isArray(value)) {
    if (value.length === 0) throw new Error("Cannot infer type of empty array")
    return "a" + inferDBusType(value[0])
  }
  if (typeof value === "object" && value !== null) return "a{sv}"
  throw new Error(`Cannot infer D-Bus type for: ${typeof value}`)
}
```

**Object-to-dict conversion** — recursively convert plain objects:

```ts
function objectToDict(
  obj: Record<string, unknown>,
): [string, [string, unknown]][] {
  return Object.entries(obj).map(([key, value]) => {
    const signature = inferDBusType(value)
    const converted = signature === "a{sv}" ? objectToDict(value) : value
    return [key, [signature, converted]]
  })
}
```

### Breaking changes

None — `hashAsObject` option is opt-in.

### Open questions

1. Should positive integers use `u` (unsigned) or always `i` (signed)?
2. How to handle numbers > 2^31-1? Promote to `x`/`t`?
3. How to handle empty arrays? Throw error, require type hint, or default to `av`?
4. Should there be a way to force a specific type (e.g., `{ value: 123, $type: "u" }`)?
