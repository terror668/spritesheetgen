import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { runMcp } from "./mcp";
import { runCli } from "./cli";
export * from "./api";
export * from "./export";
export { runCli } from "./cli";

// Importing the package as a library never starts the CLI or writes stdout.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await runCli(process.argv.slice(2), { mcp: runMcp });
}
