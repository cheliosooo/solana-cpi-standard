import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { CpiTypes, createCpiData } from "@solana-cpi-standard/jupiter";
import { createCpiRefs } from "@solana-cpi-standard/core";
import {
  buildSandboxInstruction,
  encodeRefs,
  executeCpis,
  sendInstructions,
} from "../../utils/sandbox";
import { setupSandboxContext } from "./setup";

test("Sandbox: empty plan executes", { timeout: 60000 }, async () => {
  const ctx = await setupSandboxContext();
  await executeCpis(ctx, []);
});
test("Sandbox: rejects a different payer's PDA", { timeout: 60000 }, async () => {
  const ctx = await setupSandboxContext();
  const { instruction } = await buildSandboxInstruction(ctx, []);
  instruction.keys[1].pubkey = Keypair.generate().publicKey;
  await assert.rejects(sendInstructions([instruction]), /ConstraintSeeds|2006/);
});
test(
  "Sandbox: rejects unknown IDs, wrong programs and unfilled argument slots",
  { timeout: 60000 },
  async () => {
    const ctx = await setupSandboxContext();
    const cpi = createCpiData(CpiTypes.JUPITER_SWAP, [], Buffer.alloc(0));
    await assert.rejects(
      executeCpis(ctx, [{ ...cpi, cpiType: 255 }]),
      /invalid program argument|InvalidArgument|invalid argument/i,
    );
    await assert.rejects(
      executeCpis(ctx, [
        { ...cpi, programId: SystemProgram.programId.toBase58() as typeof cpi.programId },
      ]),
      /incorrect program id|IncorrectProgramId|incorrect program/i,
    );
    await assert.rejects(
      executeCpis(ctx, [{ ...cpi, data: undefined }]),
      /invalid program argument|InvalidArgument|invalid argument/i,
    );
    await assert.rejects(
      executeCpis(ctx, [], BigInt(1)),
      /invalid program argument|InvalidArgument|invalid argument/i,
    );
  },
);
test("Sandbox: malformed wire payload and tracked indices fail", { timeout: 60000 }, async () => {
  const ctx = await setupSandboxContext();
  const ix = await ctx.program.methods
    .executeCpis(Buffer.from([1, 2, 3]), null)
    .accountsPartial({ payer: ctx.payer.publicKey, pda: ctx.pda })
    .instruction();
  await assert.rejects(sendInstructions([ix]), /invalid instruction data|InvalidInstructionData/i);
  const { refs } = createCpiRefs([]);
  refs.tracked = Buffer.from([0]);
  const badTracked = await ctx.program.methods
    .executeCpis(encodeRefs(refs), null)
    .accountsPartial({ payer: ctx.payer.publicKey, pda: ctx.pda })
    .instruction();
  await assert.rejects(
    sendInstructions([badTracked]),
    /not enough account keys|NotEnoughAccountKeys|insufficient account keys/i,
  );
});

test("Sandbox: payer must be a transaction signer", { timeout: 60000 }, async () => {
  const ctx = await setupSandboxContext();
  const { instruction } = await buildSandboxInstruction(ctx, []);
  instruction.keys[0] = { pubkey: SystemProgram.programId, isSigner: false, isWritable: false };
  await assert.rejects(sendInstructions([instruction]), /AccountNotSigner|3010/);
});
