# Roadmap

## Auto-serialization of JS objects as `a{sv}` variants

**Status:** Not implemented  
**Related test:** `test/js-types.test.ts` (marked as `test.todo`)

### Problem

D-Bus variants (`v` type) require explicit type information. Currently, to marshal a variant you must provide a tuple of `[signature, value]`:

```js
// Current API - verbose and error-prone
marshall("a{sv}", [
  [
    ["key1", ["s", "hello"]],
    ["key2", ["i", 123]],
    ["nested", ["a{sv}", [["inner", ["d", 3.14]]]]],
  ],
])
```

The desired API would allow plain JS objects:

```js
// Desired API
marshall(
  "a{sv}",
  { key1: "hello", key2: 123, nested: { inner: 3.14 } },
  { hashAsObject: true },
)
```

### Current Implementation

**Marshalling variants** (`lib/marshall.js:68-79`):

```js
case "v":
  assert.equal(data.length, 2, "variant data should be [signature, data]")
  write(ps, signatureEle, data[0])  // write signature string
  write(ps, tree[0], data[1])       // write value
```

**Unmarshalling variants** (`lib/dbus-buffer.js:98-102`):

```js
readVariant() {
  var signature = this.readSimpleType("g")
  var tree = parseSignature(signature)
  return [tree, this.readStruct(tree)]
}
```

There's an existing TODO comment in `lib/marshall.js:69`:

> TODO: allow serialisation of simple types as variants, e.g. `123 -> ['u', 123]`, `true -> ['b', 1]`, `'abc' -> ['s', 'abc']`

### Required Components

#### 1. Type Inference Function

Infer D-Bus type signature from JS value:

```ts
function inferDBusType(value: unknown): string {
  if (typeof value === "string") return "s"
  if (typeof value === "boolean") return "b"
  if (typeof value === "number") {
    if (Number.isInteger(value)) return "i" // int32
    return "d" // double
  }
  if (typeof value === "bigint") return "x" // int64
  if (Buffer.isBuffer(value)) return "ay" // byte array
  if (Array.isArray(value)) {
    if (value.length === 0) throw new Error("Cannot infer type of empty array")
    return "a" + inferDBusType(value[0])
  }
  if (typeof value === "object" && value !== null) return "a{sv}"
  throw new Error(`Cannot infer D-Bus type for: ${typeof value}`)
}
```

**Design decisions needed:**

| JS Type            | D-Bus Type  | Notes                                         |
| ------------------ | ----------- | --------------------------------------------- |
| `string`           | `s`         | Straightforward                               |
| `boolean`          | `b`         | Straightforward                               |
| `number` (integer) | `i` or `u`? | Could check sign/range, or always use `i`     |
| `number` (float)   | `d`         | Straightforward                               |
| `bigint`           | `x` or `t`? | Could check sign, or always use `x`           |
| `Array`            | `a?`        | Infer from first element, require homogeneous |
| `object`           | `a{sv}`     | Recursive conversion                          |
| `null`/`undefined` | Error       | D-Bus has no null type                        |
| `Buffer`           | `ay`        | Byte array                                    |

#### 2. Object-to-Dict Conversion

Recursively convert plain JS objects to D-Bus dict format:

```ts
function objectToDict(
  obj: Record<string, unknown>,
): [string, [string, unknown]][] {
  return Object.entries(obj).map(([key, value]) => {
    const signature = inferDBusType(value)
    const marshalledValue =
      signature === "a{sv}" ?
        objectToDict(value as Record<string, unknown>)
      : value
    return [key, [signature, marshalledValue]]
  })
}
```

#### 3. Marshall Option

Add `options` parameter to `marshall()`:

```ts
interface MarshallOptions {
  hashAsObject?: boolean // Enable auto-conversion of objects to a{sv}
}

function marshall(
  signature: string,
  data: unknown[],
  offset?: number,
  options?: MarshallOptions,
)
```

Modify the array (`a`) case in `write()` to detect when:

- The element type is `{sv}` (dict with string key and variant value)
- The data is a plain object (not an array)
- The `hashAsObject` option is enabled

#### 4. Unmarshall Option (Optional)

For symmetry, `unmarshall()` could also support `hashAsObject`:

```ts
// Current return format for a{sv}:
[
  ["key1", [{ type: "s", child: [] }, "hello"]],
  ["key2", [{ type: "i", child: [] }, 123]]
]

// With hashAsObject enabled:
{ key1: "hello", key2: 123 }
```

This would modify `readArray()` in `lib/dbus-buffer.js` to detect `a{sv}` and convert to plain object.

### Implementation Plan

| Step | File                    | Description                                    |
| ---- | ----------------------- | ---------------------------------------------- |
| 1    | `lib/marshall.js`       | Add `inferDBusType(value)` function            |
| 2    | `lib/marshall.js`       | Add `objectToDict(obj)` helper                 |
| 3    | `lib/marshall.js`       | Add `options` parameter to `marshall()`        |
| 4    | `lib/marshall.js`       | Modify `write()` to handle objects for `a{sv}` |
| 5    | `lib/dbus-buffer.js`    | Add `hashAsObject` option to unmarshalling     |
| 6    | `test/js-types.test.ts` | Remove `.todo`, add comprehensive tests        |
| 7    | `index.d.ts`            | Update type definitions                        |

### Test Cases

```ts
// Simple object
testRoundtrip("a{sv}", { name: "test", count: 42 })

// Nested objects
testRoundtrip("a{sv}", {
  config: {
    enabled: true,
    threshold: 0.5,
  },
})

// Mixed types
testRoundtrip("a{sv}", {
  str: "hello",
  num: 123,
  float: 3.14,
  bool: true,
  nested: { inner: "value" },
})

// Arrays within objects
testRoundtrip("a{sv}", {
  tags: ["a", "b", "c"],
  scores: [1, 2, 3],
})
```

### Open Questions

1. **Integer type selection:** Should positive integers use `u` (unsigned) or always `i` (signed)?

2. **Large integers:** Numbers > 2^31-1 should probably use `x`/`t`, but this adds complexity.

3. **Empty arrays:** Cannot infer element type. Options:
   - Throw error
   - Require explicit type hint
   - Use a default type (e.g., `av` for variant array)

4. **Type hints:** Should there be a way to force a specific type?

   ```js
   { value: 123, $type: "u" }  // Force unsigned
   ```

5. **Backward compatibility:** The `hashAsObject` option should be opt-in to avoid breaking existing code that passes arrays for `a{sv}`.
