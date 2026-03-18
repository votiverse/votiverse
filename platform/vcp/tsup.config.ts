import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node22",
  external: [
    "@votiverse/engine",
    "@votiverse/core",
    "@votiverse/config",
    "@votiverse/identity",
    "@votiverse/delegation",
    "@votiverse/voting",
    "@votiverse/prediction",
    "@votiverse/survey",
    "@votiverse/awareness",
  ],
});
