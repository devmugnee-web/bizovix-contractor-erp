export type ManufacturingElectronicSignaturePolicy = {
  signatureMeanings: string[];
  reauthenticationRequired: boolean;
  sessionTimeoutMinutes: number;
  mfaRequired: boolean;
};

function policyDetails(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const root = payload as Record<string, unknown>;
  const details = root.details;
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : root;
}

export function parseManufacturingElectronicSignaturePolicy(
  payload: unknown,
): ManufacturingElectronicSignaturePolicy | null {
  const details = policyDetails(payload);
  if (!details) return null;
  const signatureMeanings = Array.isArray(details.signatureMeanings)
    ? details.signatureMeanings
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    : [];
  const sessionTimeoutMinutes = Number(details.sessionTimeoutMinutes);
  if (
    !signatureMeanings.length ||
    new Set(signatureMeanings).size !== signatureMeanings.length ||
    typeof details.reauthenticationRequired !== "boolean" ||
    !Number.isInteger(sessionTimeoutMinutes) ||
    sessionTimeoutMinutes < 1 ||
    typeof details.mfaRequired !== "boolean"
  )
    return null;
  return {
    signatureMeanings,
    reauthenticationRequired: details.reauthenticationRequired,
    sessionTimeoutMinutes,
    mfaRequired: details.mfaRequired,
  };
}
