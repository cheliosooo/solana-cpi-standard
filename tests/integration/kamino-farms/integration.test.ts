import { test } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { getUserStateDecoder } from "@kamino-finance/farms-sdk";
import { executeCpis } from "../../utils/sandbox";
import { tokenBalance } from "../../utils/tokens";
import { setupKaminoFarmsContext } from "./setup";

test(
  "Kamino farms: harvest a deterministic accrued reward through the registry",
  { timeout: 240000 },
  async () => {
    const ctx = await setupKaminoFarmsContext();
    const destinationBefore = await tokenBalance(ctx.destination);
    const treasuryBefore = await tokenBalance(ctx.treasury);
    // Reward base units × fee basis points / 10,000 basis points = fee base units.
    // Integer division matches the program's fee truncation.
    const fee = (ctx.reward * ctx.treasuryFeeBps) / BigInt(10_000);
    // Exercise the program-supplied u64 slot with reward index zero.
    await executeCpis(ctx, [{ ...ctx.harvest, data: undefined }], BigInt(0));
    assert.equal(await tokenBalance(ctx.destination), destinationBefore + ctx.reward - fee);
    assert.equal(await tokenBalance(ctx.treasury), treasuryBefore + fee);
    assert.equal(await tokenBalance(ctx.rewardVault), BigInt(0));
    const account = await ctx.connection.getAccountInfo(new PublicKey(ctx.user));
    assert.ok(account);
    assert.equal(getUserStateDecoder().decode(account.data).rewardsIssuedUnclaimed[0], BigInt(0));
  },
);
