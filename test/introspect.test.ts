import { readFile } from "fs/promises"
import { join } from "path"
import { describe, test, expect } from "bun:test"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const introspect = require("../lib/introspect")

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

interface ProxyInterface {
  $methods: Record<string, string>
  $properties: Record<string, { type: string }>
}

interface Proxy {
  [interfaceName: string]: ProxyInterface
}

// Introspection test cases
const testCases = [{ desc: "Basic Example", file: "example" }]

const dummyObj = {}

async function testXml(fname: string): Promise<void> {
  const fpath = join(import.meta.dirname!, "fixtures", "introspection", fname)

  // get expected data from json file
  const jsonData = await readFile(fpath + ".json", "utf8")
  const testObj: TestExpected = JSON.parse(jsonData)

  // get introspect xml from xml file
  const xmlData = await readFile(fpath + ".xml")

  return new Promise((resolve, reject) => {
    introspect.processXML(
      null,
      xmlData,
      dummyObj,
      (err: Error | null, proxy: Proxy, _nodes: unknown) => {
        if (err) {
          reject(err)
          return
        }

        try {
          checkIntrospection(testObj, proxy)
          resolve()
        } catch (e) {
          reject(e)
        }
      },
    )
  })
}

function checkIntrospection(testObj: TestExpected, proxy: Proxy): void {
  for (const testInterface of testObj.interfaces) {
    const proxyInterface = proxy[testInterface.name]
    expect(proxyInterface).toBeDefined()
    if (!proxyInterface) throw new Error("proxyInterface is undefined")

    for (const method of testInterface.methods) {
      const curMethod = proxyInterface.$methods[method.name]
      expect(curMethod).toBeDefined()
      expect(curMethod).toBe(method.signature)
    }

    for (const prop of testInterface.properties) {
      const curProp = proxyInterface.$properties[prop.name]
      expect(curProp).toBeDefined()
      if (!curProp) throw new Error("curProp is undefined")
      expect(curProp.type).toBe(prop.type)
    }
  }
}

describe("given introspect xml", () => {
  for (const curTest of testCases) {
    test(`should correctly process ${curTest.desc}`, async () => {
      await testXml(curTest.file)
    })
  }
})
