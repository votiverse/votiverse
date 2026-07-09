import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node22",
  // The AWS SDK is loaded via dynamic import() at runtime (S3 asset storage),
  // never bundled. It's a regular dependency (so tsup auto-externalizes it),
  // but list it explicitly so the build never tries to inline it and choke on
  // its transitive `tslib` import (@aws-crypto/*).
  external: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
});
