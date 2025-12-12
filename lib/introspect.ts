import { EventEmitter } from "events"
import { Parser } from "xml2js"

// =============================================================================
// Error Class
// =============================================================================

export class DBusError extends Error {
  readonly errorName: string

  constructor(errorName: string, message: string) {
    super(message)
    this.name = "DBusError"
    this.errorName = errorName
  }
}

// =============================================================================
// Types
// =============================================================================

export interface DBusMethodInfo {
  name: string
  inSignature: string
  outSignature: string
}

export interface DBusPropertyInfo {
  name: string
  type: string
  access: "read" | "write" | "readwrite"
}

export interface DBusSignalInfo {
  name: string
  signature: string
}

export interface DBusMessage {
  destination?: string
  path?: string
  interface?: string
  member?: string
  signature?: string
  body?: unknown[]
}

// Minimal Bus interface - full type will be in bus.ts when converted
export interface Bus {
  invoke(message: DBusMessage, callback: DBusCallback): void
  mangle(path: string, iface: string, member: string): string
  signals: EventEmitter
  addMatch(match: string, callback: (error: DBusError | null) => void): void
  removeMatch(match: string, callback: (error: DBusError | null) => void): void
}

export interface DBusObject {
  name: string
  service: {
    name: string
    bus: Bus
  }
}

export type DBusCallback<T = unknown> = (
  error: DBusError | null,
  result?: T,
) => void

export type SignalHandler = (args: unknown[]) => void

export interface IntrospectResult {
  interfaces: Map<string, DBusInterface>
  nodes: string[]
}

// =============================================================================
// XML Parsing Types (internal)
// =============================================================================

interface XmlArg {
  $: {
    name?: string
    direction?: "in" | "out"
    type: string
  }
}

interface XmlMethod {
  $: { name: string }
  arg?: XmlArg[]
}

interface XmlProperty {
  $: {
    name: string
    type: string
    access: string
  }
}

interface XmlSignal {
  $: { name: string }
  arg?: XmlArg[]
}

interface XmlInterface {
  $: { name: string }
  method?: XmlMethod[]
  property?: XmlProperty[]
  signal?: XmlSignal[]
}

interface XmlNode {
  $?: { name: string }
}

interface XmlRoot {
  node?: {
    interface?: XmlInterface[]
    node?: XmlNode[]
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function getMatchRule(
  objectPath: string,
  interfaceName: string,
  signalName: string,
): string {
  return `type='signal',path='${objectPath}',interface='${interfaceName}',member='${signalName}'`
}

function parsePropertyAccess(access: string): "read" | "write" | "readwrite" {
  if (access === "read" || access === "write" || access === "readwrite") {
    return access
  }
  return "read"
}

// =============================================================================
// DBusInterface Class
// =============================================================================

export class DBusInterface {
  readonly name: string
  readonly methods: ReadonlyMap<string, DBusMethodInfo>
  readonly properties: ReadonlyMap<string, DBusPropertyInfo>
  readonly signals: ReadonlyMap<string, DBusSignalInfo>

  private readonly parent: DBusObject
  private readonly handlerMap = new Map<SignalHandler, SignalHandler>()

  constructor(
    parent: DBusObject,
    name: string,
    methods: Map<string, DBusMethodInfo>,
    properties: Map<string, DBusPropertyInfo>,
    signals: Map<string, DBusSignalInfo>,
  ) {
    this.parent = parent
    this.name = name
    this.methods = methods
    this.properties = properties
    this.signals = signals
  }

  // ---------------------------------------------------------------------------
  // Method Invocation
  // ---------------------------------------------------------------------------

  call(methodName: string, args: unknown[], callback: DBusCallback): void {
    const bus = this.parent.service.bus
    const methodInfo = this.methods.get(methodName)

    const message: DBusMessage = {
      destination: this.parent.service.name,
      path: this.parent.name,
      interface: this.name,
      member: methodName,
    }

    if (methodInfo && methodInfo.inSignature !== "") {
      message.signature = methodInfo.inSignature
      message.body = args
    }

    bus.invoke(message, callback)
  }

  callAsync(methodName: string, args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.call(methodName, args, (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      })
    })
  }

  // ---------------------------------------------------------------------------
  // Property Access
  // ---------------------------------------------------------------------------

  getProperty(propertyName: string, callback: DBusCallback): void {
    const bus = this.parent.service.bus

    bus.invoke(
      {
        destination: this.parent.service.name,
        path: this.parent.name,
        interface: "org.freedesktop.DBus.Properties",
        member: "Get",
        signature: "ss",
        body: [this.name, propertyName],
      },
      (error, result) => {
        if (error) {
          callback(error)
          return
        }

        // Result is a variant: [signature, value]
        const variant = result as [string, unknown[]]
        const signature = variant[0]
        const value = variant[1]

        // If single type, unwrap the array
        if (signature.length === 1) {
          callback(null, (value as unknown[])[0])
        } else {
          callback(null, value)
        }
      },
    )
  }

  getPropertyAsync(propertyName: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.getProperty(propertyName, (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      })
    })
  }

  setProperty(
    propertyName: string,
    value: unknown,
    callback?: DBusCallback,
  ): void {
    const bus = this.parent.service.bus
    const propertyInfo = this.properties.get(propertyName)

    if (!propertyInfo) {
      const error = new DBusError(
        "org.freedesktop.DBus.Error.UnknownProperty",
        `Property "${propertyName}" not found on interface "${this.name}"`,
      )
      if (callback) {
        callback(error)
      }
      return
    }

    bus.invoke(
      {
        destination: this.parent.service.name,
        path: this.parent.name,
        interface: "org.freedesktop.DBus.Properties",
        member: "Set",
        signature: "ssv",
        body: [this.name, propertyName, [propertyInfo.type, value]],
      },
      callback ?? (() => {}),
    )
  }

  setPropertyAsync(propertyName: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setProperty(propertyName, value, (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  // ---------------------------------------------------------------------------
  // Signal Handling
  // ---------------------------------------------------------------------------

  on(signalName: string, handler: SignalHandler): void {
    const bus = this.parent.service.bus
    const signalFullName = bus.mangle(this.parent.name, this.name, signalName)

    // Wrap handler to convert spread args to array
    let wrappedHandler = this.handlerMap.get(handler)
    if (!wrappedHandler) {
      wrappedHandler = (messageBody: unknown[]) => {
        handler(messageBody)
      }
      this.handlerMap.set(handler, wrappedHandler)
    }

    if (!bus.signals.listeners(signalFullName).length) {
      // First listener - need to call AddMatch
      const match = getMatchRule(this.parent.name, this.name, signalName)
      bus.addMatch(match, (error) => {
        if (error) {
          throw new DBusError(error.errorName, error.message)
        }
        bus.signals.on(signalFullName, wrappedHandler)
      })
    } else {
      // Match already exists, just add listener
      bus.signals.on(signalFullName, wrappedHandler)
    }
  }

  off(signalName: string, handler: SignalHandler): void {
    const bus = this.parent.service.bus
    const signalFullName = bus.mangle(this.parent.name, this.name, signalName)

    const wrappedHandler = this.handlerMap.get(handler)
    if (!wrappedHandler) {
      return
    }

    bus.signals.removeListener(signalFullName, wrappedHandler)

    if (!bus.signals.listeners(signalFullName).length) {
      // No more listeners - remove match
      const match = getMatchRule(this.parent.name, this.name, signalName)
      bus.removeMatch(match, (error) => {
        if (error) {
          throw new DBusError(error.errorName, error.message)
        }
        this.handlerMap.delete(handler)
      })
    }
  }

  addListener(signalName: string, handler: SignalHandler): void {
    this.on(signalName, handler)
  }

  removeListener(signalName: string, handler: SignalHandler): void {
    this.off(signalName, handler)
  }
}

// =============================================================================
// XML Processing
// =============================================================================

export function processXML(
  xml: string | Buffer,
  obj: DBusObject,
  callback: (error: DBusError | null, result?: IntrospectResult) => void,
): void {
  const parser = new Parser()

  parser.parseString(xml, (parseError: Error | null, result: XmlRoot) => {
    if (parseError) {
      callback(
        new DBusError(
          "org.freedesktop.DBus.Error.InvalidXml",
          parseError.message,
        ),
      )
      return
    }

    if (!result.node) {
      callback(
        new DBusError("org.freedesktop.DBus.Error.InvalidXml", "No root node"),
      )
      return
    }

    const rootNode = result.node

    // If no interfaces, try first sub-node
    if (!rootNode.interface) {
      if (
        rootNode.node
        && rootNode.node.length > 0
        && rootNode.node[0]?.$
        && rootNode.node[0].$.name
      ) {
        const subObj: DBusObject = {
          name:
            obj.name.endsWith("/") ?
              obj.name + rootNode.node[0].$.name
            : obj.name + "/" + rootNode.node[0].$.name,
          service: obj.service,
        }
        introspectBus(subObj, callback)
        return
      }
      callback(
        new DBusError(
          "org.freedesktop.DBus.Error.NoSuchInterface",
          "No such interface found",
        ),
      )
      return
    }

    const interfaces = new Map<string, DBusInterface>()
    const nodes: string[] = []

    // Extract child nodes (skip first as it's the root)
    const xmlNodes = rootNode.node || []
    for (let i = 1; i < xmlNodes.length; i++) {
      const nodeName = xmlNodes[i]?.$?.name
      if (nodeName) {
        nodes.push(nodeName)
      }
    }

    // Process interfaces
    for (const xmlInterface of rootNode.interface) {
      const interfaceName = xmlInterface.$.name

      const methods = new Map<string, DBusMethodInfo>()
      const properties = new Map<string, DBusPropertyInfo>()
      const signals = new Map<string, DBusSignalInfo>()

      // Process methods
      if (xmlInterface.method) {
        for (const xmlMethod of xmlInterface.method) {
          let inSignature = ""
          let outSignature = ""

          if (xmlMethod.arg) {
            for (const arg of xmlMethod.arg) {
              if (arg.$.direction === "in" || !arg.$.direction) {
                inSignature += arg.$.type
              } else if (arg.$.direction === "out") {
                outSignature += arg.$.type
              }
            }
          }

          methods.set(xmlMethod.$.name, {
            name: xmlMethod.$.name,
            inSignature,
            outSignature,
          })
        }
      }

      // Process properties
      if (xmlInterface.property) {
        for (const xmlProperty of xmlInterface.property) {
          properties.set(xmlProperty.$.name, {
            name: xmlProperty.$.name,
            type: xmlProperty.$.type,
            access: parsePropertyAccess(xmlProperty.$.access),
          })
        }
      }

      // Process signals
      if (xmlInterface.signal) {
        for (const xmlSignal of xmlInterface.signal) {
          let signature = ""

          if (xmlSignal.arg) {
            for (const arg of xmlSignal.arg) {
              signature += arg.$.type
            }
          }

          signals.set(xmlSignal.$.name, {
            name: xmlSignal.$.name,
            signature,
          })
        }
      }

      const dbusInterface = new DBusInterface(
        obj,
        interfaceName,
        methods,
        properties,
        signals,
      )

      interfaces.set(interfaceName, dbusInterface)
    }

    callback(null, { interfaces, nodes })
  })
}

export function processXMLAsync(
  xml: string | Buffer,
  obj: DBusObject,
): Promise<IntrospectResult> {
  return new Promise((resolve, reject) => {
    processXML(xml, obj, (error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(result!)
      }
    })
  })
}

// =============================================================================
// Introspection Entry Points
// =============================================================================

export function introspectBus(
  obj: DBusObject,
  callback: (error: DBusError | null, result?: IntrospectResult) => void,
): void {
  const bus = obj.service.bus

  bus.invoke(
    {
      destination: obj.service.name,
      path: obj.name,
      interface: "org.freedesktop.DBus.Introspectable",
      member: "Introspect",
    },
    (error, xml) => {
      if (error) {
        callback(error as DBusError)
        return
      }

      processXML(xml as string, obj, callback)
    },
  )
}

export function introspectBusAsync(obj: DBusObject): Promise<IntrospectResult> {
  return new Promise((resolve, reject) => {
    introspectBus(obj, (error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(result!)
      }
    })
  })
}
