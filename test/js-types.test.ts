import { describe, test, expect } from "bun:test"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const marshall = require("../lib/marshall")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const unmarshall = require("../lib/unmarshall")

function testRoundtrip(signature: string, data: unknown): void {
  const marshalledBuffer = marshall(signature, data)
  const result = unmarshall(marshalledBuffer, signature)
  try {
    expect(data).toEqual(result)
  } catch {
    console.log("signature   :", signature)
    console.log("orig        :", data)
    console.log("unmarshalled:", result)
    throw new Error("results don't match")
  }
}

describe("when signature is a{sX} and hashAsObject is used", () => {
  test.todo("serialises to expected value", () => {
    testRoundtrip("a{sv}", {
      test1: { subobj: { a1: 10, a2: "qqq", a3: 1.11 }, test2: 12 },
    })
  })
})
