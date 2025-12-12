import { readFile } from "fs/promises"
import { join } from "path"
import { describe, test, expect, mock } from "bun:test"
import { EventEmitter } from "events"

import {
  processXML,
  processXMLAsync,
  DBusInterface,
  DBusError,
  type DBusObject,
  type DBusMessage,
  type DBusCallback,
  type Bus,
  type IntrospectResult,
} from "../lib/introspect"

// =============================================================================
// Test Types
// =============================================================================

interface TestMethod {
  name: string
  signature: string
}

interface TestProperty {
  name: string
  type: string
  access?: string
}

interface TestInterface {
  name: string
  methods: TestMethod[]
  properties: TestProperty[]
}

interface TestExpected {
  interfaces: TestInterface[]
}

// =============================================================================
// Test Fixtures
// =============================================================================

const testCases = [{ description: "Basic Example", file: "example" }]

function createDummyObject(): DBusObject {
  return {
    name: "/test/path",
    service: {
      name: "com.test.Service",
      bus: {
        invoke: () => {},
        mangle: () => "",
        signals: new EventEmitter(),
        addMatch: () => {},
        removeMatch: () => {},
      } as unknown as Bus,
    },
  }
}

// =============================================================================
// processXML Tests
// =============================================================================

async function loadTestFixture(
  filename: string,
): Promise<{ xml: Buffer; expected: TestExpected }> {
  const fixturePath = join(
    import.meta.dirname!,
    "fixtures",
    "introspection",
    filename,
  )

  const [jsonData, xmlData] = await Promise.all([
    readFile(fixturePath + ".json", "utf8"),
    readFile(fixturePath + ".xml"),
  ])

  return {
    xml: xmlData,
    expected: JSON.parse(jsonData),
  }
}

function verifyIntrospectionResult(
  result: IntrospectResult,
  expected: TestExpected,
): void {
  for (const testInterface of expected.interfaces) {
    const proxyInterface = result.interfaces.get(testInterface.name)
    expect(proxyInterface).toBeDefined()
    if (!proxyInterface) throw new Error("proxyInterface is undefined")

    // Verify methods
    for (const method of testInterface.methods) {
      const methodInfo = proxyInterface.methods.get(method.name)
      expect(methodInfo).toBeDefined()
      expect(methodInfo?.inSignature).toBe(method.signature)
    }

    // Verify properties
    for (const property of testInterface.properties) {
      const propertyInfo = proxyInterface.properties.get(property.name)
      expect(propertyInfo).toBeDefined()
      if (!propertyInfo) throw new Error("propertyInfo is undefined")
      expect(propertyInfo.type).toBe(property.type)
    }
  }
}

describe("processXML", () => {
  for (const testCase of testCases) {
    test(`should correctly process ${testCase.description} (callback)`, async () => {
      const { xml, expected } = await loadTestFixture(testCase.file)
      const dummyObject = createDummyObject()

      return new Promise<void>((resolve, reject) => {
        processXML(xml, dummyObject, (error, result) => {
          if (error) {
            reject(error)
            return
          }

          try {
            expect(result).toBeDefined()
            verifyIntrospectionResult(result!, expected)
            resolve()
          } catch (err) {
            reject(err)
          }
        })
      })
    })

    test(`should correctly process ${testCase.description} (async)`, async () => {
      const { xml, expected } = await loadTestFixture(testCase.file)
      const dummyObject = createDummyObject()

      const result = await processXMLAsync(xml, dummyObject)
      verifyIntrospectionResult(result, expected)
    })
  }

  test("should return DBusError for invalid XML", async () => {
    const dummyObject = createDummyObject()

    return new Promise<void>((resolve, reject) => {
      processXML("not valid xml <><>", dummyObject, (error, result) => {
        try {
          expect(error).toBeDefined()
          expect(error).toBeInstanceOf(DBusError)
          expect(error?.errorName).toBe("org.freedesktop.DBus.Error.InvalidXml")
          expect(result).toBeUndefined()
          resolve()
        } catch (err) {
          reject(err)
        }
      })
    })
  })

  test("should reject with DBusError for invalid XML (async)", async () => {
    const dummyObject = createDummyObject()

    try {
      await processXMLAsync("not valid xml <><>", dummyObject)
      throw new Error("Expected to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(DBusError)
    }
  })

  test("should return DBusError for XML with no root node", async () => {
    const dummyObject = createDummyObject()
    const xml = '<?xml version="1.0"?><other></other>'

    return new Promise<void>((resolve, reject) => {
      processXML(xml, dummyObject, (error) => {
        try {
          expect(error).toBeDefined()
          expect(error).toBeInstanceOf(DBusError)
          expect(error?.errorName).toBe("org.freedesktop.DBus.Error.InvalidXml")
          resolve()
        } catch (err) {
          reject(err)
        }
      })
    })
  })
})

// =============================================================================
// DBusError Tests
// =============================================================================

describe("DBusError", () => {
  test("should have correct name and errorName", () => {
    const error = new DBusError(
      "org.freedesktop.DBus.Error.Failed",
      "Something went wrong",
    )

    expect(error.name).toBe("DBusError")
    expect(error.errorName).toBe("org.freedesktop.DBus.Error.Failed")
    expect(error.message).toBe("Something went wrong")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DBusError)
  })
})

// =============================================================================
// DBusInterface.call() Tests
// =============================================================================

describe("DBusInterface.call()", () => {
  test("should invoke bus.invoke with correct message", () => {
    let capturedMessage: DBusMessage | undefined

    const mockBus: Bus = {
      invoke: mock((message: DBusMessage, callback: DBusCallback) => {
        capturedMessage = message
        callback(null, "result")
      }),
      mangle: () => "",
      signals: new EventEmitter(),
      addMatch: () => {},
      removeMatch: () => {},
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const methods = new Map([
      [
        "TestMethod",
        { name: "TestMethod", inSignature: "ss", outSignature: "u" },
      ],
    ])

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      methods,
      new Map(),
      new Map(),
    )

    const callback = mock(() => {})
    iface.call("TestMethod", ["arg1", "arg2"], callback)

    expect(capturedMessage).toEqual({
      destination: "com.test.Service",
      path: "/test/path",
      interface: "com.test.Interface",
      member: "TestMethod",
      signature: "ss",
      body: ["arg1", "arg2"],
    })

    expect(callback).toHaveBeenCalledWith(null, "result")
  })

  test("should work without arguments for methods with no signature", () => {
    let capturedMessage: DBusMessage | undefined

    const mockBus: Bus = {
      invoke: mock((message: DBusMessage, callback: DBusCallback) => {
        capturedMessage = message
        callback(null, "result")
      }),
      mangle: () => "",
      signals: new EventEmitter(),
      addMatch: () => {},
      removeMatch: () => {},
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const methods = new Map([
      [
        "NoArgsMethod",
        { name: "NoArgsMethod", inSignature: "", outSignature: "s" },
      ],
    ])

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      methods,
      new Map(),
      new Map(),
    )

    const callback = mock(() => {})
    iface.call("NoArgsMethod", [], callback)

    expect(capturedMessage).toEqual({
      destination: "com.test.Service",
      path: "/test/path",
      interface: "com.test.Interface",
      member: "NoArgsMethod",
    })
  })
})

describe("DBusInterface.callAsync()", () => {
  test("should resolve with result on success", async () => {
    const mockBus: Bus = {
      invoke: mock((_message: DBusMessage, callback: DBusCallback) => {
        callback(null, "async result")
      }),
      mangle: () => "",
      signals: new EventEmitter(),
      addMatch: () => {},
      removeMatch: () => {},
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const methods = new Map([
      [
        "TestMethod",
        { name: "TestMethod", inSignature: "s", outSignature: "s" },
      ],
    ])

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      methods,
      new Map(),
      new Map(),
    )

    const result = await iface.callAsync("TestMethod", ["arg"])
    expect(result).toBe("async result")
  })

  test("should reject with error on failure", async () => {
    const mockBus: Bus = {
      invoke: mock((_message: DBusMessage, callback: DBusCallback) => {
        callback(
          new DBusError("org.freedesktop.DBus.Error.Failed", "Method failed"),
        )
      }),
      mangle: () => "",
      signals: new EventEmitter(),
      addMatch: () => {},
      removeMatch: () => {},
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const methods = new Map([
      [
        "FailingMethod",
        { name: "FailingMethod", inSignature: "", outSignature: "" },
      ],
    ])

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      methods,
      new Map(),
      new Map(),
    )

    try {
      await iface.callAsync("FailingMethod", [])
      throw new Error("Expected to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(DBusError)
    }
  })
})

// =============================================================================
// DBusInterface Property Tests
// =============================================================================

describe("DBusInterface.getProperty()", () => {
  test("should invoke Properties.Get with correct message", () => {
    let capturedMessage: DBusMessage | undefined

    const mockBus: Bus = {
      invoke: mock((message: DBusMessage, callback: DBusCallback) => {
        capturedMessage = message
        // Simulate variant response: [signature, [value]]
        callback(null, ["u", [42]])
      }),
      mangle: () => "",
      signals: new EventEmitter(),
      addMatch: () => {},
      removeMatch: () => {},
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const properties = new Map([
      ["Status", { name: "Status", type: "u", access: "read" as const }],
    ])

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      new Map(),
      properties,
      new Map(),
    )

    const callback = mock(() => {})
    iface.getProperty("Status", callback)

    expect(capturedMessage).toEqual({
      destination: "com.test.Service",
      path: "/test/path",
      interface: "org.freedesktop.DBus.Properties",
      member: "Get",
      signature: "ss",
      body: ["com.test.Interface", "Status"],
    })

    // Value should be unwrapped for single-type signatures
    expect(callback).toHaveBeenCalledWith(null, 42)
  })
})

describe("DBusInterface.getPropertyAsync()", () => {
  test("should resolve with unwrapped value", async () => {
    const mockBus: Bus = {
      invoke: mock((_message: DBusMessage, callback: DBusCallback) => {
        callback(null, ["s", ["hello"]])
      }),
      mangle: () => "",
      signals: new EventEmitter(),
      addMatch: () => {},
      removeMatch: () => {},
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const properties = new Map([
      ["Name", { name: "Name", type: "s", access: "read" as const }],
    ])

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      new Map(),
      properties,
      new Map(),
    )

    const result = await iface.getPropertyAsync("Name")
    expect(result).toBe("hello")
  })
})

describe("DBusInterface.setProperty()", () => {
  test("should invoke Properties.Set with correct message", () => {
    let capturedMessage: DBusMessage | undefined

    const mockBus: Bus = {
      invoke: mock((message: DBusMessage, callback: DBusCallback) => {
        capturedMessage = message
        callback(null)
      }),
      mangle: () => "",
      signals: new EventEmitter(),
      addMatch: () => {},
      removeMatch: () => {},
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const properties = new Map([
      ["Volume", { name: "Volume", type: "u", access: "readwrite" as const }],
    ])

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      new Map(),
      properties,
      new Map(),
    )

    const callback = mock(() => {})
    iface.setProperty("Volume", 75, callback)

    expect(capturedMessage).toEqual({
      destination: "com.test.Service",
      path: "/test/path",
      interface: "org.freedesktop.DBus.Properties",
      member: "Set",
      signature: "ssv",
      body: ["com.test.Interface", "Volume", ["u", 75]],
    })

    expect(callback).toHaveBeenCalledWith(null)
  })

  test("should return error for unknown property", () => {
    const mockBus: Bus = {
      invoke: mock(() => {}),
      mangle: () => "",
      signals: new EventEmitter(),
      addMatch: () => {},
      removeMatch: () => {},
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      new Map(),
      new Map(),
      new Map(),
    )

    const callback = mock(() => {})
    iface.setProperty("UnknownProperty", 123, callback)

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        errorName: "org.freedesktop.DBus.Error.UnknownProperty",
      }),
    )

    // bus.invoke should not have been called
    expect(mockBus.invoke).not.toHaveBeenCalled()
  })
})

describe("DBusInterface.setPropertyAsync()", () => {
  test("should resolve on success", async () => {
    const mockBus: Bus = {
      invoke: mock((_message: DBusMessage, callback: DBusCallback) => {
        callback(null)
      }),
      mangle: () => "",
      signals: new EventEmitter(),
      addMatch: () => {},
      removeMatch: () => {},
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const properties = new Map([
      ["Volume", { name: "Volume", type: "u", access: "readwrite" as const }],
    ])

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      new Map(),
      properties,
      new Map(),
    )

    const result = await iface.setPropertyAsync("Volume", 50)
    expect(result).toBeUndefined()
  })

  test("should reject for unknown property", async () => {
    const mockBus: Bus = {
      invoke: mock(() => {}),
      mangle: () => "",
      signals: new EventEmitter(),
      addMatch: () => {},
      removeMatch: () => {},
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      new Map(),
      new Map(),
      new Map(),
    )

    try {
      await iface.setPropertyAsync("UnknownProperty", 123)
      throw new Error("Expected to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(DBusError)
    }
  })
})

// =============================================================================
// DBusInterface Signal Tests
// =============================================================================

describe("DBusInterface signal handling", () => {
  test("on() should call addMatch and register listener", () => {
    const signalEmitter = new EventEmitter()
    let capturedMatch: string | undefined

    const mockBus: Bus = {
      invoke: mock(() => {}),
      mangle: (path: string, iface: string, member: string) =>
        `${path}:${iface}:${member}`,
      signals: signalEmitter,
      addMatch: mock(
        (match: string, callback: (err: DBusError | null) => void) => {
          capturedMatch = match
          callback(null)
        },
      ),
      removeMatch: mock(() => {}),
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const signals = new Map([
      ["StateChanged", { name: "StateChanged", signature: "is" }],
    ])

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      new Map(),
      new Map(),
      signals,
    )

    const handler = mock(() => {})
    iface.on("StateChanged", handler)

    expect(capturedMatch).toBe(
      "type='signal',path='/test/path',interface='com.test.Interface',member='StateChanged'",
    )

    // Simulate signal emission
    signalEmitter.emit("/test/path:com.test.Interface:StateChanged", [
      1,
      "active",
    ])

    expect(handler).toHaveBeenCalledWith([1, "active"])
  })

  test("off() should remove listener and call removeMatch when no listeners left", () => {
    const signalEmitter = new EventEmitter()
    let capturedRemoveMatch: string | undefined

    const mockBus: Bus = {
      invoke: mock(() => {}),
      mangle: (path: string, iface: string, member: string) =>
        `${path}:${iface}:${member}`,
      signals: signalEmitter,
      addMatch: mock(
        (_match: string, callback: (err: DBusError | null) => void) => {
          callback(null)
        },
      ),
      removeMatch: mock(
        (match: string, callback: (err: DBusError | null) => void) => {
          capturedRemoveMatch = match
          callback(null)
        },
      ),
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const signals = new Map([
      ["StateChanged", { name: "StateChanged", signature: "is" }],
    ])

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      new Map(),
      new Map(),
      signals,
    )

    const handler = mock(() => {})
    iface.on("StateChanged", handler)
    iface.off("StateChanged", handler)

    expect(capturedRemoveMatch).toBe(
      "type='signal',path='/test/path',interface='com.test.Interface',member='StateChanged'",
    )

    // Signal should no longer trigger handler
    signalEmitter.emit("/test/path:com.test.Interface:StateChanged", [
      2,
      "inactive",
    ])

    expect(handler).not.toHaveBeenCalled()
  })

  test("addListener and removeListener should be aliases", () => {
    const signalEmitter = new EventEmitter()

    const mockBus: Bus = {
      invoke: mock(() => {}),
      mangle: (path: string, iface: string, member: string) =>
        `${path}:${iface}:${member}`,
      signals: signalEmitter,
      addMatch: mock(
        (_match: string, callback: (err: DBusError | null) => void) => {
          callback(null)
        },
      ),
      removeMatch: mock(
        (_match: string, callback: (err: DBusError | null) => void) => {
          callback(null)
        },
      ),
    }

    const parent: DBusObject = {
      name: "/test/path",
      service: {
        name: "com.test.Service",
        bus: mockBus,
      },
    }

    const iface = new DBusInterface(
      parent,
      "com.test.Interface",
      new Map(),
      new Map(),
      new Map(),
    )

    const handler = mock(() => {})

    // These should work without errors
    iface.addListener("TestSignal", handler)
    iface.removeListener("TestSignal", handler)

    expect(mockBus.addMatch).toHaveBeenCalled()
    expect(mockBus.removeMatch).toHaveBeenCalled()
  })
})
