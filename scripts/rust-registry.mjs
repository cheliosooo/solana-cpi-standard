import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog, validateCompatibility } from "./catalog.mjs";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));

function cargo(root, args, env = process.env) {
  const result = spawnSync("cargo", args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Rust registry command failed: cargo ${args.join(" ")}\n${result.stderr}\n${result.stdout}`,
    );
  return result.stdout;
}

/** Discover every integration independently of the aggregate registry's features. */
export function discoverRegistryCrates(root = ROOT) {
  // Cargo canonicalizes workspace paths (notably /var versus /private/var on macOS).
  root = realpathSync(root);
  const metadata = JSON.parse(
    cargo(root, ["metadata", "--no-deps", "--format-version", "1", "--locked"]),
  );
  const members = new Set(metadata.workspace_members);
  const packages = new Map(
    metadata.packages
      .filter((pkg) => members.has(pkg.id))
      .map((pkg) => [realpathSync(pkg.manifest_path), pkg]),
  );
  const crates = readdirSync(join(root, "crates"), { withFileTypes: true })
    .filter(
      (entry) =>
        (entry.isDirectory() || entry.isSymbolicLink()) &&
        !["core", "registry"].includes(entry.name),
    )
    .map((entry) => {
      const manifest = join(root, "crates", entry.name, "Cargo.toml");
      const pkg = packages.get(realpathSync(manifest));
      if (!pkg) throw new Error(`${manifest} must be a Cargo workspace member`);
      return { name: pkg.name, integration: entry.name };
    })
    .sort((a, b) => a.integration.localeCompare(b.integration));
  // Fail if Cargo knows about a crate that directory discovery did not cover.
  for (const pkg of packages.values()) {
    const directory = dirname(pkg.manifest_path);
    if (
      dirname(directory) === resolve(root, "crates") &&
      !["core", "registry"].includes(basename(directory)) &&
      !crates.some((crate) => crate.name === pkg.name)
    )
      throw new Error(`Undiscovered Rust integration crate: ${pkg.name}`);
  }
  if (!crates.length) throw new Error("No Rust registry crates found");
  return crates;
}

/** Resolve the program targets from compiled Rust exports without parsing Rust text. */
export function catalogFromExports(crates, exports) {
  const catalog = { version: 2, retiredIds: exports[0]?.retiredIds, programs: [] };
  if (crates.length !== exports.length) throw new Error("Missing Rust registry export");
  for (let index = 0; index < crates.length; index++) {
    const crate = crates[index];
    const data = exports[index];
    if (data.crate !== crate.name) throw new Error(`Wrong Rust export for ${crate.name}`);
    if (JSON.stringify(data.retiredIds) !== JSON.stringify(catalog.retiredIds))
      throw new Error(`Retired IDs differ in ${crate.name}`);
    if (!Array.isArray(data.programs) || !data.programs.length || !Array.isArray(data.entries))
      throw new Error(`Missing programs or entries in ${crate.name}`);
    const programs = new Map();
    const constants = new Set();
    for (const program of data.programs) {
      if (programs.has(program.programId) || constants.has(program.programIdConstant))
        throw new Error(`Duplicate program or constant in ${crate.name}`);
      if (typeof program.programIdConstant !== "string")
        throw new Error(`Missing Rust program constant in ${crate.name}`);
      constants.add(program.programIdConstant);
      const exported = {
        ...program,
        ...(crate.integration !== program.name ? { integration: crate.integration } : {}),
        entries: [],
      };
      programs.set(program.programId, exported);
      catalog.programs.push(exported);
    }
    for (const { programId, ...entry } of data.entries) {
      const program = programs.get(programId);
      if (!program)
        throw new Error(`${crate.name}::${entry.label} targets undeclared program ${programId}`);
      if (!("discriminator" in entry))
        throw new Error(`Missing Rust discriminator for ${entry.label}`);
      program.entries.push(entry);
    }
    for (const program of programs.values()) program.entries.sort((a, b) => a.id - b.id);
  }
  validateCatalog(catalog);
  return catalog;
}

export function readRustRegistry(root = ROOT) {
  const crates = discoverRegistryCrates(root);
  const directory = mkdtempSync(join(tmpdir(), "cpi-registry-export-"));
  try {
    cargo(
      root,
      [
        "test",
        "--locked",
        "--all-features",
        "--lib",
        ...crates.flatMap((crate) => ["-p", crate.name]),
        "export_cpi_registry",
        "--",
        "--ignored",
      ],
      { ...process.env, CPI_REGISTRY_EXPORT_DIR: directory },
    );
    const files = new Set(readdirSync(directory));
    const exports = crates.map((crate) => {
      const file = `${crate.name}.json`;
      if (!files.delete(file))
        throw new Error(
          `Missing export from ${crate.name}; add the #[cfg(test)] export_cpi_registry! declaration`,
        );
      return JSON.parse(readFileSync(join(directory, file), "utf8"));
    });
    if (files.size) throw new Error(`Unexpected Rust registry exports: ${[...files].join(", ")}`);
    const catalog = catalogFromExports(crates, exports);
    validateCompatibility(
      catalog,
      JSON.parse(readFileSync(join(root, "tests/fixtures/legacyRegistry.json"), "utf8")),
    );
    validateCompatibility(
      catalog,
      JSON.parse(readFileSync(join(root, "tests/fixtures/namedAccountRegistry.json"), "utf8")),
    );
    return catalog;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
