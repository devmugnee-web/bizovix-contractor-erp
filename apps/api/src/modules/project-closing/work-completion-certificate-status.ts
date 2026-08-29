import type {
  CompletionCertificateEgpStatus,
  CompletionCertificateSource,
  CompletionCertificateStatus,
} from "@bizovix/database";
import type { WorkCompletionDisplayStatus } from "./dto/query-work-completion-certificate.dto";

type CertificateStatusInput = {
  source: CompletionCertificateSource;
  status: CompletionCertificateStatus;
  egpStatus: CompletionCertificateEgpStatus;
};

export function deriveWorkCompletionDisplayStatus(
  certificate: CertificateStatusInput | null | undefined,
): WorkCompletionDisplayStatus {
  if (!certificate) return "NOT_APPLIED";

  if (certificate.source === "MANUAL") {
    if (certificate.status !== "APPROVED") {
      return ["PENDING", "UNDER_PROCESS", "OBTAINED"].includes(certificate.egpStatus)
        ? "EGP_APPLIED_FOR_MANUAL"
        : "WCC_APPLIED";
    }
    if (certificate.egpStatus === "OBTAINED") return "WCC_OBTAINED";
    if (["PENDING", "UNDER_PROCESS"].includes(certificate.egpStatus)) {
      return "MANUAL_WCC_OBTAINED_EGP_APPLIED";
    }
    return "MANUAL_WCC_OBTAINED_EGP_NOT_APPLIED";
  }

  return certificate.status === "APPROVED" ? "WCC_OBTAINED" : "WCC_APPLIED";
}

type CompletionStatsRow = {
  certificate: CertificateStatusInput | null;
};

export function summarizeWorkCompletionRows(rows: CompletionStatsRow[]) {
  const approved = rows.filter((row) => row.certificate?.status === "APPROVED");
  const obtainedEgp = approved.filter(
    (row) =>
      row.certificate?.source === "EGP" ||
      (row.certificate?.source === "MANUAL" && row.certificate.egpStatus === "OBTAINED"),
  ).length;
  const obtainedManual = approved.filter(
    (row) =>
      row.certificate?.source === "MANUAL" && row.certificate.egpStatus !== "OBTAINED",
  ).length;
  return {
    totalProjects: rows.length,
    wccObtained: approved.length,
    obtainedEgp,
    obtainedManual,
    unclassifiedObtained: approved.filter(
      (row) => row.certificate?.source === "UNSPECIFIED",
    ).length,
    egpAppliedForManual: rows.filter(
      (row) =>
        row.certificate?.source === "MANUAL" &&
        (row.certificate.egpStatus === "PENDING" ||
          row.certificate.egpStatus === "UNDER_PROCESS"),
    ).length,
    withoutWcc: rows.filter((row) => row.certificate === null).length,
  };
}
