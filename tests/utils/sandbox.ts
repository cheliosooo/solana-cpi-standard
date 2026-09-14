import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AnchorProvider, Program, Wallet, type Idl } from "@anchor-lang/core";
import BN from "bn.js";
import { AccountRole, address, type Address, type Instruction } from "@solana/kit";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Signer,
} from "@solana/web3.js";
import { createCpiRefs, type CpiData, type InstructionRefs } from "@solana-cpi-standard/core";
import { assertLocalRpcUrl, rpc as surfpoolRpc } from "../../scripts/surfpool.mjs";

export const RPC_URL = assertLocalRpcUrl(process.env.RPC_URL ?? "http://127.0.0.1:8899");
export const CONNECTION = new Connection(RPC_URL, "confirmed");
// Ephemeral payer shared by the suites in each test process. Never loads user wallets.
export const PAYER_SIGNER = Keypair.generate();
export const PROGRAM_ID = new PublicKey("4dcuyHs4K97LckqNVQEazKAwygJtAATLiuNWFsvFh11m");
export const PDA_SEED = Buffer.from("cpi-sandbox");
export const [SANDBOX_PDA] = PublicKey.findProgramAddressSync(
  [PDA_SEED, PAYER_SIGNER.publicKey.toBuffer()],
  PROGRAM_ID,
);
export const ANCHOR_PROVIDER = new AnchorProvider(CONNECTION, new Wallet(PAYER_SIGNER), {
  commitment: "confirmed",
});

export function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  return surfpoolRpc(RPC_URL, method, params);
}

let ready: Promise<void> | undefined;
export async function setupSandboxContext() {
  ready ??= (async () => {
    await rpc("surfnet_setAccount", [
      PAYER_SIGNER.publicKey.toBase58(),
      { lamports: 100_000_000_000 },
    ]);
    await rpc("surfnet_setAccount", [SANDBOX_PDA.toBase58(), { lamports: 10_000_000_000 }]);
    if (!(await CONNECTION.getAccountInfo(PROGRAM_ID))?.executable)
      throw new Error("Sandbox is not deployed; use pnpm test:integrations");
  })();
  await ready;
  const idl = JSON.parse(readFileSync(resolve("target/idl/cpi_sandbox.json"), "utf8")) as Idl;
  return {
    connection: CONNECTION,
    payer: PAYER_SIGNER,
    pda: SANDBOX_PDA,
    program: new Program(idl, ANCHOR_PROVIDER),
  };
}
export type SandboxTestContext = Awaited<ReturnType<typeof setupSandboxContext>>;

export function toKitInstruction(ix: TransactionInstruction): Instruction {
  return {
    programAddress: address(ix.programId.toBase58()),
    accounts: ix.keys.map((key) => ({
      address: address(key.pubkey.toBase58()),
      role: ((key.isWritable ? 1 : 0) | (key.isSigner ? 2 : 0)) as AccountRole,
    })),
    data: ix.data,
  };
}
export function toWeb3Instruction(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((account) => ({
      pubkey: new PublicKey(account.address),
      isWritable: (account.role & 1) !== 0,
      isSigner: (account.role & 2) !== 0,
    })),
    data: Buffer.from(ix.data ?? []),
  });
}
export function encodeRefs(refs: InstructionRefs): Buffer {
  return Buffer.concat(
    [
      refs.cpi.accounts.indices,
      refs.cpi.accounts.lengths,
      refs.cpi.types,
      refs.cpi.args,
      refs.tracked,
    ].map((data) => {
      const length = Buffer.alloc(4);
      length.writeUInt32LE(data.length);
      return Buffer.concat([length, data]);
    }),
  );
}
export interface ExpectedCpiAccount {
  cpiIndex: number;
  role: string;
  address: PublicKey;
}

export async function buildSandboxInstruction(
  ctx: SandboxTestContext,
  cpis: readonly CpiData[],
  amount?: bigint,
  expectedAccounts: readonly ExpectedCpiAccount[] = [],
) {
  const { refs, accounts, lookupTables } = createCpiRefs(cpis);
  const instruction = await ctx.program.methods
    .executeCpis(encodeRefs(refs), amount === undefined ? null : new BN(amount.toString()), [
      ...expectedAccounts,
    ])
    .accountsPartial({ payer: ctx.payer.publicKey, pda: ctx.pda })
    .remainingAccounts(
      accounts.map((account) => ({
        pubkey: new PublicKey(account.address),
        isWritable: (account.role & 1) !== 0,
        isSigner: false,
      })),
    )
    .instruction();
  return { instruction, lookupTables };
}
export async function sendInstructions(
  instructions: TransactionInstruction[],
  options: { signers?: Signer[]; lookupTables?: Address[] } = {},
) {
  const lifetime = await CONNECTION.getLatestBlockhash();
  const tables = await Promise.all(
    (options.lookupTables ?? []).map(async (key) => {
      const result = await CONNECTION.getAddressLookupTable(new PublicKey(key));
      if (!result.value) throw new Error(`Missing lookup table ${key}`);
      return result.value;
    }),
  );
  const message = new TransactionMessage({
    payerKey: PAYER_SIGNER.publicKey,
    recentBlockhash: lifetime.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }),
      ...instructions,
    ],
  }).compileToV0Message(tables);
  const transaction = new VersionedTransaction(message);
  transaction.sign([PAYER_SIGNER, ...(options.signers ?? [])]);
  const simulation = await CONNECTION.simulateTransaction(transaction, { sigVerify: true });
  if (simulation.value.err)
    throw new Error(
      `Simulation failed: ${JSON.stringify(simulation.value.err)}\n${simulation.value.logs?.join("\n")}`,
    );
  const signature = await CONNECTION.sendRawTransaction(transaction.serialize(), {
    skipPreflight: true,
  });
  const confirmed = await CONNECTION.confirmTransaction({ signature, ...lifetime }, "confirmed");
  if (confirmed.value.err)
    throw new Error(`Transaction failed: ${JSON.stringify(confirmed.value.err)}`);
  return signature;
}
export async function executeCpis(
  ctx: SandboxTestContext,
  cpis: readonly CpiData[],
  amount?: bigint,
  expectedAccounts: readonly ExpectedCpiAccount[] = [],
) {
  const { instruction, lookupTables } = await buildSandboxInstruction(
    ctx,
    cpis,
    amount,
    expectedAccounts,
  );
  return sendInstructions([instruction], { lookupTables });
}
export function accountMeta(pubkey: PublicKey | Address, writable = false) {
  return {
    address: address(pubkey.toString()),
    role: writable ? AccountRole.WRITABLE : AccountRole.READONLY,
  };
}
