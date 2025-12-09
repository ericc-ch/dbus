import { Buffer } from "node:buffer"
import { describe, test, expect } from "bun:test"
import Long from "long"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const marshall = require("../lib/marshall")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const unmarshall = require("../lib/unmarshall").default

interface UnmarshallOptions {
  ReturnLongjs?: boolean
}

type TestCase = [
  signature: string,
  data: unknown[],
  shouldFail?: boolean,
  expectedResult?: unknown[],
  unmarshallOptions?: UnmarshallOptions,
]

interface TestSuites {
  [suiteName: string]: TestCase[]
}

const LongMaxS64 = Long.fromString("9223372036854775807", false)
const LongMinS64 = Long.fromString("-9223372036854775808", false)
const LongMaxU64 = Long.fromString("18446744073709551615", true)
const LongMinU64 = Long.fromString("0", true)
const LongMaxS53 = Long.fromString("9007199254740991", false)
const LongMinS53 = Long.fromString("-9007199254740991", false)
const LongMaxU53 = Long.fromString("9007199254740991", true)
const LongMinU53 = Long.fromString("0", true)

/** Take the data and marshall it then unmarshall it */
function marshallAndUnmarshall(
  signature: string,
  data: unknown[],
  unmarshallOpts?: UnmarshallOptions,
): unknown[] {
  const marshalledBuffer = marshall(signature, data)
  const result = unmarshall(
    marshalledBuffer,
    signature,
    undefined,
    unmarshallOpts,
  )
  return result
}

function testRoundtrip(
  signature: string,
  data: unknown[],
  otherResult?: unknown[],
  unmarshallOpts?: UnmarshallOptions,
): void {
  const result = marshallAndUnmarshall(signature, data, unmarshallOpts)
  try {
    if (otherResult !== undefined) {
      expect(result).toEqual(otherResult)
    } else {
      expect(data).toEqual(result)
    }
  } catch {
    console.log("signature   :", signature)
    console.log("orig        :", data)
    console.log("unmarshalled:", result)
    if (otherResult !== undefined) {
      throw new Error(`results don't match (${result}) != (${otherResult})`)
    } else {
      throw new Error(`results don't match (${data}) != (${result})`)
    }
  }
}

let str300chars = ""
for (let i = 0; i < 300; ++i) str300chars += "i"

const b30000bytes = Buffer.alloc(30000, 60)
const str30000chars = b30000bytes.toString("ascii")

describe("marshall", () => {
  test("throws error on bad data", () => {
    const badData: [string, unknown[], RegExp][] = [
      ["s", [3], /Expected string or buffer argument/],
      ["s", ["as\0df"], /String contains null byte/],
      ["g", [3], /Expected string or buffer argument/],
      ["g", ["ccc"], /Unknown type.*in signature.*/],
      ["g", ["as\0df"], /String contains null byte/],
      ["g", [str300chars], /Data:.* is too long for signature type/],
      ["g", ["iii(i"], /Bad signature: unexpected end/],
      ["g", ["iii{i"], /Bad signature: unexpected end/],
      [
        "g",
        [
          "i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i(i)))))))))))))))))))))))))))))))))",
        ],
        /Maximum container type nesting exceeded/,
      ],
      ["y", ["n"], /Data:.*was not of type number/],
      ["y", [-1], /Number outside range/],
      ["y", [1.5], /Data:.*was not an integer/],
      ["y", [256], /Number outside range/],
      ["b", ["n"], /Data:.*was not of type boolean/],
      ["b", [-1], /Data:.*was not of type boolean/],
      ["b", [0.5], /Data:.*was not of type boolean/],
      ["b", [2], /Data:.*was not of type boolean/],
      ["n", ["n"], /Data:.*was not of type number/],
      ["n", [-0x7fff - 2], /Number outside range/],
      ["n", [1.5], /Data:.*was not an integer/],
      ["n", [0x7fff + 1], /Number outside range/],
      ["q", ["n"], /Data:.*was not of type number/],
      ["q", [-1], /Number outside range/],
      ["q", [1.5], /Data:.*was not an integer/],
      ["q", [0xffff + 1], /Number outside range/],
      ["i", ["n"], /Data:.*was not of type number/],
      ["i", [-0x7fffffff - 2], /Number outside range/],
      ["i", [1.5], /Data:.*was not an integer/],
      ["i", [0x7fffffff + 1], /Number outside range/],
      ["u", ["n"], /Data:.*was not of type number/],
      ["u", [-1], /Number outside range/],
      ["u", [1.5], /Data:.*was not an integer/],
      ["u", [0xffffffff + 1], /Number outside range/],
      ["x", ["n"], /Data:.*did not convert correctly to signed 64 bit/],
      ["x", [-Math.pow(2, 53) - 1], /Number outside range.*/],
      ["x", [1.5], /Data:.*was not an integer.*/],
      ["x", [Math.pow(2, 53)], /Number outside range.*/],
      [
        "x",
        ["9223372036854775808"],
        /Data:.*did not convert correctly to signed 64 bit*/,
      ], // exceed S64
      [
        "x",
        ["-9223372036854775809"],
        /Data:.*did not convert correctly to signed 64 bit*/,
      ], // exceed S64
      ["t", ["n"], /Data:.*did not convert correctly to unsigned 64 bit/],
      ["t", [-1], /Number outside range.*/],
      [
        "t",
        ["18446744073709551616"],
        /Data:.*did not convert correctly to unsigned 64 bit*/,
      ], // exceed U64
      ["t", [1.5], /Data:.*was not an integer.*/],
      ["t", [Math.pow(2, 53)], /Number outside range.*/],
      [
        "x",
        [LongMaxU53],
        /Longjs object is unsigned, but marshalling into signed 64 bit field/,
      ], // Longjs unsigned/signed must match with field?
      [
        "t",
        [LongMaxS53],
        /Longjs object is signed, but marshalling into unsigned 64 bit field/,
      ],
      ["d", ["n"], /Data:.*was not of type number/],
      ["d", [Number.NEGATIVE_INFINITY], /Number outside range/],
      ["d", [NaN], /Data:.*was not a number/],
      ["d", [Number.POSITIVE_INFINITY], /Number outside range/],
    ]

    for (const badRow of badData) {
      const [badSig, badDatum, errorRegex] = badRow
      expect(() => marshall(badSig, badDatum)).toThrow(errorRegex)
    }
  })

  test("throws error on bad signature", () => {
    const badSig = "1"
    const badData = 1
    expect(() => marshall(badSig, badData)).toThrow(
      /Unknown type.*in signature.*/,
    )
  })
})

describe("marshall/unmarshall", () => {
  // signature, data, not expected to fail?, data after unmarshall (when expected to convert to canonic form and different from input), unmarshall_options
  const tests: TestSuites = {
    "simple types": [
      ["s", ["short string"]],
      ["s", [str30000chars]],
      ["o", ["/object/path"]],
      ["o", ["invalid/object/path"], false],
      ["g", ["xxxtt(t)s{u}uuiibb"]],
      ["g", ["signature"], false], // TODO: validate on input
      //['g', [str300chars], false],  // max 255 chars
      ["o", ["/"]],
      ["b", [false]],
      ["b", [true]],
      ["y", [10]],
      //['y', [300], false],  // TODO: validate on input
      //['y', [-10]],  // TODO: validate on input
      ["n", [300]],
      ["n", [16300]],
      //['n', [65535], false] // TODO: signed 16 bit
      //['n', [-100], false];  // TODO: validate on input, should fail
      ["q", [65535]],
      //['q', [-100], false],   // TODO: validate on input, should fail
      // i - signed, u - unsigned
      ["i", [1048576]],
      ["i", [0]],
      ["i", [-1]],
      ["u", [1048576]],
      ["u", [0]],
      //['u', [-1], false]  // TODO validate input, should fail
      ["x", [9007199254740991]], // 53bit numbers convert to 53bit numbers
      ["x", [-9007199254740991]],
      ["t", [9007199254740991]],
      ["t", [0]],
      ["x", ["9007199254740991"], false, [9007199254740991]], // strings should parse and convert to 53bit numbers
      ["x", ["-9007199254740991"], false, [-9007199254740991]],
      ["t", ["9007199254740991"], false, [9007199254740991]],
      ["t", ["0"], false, [0]],
      ["x", ["0x1FFFFFFFFFFFFF"], false, [9007199254740991]], // hex strings
      ["x", ["-0x1FFFFFFFFFFFFF"], false, [-9007199254740991]],
      ["x", ["0x0000"], false, [0]],
      [
        "x",
        ["0x7FFFFFFFFFFFFFFF"],
        false,
        [LongMaxS64],
        { ReturnLongjs: true },
      ],
      ["t", ["0x1FFFFFFFFFFFFF"], false, [9007199254740991]],
      ["t", ["0x0000"], false, [0]],
      [
        "t",
        ["0xFFFFFFFFFFFFFFFF"],
        false,
        [LongMaxU64],
        { ReturnLongjs: true },
      ],
      ["x", [LongMaxS53], false, [9007199254740991]], // make sure Longjs objects convert to 53bit numbers
      ["x", [LongMinS53], false, [-9007199254740991]],
      ["t", [LongMaxU53], false, [9007199254740991]],
      ["t", [LongMinU53], false, [0]],
      ["x", [9007199254740991], false, [LongMaxS53], { ReturnLongjs: true }], // 53bit numbers to objects
      ["x", [-9007199254740991], false, [LongMinS53], { ReturnLongjs: true }],
      ["t", [9007199254740991], false, [LongMaxU53], { ReturnLongjs: true }],
      ["t", [0], false, [LongMinU53], { ReturnLongjs: true }],
      [
        "x",
        ["9223372036854775807"],
        false,
        [LongMaxS64],
        { ReturnLongjs: true },
      ], // strings to objects
      [
        "x",
        ["-9223372036854775808"],
        false,
        [LongMinS64],
        { ReturnLongjs: true },
      ],
      [
        "t",
        ["18446744073709551615"],
        false,
        [LongMaxU64],
        { ReturnLongjs: true },
      ],
      ["t", ["0"], false, [LongMinU64], { ReturnLongjs: true }],
      ["x", [LongMaxS64], false, [LongMaxS64], { ReturnLongjs: true }], // Longjs object to objects
      ["x", [LongMinS64], false, [LongMinS64], { ReturnLongjs: true }],
      ["t", [LongMaxU64], false, [LongMaxU64], { ReturnLongjs: true }],
      ["t", [LongMinU64], false, [LongMinU64], { ReturnLongjs: true }],
      [
        "x",
        [
          {
            low: LongMaxS64.low,
            high: LongMaxS64.high,
            unsigned: LongMaxS64.unsigned,
          },
        ],
        false,
        [LongMaxS64],
        { ReturnLongjs: true },
      ], // non-instance Longjs object to objects
      [
        "x",
        [
          {
            low: LongMaxS53.low,
            high: LongMaxS53.high,
            unsigned: LongMaxS53.unsigned,
          },
        ],
        false,
        [9007199254740991],
      ],
      [
        "t",
        [
          {
            low: LongMaxU64.low,
            high: LongMaxU64.high,
            unsigned: LongMaxU64.unsigned,
          },
        ],
        false,
        [LongMaxU64],
        { ReturnLongjs: true },
      ],
      [
        "t",
        [
          {
            low: LongMaxU53.low,
            high: LongMaxU53.high,
            unsigned: LongMaxU53.unsigned,
          },
        ],
        false,
        [9007199254740991],
      ],
      // eslint-disable-next-line no-new-wrappers
      ["x", [new String(9007199254740991)], false, [9007199254740991]], // quick check String instance conversion
      // eslint-disable-next-line no-new-wrappers
      ["t", [new String("9007199254740991")], false, [9007199254740991]],
      // eslint-disable-next-line no-new-wrappers
      ["x", [new Number(9007199254740991)], false, [9007199254740991]], // quick check Number instance conversion
      // eslint-disable-next-line no-new-wrappers
      ["t", [new Number("9007199254740991")], false, [9007199254740991]],
    ],
    "simple structs": [
      ["(yyy)y", [[1, 2, 3], 4]],
      ["y(yyy)y", [5, [1, 2, 3], 4]],
      ["yy(yyy)y", [5, 6, [1, 2, 3], 4]],
      ["yyy(yyy)y", [5, 6, 7, [1, 2, 3], 4]],
      ["yyyy(yyy)y", [5, 6, 7, 8, [1, 2, 3], 4]],
      ["yyyyy(yyy)y", [5, 6, 7, 8, 9, [1, 2, 3], 4]],
    ],
    "arrays of simple types": [
      ["ai", [[1, 2, 3, 4, 5, 6, 7]]],
      [
        "aai",
        [
          [
            [300, 400, 500],
            [1, 2, 3, 4, 5, 6, 7],
          ],
        ],
      ],
      [
        "aiai",
        [
          [1, 2, 3],
          [300, 400, 500],
        ],
      ],
    ],
    "compound types": [
      ["iyai", [10, 100, [1, 2, 3, 4, 5, 6]]],
      // TODO: fix 'array of structs offset problem
      [
        "a(iyai)",
        [
          [
            [10, 100, [1, 2, 3, 4, 5, 6]],
            [11, 200, [15, 4, 5, 6]],
          ],
        ],
      ],
      [
        "sa(iyai)",
        [
          "test test test test",
          [
            [10, 100, [1, 2, 3, 4, 5, 6]],
            [11, 200, [15, 4, 5, 6]],
          ],
        ],
      ],
      [
        "a(iyai)",
        [
          [
            [10, 100, [1, 2, 3, 4, 5, 6]],
            [11, 200, [15, 4, 5, 6]],
          ],
        ],
      ],
      [
        "a(yai)",
        [
          [
            [100, [1, 2, 3, 4, 5, 6]],
            [200, [15, 4, 5, 6]],
          ],
        ],
      ],
      [
        "a(yyai)",
        [
          [
            [100, 101, [1, 2, 3, 4, 5, 6]],
            [200, 201, [15, 4, 5, 6]],
          ],
        ],
      ],
      [
        "a(yyyai)",
        [
          [
            [100, 101, 102, [1, 2, 3, 4, 5, 6]],
            [200, 201, 202, [15, 4, 5, 6]],
          ],
        ],
      ],
      ["ai", [[1, 2, 3, 4, 5, 6]]],
      ["aii", [[1, 2, 3, 4, 5, 6], 10]],
      ["a(ai)", [[[[1, 2, 3, 4, 5, 6]], [[15, 4, 5, 6]]]]],
      [
        "aai",
        [
          [
            [1, 2, 3, 4, 5, 6],
            [15, 4, 5, 6],
          ],
        ],
      ],
    ],
    buffers: [
      ["ayay", [Buffer.from([0, 1, 2, 3, 4, 5, 6, 0xff]), Buffer.from([])]],
    ],
  }

  for (const testName in tests) {
    const testSuite = tests[testName]
    if (!testSuite) continue

    for (let testNum = 0; testNum < testSuite.length; ++testNum) {
      const testData = testSuite[testNum]
      if (!testData) continue

      const [signature, data, , expectedResult, unmarshallOpts] = testData
      const testDesc = `${testName} ${testNum} ${signature}<-${JSON.stringify(data)}`

      test(testDesc, () => {
        testRoundtrip(signature, data, expectedResult, unmarshallOpts)
      })
    }
  }
})

// issue-128: marshall/unmarshall of "n"
describe("issue-128", () => {
  test('marshall/unmarshall of "n" (signed 16-bit)', () => {
    const data = [10, 1000]
    const s = "nn"
    const buf = marshall(s, data)
    expect(buf.toString("hex")).toBe("0a00e803")
    expect(unmarshall(buf, s)).toEqual(data)
  })
})
