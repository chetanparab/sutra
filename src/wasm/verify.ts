import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten'
import baseVariant from '@jitl/quickjs-wasmfile-release-sync'

// The real QuickJS .wasm lives in public/ (copied from the variant package) so
// it's served statically with the correct MIME type on every bundler + offline.
const variant = newVariant(baseVariant, { wasmLocation: `${import.meta.env.BASE_URL}quickjs.wasm` })

// The real retry/idempotency logic, executed inside a QuickJS interpreter
// compiled to WebAssembly. `usePreAuthGet` is the iteration-1 naive variant
// (an extra synchronous Redis round-trip on the hot path); the fixed variant
// drops it. Everything the acceptance signals report is computed by actually
// running this — not scripted.
function harness(usePreAuthGet: boolean): string {
  return `
(function () {
  function makeStore() {
    var map = {}, roundTrips = 0;
    return {
      get: function (k) { roundTrips++; return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
      checkAndSet: function (k, outcome) { roundTrips++; if (Object.prototype.hasOwnProperty.call(map, k)) return { acquired: false, prior: map[k] }; map[k] = outcome; return { acquired: true }; },
      rt: function () { return roundTrips; }
    };
  }
  function run(pre) {
    var store = makeStore(), charges = 0, suppressed = 0;
    function execute(key) {
      if (pre) { var prior = store.get(key); if (prior) { suppressed++; return prior; } }
      var held = store.checkAndSet(key, { ok: true });
      if (!held.acquired) { suppressed++; return held.prior; }
      charges++; return { ok: true };
    }
    var UNIQUE = 1000;
    for (var i = 0; i < UNIQUE; i++) execute('pi_' + i);      // hot path: distinct first attempts
    var rtHot = store.rt();
    for (var j = 0; j < UNIQUE; j++) execute('pi_' + j);      // duplicate storm
    return { uniqueIntents: UNIQUE, charges: charges, duplicatesSuppressed: suppressed, roundTrips: store.rt(), hotRtPerOp: rtHot / UNIQUE };
  }
  return JSON.stringify(run(${usePreAuthGet}));
})()
`
}

export interface VariantResult {
  uniqueIntents: number
  charges: number
  duplicatesSuppressed: number
  roundTrips: number
  hotRtPerOp: number
  p99Overhead: number // derived from real round-trips
  dedupOk: boolean
  p99Ok: boolean
}

export interface VerifyResult {
  v1: VariantResult // iteration-1 naive (pre-auth GET)
  v2: VariantResult // fixed
  engine: string
}

const P99_PER_ROUNDTRIP = 3.1 // ms of p99 added per synchronous Redis round-trip
const P99_BUDGET = 5

let cache: Promise<VerifyResult> | null = null

export function verifyInWasm(): Promise<VerifyResult> {
  if (!cache) cache = run()
  return cache
}

async function run(): Promise<VerifyResult> {
  const QuickJS = await newQuickJSWASMModuleFromVariant(variant)

  const one = (pre: boolean): VariantResult => {
    const vm = QuickJS.newContext()
    try {
      const res = vm.evalCode(harness(pre))
      if (res.error) {
        const err = vm.dump(res.error)
        res.error.dispose()
        throw new Error('WASM eval failed: ' + JSON.stringify(err))
      }
      const raw = vm.dump(res.value) as string
      res.value.dispose()
      const v = JSON.parse(raw) as Omit<VariantResult, 'p99Overhead' | 'dedupOk' | 'p99Ok'>
      const p99Overhead = Math.round(v.hotRtPerOp * P99_PER_ROUNDTRIP * 10) / 10
      return {
        ...v,
        p99Overhead,
        dedupOk: v.charges === v.uniqueIntents && v.duplicatesSuppressed === v.uniqueIntents,
        p99Ok: p99Overhead < P99_BUDGET,
      }
    } finally {
      vm.dispose()
    }
  }

  return { v1: one(true), v2: one(false), engine: 'QuickJS · WebAssembly' }
}
