-- Append-only A-to-K workflow definition v2. Historical v1 catalog rows and
-- every run pinned to v1 remain unchanged and operable.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ManufacturingWorkflowDefinition"
    WHERE "id" = 'mwf-a-k-v1' AND "version" = 1
  ) THEN
    RAISE EXCEPTION 'Manufacturing workflow v1 must exist before installing v2';
  END IF;
END $$;

INSERT INTO "ManufacturingWorkflowDefinition" (
  "id", "version", "isActive", "effectiveFrom", "totalGroups", "totalSteps",
  "createdAt", "updatedAt"
)
SELECT
  'mwf-a-k-v2', 2, true, DATE '2026-09-01', "totalGroups", "totalSteps",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ManufacturingWorkflowDefinition"
WHERE "id" = 'mwf-a-k-v1' AND "version" = 1;

INSERT INTO "ManufacturingWorkflowGroup" (
  "id", "workflowDefinitionId", "legacyGroupCode", "flowGroupCode", "name",
  "flowGroupOrder", "expectedStepCount", "createdAt", "updatedAt"
)
SELECT
  'mwfg-a-k-v2-' || "flowGroupCode",
  'mwf-a-k-v2',
  "legacyGroupCode",
  "flowGroupCode",
  "name",
  "flowGroupOrder",
  "expectedStepCount",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ManufacturingWorkflowGroup"
WHERE "workflowDefinitionId" = 'mwf-a-k-v1'
ORDER BY "flowGroupOrder";

INSERT INTO "ManufacturingWorkflowStepDefinition" (
  "id", "workflowDefinitionId", "workflowGroupId", "legacyStepCode", "flowSerial",
  "title", "displayOrder", "executionOrder", "stepType", "applicabilityType",
  "repeatable", "postingEffect", "idempotencyPolicy", "route", "permissionKey",
  "completionRule", "allowedModes", "isBlocking", "isActive", "createdAt", "updatedAt"
)
SELECT
  'mwfs-a-k-v2-' || lpad(step."flowSerial"::text, 3, '0'),
  'mwf-a-k-v2',
  'mwfg-a-k-v2-' || source_group."flowGroupCode",
  step."legacyStepCode",
  step."flowSerial",
  step."title",
  step."displayOrder",
  step."executionOrder",
  step."stepType",
  CASE
    WHEN step."flowSerial" IN (
      1,2,3,4,5,6,7,41,42,49,79,109,127,143,
      144,145,146,147,148,149,150,151,152,153,154
    ) THEN 'MONITORING'
    WHEN step."flowSerial" IN (104,105,106) THEN 'PERIODIC'
    WHEN step."flowSerial" IN (
      11,20,39,43,44,45,52,54,55,56,57,72,73,74,77,78,
      88,89,90,91,92,93,94,95,99,100,101,102,103,107,
      108,110,112,113,114,115,116,117,118,119,120,
      125,129,131,132,133,134,135,137,138,140
    ) THEN 'CONDITIONAL'
    WHEN step."flowSerial" IN (50,51,58,59,60,61,62,80,111,123,124,155)
      THEN 'MODE_SPECIFIC'
    ELSE 'REQUIRED'
  END::"ManufacturingWorkflowApplicabilityType",
  step."repeatable",
  step."postingEffect",
  step."idempotencyPolicy",
  step."route",
  step."permissionKey",
  step."completionRule",
  CASE
    WHEN step."flowSerial" = 50 THEN ARRAY['GENERAL','HYBRID']::text[]
    WHEN step."flowSerial" = 51
      OR step."flowSerial" IN (7,55,56,57,58,59,60,61,62,80,111,123,124,125,155)
      THEN ARRAY['PHARMACEUTICAL','HYBRID']::text[]
    ELSE ARRAY['GENERAL','PHARMACEUTICAL','HYBRID']::text[]
  END,
  CASE
    WHEN step."flowSerial" IN (
      1,2,3,4,5,6,7,41,42,49,79,104,105,106,109,127,143,
      144,145,146,147,148,149,150,151,152,153,154
    ) THEN false
    ELSE true
  END,
  step."isActive",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ManufacturingWorkflowStepDefinition" step
JOIN "ManufacturingWorkflowGroup" source_group
  ON source_group."id" = step."workflowGroupId"
WHERE step."workflowDefinitionId" = 'mwf-a-k-v1'
ORDER BY step."flowSerial";

-- Copy the v1 graph, except the generated reports no longer gate validation
-- documents and Audit Trail no longer gates Audit Trail Review. Reports remain
-- observable from Step 143, while operational close-out proceeds 143 -> 155.
INSERT INTO "ManufacturingStepDependency" (
  "id", "stepId", "prerequisiteStepId", "requiredStatus", "dependencyType",
  "conditionExpression", "createdAt"
)
SELECT
  'mwfd-a-k-v2-' || lpad(target."flowSerial"::text, 3, '0') || '-' ||
    lpad(prerequisite."flowSerial"::text, 3, '0') || '-' ||
    lower(dependency."dependencyType"::text),
  'mwfs-a-k-v2-' || lpad(target."flowSerial"::text, 3, '0'),
  'mwfs-a-k-v2-' || lpad(prerequisite."flowSerial"::text, 3, '0'),
  dependency."requiredStatus",
  dependency."dependencyType",
  dependency."conditionExpression",
  CURRENT_TIMESTAMP
FROM "ManufacturingStepDependency" dependency
JOIN "ManufacturingWorkflowStepDefinition" target
  ON target."id" = dependency."stepId"
JOIN "ManufacturingWorkflowStepDefinition" prerequisite
  ON prerequisite."id" = dependency."prerequisiteStepId"
WHERE target."workflowDefinitionId" = 'mwf-a-k-v1'
  AND prerequisite."workflowDefinitionId" = 'mwf-a-k-v1'
  AND NOT (
    target."flowSerial" = 155
    AND prerequisite."flowSerial" BETWEEN 144 AND 154
  )
  AND NOT (
    target."flowSerial" = 156
    AND prerequisite."flowSerial" = 154
  );

INSERT INTO "ManufacturingStepDependency" (
  "id", "stepId", "prerequisiteStepId", "requiredStatus", "dependencyType",
  "conditionExpression", "createdAt"
)
SELECT
  'mwfd-a-k-v2-155-143-hard',
  target."id",
  prerequisite."id",
  (prerequisite."completionRule" ->> 'requiredStatus')::"ManufacturingWorkflowStepStatus",
  'HARD'::"ManufacturingWorkflowDependencyType",
  NULL,
  CURRENT_TIMESTAMP
FROM "ManufacturingWorkflowStepDefinition" target
JOIN "ManufacturingWorkflowStepDefinition" prerequisite
  ON prerequisite."workflowDefinitionId" = target."workflowDefinitionId"
WHERE target."workflowDefinitionId" = 'mwf-a-k-v2'
  AND target."flowSerial" = 155
  AND prerequisite."flowSerial" = 143;

DO $$
DECLARE
  group_count INTEGER;
  step_count INTEGER;
  dependency_count INTEGER;
BEGIN
  SELECT count(*) INTO group_count
  FROM "ManufacturingWorkflowGroup"
  WHERE "workflowDefinitionId" = 'mwf-a-k-v2';
  SELECT count(*) INTO step_count
  FROM "ManufacturingWorkflowStepDefinition"
  WHERE "workflowDefinitionId" = 'mwf-a-k-v2';
  SELECT count(*) INTO dependency_count
  FROM "ManufacturingStepDependency" dependency
  JOIN "ManufacturingWorkflowStepDefinition" step
    ON step."id" = dependency."stepId"
  WHERE step."workflowDefinitionId" = 'mwf-a-k-v2';

  IF group_count <> 11 THEN
    RAISE EXCEPTION 'Manufacturing workflow v2 expected 11 groups, found %', group_count;
  END IF;
  IF step_count <> 159 THEN
    RAISE EXCEPTION 'Manufacturing workflow v2 expected 159 steps, found %', step_count;
  END IF;
  IF dependency_count <> 207 THEN
    RAISE EXCEPTION 'Manufacturing workflow v2 expected 207 dependencies, found %', dependency_count;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "ManufacturingWorkflowStepDefinition"
    WHERE "workflowDefinitionId" = 'mwf-a-k-v2'
      AND "flowSerial" BETWEEN 144 AND 154
      AND ("applicabilityType" <> 'MONITORING' OR "isBlocking")
  ) THEN
    RAISE EXCEPTION 'Manufacturing workflow v2 reports must be monitoring and nonblocking';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "ManufacturingStepDependency" dependency
    JOIN "ManufacturingWorkflowStepDefinition" target
      ON target."id" = dependency."stepId"
    JOIN "ManufacturingWorkflowStepDefinition" prerequisite
      ON prerequisite."id" = dependency."prerequisiteStepId"
    WHERE target."workflowDefinitionId" = 'mwf-a-k-v2'
      AND (
        (target."flowSerial" = 155 AND prerequisite."flowSerial" BETWEEN 144 AND 154)
        OR (target."flowSerial" = 156 AND prerequisite."flowSerial" = 154)
      )
  ) THEN
    RAISE EXCEPTION 'Manufacturing workflow v2 contains a blocking report dependency';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "ManufacturingStepDependency" dependency
    JOIN "ManufacturingWorkflowStepDefinition" target
      ON target."id" = dependency."stepId"
    JOIN "ManufacturingWorkflowStepDefinition" prerequisite
      ON prerequisite."id" = dependency."prerequisiteStepId"
    WHERE target."workflowDefinitionId" = 'mwf-a-k-v2'
      AND target."flowSerial" = 155
      AND prerequisite."flowSerial" = 143
      AND dependency."dependencyType" = 'HARD'
  ) THEN
    RAISE EXCEPTION 'Manufacturing workflow v2 is missing the 143 to 155 close-out gate';
  END IF;
END $$;
