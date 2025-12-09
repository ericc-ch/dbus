#!/usr/bin/env bun

import { readFile } from "fs/promises"
import { print } from "esrap"
import ts from "esrap/languages/ts"
import { Parser } from "xml2js"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dbus = require("../index.js")

// D-Bus signature to TypeScript type mapping
function dbusTypeToTs(signature: string): string {
  const typeMap: Record<string, string> = {
    y: "number", // byte
    b: "boolean", // boolean
    n: "number", // int16
    q: "number", // uint16
    i: "number", // int32
    u: "number", // uint32
    x: "bigint", // int64
    t: "bigint", // uint64
    d: "number", // double
    h: "number", // unix fd
    s: "string", // string
    o: "string", // object path
    g: "string", // signature
  }

  if (signature.length === 0) return "void"

  const result: string[] = []
  let i = 0

  while (i < signature.length) {
    const char = signature[i]!

    if (typeMap[char]) {
      result.push(typeMap[char])
      i++
    } else if (char === "v") {
      // variant: [signature, value]
      result.push("[string, unknown]")
      i++
    } else if (char === "a") {
      // array or dict
      i++
      if (signature[i] === "{") {
        // dict entry a{kt} -> Array<[K, V]>
        i++ // skip {
        const keyType = dbusTypeToTs(signature[i]!)
        i++
        const [valueType, consumed] = parseCompleteType(signature, i)
        i += consumed
        i++ // skip }
        result.push(`Array<[${keyType}, ${valueType}]>`)
      } else {
        // regular array
        const [elementType, consumed] = parseCompleteType(signature, i)
        i += consumed
        result.push(`${elementType}[]`)
      }
    } else if (char === "(") {
      // struct -> tuple
      i++ // skip (
      const tupleTypes: string[] = []
      while (signature[i] !== ")") {
        const [memberType, consumed] = parseCompleteType(signature, i)
        tupleTypes.push(memberType)
        i += consumed
      }
      i++ // skip )
      result.push(`[${tupleTypes.join(", ")}]`)
    } else {
      // unknown type, fallback to unknown
      result.push("unknown")
      i++
    }
  }

  return result.length === 1 ? result[0]! : `[${result.join(", ")}]`
}

// parse a complete type from signature starting at index, return [type, charsConsumed]
function parseCompleteType(
  signature: string,
  startIndex: number,
): [string, number] {
  const typeMap: Record<string, string> = {
    y: "number",
    b: "boolean",
    n: "number",
    q: "number",
    i: "number",
    u: "number",
    x: "bigint",
    t: "bigint",
    d: "number",
    h: "number",
    s: "string",
    o: "string",
    g: "string",
  }

  let i = startIndex
  const char = signature[i]!

  if (typeMap[char]) {
    return [typeMap[char], 1]
  }

  if (char === "v") {
    return ["[string, unknown]", 1]
  }

  if (char === "a") {
    i++ // skip 'a'
    if (signature[i] === "{") {
      // dict entry
      i++ // skip {
      const keyType = typeMap[signature[i]!] || "unknown"
      i++
      const [valueType, consumed] = parseCompleteType(signature, i)
      i += consumed
      i++ // skip }
      return [`Array<[${keyType}, ${valueType}]>`, i - startIndex]
    }
    // regular array
    const [elementType, consumed] = parseCompleteType(signature, i)
    return [`${elementType}[]`, 1 + consumed]
  }

  if (char === "(") {
    i++ // skip (
    const tupleTypes: string[] = []
    while (signature[i] !== ")") {
      const [memberType, consumed] = parseCompleteType(signature, i)
      tupleTypes.push(memberType)
      i += consumed
    }
    i++ // skip )
    return [`[${tupleTypes.join(", ")}]`, i - startIndex]
  }

  return ["unknown", 1]
}

interface MethodArg {
  $: { name?: string; direction?: string; type: string }
}

interface Method {
  $: { name: string }
  arg?: MethodArg[]
}

interface Signal {
  $: { name: string }
  arg?: Array<{ $: { name?: string; type: string } }>
}

interface Property {
  $: { name: string; type: string; access: string }
}

interface Interface {
  $: { name: string }
  method?: Method[]
  signal?: Signal[]
  property?: Property[]
}

interface IntrospectionResult {
  node: {
    interface?: Interface[]
  }
}

// convert interface name to valid identifier (e.g., "org.freedesktop.DBus" -> "OrgFreedesktopDBus")
function interfaceNameToIdentifier(name: string): string {
  return name
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

// generate AST for the TypeScript output
function generateAst(
  interfaces: Interface[],
  service: string,
  path: string,
): object {
  const body: object[] = []

  // import type { MessageBus } from "@echristian/dbus-native"
  body.push({
    type: "ImportDeclaration",
    importKind: "type",
    specifiers: [
      {
        type: "ImportSpecifier",
        imported: { type: "Identifier", name: "MessageBus" },
        local: { type: "Identifier", name: "MessageBus" },
      },
    ],
    source: { type: "Literal", value: "@echristian/dbus-native" },
  })

  for (const iface of interfaces) {
    const ifaceName = iface.$.name
    const identifier = interfaceNameToIdentifier(ifaceName)

    // generate interface for methods
    const methodsInterfaceName = `${identifier}Methods`
    const methodSignatures: object[] = []

    if (iface.method) {
      for (const method of iface.method) {
        const methodName = method.$.name
        const params: object[] = []
        let outSignature = ""

        if (method.arg) {
          for (const arg of method.arg) {
            if (arg.$.direction === "in" || !arg.$.direction) {
              const paramName = arg.$.name || `arg${params.length}`
              const paramType = dbusTypeToTs(arg.$.type)
              params.push({
                type: "TSPropertySignature",
                key: { type: "Identifier", name: paramName },
                typeAnnotation: {
                  type: "TSTypeAnnotation",
                  typeAnnotation: {
                    type: "TSTypeReference",
                    typeName: { type: "Identifier", name: paramType },
                  },
                },
              })
            } else if (arg.$.direction === "out") {
              outSignature += arg.$.type
            }
          }
        }

        const returnType = outSignature ? dbusTypeToTs(outSignature) : "void"

        // method(arg1: Type1, arg2: Type2, callback: (err: Error | null, result?: ReturnType) => void): void
        const methodParams: object[] = []

        if (method.arg) {
          for (const arg of method.arg) {
            if (arg.$.direction === "in" || !arg.$.direction) {
              const paramName = arg.$.name || `arg${methodParams.length}`
              methodParams.push({
                type: "Identifier",
                name: paramName,
                typeAnnotation: {
                  type: "TSTypeAnnotation",
                  typeAnnotation: parseTypeAnnotation(dbusTypeToTs(arg.$.type)),
                },
              })
            }
          }
        }

        // callback parameter
        methodParams.push({
          type: "Identifier",
          name: "callback",
          typeAnnotation: {
            type: "TSTypeAnnotation",
            typeAnnotation: {
              type: "TSFunctionType",
              params: [
                {
                  type: "Identifier",
                  name: "err",
                  typeAnnotation: {
                    type: "TSTypeAnnotation",
                    typeAnnotation: {
                      type: "TSUnionType",
                      types: [
                        {
                          type: "TSTypeReference",
                          typeName: { type: "Identifier", name: "Error" },
                        },
                        { type: "TSNullKeyword" },
                      ],
                    },
                  },
                },
                {
                  type: "Identifier",
                  name: "result",
                  optional: true,
                  typeAnnotation: {
                    type: "TSTypeAnnotation",
                    typeAnnotation: parseTypeAnnotation(returnType),
                  },
                },
              ],
              returnType: {
                type: "TSTypeAnnotation",
                typeAnnotation: { type: "TSVoidKeyword" },
              },
            },
          },
        })

        methodSignatures.push({
          type: "TSMethodSignature",
          key: { type: "Identifier", name: methodName },
          params: methodParams,
          returnType: {
            type: "TSTypeAnnotation",
            typeAnnotation: { type: "TSVoidKeyword" },
          },
        })
      }
    }

    // export interface OrgExampleFooMethods { ... }
    body.push({
      type: "ExportNamedDeclaration",
      declaration: {
        type: "TSInterfaceDeclaration",
        id: { type: "Identifier", name: methodsInterfaceName },
        body: {
          type: "TSInterfaceBody",
          body: methodSignatures,
        },
      },
    })

    // generate factory function
    const factoryName = `create${identifier}`

    // build method implementations
    const methodImplementations: object[] = []

    if (iface.method) {
      for (const method of iface.method) {
        const methodName = method.$.name
        const paramNames: string[] = []
        let signature = ""

        if (method.arg) {
          for (const arg of method.arg) {
            if (arg.$.direction === "in" || !arg.$.direction) {
              const paramName = arg.$.name || `arg${paramNames.length}`
              paramNames.push(paramName)
              signature += arg.$.type
            }
          }
        }

        const invokeProperties: object[] = [
          {
            type: "Property",
            key: { type: "Identifier", name: "destination" },
            value: { type: "Literal", value: service },
            kind: "init",
          },
          {
            type: "Property",
            key: { type: "Identifier", name: "path" },
            value: { type: "Literal", value: path },
            kind: "init",
          },
          {
            type: "Property",
            key: { type: "Identifier", name: "interface" },
            value: { type: "Literal", value: ifaceName },
            kind: "init",
          },
          {
            type: "Property",
            key: { type: "Identifier", name: "member" },
            value: { type: "Literal", value: methodName },
            kind: "init",
          },
        ]

        if (paramNames.length > 0) {
          invokeProperties.push({
            type: "Property",
            key: { type: "Identifier", name: "body" },
            value: {
              type: "ArrayExpression",
              elements: paramNames.map((name) => ({
                type: "Identifier",
                name,
              })),
            },
            kind: "init",
          })
          invokeProperties.push({
            type: "Property",
            key: { type: "Identifier", name: "signature" },
            value: { type: "Literal", value: signature },
            kind: "init",
          })
        }

        const methodParams = paramNames.map((name) => ({
          type: "Identifier",
          name,
        }))
        methodParams.push({ type: "Identifier", name: "callback" })

        methodImplementations.push({
          type: "Property",
          key: { type: "Identifier", name: methodName },
          kind: "init",
          value: {
            type: "FunctionExpression",
            params: methodParams,
            body: {
              type: "BlockStatement",
              body: [
                {
                  type: "ExpressionStatement",
                  expression: {
                    type: "CallExpression",
                    callee: {
                      type: "MemberExpression",
                      object: { type: "Identifier", name: "bus" },
                      property: { type: "Identifier", name: "invoke" },
                    },
                    arguments: [
                      {
                        type: "ObjectExpression",
                        properties: invokeProperties,
                      },
                      { type: "Identifier", name: "callback" },
                    ],
                  },
                },
              ],
            },
          },
        })
      }
    }

    // export function createOrgExampleFoo(bus: MessageBus): OrgExampleFooMethods { return { ... } }
    body.push({
      type: "ExportNamedDeclaration",
      declaration: {
        type: "FunctionDeclaration",
        id: { type: "Identifier", name: factoryName },
        params: [
          {
            type: "Identifier",
            name: "bus",
            typeAnnotation: {
              type: "TSTypeAnnotation",
              typeAnnotation: {
                type: "TSTypeReference",
                typeName: { type: "Identifier", name: "MessageBus" },
              },
            },
          },
        ],
        returnType: {
          type: "TSTypeAnnotation",
          typeAnnotation: {
            type: "TSTypeReference",
            typeName: { type: "Identifier", name: methodsInterfaceName },
          },
        },
        body: {
          type: "BlockStatement",
          body: [
            {
              type: "ReturnStatement",
              argument: {
                type: "ObjectExpression",
                properties: methodImplementations,
              },
            },
          ],
        },
      },
    })
  }

  return {
    type: "Program",
    sourceType: "module",
    body,
  }
}

// parse type string to AST type annotation
function parseTypeAnnotation(typeStr: string): object {
  // handle basic types
  if (typeStr === "number") return { type: "TSNumberKeyword" }
  if (typeStr === "string") return { type: "TSStringKeyword" }
  if (typeStr === "boolean") return { type: "TSBooleanKeyword" }
  if (typeStr === "bigint") return { type: "TSBigIntKeyword" }
  if (typeStr === "void") return { type: "TSVoidKeyword" }
  if (typeStr === "unknown") return { type: "TSUnknownKeyword" }

  // handle arrays like "string[]"
  if (typeStr.endsWith("[]")) {
    const elementType = typeStr.slice(0, -2)
    return {
      type: "TSArrayType",
      elementType: parseTypeAnnotation(elementType),
    }
  }

  // handle tuples like "[string, number]"
  if (typeStr.startsWith("[") && typeStr.endsWith("]")) {
    const inner = typeStr.slice(1, -1)
    const types = splitTupleTypes(inner)
    return {
      type: "TSTupleType",
      elementTypes: types.map((t) => parseTypeAnnotation(t.trim())),
    }
  }

  // handle Array<[K, V]> pattern
  if (typeStr.startsWith("Array<")) {
    const inner = typeStr.slice(6, -1)
    return {
      type: "TSTypeReference",
      typeName: { type: "Identifier", name: "Array" },
      typeArguments: {
        type: "TSTypeParameterInstantiation",
        params: [parseTypeAnnotation(inner)],
      },
    }
  }

  // fallback to type reference
  return {
    type: "TSTypeReference",
    typeName: { type: "Identifier", name: typeStr },
  }
}

// split tuple types handling nested brackets
function splitTupleTypes(str: string): string[] {
  const result: string[] = []
  let current = ""
  let depth = 0

  for (const char of str) {
    if (char === "[" || char === "<") depth++
    if (char === "]" || char === ">") depth--

    if (char === "," && depth === 0) {
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  if (current.trim()) {
    result.push(current.trim())
  }

  return result
}

async function getXml(
  xml: string | undefined,
  service: string | undefined,
  path: string | undefined,
  busType: string,
): Promise<string> {
  if (xml) {
    return readFile(xml, "utf-8")
  }

  const bus = busType === "system" ? dbus.systemBus() : dbus.sessionBus()

  return new Promise((resolve, reject) => {
    bus.invoke(
      {
        destination: service!,
        path: path!,
        interface: "org.freedesktop.DBus.Introspectable",
        member: "Introspect",
      },
      (err: Error | null, xmlResult: string) => {
        bus.connection.end()
        if (err) reject(err)
        else resolve(xmlResult)
      },
    )
  })
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("bus", {
      type: "string",
      choices: ["session", "system"] as const,
      default: "session",
      description: "D-Bus to connect to",
    })
    .option("service", {
      type: "string",
      description: "D-Bus service name",
    })
    .option("path", {
      type: "string",
      description: "D-Bus object path",
    })
    .option("xml", {
      type: "string",
      description: "Read introspection XML from file instead of D-Bus",
    })
    .option("dump", {
      type: "boolean",
      default: false,
      description: "Dump raw XML and exit",
    })
    .check((argv) => {
      if (!argv.xml && (!argv.service || !argv.path)) {
        throw new Error(
          "Either --xml or both --service and --path are required",
        )
      }
      return true
    })
    .help()
    .parseAsync()

  const xml = await getXml(argv.xml, argv.service, argv.path, argv.bus)

  if (argv.dump) {
    console.log(xml)
    return
  }

  const parser = new Parser()
  const result: IntrospectionResult = await parser.parseStringPromise(xml)

  if (!result.node?.interface) {
    console.error("No interfaces found in introspection XML")
    process.exit(1)
  }

  const ast = generateAst(
    result.node.interface,
    argv.service || "REPLACE_WITH_SERVICE",
    argv.path || "REPLACE_WITH_PATH",
  )

  const { code } = print(ast as any, ts())
  console.log(code)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
