export const messageType = {
  invalid: 0,
  methodCall: 1,
  methodReturn: 2,
  error: 3,
  signal: 4,
} as const

export type MessageTypeName = keyof typeof messageType
export type MessageTypeValue = (typeof messageType)[MessageTypeName]

// Header field names indexed by type ID (index 0 is null/unused)
export const headerTypeName = [
  null,
  "path",
  "interface",
  "member",
  "errorName",
  "replySerial",
  "destination",
  "sender",
  "signature",
] as const

export type HeaderFieldName = Exclude<(typeof headerTypeName)[number], null>

// Alternative: fieldSignature and headerTypeId could be merged into a single map
// (e.g., path -> [1, 'o']) but are kept separate for backward compatibility and readability
export const fieldSignature = {
  path: "o",
  interface: "s",
  member: "s",
  errorName: "s",
  replySerial: "u",
  destination: "s",
  sender: "s",
  signature: "g",
} as const

export type FieldSignatureChar = (typeof fieldSignature)[HeaderFieldName]

export const headerTypeId = {
  path: 1,
  interface: 2,
  member: 3,
  errorName: 4,
  replySerial: 5,
  destination: 6,
  sender: 7,
  signature: 8,
} as const

export const protocolVersion = 1 as const

export const flags = {
  noReplyExpected: 1,
  noAutoStart: 2,
} as const

export type FlagName = keyof typeof flags

// Byte values for endianness marker ('l' = 108, 'B' = 66)
export const endianness = {
  le: 108,
  be: 66,
} as const

export type Endianness = keyof typeof endianness

export const messageSignature = "yyyyuua(yv)" as const

export const defaultAuthMethods = [
  "EXTERNAL",
  "DBUS_COOKIE_SHA1",
  "ANONYMOUS",
] as const

export type AuthMethod = (typeof defaultAuthMethods)[number]

// Default export for backward compatibility
export default {
  messageType,
  headerTypeName,
  headerTypeId,
  fieldSignature,
  protocolVersion,
  flags,
  endianness,
  messageSignature,
  defaultAuthMethods,
}
