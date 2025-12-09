#!/usr/bin/env node

// simple script to monitor incoming/outcoming dbus messages
// needs a lot of cleanup but does the job

const net = require("net")
const { PassThrough } = require("stream")
const yargs = require("yargs/yargs")
const { hideBin } = require("yargs/helpers")
const message = require("../lib/message")
const readLine = require("../lib/readline")

const argv = yargs(hideBin(process.argv))
  .option("system", {
    type: "boolean",
    default: false,
    description: "Connect to system bus instead of session bus",
  })
  .help()
  .parseSync()

var sessionBusAddress = process.env.DBUS_SESSION_BUS_ADDRESS
var m = sessionBusAddress.match(/abstract=([^,]+)/)

var isSystemBus = argv.system
console.log(isSystemBus)

var address = isSystemBus ? "/var/run/dbus/system_bus_socket" : `\0${m[1]}`

function waitHandshake(stream, prefix, cb) {
  readLine(stream, function (line) {
    console.log(prefix, line.toString())
    if (
      line.toString().slice(0, 5) === "BEGIN"
      || line.toString().slice(0, 2) === "OK"
    ) {
      cb()
    } else {
      waitHandshake(stream, prefix, cb)
    }
  })
}

net
  .createServer(function (s) {
    var buff = ""
    var connected = false

    var cli = net.connect({ path: address })

    s.on("data", function (d) {
      if (connected) {
        cli.write(d)
      } else {
        buff += d.toString()
      }
    })
    connected = true
    cli.write(buff)
    cli.pipe(s)

    var cc = new PassThrough()
    var ss = new PassThrough()

    // TODO: pipe? streams1 and streams2 here
    cli.on("data", function (b) {
      cc.write(b)
    })
    s.on("data", function (b) {
      ss.write(b)
    })

    waitHandshake(cc, "dbus>", function () {
      message.unmarshalMessages(cc, function (message) {
        console.log("dbus>\n", JSON.stringify(message, null, 2))
      })
    })

    waitHandshake(ss, " cli>", function () {
      message.unmarshalMessages(ss, function (message) {
        console.log(" cli>\n", JSON.stringify(message, null, 2))
      })
    })
  })
  .listen(3334, function () {
    console.log(
      "Server started. connect with DBUS_SESSION_BUS_ADDRESS=tcp:host=127.0.0.1,port=3334",
    )
  })
