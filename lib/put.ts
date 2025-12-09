import { Buffer } from "node:buffer"

interface Word {
  buffer?: Buffer
  bytes?: number
  value?: number
  endian?: "little"
}

export class Put {
  private words: Word[] = []
  private _length: number = 0
  _offset: number = 0

  put(buffer: Buffer): this {
    this.words.push({ buffer })
    this._length += buffer.length
    return this
  }

  word8(value: number): this {
    this.words.push({ bytes: 1, value })
    this._length += 1
    return this
  }

  word16le(value: number): this {
    this.words.push({ endian: "little", bytes: 2, value })
    this._length += 2
    return this
  }

  word32le(value: number): this {
    this.words.push({ endian: "little", bytes: 4, value })
    this._length += 4
    return this
  }

  buffer(): Buffer {
    const result = Buffer.alloc(this._length)
    let offset = 0

    for (const word of this.words) {
      if (word.buffer) {
        word.buffer.copy(result, offset, 0)
        offset += word.buffer.length
      } else if (word.bytes !== undefined && word.value !== undefined) {
        // Little-endian: write LSB first
        for (let i = 0; i < word.bytes * 8; i += 8) {
          result[offset++] = (word.value >> i) & 0xff
        }
      }
    }

    return result
  }
}

export default function put(): Put {
  return new Put()
}
