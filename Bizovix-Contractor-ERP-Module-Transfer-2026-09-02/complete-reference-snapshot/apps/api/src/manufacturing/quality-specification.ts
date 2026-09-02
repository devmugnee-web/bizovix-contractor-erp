import { Prisma } from "../generated/prisma/index.js";

export type QualitySpecificationResultType = "NUMERIC" | "TEXT" | "BOOLEAN";

export interface QualitySpecificationMethodSource {
  id: string;
  code: string;
  name: string;
  versionNumber: number;
  status: string;
}

export interface QualitySpecificationSource {
  id: string;
  code: string;
  name: string;
  versionNumber: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  approvedAt: Date | null;
  payload: unknown;
}

export interface ApplicableQualitySpecificationParameter {
  parameterCode: string;
  parameterName: string;
  sequence: number;
  resultType: QualitySpecificationResultType;
  unit: string | null;
  testMethodRecordId: string;
  testMethodCode: string;
  testMethodName: string;
  testMethodVersion: number;
  testMethodSnapshot: string;
  lowerLimit: string | null;
  upperLimit: string | null;
  expectedText: string | null;
  expectedBoolean: boolean | null;
  critical: boolean;
  specificationText: string;
}

export interface ApplicableQualitySpecification {
  id: string;
  code: string;
  name: string;
  versionNumber: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  approvedAt: string | null;
  parameters: ApplicableQualitySpecificationParameter[];
}

export interface QualityResultInput {
  parameterCode?: unknown;
  actualValue?: unknown;
  actualText?: unknown;
  remarks?: unknown;
}

export interface EvaluatedQualityResult {
  parameterCode: string;
  parameterName: string;
  testMethod: string;
  unit: string | null;
  specificationMin: Prisma.Decimal | null;
  specificationMax: Prisma.Decimal | null;
  specificationText: string;
  actualValue: Prisma.Decimal | null;
  actualText: string | null;
  passed: boolean;
  remarks: string | null;
  sortOrder: number;
}

export class QualitySpecificationValidationError extends Error {}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new QualitySpecificationValidationError(`${label} is missing.`);
  }
  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredPositiveInteger(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new QualitySpecificationValidationError(
      `${label} must be a positive integer.`,
    );
  }
  return parsed;
}

function optionalDecimal(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  try {
    const parsed = new Prisma.Decimal(value as Prisma.Decimal.Value);
    if (!parsed.isFinite()) throw new Error("not finite");
    return parsed;
  } catch {
    throw new QualitySpecificationValidationError(
      `${label} must be a valid number.`,
    );
  }
}

function dateIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function numericSpecificationText(
  lower: Prisma.Decimal | null,
  upper: Prisma.Decimal | null,
) {
  if (lower && upper) return `${lower.toString()} to ${upper.toString()}`;
  if (lower) return `>= ${lower.toString()}`;
  if (upper) return `<= ${upper.toString()}`;
  throw new QualitySpecificationValidationError(
    "Numeric quality parameter requires a lower or upper limit.",
  );
}

/**
 * Converts an approved control record into the immutable specification shown
 * to an inspector. Nothing supplied by the result-entry client is trusted for
 * parameter identity, test method or limits.
 */
export function compileApplicableQualitySpecification(
  source: QualitySpecificationSource,
  methods: QualitySpecificationMethodSource[],
): ApplicableQualitySpecification {
  const payload = objectValue(source.payload);
  const rawParameters = Array.isArray(payload.parameters)
    ? payload.parameters
    : [];
  if (!rawParameters.length) {
    throw new QualitySpecificationValidationError(
      `Approved quality specification ${source.code} v${source.versionNumber} has no parameters.`,
    );
  }
  const methodById = new Map(methods.map((method) => [method.id, method]));
  const seenSequences = new Set<number>();
  const parameters = rawParameters
    .map((rawParameter, index) => {
      const parameter = objectValue(rawParameter);
      const sequence = requiredPositiveInteger(
        parameter.sequence,
        `Quality parameter ${index + 1} sequence`,
      );
      if (seenSequences.has(sequence)) {
        throw new QualitySpecificationValidationError(
          `Quality specification has duplicate sequence ${sequence}.`,
        );
      }
      seenSequences.add(sequence);
      const parameterName = requiredText(
        parameter.name,
        `Quality parameter ${sequence} name`,
      );
      const testMethodRecordId = requiredText(
        parameter.testMethodRecordId,
        `Quality parameter ${sequence} test method`,
      );
      const method = methodById.get(testMethodRecordId);
      if (!method || method.status !== "APPROVED") {
        throw new QualitySpecificationValidationError(
          `Quality parameter ${parameterName} does not reference a currently approved test method.`,
        );
      }
      const resultType = parameter.resultType;
      if (
        resultType !== "NUMERIC" &&
        resultType !== "TEXT" &&
        resultType !== "BOOLEAN"
      ) {
        throw new QualitySpecificationValidationError(
          `Quality parameter ${parameterName} has an invalid result type.`,
        );
      }
      const lower = optionalDecimal(
        parameter.lowerLimit,
        `${parameterName} lower limit`,
      );
      const upper = optionalDecimal(
        parameter.upperLimit,
        `${parameterName} upper limit`,
      );
      const expectedText = optionalText(parameter.expectedText);
      const expectedBoolean =
        typeof parameter.expectedBoolean === "boolean"
          ? parameter.expectedBoolean
          : null;
      if (lower && upper && lower.greaterThan(upper)) {
        throw new QualitySpecificationValidationError(
          `${parameterName} lower limit cannot exceed its upper limit.`,
        );
      }
      const specificationText =
        resultType === "NUMERIC"
          ? numericSpecificationText(lower, upper)
          : resultType === "TEXT"
            ? (expectedText ??
              (() => {
                throw new QualitySpecificationValidationError(
                  `${parameterName} requires expected text.`,
                );
              })())
            : expectedBoolean === null
              ? (() => {
                  throw new QualitySpecificationValidationError(
                    `${parameterName} requires an expected boolean.`,
                  );
                })()
              : expectedBoolean
                ? "Yes"
                : "No";
      return {
        parameterCode: `${source.code}-${String(sequence).padStart(2, "0")}`,
        parameterName,
        sequence,
        resultType,
        unit: optionalText(parameter.unit),
        testMethodRecordId,
        testMethodCode: method.code,
        testMethodName: method.name,
        testMethodVersion: method.versionNumber,
        testMethodSnapshot: `${method.code} v${method.versionNumber} — ${method.name}`,
        lowerLimit: lower?.toString() ?? null,
        upperLimit: upper?.toString() ?? null,
        expectedText,
        expectedBoolean,
        critical: parameter.critical === true,
        specificationText,
      } satisfies ApplicableQualitySpecificationParameter;
    })
    .sort((left, right) => left.sequence - right.sequence);
  return {
    id: source.id,
    code: source.code,
    name: source.name,
    versionNumber: source.versionNumber,
    effectiveFrom: dateIso(source.effectiveFrom),
    effectiveTo: dateIso(source.effectiveTo),
    approvedAt: dateIso(source.approvedAt),
    parameters,
  };
}

function parseBooleanActual(value: unknown, parameterName: string) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  throw new QualitySpecificationValidationError(
    `${parameterName} requires a Yes/No actual result.`,
  );
}

/** Validates the exact parameter set and calculates every pass/fail result. */
export function evaluateQualitySpecificationResults(
  specification: ApplicableQualitySpecification,
  inputs: QualityResultInput[],
): EvaluatedQualityResult[] {
  if (!Array.isArray(inputs)) {
    throw new QualitySpecificationValidationError(
      "Quality results must be an array.",
    );
  }
  const inputByCode = new Map<string, QualityResultInput>();
  for (const [index, input] of inputs.entries()) {
    const code = requiredText(
      input.parameterCode,
      `QC result row ${index + 1} parameterCode`,
    );
    if (inputByCode.has(code)) {
      throw new QualitySpecificationValidationError(
        `Duplicate QC parameterCode ${code}.`,
      );
    }
    inputByCode.set(code, input);
  }
  const expectedCodes = new Set(
    specification.parameters.map((parameter) => parameter.parameterCode),
  );
  const unexpected = [...inputByCode.keys()].filter(
    (code) => !expectedCodes.has(code),
  );
  if (unexpected.length) {
    throw new QualitySpecificationValidationError(
      `QC results contain parameter(s) outside ${specification.code} v${specification.versionNumber}: ${unexpected.join(", ")}.`,
    );
  }
  const missing = specification.parameters.filter(
    (parameter) => !inputByCode.has(parameter.parameterCode),
  );
  if (missing.length) {
    throw new QualitySpecificationValidationError(
      `QC results are missing required parameter(s): ${missing.map((parameter) => parameter.parameterName).join(", ")}.`,
    );
  }
  return specification.parameters.map((parameter, sortOrder) => {
    const input = inputByCode.get(parameter.parameterCode)!;
    const remarks = optionalText(input.remarks);
    if (parameter.resultType === "NUMERIC") {
      const actualValue = optionalDecimal(
        input.actualValue,
        `${parameter.parameterName} actual value`,
      );
      if (!actualValue) {
        throw new QualitySpecificationValidationError(
          `${parameter.parameterName} requires a numeric actual value.`,
        );
      }
      const lower =
        parameter.lowerLimit === null
          ? null
          : new Prisma.Decimal(parameter.lowerLimit);
      const upper =
        parameter.upperLimit === null
          ? null
          : new Prisma.Decimal(parameter.upperLimit);
      const passed =
        (!lower || actualValue.greaterThanOrEqualTo(lower)) &&
        (!upper || actualValue.lessThanOrEqualTo(upper));
      return {
        parameterCode: parameter.parameterCode,
        parameterName: parameter.parameterName,
        testMethod: parameter.testMethodSnapshot,
        unit: parameter.unit,
        specificationMin: lower,
        specificationMax: upper,
        specificationText: parameter.specificationText,
        actualValue,
        actualText: null,
        passed,
        remarks,
        sortOrder,
      };
    }
    if (parameter.resultType === "TEXT") {
      const actualText = requiredText(
        input.actualText,
        `${parameter.parameterName} actual result`,
      );
      return {
        parameterCode: parameter.parameterCode,
        parameterName: parameter.parameterName,
        testMethod: parameter.testMethodSnapshot,
        unit: parameter.unit,
        specificationMin: null,
        specificationMax: null,
        specificationText: parameter.specificationText,
        actualValue: null,
        actualText,
        passed: actualText === parameter.expectedText,
        remarks,
        sortOrder,
      };
    }
    const actualBoolean = parseBooleanActual(
      input.actualText,
      parameter.parameterName,
    );
    return {
      parameterCode: parameter.parameterCode,
      parameterName: parameter.parameterName,
      testMethod: parameter.testMethodSnapshot,
      unit: parameter.unit,
      specificationMin: null,
      specificationMax: null,
      specificationText: parameter.specificationText,
      actualValue: null,
      actualText: actualBoolean ? "Yes" : "No",
      passed: actualBoolean === parameter.expectedBoolean,
      remarks,
      sortOrder,
    };
  });
}
