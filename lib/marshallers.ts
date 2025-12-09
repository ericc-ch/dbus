import { Buffer } from "node:buffer"
import { align } from "./align"
import Long from "long"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const parseSignature = require("../lib/signature")

interface PutStream {
  _offset: number
  put(buf: Buffer): PutStream
  word8(val: number): PutStream
  word16le(val: number): PutStream
  word32le(val: number): PutStream
}

interface Marshaller {
  check: (data: unknown) => unknown
  marshall: (ps: PutStream, data: unknown) => void
}

/**
 * MakeSimpleMarshaller
 * @param signature - the signature of the data you want to check
 * @returns a simple marshaller with the "check" method
 *
 * check returns nothing - it only raises errors if the data is
 * invalid for the signature
 */
export var MakeSimpleMarshaller = function (signature: string): Marshaller {
  var marshaller = {} as Marshaller
  function checkValidString(data: unknown) {
    if (typeof data !== "string") {
      throw new Error(`Data: ${data} was not of type string`)
    } else if (data.indexOf("\0") !== -1) {
      throw new Error("String contains null byte")
    }
  }

  function checkValidSignature(data: string) {
    if (data.length > 0xff) {
      throw new Error(
        `Data: ${data} is too long for signature type (${data.length} > 255)`,
      )
    }

    var parenCount = 0
    for (var ii = 0; ii < data.length; ++ii) {
      if (parenCount > 32) {
        throw new Error(
          `Maximum container type nesting exceeded in signature type:${data}`,
        )
      }
      switch (data[ii]) {
        case "(":
          ++parenCount
          break
        case ")":
          --parenCount
          break
        default:
          /* no-op */
          break
      }
    }
    parseSignature(data)
  }

  switch (signature) {
    case "o":
    // object path
    // TODO: verify object path here?
    case "s": // eslint-disable-line no-fallthrough
      //STRING
      marshaller.check = function (data) {
        checkValidString(data)
      }
      marshaller.marshall = function (ps, data) {
        this.check(data)
        // utf8 string
        align(ps, 4)
        const buff = Buffer.from(data as string, "utf8")
        ps.word32le(buff.length).put(buff).word8(0)
        ps._offset += 5 + buff.length
      }
      break
    case "g":
      //SIGNATURE
      marshaller.check = function (data) {
        checkValidString(data)
        checkValidSignature(data as string)
      }
      marshaller.marshall = function (ps, data) {
        this.check(data)
        // signature
        const buff = Buffer.from(data as string, "ascii")
        ps.word8((data as string).length)
          .put(buff)
          .word8(0)
        ps._offset += 2 + buff.length
      }
      break
    case "y":
      //BYTE
      marshaller.check = function (data) {
        checkInteger(data)
        checkRange(0x00, 0xff, data as number)
      }
      marshaller.marshall = function (ps, data) {
        this.check(data)
        ps.word8(data as number)
        ps._offset++
      }
      break
    case "b":
      //BOOLEAN
      marshaller.check = function (data) {
        checkBoolean(data)
      }
      marshaller.marshall = function (ps, data) {
        this.check(data)
        // booleans serialised as 0/1 unsigned 32 bit int
        var val = data ? 1 : 0
        align(ps, 4)
        ps.word32le(val)
        ps._offset += 4
      }
      break
    case "n":
      //INT16
      marshaller.check = function (data) {
        checkInteger(data)
        checkRange(-0x7fff - 1, 0x7fff, data as number)
      }
      marshaller.marshall = function (ps, data) {
        this.check(data)
        align(ps, 2)
        const buff = Buffer.alloc(2)
        buff.writeInt16LE(parseInt(data as string), 0)
        ps.put(buff)
        ps._offset += 2
      }
      break
    case "q":
      //UINT16
      marshaller.check = function (data) {
        checkInteger(data)
        checkRange(0, 0xffff, data as number)
      }
      marshaller.marshall = function (ps, data) {
        this.check(data)
        align(ps, 2)
        ps.word16le(data as number)
        ps._offset += 2
      }
      break
    case "i":
      //INT32
      marshaller.check = function (data) {
        checkInteger(data)
        checkRange(-0x7fffffff - 1, 0x7fffffff, data as number)
      }
      marshaller.marshall = function (ps, data) {
        this.check(data)
        align(ps, 4)
        const buff = Buffer.alloc(4)
        buff.writeInt32LE(parseInt(data as string), 0)
        ps.put(buff)
        ps._offset += 4
      }
      break
    case "u":
      //UINT32
      marshaller.check = function (data) {
        checkInteger(data)
        checkRange(0, 0xffffffff, data as number)
      }
      marshaller.marshall = function (ps, data) {
        this.check(data)
        // 32 t unsigned int
        align(ps, 4)
        ps.word32le(data as number)
        ps._offset += 4
      }
      break
    case "t":
      //UINT64
      marshaller.check = function (data) {
        return checkLong(data, false)
      }
      marshaller.marshall = function (ps, data) {
        var longData = this.check(data) as Long
        align(ps, 8)
        ps.word32le(longData.low)
        ps.word32le(longData.high)
        ps._offset += 8
      }
      break
    case "x":
      //INT64
      marshaller.check = function (data) {
        return checkLong(data, true)
      }
      marshaller.marshall = function (ps, data) {
        var longData = this.check(data) as Long
        align(ps, 8)
        ps.word32le(longData.low)
        ps.word32le(longData.high)
        ps._offset += 8
      }
      break
    case "d":
      //DOUBLE
      marshaller.check = function (data) {
        if (typeof data !== "number") {
          throw new Error(`Data: ${data} was not of type number`)
        } else if (Number.isNaN(data)) {
          throw new Error(`Data: ${data} was not a number`)
        } else if (!Number.isFinite(data)) {
          throw new Error("Number outside range")
        }
      }
      marshaller.marshall = function (ps, data) {
        this.check(data)
        align(ps, 8)
        const buff = Buffer.alloc(8)
        buff.writeDoubleLE(parseFloat(data as string), 0)
        ps.put(buff)
        ps._offset += 8
      }
      break
    default:
      throw new Error(`Unknown data type format: ${signature}`)
  }
  return marshaller
}

var checkRange = function (minValue: number, maxValue: number, data: number) {
  if (data > maxValue || data < minValue) {
    throw new Error("Number outside range")
  }
}

var checkInteger = function (data: unknown) {
  if (typeof data !== "number") {
    throw new Error(`Data: ${data} was not of type number`)
  }
  if (Math.floor(data) !== data) {
    throw new Error(`Data: ${data} was not an integer`)
  }
}

var checkBoolean = function (data: unknown) {
  if (!(typeof data === "boolean" || data === 0 || data === 1))
    throw new Error(`Data: ${data} was not of type boolean`)
}

interface LongLike {
  low: number
  high: number
  unsigned: boolean
}

// This is essentially a tweaked version of 'fromValue' from Long.js with error checking.
// This can take number or string of decimal characters or 'Long' instance (or Long-style object with props low,high,unsigned).
var makeLong = function (val: unknown, signed: boolean): Long {
  if (val instanceof Long) return val
  if (val instanceof Number) val = val.valueOf()
  if (typeof val === "number") {
    try {
      // Long.js won't alert you to precision loss in passing more than 53 bit ints through a double number, so we check here
      checkInteger(val)
      if (signed) {
        checkRange(-0x1fffffffffffff, 0x1fffffffffffff, val)
      } else {
        checkRange(0, 0x1fffffffffffff, val)
      }
    } catch (e) {
      ;(e as Error).message += " (Number type can only carry 53 bit integer)"
      throw e
    }
    try {
      return Long.fromNumber(val, !signed)
    } catch (e) {
      ;(e as Error).message =
        `Error converting number to 64bit integer "${(e as Error).message}"`
      throw e
    }
  }
  if (typeof val === "string" || val instanceof String) {
    var radix = 10
    var strVal = val.toString().trim().toUpperCase() // remove extra whitespace and make uppercase (for hex)
    if (strVal.substring(0, 2) === "0X") {
      radix = 16
      strVal = strVal.substring(2)
    } else if (strVal.substring(0, 3) === "-0X") {
      // unusual, but just in case?
      radix = 16
      strVal = `-${strVal.substring(3)}`
    }
    strVal = strVal.replace(/^0+(?=\d)/, "") // dump leading zeroes
    var data: Long
    try {
      data = Long.fromString(strVal, !signed, radix)
    } catch (e) {
      ;(e as Error).message =
        `Error converting string to 64bit integer '${(e as Error).message}'`
      throw e
    }
    // If string represents a number outside of 64 bit range, it can quietly overflow.
    // We assume if things converted correctly the string coming out of Long should match what went into it.
    if (data.toString(radix).toUpperCase() !== strVal)
      throw new Error(
        `Data: '${strVal}' did not convert correctly to ${
          signed ? "signed" : "unsigned"
        } 64 bit`,
      )
    return data
  }
  // Throws for non-objects, converts non-instanceof Long:
  try {
    var longLike = val as LongLike
    return Long.fromBits(longLike.low, longLike.high, longLike.unsigned)
  } catch (e) {
    ;(e as Error).message =
      `Error converting object to 64bit integer '${(e as Error).message}'`
    throw e
  }
}

var checkLong = function (data: unknown, signed: boolean): Long {
  var longData: Long
  if (!Long.isLong(data)) {
    longData = makeLong(data, signed)
  } else {
    longData = data
  }

  // Do we enforce that Long.js object unsigned/signed match the field even if it is still in range?
  // Probably, might help users avoid unintended bugs?
  if (signed) {
    if (longData.unsigned)
      throw new Error(
        "Longjs object is unsigned, but marshalling into signed 64 bit field",
      )
    if (longData.gt(Long.MAX_VALUE) || longData.lt(Long.MIN_VALUE)) {
      throw new Error(`Data: ${longData} was out of range (64-bit signed)`)
    }
  } else {
    if (!longData.unsigned)
      throw new Error(
        "Longjs object is signed, but marshalling into unsigned 64 bit field",
      )
    // NOTE: data.gt(Long.MAX_UNSIGNED_VALUE) will catch if Long.js object is a signed value but is still within unsigned range!
    //  Since we are enforcing signed type matching between Long.js object and field, this note should not matter.
    if (longData.gt(Long.MAX_UNSIGNED_VALUE) || longData.lt(0)) {
      throw new Error(`Data: ${longData} was out of range (64-bit unsigned)`)
    }
  }
  return longData
}
