import { build } from "esbuild";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const result = await build({
  entryPoints: ["src/index.ts"], outfile: "dist/index.js", bundle: true,
  platform: "node", format: "esm", target: "node20", minify: true,
  sourcemap: false, legalComments: "none", metafile: true,
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __ssgRequire } from "node:module";const require = __ssgRequire(import.meta.url);' },
});
await chmod("dist/index.js", 0o755);
const code = await readFile("dist/index.js", "utf8");
if (/\/Users\/|sourceMappingURL/.test(code)) {
  throw new Error("Bundle contains an internal name or build path");
}
// Minification removes inline dependency banners; retain their full licenses here.
const dependencies = new Map();
for (const input of Object.keys(result.metafile.inputs).filter((p) => p.includes("node_modules/"))) {
  let directory = dirname(resolve(input));
  while (dirname(directory) !== directory) {
    let pkg;
    try { pkg = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8")); } catch { /* go to the owning package */ }
    if (pkg?.name) {
      const key = `${pkg.name}@${pkg.version}`;
      if (!dependencies.has(key)) {
        let license;
        for (const name of ["LICENSE", "LICENSE.txt", "LICENSE.md", "license", "license.txt"]) {
          try { license = await readFile(resolve(directory, name), "utf8"); break; } catch { /* try the next license spelling */ }
        }
        if (!license) throw new Error(`Missing bundled dependency license: ${key}`);
        dependencies.set(key, license);
      }
      break;
    }
    directory = dirname(directory);
  }
}
await writeFile("NOTICE", "Third-party licenses for bundled dependencies\n\n" + [...dependencies].sort(([a], [b]) => a.localeCompare(b)).map(([name, license]) => `${name}\n${"=".repeat(name.length)}\n${license}`).join("\n\n"));
