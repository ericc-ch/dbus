import { describe, test, expect, afterEach } from "bun:test"

import type { DBusInterface, DBusCallback } from "../lib/introspect"

const dbus = require("../index.js")

describe("connection", () => {
  let bus: any = null

  afterEach(() => {
    if (bus?.connection) {
      bus.connection.end()
      bus = null
    }
  })

  test("connects to session bus and lists names", async () => {
    bus = dbus.sessionBus()
    expect(bus).toBeDefined()

    const names = await new Promise<string[]>((resolve, reject) => {
      bus.getInterface(
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus",
        (err: Error | null, iface: DBusInterface) => {
          if (err) return reject(err)

          iface.call("ListNames", [], ((err, names) => {
            if (err) return reject(err)
            resolve(names as string[])
          }) as DBusCallback)
        },
      )
    })

    expect(Array.isArray(names)).toBe(true)
    expect(names).toContain("org.freedesktop.DBus")
  })

  test("gets bus id from session bus", async () => {
    bus = dbus.sessionBus()
    expect(bus).toBeDefined()

    const id = await new Promise<string>((resolve, reject) => {
      bus.getInterface(
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus",
        (err: Error | null, iface: DBusInterface) => {
          if (err) return reject(err)

          iface.call("GetId", [], ((err, id) => {
            if (err) return reject(err)
            resolve(id as string)
          }) as DBusCallback)
        },
      )
    })

    expect(typeof id).toBe("string")
    expect(id.length).toBeGreaterThan(0)
  })

  test("checks if name has owner", async () => {
    bus = dbus.sessionBus()
    expect(bus).toBeDefined()

    const hasOwner = await new Promise<boolean>((resolve, reject) => {
      bus.getInterface(
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus",
        (err: Error | null, iface: DBusInterface) => {
          if (err) return reject(err)

          iface.call("NameHasOwner", ["org.freedesktop.DBus"], ((
            err,
            hasOwner,
          ) => {
            if (err) return reject(err)
            resolve(hasOwner as boolean)
          }) as DBusCallback)
        },
      )
    })

    expect(hasOwner).toBe(true)
  })
})
