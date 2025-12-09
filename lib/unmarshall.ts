import { Buffer } from "node:buffer"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DBusBuffer = require("./dbus-buffer")

export default function unmarshall(
  buffer: Buffer,
  signature: string,
  startPos?: number,
  options?: unknown,
) {
  if (!startPos) startPos = 0
  if (signature === "") return Buffer.from("")
  var dbuff = new DBusBuffer(buffer, startPos, options)
  return dbuff.read(signature)
}
