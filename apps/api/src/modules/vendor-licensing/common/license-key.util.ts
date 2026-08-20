import { randomBytes } from "crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SEGMENT_LENGTH = 5;
const SEGMENT_COUNT = 4;

function randomSegment(): string {
  const bytes = randomBytes(SEGMENT_LENGTH);
  let segment = "";
  for (let i = 0; i < SEGMENT_LENGTH; i++) {
    segment += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return segment;
}

export function generateLicenseKey(prefix = "BZVX"): string {
  const segments = Array.from({ length: SEGMENT_COUNT }, () => randomSegment());
  return [prefix, ...segments].join("-");
}

/** Keeps the product prefix and the last segment visible, masks everything between — for bulk/listing views. */
export function maskLicenseKey(licenseKey: string): string {
  const segments = licenseKey.split("-");
  if (segments.length < 3) return licenseKey;
  return segments.map((segment, index) => (index === 0 || index === segments.length - 1 ? segment : "*".repeat(segment.length))).join("-");
}
