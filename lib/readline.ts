import { Buffer } from "node:buffer"
import type { Readable } from "node:stream"

const NEWLINE_BYTE = 0x0a

interface ReadableStream extends Readable {
  read(size: number): Buffer | null
}

export default function readOneLine(
  stream: ReadableStream,
  callback: (line: Buffer) => void,
) {
  const collectedBytes: number[] = []

  function onReadable() {
    while (true) {
      const chunk = stream.read(1)
      if (!chunk) return

      const byte = chunk[0]!
      if (byte === NEWLINE_BYTE) {
        try {
          callback(Buffer.from(collectedBytes))
        } catch (error) {
          stream.emit("error", error)
        }
        stream.removeListener("readable", onReadable)
        return
      }
      collectedBytes.push(byte)
    }
  }

  stream.on("readable", onReadable)
}
