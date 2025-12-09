import { describe, test, expect } from "bun:test"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const message = require("../lib/message")
import testdata from "./testdata"

interface DBusMessage {
  type: number
  serial: number
  destination: string
  flags: number
  signature: string
  body: unknown[]
}

function msg2buff(msg: DBusMessage): Buffer {
  return message.marshall(msg)
}

function buff2msg(buff: Buffer): DBusMessage {
  return message.unmarshall(buff)
}

describe("message marshall/unmarshall", () => {
  for (const testName in testdata) {
    const testSuite = testdata[testName]
    if (!testSuite) continue

    for (let testNum = 0; testNum < testSuite.length; ++testNum) {
      const testCase = testSuite[testNum]
      if (!testCase) continue

      const [signature, data, shouldFail] = testCase
      const testDesc = `${testName} ${testNum} ${signature}<-${JSON.stringify(data)}`

      if (shouldFail !== false) {
        test(testDesc, () => {
          const msg: DBusMessage = {
            type: 1,
            serial: 1,
            destination: "final",
            flags: 1,
            signature,
            body: data,
          }
          expect(msg).toEqual(buff2msg(msg2buff(msg)))
        })
      }
    }
  }
})
