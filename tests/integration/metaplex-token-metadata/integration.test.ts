import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { CpiTypes, fromInstruction } from "@solana-cpi-standard/metaplex-token-metadata";
import { executeCpis, toKitInstruction } from "../../utils/sandbox";
import { setupMetaplexContext } from "./setup";

test(
  "Metaplex: create and update metadata through the sandbox PDA",
  { timeout: 180000 },
  async () => {
    const ctx = await setupMetaplexContext();
    const data = {
      name: "CPI Standard",
      symbol: "CPI",
      uri: "https://example.com/cpi.json",
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    };
    const create = createCreateMetadataAccountV3Instruction(
      {
        metadata: ctx.metadata,
        mint: ctx.mint,
        mintAuthority: ctx.pda,
        payer: ctx.payer.publicKey,
        updateAuthority: ctx.pda,
      },
      { createMetadataAccountArgsV3: { data, isMutable: true, collectionDetails: null } },
    );
    await executeCpis(ctx, [
      fromInstruction(CpiTypes.MPL_CREATE_METADATA, toKitInstruction(create)),
    ]);
    const created = await Metadata.fromAccountAddress(ctx.connection, ctx.metadata);
    assert.equal(created.mint.toBase58(), ctx.mint.toBase58());
    assert.equal(created.updateAuthority.toBase58(), ctx.pda.toBase58());
    assert.equal(created.data.name.replace(/\0/g, ""), data.name);
    const updatedData = { ...data, name: "CPI Updated", uri: "https://example.com/updated.json" };
    const update = createUpdateMetadataAccountV2Instruction(
      { metadata: ctx.metadata, updateAuthority: ctx.pda },
      {
        updateMetadataAccountArgsV2: {
          data: updatedData,
          updateAuthority: null,
          primarySaleHappened: null,
          isMutable: null,
        },
      },
    );
    await executeCpis(ctx, [
      fromInstruction(CpiTypes.MPL_UPDATE_METADATA, toKitInstruction(update)),
    ]);
    const updated = await Metadata.fromAccountAddress(ctx.connection, ctx.metadata);
    assert.equal(updated.data.name.replace(/\0/g, ""), updatedData.name);
    assert.equal(updated.data.uri.replace(/\0/g, ""), updatedData.uri);
  },
);
