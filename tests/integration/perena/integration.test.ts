import { test } from "node:test";
import assert from "node:assert/strict";
import { address } from "@solana/kit";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CpiTypes, PROGRAM_ID, fromInstruction } from "@solana-cpi-standard/perena";
import { executeCpis } from "../../utils/sandbox";
import { USDC, tokenBalance } from "../../utils/tokens";
import { setupPerenaContext } from "./setup";

test(
  "Perena: deposit USDC and redeem the minted shares through the sandbox PDA",
  { timeout: 240000 },
  async () => {
    const ctx = await setupPerenaContext();
    const inputBefore = await tokenBalance(ctx.input);
    const sharesBefore = await tokenBalance(ctx.shares, ctx.shareProgram);
    await executeCpis(ctx, [ctx.deposit]);
    assert.equal(await tokenBalance(ctx.input), inputBefore - ctx.amount);
    const sharesMinted = (await tokenBalance(ctx.shares, ctx.shareProgram)) - sharesBefore;
    // Share output depends on live vault NAV and fees at the fork's current slot.
    assert.ok(sharesMinted > BigInt(0));
    const plan = await ctx.client.tx.executeWithdraw.getTx({
      user: address(ctx.pda.toBase58()),
      vault: ctx.vault,
      assetMint: address(USDC.toBase58()),
      shareMint: address(ctx.shareMint.toBase58()),
      assetTokenProgram: address(TOKEN_PROGRAM_ID.toBase58()),
      shareTokenProgram: address(ctx.shareProgram.toBase58()),
      shareAmount: sharesMinted,
    });
    const withdrawals = plan.instructions.filter((ix) => ix.programAddress === PROGRAM_ID);
    assert.equal(withdrawals.length, 1);
    const withdrawal = fromInstruction(CpiTypes.PERENA_BURN_FROM_EXTERNAL, withdrawals[0]);
    await executeCpis(ctx, [withdrawal]);
    assert.equal(await tokenBalance(ctx.shares, ctx.shareProgram), sharesBefore);
    // Redemption value also depends on the forked vault's NAV/fees and rounding.
    assert.ok((await tokenBalance(ctx.input)) > inputBefore - ctx.amount);
  },
);
