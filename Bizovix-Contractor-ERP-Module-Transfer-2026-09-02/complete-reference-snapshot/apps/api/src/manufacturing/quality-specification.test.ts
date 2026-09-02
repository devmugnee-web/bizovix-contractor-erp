import { describe, expect, it } from "vitest";

import {
  compileApplicableQualitySpecification,
  evaluateQualitySpecificationResults,
  QualitySpecificationValidationError,
} from "./quality-specification.js";

const source = {
  id: "spec-1",
  code: "FG-QC",
  name: "Finished-good specification",
  versionNumber: 3,
  effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  effectiveTo: null,
  approvedAt: new Date("2026-08-30T00:00:00.000Z"),
  payload: {
    parameters: [
      {
        sequence: 1,
        name: "Temperature",
        testMethodRecordId: "method-1",
        resultType: "NUMERIC",
        unit: "C",
        lowerLimit: 2,
        upperLimit: 8,
        critical: true,
      },
      {
        sequence: 2,
        name: "Appearance",
        testMethodRecordId: "method-2",
        resultType: "TEXT",
        expectedText: "Clear",
      },
      {
        sequence: 3,
        name: "Seal intact",
        testMethodRecordId: "method-2",
        resultType: "BOOLEAN",
        expectedBoolean: true,
      },
    ],
  },
};

const methods = [
  {
    id: "method-1",
    code: "TM-TEMP",
    name: "Calibrated probe",
    versionNumber: 2,
    status: "APPROVED",
  },
  {
    id: "method-2",
    code: "TM-VIS",
    name: "Visual inspection",
    versionNumber: 1,
    status: "APPROVED",
  },
];

describe("quality specification enforcement", () => {
  it("compiles immutable parameter, method and limit snapshots", () => {
    const specification = compileApplicableQualitySpecification(
      source,
      methods,
    );

    expect(specification.parameters).toMatchObject([
      {
        parameterCode: "FG-QC-01",
        parameterName: "Temperature",
        testMethodSnapshot: "TM-TEMP v2 — Calibrated probe",
        lowerLimit: "2",
        upperLimit: "8",
        specificationText: "2 to 8",
      },
      { parameterCode: "FG-QC-02", specificationText: "Clear" },
      { parameterCode: "FG-QC-03", specificationText: "Yes" },
    ]);
  });

  it("calculates pass and fail server-side from the approved limits", () => {
    const specification = compileApplicableQualitySpecification(
      source,
      methods,
    );
    const results = evaluateQualitySpecificationResults(specification, [
      { parameterCode: "FG-QC-01", actualValue: "8.01" },
      { parameterCode: "FG-QC-02", actualText: "Clear" },
      { parameterCode: "FG-QC-03", actualText: "no" },
    ]);

    expect(results.map((result) => result.passed)).toEqual([
      false,
      true,
      false,
    ]);
    expect(results[0]).toMatchObject({
      parameterName: "Temperature",
      specificationText: "2 to 8",
      testMethod: "TM-TEMP v2 — Calibrated probe",
    });
    expect(results[0].actualValue?.toString()).toBe("8.01");
  });

  it("rejects missing, duplicate and arbitrary result parameters", () => {
    const specification = compileApplicableQualitySpecification(
      source,
      methods,
    );

    expect(() =>
      evaluateQualitySpecificationResults(specification, [
        { parameterCode: "FG-QC-01", actualValue: 5 },
        { parameterCode: "FG-QC-01", actualValue: 6 },
      ]),
    ).toThrow("Duplicate QC parameterCode FG-QC-01");

    expect(() =>
      evaluateQualitySpecificationResults(specification, [
        { parameterCode: "FG-QC-01", actualValue: 5 },
        { parameterCode: "ARBITRARY", actualText: "anything" },
      ]),
    ).toThrow("outside FG-QC v3");

    expect(() =>
      evaluateQualitySpecificationResults(specification, [
        { parameterCode: "FG-QC-01", actualValue: 5 },
        { parameterCode: "FG-QC-02", actualText: "Clear" },
      ]),
    ).toThrow("Seal intact");
  });

  it("blocks a specification whose linked test method is no longer approved", () => {
    expect(() =>
      compileApplicableQualitySpecification(source, [
        methods[0],
        { ...methods[1], status: "RETIRED" },
      ]),
    ).toThrow(QualitySpecificationValidationError);
  });
});
