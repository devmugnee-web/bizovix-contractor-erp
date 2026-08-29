CREATE UNIQUE INDEX "completion_certificates_one_active_final_per_work_key"
  ON "completion_certificates"("organizationId", "workId")
  WHERE "status" <> 'CANCELLED'
    AND upper(btrim("completionType")) = 'FINAL';
