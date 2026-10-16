BEGIN;

ALTER TABLE "WorkspaceIntegration"
ADD COLUMN "webhookId" TEXT,
ADD COLUMN "webhookSecretEncrypted" TEXT;

COMMIT;