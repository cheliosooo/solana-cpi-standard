const categories = [
  "Swap",
  "Deposit",
  "Withdraw",
  "Borrow",
  "Repay",
  "ClaimIncentives",
  "UpdateMintMetadata",
];

export function validateCatalog(catalog) {
  if (
    catalog.version !== 1 ||
    !Array.isArray(catalog.programs) ||
    !Array.isArray(catalog.retiredIds)
  ) {
    throw new Error("Unsupported catalog schema");
  }
  const ids = new Map();
  const labels = new Set();
  const names = new Set();
  const programs = new Set();
  const assertId = (id, owner) => {
    if (!Number.isInteger(id) || id < 0 || id > 255) throw new Error(`Invalid CPI ID: ${id}`);
    if (ids.has(id))
      throw new Error(`Duplicate or retired CPI ID ${id}: ${owner} overlaps ${ids.get(id)}`);
    ids.set(id, owner);
  };
  catalog.retiredIds.forEach((id) => assertId(id, "retired IDs"));
  for (const program of catalog.programs) {
    if (
      typeof program.name !== "string" ||
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(program.name) ||
      names.has(program.name)
    ) {
      throw new Error(`Invalid or duplicate integration name: ${program.name}`);
    }
    names.add(program.name);
    if (
      program.integration !== undefined &&
      (typeof program.integration !== "string" ||
        !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(program.integration))
    ) {
      throw new Error(`Invalid integration name: ${program.integration}`);
    }
    if (
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(program.programId) ||
      programs.has(program.programId)
    ) {
      throw new Error(`Invalid or duplicate program: ${program.programId}`);
    }
    programs.add(program.programId);
    if (
      program.programIdConstant !== undefined &&
      !/^[A-Z][A-Z0-9_]*$/.test(program.programIdConstant)
    )
      throw new Error(`Invalid program constant: ${program.programIdConstant}`);
    if (!Array.isArray(program.entries) || program.entries.length === 0)
      throw new Error("Empty integration");
    for (const entry of program.entries) {
      assertId(entry.id, `${program.integration ?? program.name}/${program.name}::${entry.label}`);
      if (!/^[A-Z][A-Z0-9_]*$/.test(entry.label) || labels.has(entry.label))
        throw new Error(`Invalid or duplicate label: ${entry.label}`);
      labels.add(entry.label);
      if (typeof entry.instructionName !== "string" || !/^[a-z0-9_]*$/.test(entry.instructionName))
        throw new Error("Invalid instruction name");
      if (entry.category !== null && !categories.includes(entry.category))
        throw new Error("Invalid category");
      if ("discriminator" in entry) {
        const discriminator = entry.discriminator;
        if (
          entry.instructionName === ""
            ? discriminator !== null
            : !Array.isArray(discriminator) ||
              discriminator.length !== 8 ||
              discriminator.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
        )
          throw new Error(`Invalid discriminator for ${entry.label}`);
      }
      if (
        entry.expectedTargetAccountIndex !== null &&
        (!Number.isInteger(entry.expectedTargetAccountIndex) ||
          entry.expectedTargetAccountIndex < 0 ||
          entry.expectedTargetAccountIndex > 253)
      )
        throw new Error("Invalid target account index");
    }
  }
}

/** A package/crate may collect multiple on-chain programs, such as Kamino. */
export function getIntegrations(catalog) {
  const integrations = new Map();
  for (const program of catalog.programs) {
    const name = program.integration ?? program.name;
    if (!integrations.has(name)) integrations.set(name, []);
    integrations.get(name).push(program);
  }
  return [...integrations].map(([name, programs]) => ({ name, programs }));
}

export function validateCompatibility(catalog, legacy) {
  // Compare wire semantics; generated metadata and JSON property order may change.
  const identity = (entry, programId) => ({
    id: entry.id,
    label: entry.label,
    programId,
    instructionName: entry.instructionName,
    category: entry.category,
    expectedTargetAccountIndex: entry.expectedTargetAccountIndex,
  });
  const current = new Map(
    catalog.programs.flatMap((p) => p.entries.map((e) => [e.id, identity(e, p.programId)])),
  );
  for (const id of legacy.retiredIds) {
    if (!catalog.retiredIds.includes(id)) throw new Error(`Retired ID ${id} must stay reserved`);
  }
  for (const program of legacy.programs) {
    for (const entry of program.entries) {
      const found = current.get(entry.id);
      if (!found) {
        if (!catalog.retiredIds.includes(entry.id))
          throw new Error(`Removed ID ${entry.id} must be retired`);
      } else if (JSON.stringify(found) !== JSON.stringify(identity(entry, program.programId))) {
        throw new Error(`Existing CPI ID ${entry.id} changed meaning`);
      }
    }
  }
}
