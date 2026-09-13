import { test } from "node:test";
import assert from "node:assert/strict";
import { UserMetadata, Obligation } from "@kamino-finance/klend-sdk/dist/@codegen/klend/accounts";
import {
  CpiTypes,
  KAMINO_LENDING_PROGRAM_ID as PROGRAM_ID,
  createCpiData,
} from "@solana-cpi-standard/kamino";
import { executeCpis, accountMeta } from "../../utils/sandbox";
import { setupKaminoLendingContext, MARKET } from "./setup";

test(
  "Kamino lending: initialize PDA metadata/obligation, refresh, and reject elevation without collateral",
  { timeout: 180000 },
  async () => {
    const ctx = await setupKaminoLendingContext();
    await executeCpis(ctx, ctx.initialize);
    const metadata = await ctx.connection.getAccountInfo(ctx.metadata);
    assert.ok(metadata);
    assert.equal(metadata.owner.toBase58(), PROGRAM_ID);
    assert.equal(UserMetadata.decode(metadata.data).owner, ctx.pda.toBase58());
    const refresh = createCpiData(
      CpiTypes.K_REFRESH_OBLIGATION,
      [accountMeta(MARKET), accountMeta(ctx.obligation, true)],
      Buffer.alloc(0),
    );
    const elevation = createCpiData(
      CpiTypes.K_REQUEST_ELEVATION_GROUP,
      [accountMeta(ctx.pda), accountMeta(ctx.obligation, true), accountMeta(MARKET)],
      Buffer.from([0]),
    );
    await executeCpis(ctx, [refresh]);
    await assert.rejects(
      executeCpis(ctx, [refresh, elevation]),
      /ObligationDepositsEmpty.*6020|Error Number: 6020/,
    );
    const state = await ctx.connection.getAccountInfo(ctx.obligation);
    assert.ok(state);
    const obligation = Obligation.decode(state.data);
    assert.equal(state.owner.toBase58(), PROGRAM_ID);
    assert.equal(obligation.owner, ctx.pda.toBase58());
    assert.equal(obligation.lendingMarket, MARKET.toBase58());
    assert.equal(obligation.elevationGroup, 0);
    assert.equal(obligation.depositedValueSf.toString(), "0");
    assert.equal(obligation.borrowedAssetsMarketValueSf.toString(), "0");
  },
);
