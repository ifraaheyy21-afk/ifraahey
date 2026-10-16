BEGIN;

ALTER TABLE "ScheduledEmail"
ADD COLUMN "providerRfcMessageId" TEXT;

CREATE INDEX "ScheduledEmail_workspaceId_providerRfcMessageId_idx"
ON "ScheduledEmail"("workspaceId", "providerRfcMessageId");

COMMIT;