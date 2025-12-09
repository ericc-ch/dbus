import { Buffer } from "node:buffer"
import { readdirSync, readFileSync } from "fs"
import { describe, test, expect } from "bun:test"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const message = require("../lib/message")

const dir = `${import.meta.dirname}/fixtures/messages/`

describe("given base-64 encoded files with complete messages", () => {
  test("should be able to read them all", () => {
    const messages = readdirSync(dir)

    for (const name of messages) {
      const msg = readFileSync(dir + name, "ascii")
      const msgBin = Buffer.from(msg, "base64")
      const unmarshalledMsg = message.unmarshall(msgBin)
      const marshalled = message.marshall(unmarshalledMsg)
      expect(unmarshalledMsg).toEqual(message.unmarshall(marshalled))
    }
  })
})
