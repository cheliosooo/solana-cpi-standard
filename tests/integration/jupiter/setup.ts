import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { address } from "@solana/kit";
import { CpiTypes, fromInstruction } from "@solana-cpi-standard/jupiter";
import { setupSandboxContext, toKitInstruction } from "../../utils/sandbox";
import { USDC, WSOL, tokenAccount, fundTokenAccount } from "../../utils/tokens";
interface ApiInstruction {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
}
interface Quote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  routePlan: unknown[];
}
interface SwapInstructions {
  swapInstruction: ApiInstruction;
  setupInstructions: ApiInstruction[];
  addressLookupTableAddresses: string[];
}
const apiUrl = process.env.JUPITER_API_URL ?? "https://lite-api.jup.ag/swap/v1";
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(
      `Jupiter HTTP ${response.status}; configure JUPITER_API_URL/JUPITER_API_KEY if required`,
    );
  return (await response.json()) as T;
}
function instruction(data: ApiInstruction) {
  return new TransactionInstruction({
    programId: new PublicKey(data.programId),
    keys: data.accounts.map((account) => ({ ...account, pubkey: new PublicKey(account.pubkey) })),
    data: Buffer.from(data.data, "base64"),
  });
}
export async function setupJupiterContext() {
  const base = await setupSandboxContext();
  const input = await tokenAccount(USDC, base.pda);
  const output = await tokenAccount(WSOL, base.pda);
  const amount = BigInt(1_000_000);
  await fundTokenAccount(input, amount * BigInt(10));
  const query = new URLSearchParams({
    inputMint: USDC.toBase58(),
    outputMint: WSOL.toBase58(),
    amount: amount.toString(),
    slippageBps: "500",
    onlyDirectRoutes: "true",
    maxAccounts: "20",
    // Pool-based AMMs avoid routes that depend on rapidly expiring external oracle quotes.
    dexes: "Raydium,Raydium CP",
  });
  const quote = await request<Quote>(`/quote?${query}`);
  if (
    quote.inAmount !== amount.toString() ||
    quote.inputMint !== USDC.toBase58() ||
    quote.outputMint !== WSOL.toBase58() ||
    !quote.routePlan?.length
  )
    throw new Error("Jupiter returned an invalid quote");
  const instructions = await request<SwapInstructions>("/swap-instructions", {
    quoteResponse: quote,
    userPublicKey: base.pda.toBase58(),
    payer: base.payer.publicKey.toBase58(),
    wrapAndUnwrapSol: false,
    useSharedAccounts: false,
  });
  const swap = fromInstruction(
    CpiTypes.JUPITER_SWAP,
    toKitInstruction(instruction(instructions.swapInstruction)),
    { lookupTables: instructions.addressLookupTableAddresses.map(address) },
  );
  const setup = (instructions.setupInstructions ?? []).map(instruction);
  return { ...base, input, output, amount, quote, swap, setup };
}
export type JupiterTestContext = Awaited<ReturnType<typeof setupJupiterContext>>;
