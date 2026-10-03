// The CLI is the engine's I/O shell. No fence here: node: builtins are the
// point. It still adds no dependencies beyond the engine itself.

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
  },
]);
