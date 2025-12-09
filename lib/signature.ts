/**
 * Parse D-Bus type signature strings into a tree structure.
 *
 * D-Bus type codes:
 * - Basic types: y(byte), b(bool), n(int16), q(uint16), i(int32), u(uint32),
 *                x(int64), t(uint64), d(double), s(string), o(object path),
 *                g(signature), h(unix fd)
 * - Container types: a(array), v(variant), ()(struct), {}(dict entry)
 *
 * @see https://dbus.freedesktop.org/doc/dbus-specification.html#type-system
 */

/** D-Bus type codes that can appear in wire signatures */
export type DBusTypeCode =
  | "y"
  | "b"
  | "n"
  | "q"
  | "i"
  | "u"
  | "x"
  | "t" // integers
  | "d"
  | "s"
  | "o"
  | "g" // double, string, object path, signature
  | "a"
  | "v"
  | "h" // array, variant, unix fd
  | "("
  | ")"
  | "{"
  | "}" // struct, dict entry delimiters

/** A node in the parsed signature tree */
export interface SignatureNode {
  type: string
  child: SignatureNode[]
}

const BRACKET_PAIRS: Record<string, string> = {
  "{": "}",
  "(": ")",
}

const KNOWN_TYPES: Record<string, boolean> = {}
"(){}ybnqiuxtdsogavh".split("").forEach((char) => {
  KNOWN_TYPES[char] = true
})

/**
 * Parse a D-Bus signature string into a tree structure.
 *
 * @param signature - The D-Bus type signature string (e.g., "a{sv}", "(ii)")
 * @returns An array of signature nodes representing the parsed types
 * @throws Error if the signature contains unknown types or is malformed
 *
 * @example
 * parseSignature("a{sv}")
 * // Returns: [{ type: "a", child: [{ type: "{", child: [
 * //   { type: "s", child: [] },
 * //   { type: "v", child: [] }
 * // ]}]}]
 */
export function parseSignature(signature: string): SignatureNode[] {
  let index = 0

  function next(): string | null {
    if (index < signature.length) {
      const char = signature[index] as string
      ++index
      return char
    }
    return null
  }

  function parseOne(char: string): SignatureNode {
    function checkNotEnd(char: string | null): string {
      if (!char) throw new Error("Bad signature: unexpected end")
      return char
    }

    if (!KNOWN_TYPES[char]) {
      throw new Error(`Unknown type: "${char}" in signature "${signature}"`)
    }

    const node: SignatureNode = { type: char, child: [] }

    switch (char) {
      case "a": {
        // array - next character is the element type
        const element = next()
        checkNotEnd(element)
        node.child.push(parseOne(element!))
        return node
      }
      case "{": // dict entry
      case "(": {
        // struct
        let element: string | null
        while ((element = next()) !== null && element !== BRACKET_PAIRS[char]) {
          node.child.push(parseOne(element))
        }
        checkNotEnd(element)
        return node
      }
    }

    return node
  }

  const result: SignatureNode[] = []
  let char: string | null
  while ((char = next()) !== null) {
    result.push(parseOne(char))
  }
  return result
}

export default parseSignature
