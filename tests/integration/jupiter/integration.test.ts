import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSandboxInstruction, sendInstructions } from "../../utils/sandbox";
import { tokenBalance, fundTokenAccount } from "../../utils/tokens";
import { setupJupiterContext } from "./setup";

test("Jupiter: PDA swaps USDC for WSOL through a live route", { timeout: 240000 }, async () => {
  const ctx = await setupJupiterContext();
  const beforeInput = await tokenBalance(ctx.input);
  const beforeOutput = await tokenBalance(ctx.output);
  const { instruction, lookupTables } = await buildSandboxInstruction(ctx, [ctx.swap]);
  await sendInstructions([...ctx.setup, instruction], { lookupTables });
  assert.equal(await tokenBalance(ctx.input), beforeInput - ctx.amount);
  // Output is nondeterministic: the live DEX state may advance after the quote.
  // The serialized route's minimum output is the on-chain slippage guarantee.
  assert.ok(
    (await tokenBalance(ctx.output)) - beforeOutput >= BigInt(ctx.quote.otherAmountThreshold),
  );
});
test(
  "Jupiter: insufficient balance propagates an actual program failure",
  { timeout: 240000 },
  async () => {
    const ctx = await setupJupiterContext();
    await fundTokenAccount(ctx.input, BigInt(0));
    const { instruction, lookupTables } = await buildSandboxInstruction(ctx, [ctx.swap]);
    await assert.rejects(
      sendInstructions([...ctx.setup, instruction], { lookupTables }),
      /insufficient|Insufficient|0x1|6024/,
    );
    assert.equal(await tokenBalance(ctx.input), BigInt(0));
  },
);
