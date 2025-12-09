import { Buffer } from "node:buffer"
import type { Readable } from "node:stream"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const marshallData = require("./marshall")
import constants from "./constants"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DBusBuffer = require("./dbus-buffer")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const headerSignature = require("./header-signature.json")

interface DBusMessage {
  serial?: number
  type?: number
  flags?: number
  signature?: string
  body?: unknown[]
  [key: string]: unknown
}

interface UnmarshalOpts {
  ReturnLongjs?: boolean
}

export function unmarshalMessages(
  stream: Readable,
  onMessage: (message: DBusMessage) => void,
  opts?: UnmarshalOpts,
) {
  var state = 0 // 0: header, 1: fields + body
  var header: Buffer | null
  var fieldsAndBody: Buffer | null
  var fieldsLength: number
  var fieldsLengthPadded: number
  var fieldsAndBodyLength = 0
  var bodyLength = 0
  stream.on("readable", function () {
    while (true) {
      if (state === 0) {
        header = stream.read(16) as Buffer | null
        if (!header) break
        state = 1

        fieldsLength = header.readUInt32LE(12)
        fieldsLengthPadded = ((fieldsLength + 7) >> 3) << 3
        bodyLength = header.readUInt32LE(4)
        fieldsAndBodyLength = fieldsLengthPadded + bodyLength
      } else {
        fieldsAndBody = stream.read(fieldsAndBodyLength) as Buffer | null
        if (!fieldsAndBody) break
        state = 0

        var messageBuffer = new DBusBuffer(fieldsAndBody, undefined, opts)
        var unmarshalledHeader = messageBuffer.readArray(
          headerSignature[0].child[0],
          fieldsLength,
        )
        messageBuffer.align(3)
        var message: DBusMessage = {}
        message.serial = header!.readUInt32LE(8)

        for (var i = 0; i < unmarshalledHeader.length; ++i) {
          var headerName = constants.headerTypeName[unmarshalledHeader[i][0]]
          if (headerName) {
            message[headerName] = unmarshalledHeader[i][1][1][0]
          }
        }

        message.type = header!.readUInt8(1)
        message.flags = header!.readUInt8(2)

        if (bodyLength > 0 && message.signature) {
          message.body = messageBuffer.read(message.signature)
        }
        onMessage(message)
      }
    }
  })
}

// given buffer which contains entire message deserialise it
// TODO: factor out common code
export function unmarshall(buff: Buffer, opts?: UnmarshalOpts) {
  var msgBuf = new DBusBuffer(buff, undefined, opts)
  var headers = msgBuf.read("yyyyuua(yv)")
  var message: DBusMessage = {}
  for (var i = 0; i < headers[6].length; ++i) {
    var headerName = constants.headerTypeName[headers[6][i][0]]
    if (headerName) {
      message[headerName] = headers[6][i][1][1][0]
    }
  }
  message.type = headers[1]
  message.flags = headers[2]
  message.serial = headers[5]
  msgBuf.align(3)
  message.body = msgBuf.read(message.signature)
  return message
}

export function marshall(message: DBusMessage) {
  if (!message.serial) throw new Error("Missing or invalid serial")
  var flags = message.flags || 0
  var type = message.type || constants.messageType.methodCall
  var bodyLength = 0
  var bodyBuff: Buffer | undefined
  if (message.signature && message.body) {
    bodyBuff = marshallData(message.signature, message.body) as Buffer
    bodyLength = bodyBuff.length
  }
  var header = [
    constants.endianness.le,
    type,
    flags,
    constants.protocolVersion,
    bodyLength,
    message.serial,
  ]
  var headerBuff: Buffer = marshallData("yyyyuu", header)
  var fields: unknown[] = []
  constants.headerTypeName.forEach(function (fieldName) {
    if (!fieldName) return
    var fieldVal = message[fieldName]
    if (fieldVal) {
      fields.push([
        constants.headerTypeId[fieldName],
        [constants.fieldSignature[fieldName], fieldVal],
      ])
    }
  })
  var fieldsBuff: Buffer = marshallData("a(yv)", [fields], 12)
  var headerLenAligned = ((headerBuff.length + fieldsBuff.length + 7) >> 3) << 3
  var messageLen = headerLenAligned + bodyLength
  var messageBuff = Buffer.alloc(messageLen)
  headerBuff.copy(messageBuff)
  fieldsBuff.copy(messageBuff, headerBuff.length)
  if (bodyLength > 0) bodyBuff!.copy(messageBuff, headerLenAligned)

  return messageBuff
}

export default {
  unmarshalMessages,
  unmarshall,
  marshall,
}
