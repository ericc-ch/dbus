import { EventEmitter } from "events"
import { Socket } from "net"

export { DBusTypeCode, SignatureNode, parseSignature } from "./lib/signature"

// Re-export from introspect.ts
export {
  DBusError,
  DBusInterface,
  DBusMethodInfo,
  DBusPropertyInfo,
  DBusSignalInfo,
  DBusCallback,
  SignalHandler,
  IntrospectResult,
  introspectBus,
  introspectBusAsync,
  processXML,
  processXMLAsync,
} from "./lib/introspect"

export function systemBus(): MessageBus

export class MessageBus {
  connection: BusConnection
  public invoke(
    message: DBusMessage,
    callback: (error: DBusError | undefined, value: unknown) => void,
  ): void
  public getService(name: string): DBusService
}

export class BusConnection extends EventEmitter {
  public stream: Socket
}

export class DBusService {
  public name: string
  public bus: MessageBus
  public getObject(
    name: string,
    callback: (error: null | Error, obj?: DBusObject) => void,
  ): DBusObject
  public getInterface(
    objName: string,
    ifaceName: string,
    callback: (error: null | Error, iface?: DBusInterface) => void,
  ): void
}

export class DBusObject {
  public name: string
  public service: DBusService
  public proxy: Map<string, DBusInterface>
  public nodes: string[]
  public as(name: string): DBusInterface | undefined
}

export interface DBusMessage {
  destination?: string
  path?: string
  interface?: string
  member?: string
  signature?: string
  body?: unknown[]
}

import type { DBusError, DBusInterface } from "./lib/introspect"
