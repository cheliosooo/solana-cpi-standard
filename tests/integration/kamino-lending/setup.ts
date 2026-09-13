import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  CpiTypes,
  KAMINO_LENDING_PROGRAM_ID as PROGRAM_ID,
  createCpiData,
} from "@solana-cpi-standard/kamino";
import { accountMeta, setupSandboxContext } from "../../utils/sandbox";
export const MARKET = new PublicKey("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF");
export async function setupKaminoLendingContext() {
  const base = await setupSandboxContext();
  const program = new PublicKey(PROGRAM_ID);
  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_meta"), base.pda.toBuffer()],
    program,
  );
  const [obligation] = PublicKey.findProgramAddressSync(
    [
      Buffer.from([0]),
      Buffer.from([0]),
      base.pda.toBuffer(),
      MARKET.toBuffer(),
      SystemProgram.programId.toBuffer(),
      SystemProgram.programId.toBuffer(),
    ],
    program,
  );
  const initialize = [
    createCpiData(
      CpiTypes.K_INIT_USER_METADATA,
      [
        accountMeta(base.pda),
        accountMeta(base.payer.publicKey, true),
        accountMeta(metadata, true),
        accountMeta(program),
        accountMeta(SYSVAR_RENT_PUBKEY),
        accountMeta(SystemProgram.programId),
      ],
      SystemProgram.programId.toBuffer(),
    ),
    createCpiData(
      CpiTypes.K_INIT_OBLIGATION,
      [
        accountMeta(base.pda),
        accountMeta(base.payer.publicKey, true),
        accountMeta(obligation, true),
        accountMeta(MARKET),
        accountMeta(SystemProgram.programId),
        accountMeta(SystemProgram.programId),
        accountMeta(metadata),
        accountMeta(SYSVAR_RENT_PUBKEY),
        accountMeta(SystemProgram.programId),
      ],
      Buffer.from([0, 0]),
    ),
  ];
  return { ...base, metadata, obligation, initialize };
}
export type KaminoLendingTestContext = Awaited<ReturnType<typeof setupKaminoLendingContext>>;
