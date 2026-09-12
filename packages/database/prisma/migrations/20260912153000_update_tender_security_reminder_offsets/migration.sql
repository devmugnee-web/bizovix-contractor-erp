UPDATE "reminder_rule_settings"
SET "offsetDays" = ARRAY[15, 7, 0]::INTEGER[],
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "reminderType" = 'TENDER_SECURITY_EXPIRY';
