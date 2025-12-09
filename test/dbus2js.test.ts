import { describe, test, expect } from "bun:test"
import { $ } from "bun"
import { join } from "path"

const scriptPath = join(import.meta.dirname!, "..", "bin", "dbus2js.ts")
const fixturesPath = join(import.meta.dirname!, "fixtures", "introspection")

describe("dbus2js", () => {
  test("shows help with --help", async () => {
    const result = await $`bun ${scriptPath} --help`.text()
    expect(result).toContain("--bus")
    expect(result).toContain("--service")
    expect(result).toContain("--path")
    expect(result).toContain("--xml")
    expect(result).toContain("--dump")
  })

  test("dumps xml with --dump", async () => {
    const xmlPath = join(fixturesPath, "example.xml")
    const result = await $`bun ${scriptPath} --xml ${xmlPath} --dump`.text()
    expect(result).toContain("com.example.MyService1.InterestingInterface")
    expect(result).toContain('<method name="AddContact">')
  })

  test("generates typescript from xml", async () => {
    const xmlPath = join(fixturesPath, "example.xml")
    const result =
      await $`bun ${scriptPath} --xml ${xmlPath} --service com.example.Service --path /com/example/Object`.text()

    // check import
    expect(result).toContain("import type { MessageBus }")
    expect(result).toContain("@echristian/dbus-native")

    // check interface
    expect(result).toContain(
      "export interface ComExampleMyService1InterestingInterfaceMethods",
    )
    expect(result).toContain("AddContact(")

    // check factory function
    expect(result).toContain(
      "export function createComExampleMyService1InterestingInterface",
    )
    expect(result).toContain("bus: MessageBus")

    // check method implementation
    expect(result).toContain("bus.invoke(")
    expect(result).toContain("destination: 'com.example.Service'")
    expect(result).toContain("path: '/com/example/Object'")
    expect(result).toContain(
      "interface: 'com.example.MyService1.InterestingInterface'",
    )
    expect(result).toContain("member: 'AddContact'")
    expect(result).toContain("signature: 'ss'")
  })

  test("requires service and path when not using xml", async () => {
    const result = await $`bun ${scriptPath} 2>&1`.nothrow()
    expect(result.exitCode).not.toBe(0)
    expect(result.text()).toContain(
      "Either --xml or both --service and --path are required",
    )
  })

  test("handles xml file with service/path overrides", async () => {
    const xmlPath = join(fixturesPath, "example.xml")
    const result =
      await $`bun ${scriptPath} --xml ${xmlPath} --service my.custom.Service --path /my/custom/path`.text()

    expect(result).toContain("destination: 'my.custom.Service'")
    expect(result).toContain("path: '/my/custom/path'")
  })
})

describe("dbus type to typescript conversion", () => {
  // these tests verify the output contains correct types

  test("basic types are converted correctly", async () => {
    const xmlPath = join(fixturesPath, "example.xml")
    const result =
      await $`bun ${scriptPath} --xml ${xmlPath} --service test --path /test`.text()

    // AddContact has 'ss' input (string, string) and 'u' output (number)
    expect(result).toContain("name: string")
    expect(result).toContain("email: string")
    expect(result).toContain("result: number") // uint32 -> number
  })
})
