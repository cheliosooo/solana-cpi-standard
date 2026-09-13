import { getAccount, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { CONNECTION, PAYER_SIGNER, rpc } from "./sandbox";

export const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
export async function tokenAccount(mint: PublicKey, owner: PublicKey, program = TOKEN_PROGRAM_ID) {
  return (
    await getOrCreateAssociatedTokenAccount(
      CONNECTION,
      PAYER_SIGNER,
      mint,
      owner,
      true,
      "confirmed",
      {},
      program,
    )
  ).address;
}
/** Patch only the local test token account; the mint authority is untouched. */
export async function fundTokenAccount(account: PublicKey, amount: bigint) {
  const state = await CONNECTION.getAccountInfo(account);
  if (!state || state.data.length < 165) throw new Error("Expected an initialized token account");
  const bytes = Buffer.from(state.data);
  bytes.writeBigUInt64LE(amount, 64);
  await rpc("surfnet_setAccount", [
    account.toBase58(),
    {
      data: bytes.toString("hex"),
      lamports: state.lamports,
      owner: state.owner.toBase58(),
      executable: false,
    },
  ]);
}
export async function tokenBalance(account: PublicKey, program = TOKEN_PROGRAM_ID) {
  return (await getAccount(CONNECTION, account, "confirmed", program)).amount;
}
