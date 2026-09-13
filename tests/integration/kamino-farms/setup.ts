import { address, createNoopSigner, createSolanaRpc } from "@solana/kit";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createMint, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Farms,
  getUserStatePDA,
  getFarmStateDecoder,
  getFarmStateEncoder,
  getUserStateDecoder,
  getUserStateEncoder,
  getTreasuryVaultPDA,
  getGlobalConfigDecoder,
} from "@kamino-finance/farms-sdk";
import {
  CpiTypes,
  KAMINO_FARMS_PROGRAM_ID as PROGRAM_ID,
  createCpiData,
} from "@solana-cpi-standard/kamino";
import {
  accountMeta,
  RPC_URL,
  rpc,
  setupSandboxContext,
  sendInstructions,
  toWeb3Instruction,
} from "../../utils/sandbox";
import { tokenAccount } from "../../utils/tokens";

export async function setupKaminoFarmsContext() {
  const base = await setupSandboxContext();
  const client = new Farms(createSolanaRpc(RPC_URL), PROGRAM_ID);
  const admin = createNoopSigner(address(base.payer.publicKey.toBase58()));
  const configKeypair = Keypair.generate();
  const farmKeypair = Keypair.generate();
  const config = address(configKeypair.publicKey.toBase58());
  const farm = address(farmKeypair.publicKey.toBase58());
  const mint = await createMint(base.connection, base.payer, base.payer.publicKey, null, 6);
  await sendInstructions(
    (await client.createGlobalConfigIxs(admin, createNoopSigner(config))).map(toWeb3Instruction),
    { signers: [configKeypair] },
  );
  await sendInstructions(
    (
      await client.createFarmIxs(admin, createNoopSigner(farm), config, address(mint.toBase58()))
    ).map(toWeb3Instruction),
    { signers: [farmKeypair] },
  );
  await sendInstructions([
    toWeb3Instruction(
      await client.addRewardToFarmIx(
        admin,
        config,
        farm,
        address(mint.toBase58()),
        address(TOKEN_PROGRAM_ID.toBase58()),
      ),
    ),
  ]);
  await sendInstructions([toWeb3Instruction(await client.createNewUserIx(admin, farm))]);
  const user = await getUserStatePDA(PROGRAM_ID, farm, admin.address);
  const destination = await tokenAccount(mint, base.payer.publicKey);
  const farmAccount = await base.connection.getAccountInfo(farmKeypair.publicKey);
  const userAccount = await base.connection.getAccountInfo(new PublicKey(user));
  const configAccount = await base.connection.getAccountInfo(configKeypair.publicKey);
  if (!farmAccount || !userAccount || !configAccount)
    throw new Error("Farm setup did not initialize accounts");
  const farmState = getFarmStateDecoder().decode(farmAccount.data);
  const userState = getUserStateDecoder().decode(userAccount.data);
  const globalConfig = getGlobalConfigDecoder().decode(configAccount.data);
  const reward = BigInt(1_000_000);
  const rewardVault = new PublicKey(farmState.rewardInfos[0].rewardsVault);
  await mintTo(base.connection, base.payer, mint, rewardVault, base.payer, reward);
  // Seed a deterministic accrued reward locally. Harvest still runs the real
  // farms bytecode, including token transfers and its own authority constraints.
  userState.rewardsIssuedUnclaimed[0] = reward;
  farmState.rewardInfos[0].rewardsIssuedUnclaimed = reward;
  for (const [key, state, bytes] of [
    [new PublicKey(user), userAccount, getUserStateEncoder().encode(userState)],
    [farmKeypair.publicKey, farmAccount, getFarmStateEncoder().encode(farmState)],
  ] as const) {
    await rpc("surfnet_setAccount", [
      key.toBase58(),
      {
        data: Buffer.from(bytes).toString("hex"),
        owner: state.owner.toBase58(),
        lamports: state.lamports,
        executable: false,
      },
    ]);
  }
  const treasury = await getTreasuryVaultPDA(PROGRAM_ID, config, address(mint.toBase58()));
  const data = Buffer.alloc(8); // reward index zero, Borsh u64
  const harvest = createCpiData(
    CpiTypes.K_HARVEST_REWARD,
    [
      accountMeta(base.payer.publicKey, true),
      accountMeta(user, true),
      accountMeta(farm, true),
      accountMeta(config),
      accountMeta(mint),
      accountMeta(destination, true),
      accountMeta(rewardVault, true),
      accountMeta(treasury, true),
      accountMeta(farmState.farmVaultsAuthority),
      accountMeta(PROGRAM_ID),
      accountMeta(TOKEN_PROGRAM_ID),
    ],
    data,
  );
  return {
    ...base,
    user,
    farm,
    destination,
    rewardVault,
    treasury: new PublicKey(treasury),
    reward,
    treasuryFeeBps: globalConfig.treasuryFeeBps,
    harvest,
  };
}
export type KaminoFarmsTestContext = Awaited<ReturnType<typeof setupKaminoFarmsContext>>;
