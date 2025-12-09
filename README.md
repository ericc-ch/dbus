# D-Bus Native

Pure JavaScript D-Bus protocol client and server for Node.js.

Forked from [homebridge/dbus-native](https://github.com/homebridge/dbus-native).

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Guide](#guide)
  - [Connecting to the Bus](#connecting-to-the-bus)
  - [Calling Methods on Existing Services](#calling-methods-on-existing-services)
  - [Creating a Service](#creating-a-service)
  - [Properties](#properties)
  - [Signals](#signals)
  - [Low-Level Messaging](#low-level-messaging)
- [CLI Tools](#cli-tools)
  - [dbus2js](#dbus2js)
  - [dbus-dissect](#dbus-dissect)
- [API Reference](#api-reference)
  - [sessionBus / systemBus](#sessionbus--systembus)
  - [createClient](#createclient)
  - [createConnection](#createconnection)
  - [Connection Options](#connection-options)
  - [MessageBus Methods](#messagebus-methods)
  - [Interface Description Format](#interface-description-format)
  - [D-Bus Type Signatures](#d-bus-type-signatures)
- [64-bit Integer Handling](#64-bit-integer-handling)
- [Examples](#examples)
- [TypeScript](#typescript)
- [Links](#links)

---

## Installation

```shell
npm install @echristian/dbus-native
```

---

## Quick Start

### Send a Desktop Notification

```js
const dbus = require("@echristian/dbus-native")

const sessionBus = dbus.sessionBus()

sessionBus
  .getService("org.freedesktop.Notifications")
  .getInterface(
    "/org/freedesktop/Notifications",
    "org.freedesktop.Notifications",
    (err, notifications) => {
      if (err) {
        console.error("Failed to get interface:", err)
        return
      }

      notifications.Notify(
        "MyApp", // app name
        0, // replaces_id
        "", // icon
        "Hello!", // summary
        "Hello World", // body
        [], // actions
        {}, // hints
        5000, // timeout (ms)
        (err, id) => {
          if (err) console.error(err)
          else console.log("Notification ID:", id)
        },
      )
    },
  )
```

### Create a Simple Service

```js
const dbus = require("@echristian/dbus-native")

const sessionBus = dbus.sessionBus()
const serviceName = "com.example.MyService"
const objectPath = "/com/example/MyService"

sessionBus.requestName(serviceName, 0x4, (err, retCode) => {
  if (err) throw new Error(`Failed to request name: ${err}`)
  if (retCode !== 1) throw new Error(`Name request failed with code ${retCode}`)

  console.log(`Service "${serviceName}" is running`)

  const ifaceDesc = {
    name: serviceName,
    methods: {
      SayHello: ["s", "s", ["name"], ["greeting"]],
    },
    properties: {},
    signals: {},
  }

  const iface = {
    SayHello: (name) => `Hello, ${name}!`,
  }

  sessionBus.exportInterface(iface, objectPath, ifaceDesc)
})
```

### Call Your Service

```js
const dbus = require("@echristian/dbus-native")

const sessionBus = dbus.sessionBus()
const serviceName = "com.example.MyService"
const objectPath = "/com/example/MyService"

sessionBus
  .getService(serviceName)
  .getInterface(objectPath, serviceName, (err, iface) => {
    if (err) {
      console.error("Failed to get interface:", err)
      return
    }

    iface.SayHello("World", (err, greeting) => {
      if (err) console.error(err)
      else console.log(greeting) // "Hello, World!"
    })
  })
```

---

## Guide

### Connecting to the Bus

D-Bus has two main buses:

- **Session Bus**: Per-user bus for desktop applications
- **System Bus**: System-wide bus for system services

```js
const dbus = require("@echristian/dbus-native")

// Connect to the session bus (uses DBUS_SESSION_BUS_ADDRESS env var)
const sessionBus = dbus.sessionBus()

// Connect to the system bus
const systemBus = dbus.systemBus()
```

You can also pass options:

```js
const bus = dbus.sessionBus({
  busAddress: "unix:path=/run/user/1000/bus",
  authMethods: ["EXTERNAL"],
  ayBuffer: true, // return 'ay' (byte arrays) as Buffer
  ReturnLongjs: false, // return 64-bit ints as number (not Long.js)
})
```

### Calling Methods on Existing Services

To call methods on an existing D-Bus service:

1. Get the service by its well-known name
2. Get the interface on a specific object path
3. Call methods on the interface

```js
const dbus = require("@echristian/dbus-native")

const sessionBus = dbus.sessionBus()

// Step 1: Get the service
const service = sessionBus.getService("org.freedesktop.Notifications")

// Step 2: Get the interface
service.getInterface(
  "/org/freedesktop/Notifications", // object path
  "org.freedesktop.Notifications", // interface name
  (err, iface) => {
    if (err) {
      console.error("Failed to get interface:", err)
      process.exit(1)
    }

    // Step 3: Call a method
    iface.GetCapabilities((err, capabilities) => {
      if (err) {
        console.error("Method call failed:", err)
      } else {
        console.log("Notification capabilities:", capabilities)
      }
    })
  },
)
```

You can also use `bus.getInterface()` as a shortcut:

```js
sessionBus.getInterface(
  "org.freedesktop.Notifications", // service name
  "/org/freedesktop/Notifications", // object path
  "org.freedesktop.Notifications", // interface name
  (err, iface) => {
    // ...
  },
)
```

### Creating a Service

To expose your own D-Bus service:

1. Connect to the bus
2. Request a well-known name
3. Define your interface description
4. Implement the interface
5. Export it

```js
const dbus = require("@echristian/dbus-native")

const sessionBus = dbus.sessionBus()
const serviceName = "com.example.Calculator"
const objectPath = "/com/example/Calculator"
const interfaceName = serviceName

// Check connection
if (!sessionBus) {
  throw new Error("Could not connect to the DBus session bus.")
}

// Request the service name
// Flag 0x4 = DBUS_NAME_FLAG_DO_NOT_QUEUE (fail if name is taken)
sessionBus.requestName(serviceName, 0x4, (err, retCode) => {
  if (err) {
    throw new Error(`Could not request service name: ${err}`)
  }

  // Return codes: 1 = success, 2 = in queue, 3 = exists, 4 = already owner
  if (retCode !== 1) {
    throw new Error(`Failed to request name. Return code: ${retCode}`)
  }

  console.log(`Service "${serviceName}" is now running`)

  // Define the interface
  const ifaceDesc = {
    name: interfaceName,
    methods: {
      // Format: [inputSignature, outputSignature, [inputNames], [outputNames]]
      Add: ["ii", "i", ["a", "b"], ["sum"]],
      Subtract: ["ii", "i", ["a", "b"], ["difference"]],
      Multiply: ["ii", "i", ["a", "b"], ["product"]],
      Divide: ["ii", "d", ["a", "b"], ["quotient"]],
    },
    properties: {
      LastResult: "i",
    },
    signals: {
      ResultComputed: ["i", "result"],
    },
  }

  // Implement the interface
  let lastResult = 0

  const iface = {
    Add: (a, b) => {
      lastResult = a + b
      iface.emit("ResultComputed", lastResult)
      return lastResult
    },
    Subtract: (a, b) => {
      lastResult = a - b
      iface.emit("ResultComputed", lastResult)
      return lastResult
    },
    Multiply: (a, b) => {
      lastResult = a * b
      iface.emit("ResultComputed", lastResult)
      return lastResult
    },
    Divide: (a, b) => {
      if (b === 0) {
        const err = new Error("Division by zero")
        err.dbusName = "com.example.Calculator.Error.DivisionByZero"
        throw err
      }
      lastResult = a / b
      iface.emit("ResultComputed", Math.floor(lastResult))
      return lastResult
    },
    LastResult: lastResult,
    emit: () => {}, // Will be monkey-patched by exportInterface
  }

  // Export the interface
  sessionBus.exportInterface(iface, objectPath, ifaceDesc)

  console.log("Ready to receive method calls!")
})
```

**Returning D-Bus Errors:**

To return a D-Bus error, throw an Error with a `dbusName` property:

```js
const err = new Error("Something went wrong")
err.dbusName = "com.example.MyService.Error.SomethingWrong"
throw err
```

### Properties

Properties are declared in the interface description and implemented as values on the interface object:

```js
const ifaceDesc = {
  name: "com.example.MyService",
  methods: {},
  properties: {
    Name: "s", // string property
    Count: "i", // int32 property
    Enabled: "b", // boolean property
  },
  signals: {},
}

const iface = {
  Name: "My Service",
  Count: 42,
  Enabled: true,
}

sessionBus.exportInterface(iface, objectPath, ifaceDesc)
```

Clients can read/write properties using the standard `org.freedesktop.DBus.Properties` interface:

```js
service.getInterface(
  objectPath,
  "org.freedesktop.DBus.Properties",
  (err, props) => {
    // Read a property
    props.Get("com.example.MyService", "Count", (err, value) => {
      console.log("Count:", value)
    })

    // Write a property
    props.Set("com.example.MyService", "Count", ["i", 100], (err) => {
      if (err) console.error(err)
    })

    // Get all properties
    props.GetAll("com.example.MyService", (err, allProps) => {
      console.log("All properties:", allProps)
    })
  },
)
```

### Signals

Signals are one-way messages broadcast by a service. They can be emitted by services and listened to by clients.

**Emitting Signals (Service Side):**

```js
const ifaceDesc = {
  name: "com.example.MyService",
  methods: {},
  properties: {},
  signals: {
    // Format: [signature, parameterName]
    StatusChanged: ["s", "new_status"],
    Progress: ["ii", "current", "total"],
    Completed: ["", ""], // signal with no parameters
  },
}

const iface = {
  emit: () => {}, // Required - will be monkey-patched by exportInterface
}

sessionBus.exportInterface(iface, objectPath, ifaceDesc)

// Emit signals
iface.emit("StatusChanged", "running")
iface.emit("Progress", 50, 100)
iface.emit("Completed")
```

**Listening to Signals (Client Side):**

The interface object is an EventEmitter. Use `.on()` to listen for signals:

```js
service.getInterface(objectPath, interfaceName, (err, iface) => {
  if (err) {
    console.error(err)
    return
  }

  // Listen for signals
  iface.on("StatusChanged", (newStatus) => {
    console.log("Status changed to:", newStatus)
  })

  iface.on("Progress", (current, total) => {
    console.log(`Progress: ${current}/${total}`)
  })

  iface.on("Completed", () => {
    console.log("Operation completed!")
  })
})
```

### Low-Level Messaging

For full control over D-Bus messages, use `createConnection()`:

```js
const dbus = require("@echristian/dbus-native")

const conn = dbus.createConnection()

// Send the Hello message to get a unique name
conn.message({
  type: dbus.messageType.methodCall,
  path: "/org/freedesktop/DBus",
  destination: "org.freedesktop.DBus",
  interface: "org.freedesktop.DBus",
  member: "Hello",
})

// Listen for all messages
conn.on("message", (msg) => {
  console.log("Received message:", JSON.stringify(msg, null, 2))
})

conn.on("connect", () => {
  console.log("Connected to D-Bus")
})

conn.on("error", (err) => {
  console.error("Connection error:", err)
})
```

**Message Structure:**

```js
{
  type: dbus.messageType.methodCall,  // methodCall, methodReturn, error, signal
  path: '/org/example/Path',          // object path
  destination: 'org.example.Service', // target service (optional for signals)
  interface: 'org.example.Interface', // interface name
  member: 'MethodName',               // method or signal name
  signature: 'ss',                    // type signature of body
  body: ['arg1', 'arg2'],             // arguments
  serial: 1,                          // message serial (auto-assigned)
  sender: ':1.123',                   // sender (assigned by bus)
  replySerial: 1,                     // for methodReturn/error
  errorName: 'org.example.Error'      // for error messages
}
```

**Message Types:**

```js
dbus.messageType.methodCall // 1
dbus.messageType.methodReturn // 2
dbus.messageType.error // 3
dbus.messageType.signal // 4
```

---

## CLI Tools

### dbus2js

Generate JavaScript client bindings from D-Bus introspection XML.

**Usage:**

```shell
# From a running service
npx dbus2js --bus session --service org.freedesktop.Notifications --path /org/freedesktop/Notifications

# From an XML file
npx dbus2js --xml introspection.xml --service org.example.Service --path /org/example/Object

# Dump raw introspection XML
npx dbus2js --bus session --service org.freedesktop.Notifications --path /org/freedesktop/Notifications --dump
```

**Options:**

| Option      | Description                                      |
| ----------- | ------------------------------------------------ |
| `--bus`     | `session` or `system` (default: session)         |
| `--service` | D-Bus service name                               |
| `--path`    | Object path to introspect                        |
| `--xml`     | Read introspection from file instead of querying |
| `--dump`    | Dump raw XML and exit                            |

**Output:**

The tool generates a CommonJS module with methods matching the introspected interface:

```js
module.exports["org.freedesktop.Notifications"] = function (bus) {
  this.Notify = function (
    app_name,
    replaces_id,
    app_icon,
    summary,
    body,
    actions,
    hints,
    expire_timeout,
    callback,
  ) {
    bus.invoke(
      {
        destination: "org.freedesktop.Notifications",
        path: "/org/freedesktop/Notifications",
        interface: "org.freedesktop.Notifications",
        member: "Notify",
        body: [
          app_name,
          replaces_id,
          app_icon,
          summary,
          body,
          actions,
          hints,
          expire_timeout,
        ],
        signature: "susssasa{sv}i",
      },
      callback,
    )
  }
  // ...
}
```

### dbus-dissect

A MITM proxy for inspecting D-Bus traffic between clients and the bus.

**Usage:**

```shell
# Start the proxy (listens on TCP port 3334)
node bin/dbus-dissect.js

# For system bus
node bin/dbus-dissect.js --system
```

Then run your D-Bus application with the proxy:

```shell
DBUS_SESSION_BUS_ADDRESS=tcp:host=127.0.0.1,port=3334 your-dbus-app
```

The proxy will log all messages in both directions:

```
dbus>
{
  "type": 2,
  "destination": ":1.234",
  "replySerial": 1,
  "signature": "s",
  "body": [":1.234"]
}
 cli>
{
  "type": 1,
  "path": "/org/freedesktop/Notifications",
  ...
}
```

---

## API Reference

### sessionBus / systemBus

```js
const bus = dbus.sessionBus(options?);
const bus = dbus.systemBus();
```

Connect to the session or system bus. Returns a `MessageBus` instance.

### createClient

```js
const bus = dbus.createClient(options?);
```

Same as `sessionBus()`. Creates a `MessageBus` connected to the bus specified in options or `DBUS_SESSION_BUS_ADDRESS`.

### createConnection

```js
const conn = dbus.createConnection(options?);
```

Low-level connection without the `MessageBus` wrapper. Returns an EventEmitter with:

- **Methods:** `message(msg)`, `end()`
- **Events:** `connect`, `message`, `error`, `end`

### Connection Options

| Option         | Type     | Default                                         | Description                                        |
| -------------- | -------- | ----------------------------------------------- | -------------------------------------------------- |
| `busAddress`   | string   | `DBUS_SESSION_BUS_ADDRESS`                      | Bus address (e.g., `unix:path=/run/user/1000/bus`) |
| `socket`       | string   | —                                               | Unix socket path                                   |
| `host`         | string   | —                                               | TCP host                                           |
| `port`         | number   | —                                               | TCP port                                           |
| `stream`       | Stream   | —                                               | Existing duplex stream                             |
| `authMethods`  | string[] | `['EXTERNAL', 'DBUS_COOKIE_SHA1', 'ANONYMOUS']` | Authentication methods to try                      |
| `ayBuffer`     | boolean  | `true`                                          | Return `ay` (byte arrays) as Node.js Buffer        |
| `ReturnLongjs` | boolean  | `false`                                         | Return 64-bit integers as Long.js objects          |
| `direct`       | boolean  | `false`                                         | Skip Hello message (for peer-to-peer)              |

### MessageBus Methods

| Method                                                           | Description                            |
| ---------------------------------------------------------------- | -------------------------------------- |
| `getService(name)`                                               | Get a `DBusService` by well-known name |
| `getObject(serviceName, objectPath, callback)`                   | Get a `DBusObject`                     |
| `getInterface(serviceName, objectPath, interfaceName, callback)` | Get an interface directly              |
| `requestName(name, flags, callback)`                             | Request a well-known name              |
| `releaseName(name, callback)`                                    | Release a well-known name              |
| `exportInterface(impl, path, ifaceDesc)`                         | Export an interface                    |
| `invoke(msg, callback)`                                          | Send a raw message                     |
| `sendSignal(path, iface, name, signature, args)`                 | Send a signal                          |
| `sendError(msg, errorName, errorText)`                           | Send an error reply                    |
| `sendReply(msg, signature, body)`                                | Send a method return                   |
| `addMatch(rule, callback)`                                       | Add a signal match rule                |
| `removeMatch(rule, callback)`                                    | Remove a signal match rule             |
| `listNames(callback)`                                            | List all names on the bus              |
| `listActivatableNames(callback)`                                 | List activatable services              |
| `nameHasOwner(name, callback)`                                   | Check if a name is owned               |
| `getNameOwner(name, callback)`                                   | Get the owner of a name                |
| `startServiceByName(name, flags, callback)`                      | Activate a service                     |
| `getConnectionUnixUser(name, callback)`                          | Get Unix UID of connection             |
| `getConnectionUnixProcessId(name, callback)`                     | Get Unix PID of connection             |
| `getId(callback)`                                                | Get the bus ID                         |

**Request Name Flags:**

| Flag                               | Value | Description                           |
| ---------------------------------- | ----- | ------------------------------------- |
| `DBUS_NAME_FLAG_ALLOW_REPLACEMENT` | `0x1` | Allow other services to take the name |
| `DBUS_NAME_FLAG_REPLACE_EXISTING`  | `0x2` | Take the name from the current owner  |
| `DBUS_NAME_FLAG_DO_NOT_QUEUE`      | `0x4` | Fail if name is already taken         |

**Request Name Return Codes:**

| Code                                    | Value | Description               |
| --------------------------------------- | ----- | ------------------------- |
| `DBUS_REQUEST_NAME_REPLY_PRIMARY_OWNER` | `1`   | You are now the owner     |
| `DBUS_REQUEST_NAME_REPLY_IN_QUEUE`      | `2`   | You are in the queue      |
| `DBUS_REQUEST_NAME_REPLY_EXISTS`        | `3`   | Name already has an owner |
| `DBUS_REQUEST_NAME_REPLY_ALREADY_OWNER` | `4`   | You already own this name |

### Interface Description Format

```js
const ifaceDesc = {
  name: "com.example.MyInterface",

  methods: {
    // Format: [inputSignature, outputSignature, [inputNames], [outputNames]]
    NoArgs: ["", "s", [], ["result"]],
    OneArg: ["s", "s", ["input"], ["output"]],
    MultipleArgs: ["si", "b", ["name", "count"], ["success"]],
    NoReturn: ["s", "", ["message"], []],
  },

  properties: {
    // Format: signature
    StringProp: "s",
    IntProp: "i",
    BoolProp: "b",
  },

  signals: {
    // Format: [signature, ...parameterNames]
    NoParams: [""],
    OneParam: ["s", "message"],
    MultipleParams: ["si", "name", "value"],
  },
}
```

### D-Bus Type Signatures

| Signature | D-Bus Type  | JavaScript Type         |
| --------- | ----------- | ----------------------- |
| `y`       | BYTE        | number (0-255)          |
| `b`       | BOOLEAN     | boolean                 |
| `n`       | INT16       | number                  |
| `q`       | UINT16      | number                  |
| `i`       | INT32       | number                  |
| `u`       | UINT32      | number                  |
| `x`       | INT64       | number or Long.js       |
| `t`       | UINT64      | number or Long.js       |
| `d`       | DOUBLE      | number                  |
| `s`       | STRING      | string                  |
| `o`       | OBJECT_PATH | string                  |
| `g`       | SIGNATURE   | string                  |
| `a`       | ARRAY       | array                   |
| `(...)`   | STRUCT      | array                   |
| `a{...}`  | DICT_ENTRY  | array of `[key, value]` |
| `v`       | VARIANT     | `[signature, value]`    |

**Examples:**

| Signature | Description                | JavaScript Example                              |
| --------- | -------------------------- | ----------------------------------------------- |
| `s`       | string                     | `'hello'`                                       |
| `i`       | int32                      | `42`                                            |
| `as`      | array of strings           | `['a', 'b', 'c']`                               |
| `ai`      | array of int32             | `[1, 2, 3]`                                     |
| `(si)`    | struct of string and int32 | `['hello', 42]`                                 |
| `a{ss}`   | dict string->string        | `[['key1', 'val1'], ['key2', 'val2']]`          |
| `a{sv}`   | dict string->variant       | `[['name', ['s', 'John']], ['age', ['i', 30]]]` |

---

## 64-bit Integer Handling

JavaScript numbers can safely represent integers up to 53 bits. For full 64-bit precision, this library uses [Long.js](https://github.com/dcodeIO/long.js).

**Reading 64-bit values:**

By default, 64-bit integers are converted to JavaScript numbers (with possible precision loss):

```js
const bus = dbus.sessionBus()
// 64-bit values returned as numbers
```

To preserve full precision, use the `ReturnLongjs` option:

```js
const bus = dbus.sessionBus({ ReturnLongjs: true })
// 64-bit values returned as Long.js objects
```

**Writing 64-bit values:**

You can pass 64-bit values as:

- JavaScript number (up to 53 bits)
- Decimal string: `'9007199254740993'`
- Hex string: `'0x20000000000001'`
- Long.js object

```js
const Long = require("long")

bus.invoke(
  {
    // ...
    signature: "x",
    body: [Long.fromString("9007199254740993")],
  },
  callback,
)
```

---

## Examples

The `examples/` directory contains working examples:

| File                 | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `basic-service.js`   | Create a service with methods, properties, and signals |
| `basic-client.js`    | Call methods and listen to signals                     |
| `service-signals.js` | Service that emits signals periodically                |
| `client-signals.js`  | Client that listens to signals                         |
| `notifications.js`   | Send desktop notifications                             |
| `return-types.js`    | Examples of all D-Bus return types                     |
| `monitor.js`         | Low-level message monitoring                           |
| `service/server.js`  | Raw message handling (server)                          |
| `service/client.js`  | Raw message handling (client)                          |
| `p2p/serv.js`        | Peer-to-peer server                                    |
| `p2p/cli.js`         | Peer-to-peer client                                    |

Run an example:

```shell
node examples/basic-service.js   # In terminal 1
node examples/basic-client.js    # In terminal 2
```

---

## TypeScript

Type definitions are included in `index.d.ts`. Basic types are provided for:

- `MessageBus`
- `BusConnection`
- `DBusService`
- `DBusObject`
- `DBusInterface`

```ts
import * as dbus from "@echristian/dbus-native"

const bus: dbus.MessageBus = dbus.sessionBus()
```

---

## Links

- [D-Bus Specification](https://dbus.freedesktop.org/doc/dbus-specification.html)
- [Original dbus-native](https://github.com/sidorares/dbus-native)
- [Homebridge fork](https://github.com/homebridge/dbus-native)
- [Long.js](https://github.com/dcodeIO/long.js) - 64-bit integer support
