// The engine fence. Each rule below enforces a principle from epic #1 that
// would otherwise erode one convenient import at a time. Loosening one is an
// architectural decision: write an ADR in docs/decisions/ first.

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      // Deterministic core: a seed must produce an identical event log. The
      // engine gets time and randomness from its caller (the sim clock and
      // the seeded PRNG), never from the host.
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Deterministic core: draw from the seeded PRNG, not Math.random." },
        { object: "Date", property: "now", message: "Deterministic core: read the sim clock, not the wall clock." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Deterministic core: new Date() reads the wall clock. Read the sim clock instead.",
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "performance", message: "Deterministic core: no host timers. Read the sim clock." },
        { name: "crypto", message: "Deterministic core: no host randomness. Draw from the seeded PRNG." },
        { name: "process", message: "Headless and pure: the engine takes its inputs as arguments, not from the environment." },
      ],
      // Headless, zero runtime dependencies: the engine imports only its own
      // files. No node: builtins (it must run anywhere), no apps/* (the shell
      // depends on the engine, never the reverse), no third-party packages.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.{1,2}/)",
              message: "Engine fence: relative imports only. No node: builtins, apps, or third-party packages.",
            },
          ],
        },
      ],
    },
  },
]);
