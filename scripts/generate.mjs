import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getIntegrations } from "./catalog.mjs";
import { readRustRegistry, ROOT } from "./rust-registry.mjs";

export function generate(check = false, root = ROOT) {
  // Validation finishes before any generated file is written. Rust is the input;
  // generation also works when the JSON catalog and TypeScript files are absent.
  const catalog = readRustRegistry(root);
  const header = "// Generated from the Rust CPI registries. Run pnpm codegen; do not edit.\n";
  const outputs = new Map([["registry/catalog.json", `${JSON.stringify(catalog, null, 2)}\n`]]);
  for (const integration of getIntegrations(catalog)) {
    const registered = integration.programs
      .flatMap((program) => program.entries.map((entry) => ({ entry, program })))
      .sort((a, b) => a.entry.id - b.entry.id);
    const constants = registered.map(({ entry }) => `  ${entry.label}: ${entry.id},`).join("\n");
    const entries = registered
      .map(
        ({ entry: e, program }) =>
          `  { id: ${e.id}, label: ${JSON.stringify(e.label)}, programId: ${program.programIdConstant}, discriminator: ${e.discriminator === null ? "null" : `[${e.discriminator.join(", ")}]`}, category: ${JSON.stringify(e.category)}, expectedTargetAccountIndex: ${JSON.stringify(e.expectedTargetAccountIndex)} },`,
      )
      .join("\n");
    outputs.set(
      `packages/${integration.name}/src/generated.ts`,
      `${header}import { address } from "@solana/kit";\nimport { createIntegration } from "@solana-cpi-standard/core";\n\n${integration.programs.map((p) => `export const ${p.programIdConstant} = address("${p.programId}");`).join("\n")}\nexport const CpiTypes = {\n${constants}\n} as const;\nexport type CpiType = typeof CpiTypes[keyof typeof CpiTypes];\n\nexport const CPI_ENTRIES = [\n${entries}\n] as const;\n\nexport const { createCpiData, fromInstruction } = createIntegration(CPI_ENTRIES);\n`,
    );
  }
  for (const [path, contents] of outputs) {
    const full = resolve(root, path);
    if (check) {
      if (!existsSync(full) || readFileSync(full, "utf8") !== contents)
        throw new Error(`Generated file is missing or stale: ${path}; run pnpm codegen`);
    } else {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check")) throw new Error("Usage: pnpm codegen [--check]");
  generate(args.includes("--check"));
}
