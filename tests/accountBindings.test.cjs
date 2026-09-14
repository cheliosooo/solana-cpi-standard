const { test } = require("node:test");
const assert = require("node:assert/strict");
const BN = require("bn.js");
const { address, none } = require("@solana/kit");
const core = require("../packages/core/dist");
const kamino = require("../packages/kamino/dist");
const sdk = require("@kamino-finance/klend-sdk/dist/@codegen/klend/instructions");
const other = address("11111111111111111111111111111111");
const user = address("SysvarRent111111111111111111111111111111111");
const destination = address("So11111111111111111111111111111111111111112");
const source = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const farmsAccounts = { obligationFarmUserState: none(), reserveFarmState: none() };

test("Kamino named roles resolve to the installed SDK's actual instruction accounts", () => {
  const owner = { address: other };
  const deposit = sdk.depositReserveLiquidityAndObligationCollateralV2(
    { liquidityAmount: new BN(1) },
    {
      depositAccounts: {
        owner,
        obligation: user,
        lendingMarket: other,
        lendingMarketAuthority: other,
        reserve: other,
        reserveLiquidityMint: other,
        reserveLiquiditySupply: other,
        reserveCollateralMint: other,
        reserveDestinationDepositCollateral: other,
        userSourceLiquidity: source,
        placeholderUserDestinationCollateral: none(),
        collateralTokenProgram: other,
        liquidityTokenProgram: other,
        instructionSysvarAccount: other,
      },
      farmsAccounts,
      farmsProgram: other,
    },
  );
  const withdraw = sdk.withdrawObligationCollateralAndRedeemReserveCollateralV2(
    { collateralAmount: new BN(1) },
    {
      withdrawAccounts: {
        owner,
        obligation: user,
        lendingMarket: other,
        lendingMarketAuthority: other,
        withdrawReserve: other,
        reserveLiquidityMint: other,
        reserveSourceCollateral: other,
        reserveCollateralMint: other,
        reserveLiquiditySupply: other,
        userDestinationLiquidity: destination,
        placeholderUserDestinationCollateral: none(),
        collateralTokenProgram: other,
        liquidityTokenProgram: other,
        instructionSysvarAccount: other,
      },
      farmsAccounts,
      farmsProgram: other,
    },
  );
  const borrow = sdk.borrowObligationLiquidityV2(
    { liquidityAmount: new BN(1) },
    {
      borrowAccounts: {
        owner,
        obligation: user,
        lendingMarket: other,
        lendingMarketAuthority: other,
        borrowReserve: other,
        borrowReserveLiquidityMint: other,
        reserveSourceLiquidity: other,
        borrowReserveLiquidityFeeReceiver: other,
        userDestinationLiquidity: destination,
        referrerTokenState: none(),
        tokenProgram: other,
        instructionSysvarAccount: other,
      },
      farmsAccounts,
      farmsProgram: other,
    },
  );
  const repay = sdk.repayObligationLiquidityV2(
    { liquidityAmount: new BN(1) },
    {
      repayAccounts: {
        owner,
        obligation: user,
        lendingMarket: other,
        repayReserve: other,
        reserveLiquidityMint: other,
        reserveDestinationLiquidity: other,
        userSourceLiquidity: source,
        tokenProgram: other,
        instructionSysvarAccount: other,
      },
      farmsAccounts,
      farmsProgram: other,
      lendingMarketAuthority: other,
    },
  );
  for (const [id, ix, tokenRole, tokenAddress] of [
    [kamino.CpiTypes.K_DEPOSIT, deposit, core.SOURCE_TOKEN_ACCOUNT, source],
    [kamino.CpiTypes.K_WITHDRAW, withdraw, core.DESTINATION_TOKEN_ACCOUNT, destination],
    [kamino.CpiTypes.K_BORROW, borrow, core.DESTINATION_TOKEN_ACCOUNT, destination],
    [kamino.CpiTypes.K_REPAY, repay, core.SOURCE_TOKEN_ACCOUNT, source],
  ]) {
    const entry = kamino.CPI_ENTRIES.find((entry) => entry.id === id);
    assert.equal(entry.requiredAccounts.length, 2);
    const expected = new Map([
      [core.USER_ACCOUNT, user],
      [tokenRole, tokenAddress],
    ]);
    for (const binding of entry.requiredAccounts) {
      assert.ok(expected.has(binding.role));
      assert.equal(ix.accounts[binding.index].address, expected.get(binding.role));
    }
  }
});
test("client metadata validates role names, uniqueness and indices", () => {
  const entry = kamino.CPI_ENTRIES.find((entry) => entry.id === kamino.CpiTypes.K_DEPOSIT);
  for (const requiredAccounts of [
    undefined,
    [{ role: undefined, index: 0 }],
    [{ role: "", index: 0 }],
    [{ role: core.USER_ACCOUNT, index: 254 }],
    [entry.requiredAccounts[0], entry.requiredAccounts[0]],
  ]) {
    assert.throws(() => core.createIntegration([{ ...entry, requiredAccounts }]));
  }
  const custom = [
    { role: "custom:position", index: 0 },
    { role: core.USER_ACCOUNT, index: 0 },
  ];
  assert.doesNotThrow(() => core.createIntegration([{ ...entry, requiredAccounts: custom }]));
});
