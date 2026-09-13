import { createMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "@solana-cpi-standard/metaplex-token-metadata";
import { setupSandboxContext } from "../../utils/sandbox";
export async function setupMetaplexContext() {
  const base = await setupSandboxContext();
  const mint = await createMint(base.connection, base.payer, base.pda, null, 6);
  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), new PublicKey(PROGRAM_ID).toBuffer(), mint.toBuffer()],
    new PublicKey(PROGRAM_ID),
  );
  return { ...base, mint, metadata };
}
export type MetaplexTestContext = Awaited<ReturnType<typeof setupMetaplexContext>>;
