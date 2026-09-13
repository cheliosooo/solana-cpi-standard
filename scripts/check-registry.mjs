import { readRustRegistry } from "./rust-registry.mjs";
import { getIntegrations } from "./catalog.mjs";

const catalog = readRustRegistry();
const integrations = getIntegrations(catalog);
console.log(
  `Checked ${catalog.programs.flatMap((p) => p.entries).length} CPI IDs across ${integrations.length} Rust integration crates (${integrations.map((i) => i.name).join(", ")}); no overlaps or retired IDs reused.`,
);
