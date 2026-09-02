ALTER TABLE "PayrollSettings"
ADD COLUMN "salaryComponents" JSONB NOT NULL DEFAULT '[{"name":"Basic","percent":50},{"name":"House Rent","percent":25},{"name":"Medical Allowance","percent":15},{"name":"Conveyance","percent":10}]';
