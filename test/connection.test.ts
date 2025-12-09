import { describe, test, expect, afterEach } from "bun:test"

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
        (err: Error | null, iface: any) => {
          if (err) return reject(err)

          iface.ListNames((err: Error | null, names: string[]) => {
            if (err) return reject(err)
            resolve(names)
          })
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
        (err: Error | null, iface: any) => {
          if (err) return reject(err)

          iface.GetId((err: Error | null, id: string) => {
            if (err) return reject(err)
            resolve(id)
          })
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
        (err: Error | null, iface: any) => {
          if (err) return reject(err)

          iface.NameHasOwner(
            "org.freedesktop.DBus",
            (err: Error | null, hasOwner: boolean) => {
              if (err) return reject(err)
              resolve(hasOwner)
            },
          )
        },
      )
    })

    expect(hasOwner).toBe(true)
  })
})
