import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { ENGINE_NAME, ENGINE_VERSION } from "./index.ts";

describe("engine identity", () => {
  it("names itself", () => {
    expect(ENGINE_NAME).toBe("Ingenium");
  });

  it("reports the version package.json declares", () => {
    expect(ENGINE_VERSION).toBe(pkg.version);
  });
});
