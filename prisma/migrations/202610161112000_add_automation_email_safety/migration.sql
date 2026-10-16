BEGIN;

ALTER TABLE "AutomationRun"
ADD COLUMN "workflowDefinition" JSONB,
ADD COLUMN "workflowVersion" INTEGER;

ALTER TABLE "EmailEvent"
ADD COLUMN "webhookEventId" TEXT;

ALTER TABLE "ScheduledEmail"
ADD COLUMN "sendAttemptedAt" TIMESTAMP(3),
ADD COLUMN "sendCredentialFingerprint" TEXT,
ADD COLUMN "sendLockToken" TEXT,
ADD COLUMN "sendLockedUntil" TIMESTAMP(3),
ADD COLUMN "sendPayload" JSONB;

ALTER TABLE "WorkspaceIntegration"
ADD COLUMN "metadata" JSONB;

CREATE UNIQUE INDEX "EmailEvent_webhookEventId_key"
ON "EmailEvent"("webhookEventId");

COMMIT;