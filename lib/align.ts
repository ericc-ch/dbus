import { Buffer } from "node:buffer"

/**
 * Interface for a stream that supports writing buffers and tracking offset.
 */
export interface PutStream {
  _offset: number
  put(buffer: Buffer): void
}

/**
 * Aligns the stream position to the specified byte boundary.
 * D-Bus requires data types to be aligned to their natural boundaries:
 * - 2 bytes for int16/uint16
 * - 4 bytes for int32/uint32/bool/string/object-path
 * - 8 bytes for int64/uint64/double/structs
 */
export function align(stream: PutStream, alignment: number) {
  const padding = alignment - (stream._offset % alignment)
  if (padding === 0 || padding === alignment) return

  const padBuffer = Buffer.alloc(padding)
  stream.put(padBuffer)
  stream._offset += padding
}
