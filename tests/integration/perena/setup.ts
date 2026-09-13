import { address } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import { VaultClient, DEFAULT_VAULT_ID } from "@perena/vault-sdk";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CpiTypes, PROGRAM_ID, fromInstruction } from "@solana-cpi-standard/perena";
import { ANCHOR_PROVIDER, setupSandboxContext } from "../../utils/sandbox";
import { USDC, tokenAccount, fundTokenAccount } from "../../utils/tokens";
export async function setupPerenaContext() {
  const base = await setupSandboxContext();
  const client = new VaultClient(ANCHOR_PROVIDER, PROGRAM_ID);
  const [vault] = await client.pda.deriveVaultPda(DEFAULT_VAULT_ID);
  const state = await client.account.fetchVault(vault);
  const shareMint = new PublicKey(state.mint);
  const shareProgram =
    "token2022" in state.mintTokenProgram ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const input = await tokenAccount(USDC, base.pda);
  const shares = await tokenAccount(shareMint, base.pda, shareProgram);
  const [feeVault] = await client.pda.deriveFeeAuthorityPda(vault);
  await tokenAccount(USDC, new PublicKey(feeVault));
  const amount = BigInt(1_000_000);
  await fundTokenAccount(input, amount * BigInt(10));
  const plan = await client.tx.executeDeposit.getTx({
    user: address(base.pda.toBase58()),
    vault,
    assetMint: address(USDC.toBase58()),
    shareMint: address(shareMint.toBase58()),
    userAssetAta: address(input.toBase58()),
    userShareAta: address(shares.toBase58()),
    amount,
    assetTokenProgram: address(TOKEN_PROGRAM_ID.toBase58()),
    shareTokenProgram: address(shareProgram.toBase58()),
  });
  const deposit = plan.instructions.filter((ix) => ix.programAddress === PROGRAM_ID);
  if (deposit.length !== 1) throw new Error("Expected exactly one Perena deposit instruction");
  return {
    ...base,
    client,
    vault,
    shareMint,
    shareProgram,
    input,
    shares,
    amount,
    deposit: fromInstruction(CpiTypes.PERENA_MINT, deposit[0]),
  };
}
export type PerenaTestContext = Awaited<ReturnType<typeof setupPerenaContext>>;
