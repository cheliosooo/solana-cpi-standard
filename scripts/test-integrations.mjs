import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { assertLocalRpcUrl, deploySandbox, rpc } from "./surfpool.mjs";
import { getIntegrations } from "./catalog.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(readFileSync(resolve(root, "registry/catalog.json"), "utf8"));
const suites = ["sandbox", ...catalog.programs.map((p) => p.name)];
const selections = new Map(suites.map((name) => [name, [name]]));
for (const integration of getIntegrations(catalog)) {
  selections.set(
    integration.name,
    integration.programs.map((p) => p.name),
  );
}
const choices = [...selections.keys()];
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--")));
const names = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (flags.has("--help")) {
  console.log(
    `Usage: pnpm test:integrations [${choices.join("|")}] [--skip-build] [--use-existing]\nDefault: build packages/program, start a fresh Surfpool, deploy sandbox, run every suite, stop Surfpool.\nAn integration name runs all of its program suites (kamino runs lending and farms).\n--use-existing requires a running local Surfpool; its state is retained and the sandbox is redeployed.\nEnvironment: RPC_URL (default http://127.0.0.1:8899), SURFPOOL_DATASOURCE_RPC_URL, JUPITER_API_URL, JUPITER_API_KEY.`,
  );
  process.exit(0);
}
for (const flag of flags)
  if (!["--skip-build", "--use-existing"].includes(flag)) throw new Error(`Unknown option ${flag}`);
for (const name of names)
  if (!selections.has(name)) throw new Error(`Unknown suite ${name}; choose ${choices.join(", ")}`);
const selected = names.length
  ? [...new Set(names.flatMap((name) => selections.get(name)))]
  : suites;
const rpcUrl = assertLocalRpcUrl(process.env.RPC_URL ?? "http://127.0.0.1:8899");
const port = Number(new URL(rpcUrl).port || 80);
const networkHost = new URL(rpcUrl).hostname.replace(/^\[|\]$/g, "");
if (port >= 65535) throw new Error("RPC port must leave room for the websocket port (RPC + 1)");
let validator;
let activeChild;
let log;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  activeChild?.kill("SIGTERM");
  if (validator && validator.exitCode === null) {
    validator.kill("SIGTERM");
    await Promise.race([
      once(validator, "exit"),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (validator.exitCode === null) validator.kill("SIGKILL");
  }
  log?.end();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await stop();
    process.exit(130);
  });
async function run(command, args) {
  activeChild = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, RPC_URL: rpcUrl },
  });
  const child = activeChild;
  const [code] = await once(child, "exit");
  activeChild = undefined;
  if (code !== 0) throw new Error(`${command} exited with ${code}`);
}
try {
  if (!flags.has("--skip-build")) {
    await run("pnpm", ["build"]);
    await run("pnpm", ["typecheck:integrations"]);
    await run("pnpm", ["build:sandbox"]);
  }
  for (const artifact of ["target/deploy/cpi_sandbox.so", "target/idl/cpi_sandbox.json"]) {
    if (!existsSync(resolve(root, artifact)))
      throw new Error(`Missing ${artifact}; run pnpm build:sandbox`);
  }
  if (!flags.has("--use-existing")) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, networkHost, resolve);
    });
    await new Promise((resolve) => server.close(resolve));
    mkdirSync(resolve(root, ".surfpool"), { recursive: true });
    log = createWriteStream(resolve(root, ".surfpool/integrations.log"));
    const args = [
      "start",
      "--no-tui",
      "--no-deploy",
      "--no-studio",
      "--yes",
      "--port",
      String(port),
      "--ws-port",
      String(port + 1),
      "--host",
      networkHost,
    ];
    validator = spawn("surfpool", args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    validator.stdout.pipe(log);
    validator.stderr.pipe(log);
    validator.on("error", (error) => {
      console.error(error.message);
    });
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (validator && validator.exitCode !== null)
      throw new Error("Surfpool exited; inspect .surfpool/integrations.log");
    try {
      if ((await rpc(rpcUrl, "getHealth")) === "ok") {
        ready = true;
        break;
      }
    } catch {
      /* Startup is asynchronous. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Surfpool RPC did not become ready");
  await deploySandbox(
    rpcUrl,
    "4dcuyHs4K97LckqNVQEazKAwygJtAATLiuNWFsvFh11m",
    resolve(root, "target/deploy/cpi_sandbox.so"),
  );
  await run("pnpm", [
    "exec",
    "tsx",
    "--test",
    "--test-concurrency=1",
    ...selected.map((name) => `tests/integration/${name}/integration.test.ts`),
  ]);
} finally {
  await stop();
}
