import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node22",
  // tsup auto-externalizes dependencies + peerDependencies, but NOT
  // optionalDependencies. The AWS SDK is an optionalDependency loaded via
  // guarded dynamic import() only when S3 asset storage is enabled, so it
  // must stay external — otherwise esbuild tries to bundle it and fails to
  // resolve its transitive `tslib` import (@aws-crypto/*).
  external: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
});
