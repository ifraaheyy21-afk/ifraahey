-- Historical reconciliation: these objects already exist in the inspected database.
-- On that database, use migrate resolve --applied; do NOT execute this SQL.
-- This migration must sort after the original base migration and before
-- 202610161112000_add_automation_email_safety, which adds metadata below.

BEGIN;

CREATE TYPE "IntegrationProvider" AS ENUM (
    'salesforce', 'hubspot', 'stripe', 'pipedrive', 'resend', 'sendgrid',
    'mailgun', 'posthog', 'intercom', 'slack', 'google_calendar', 'zapier'
);

CREATE TYPE "IntegrationStatus" AS ENUM ('connected', 'disconnected', 'expired', 'error');

ALTER TABLE "Customer" ADD COLUMN "unsubscribedAt" TIMESTAMP(3);

CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'connected',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "instanceUrl" TEXT,
    "tokenType" TEXT,
    "scope" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "externalUserId" TEXT,
    "externalOrgId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "syncStatus" TEXT,
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "webhookChannel" TEXT,
    "webhookChannelId" TEXT,
    "webhookUrl" TEXT,
    CONSTRAINT "WorkspaceIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workspace_userEmail_key" ON "Workspace"("userEmail");
CREATE INDEX "BrandEmailProfile_workspaceId_idx" ON "BrandEmailProfile"("workspaceId");
CREATE INDEX "Customer_workspaceId_idx" ON "Customer"("workspaceId");
CREATE INDEX "Customer_email_idx" ON "Customer"("email");
CREATE INDEX "EmailSample_workspaceId_idx" ON "EmailSample"("workspaceId");
CREATE INDEX "GeneratedEmail_workspaceId_idx" ON "GeneratedEmail"("workspaceId");
CREATE INDEX "GeneratedEmail_status_idx" ON "GeneratedEmail"("status");
CREATE INDEX "ScheduledEmail_workspaceId_idx" ON "ScheduledEmail"("workspaceId");
CREATE INDEX "ScheduledEmail_customerId_idx" ON "ScheduledEmail"("customerId");
CREATE INDEX "ScheduledEmail_generatedEmailId_idx" ON "ScheduledEmail"("generatedEmailId");
CREATE INDEX "ScheduledEmail_status_idx" ON "ScheduledEmail"("status");
CREATE INDEX "ScheduledEmail_scheduledFor_idx" ON "ScheduledEmail"("scheduledFor");
CREATE INDEX "EmailEvent_workspaceId_idx" ON "EmailEvent"("workspaceId");
CREATE INDEX "EmailEvent_customerId_idx" ON "EmailEvent"("customerId");
CREATE INDEX "EmailEvent_generatedEmailId_idx" ON "EmailEvent"("generatedEmailId");
CREATE INDEX "EmailEvent_scheduledEmailId_idx" ON "EmailEvent"("scheduledEmailId");
CREATE INDEX "EmailEvent_status_idx" ON "EmailEvent"("status");
CREATE INDEX "EmailEvent_createdAt_idx" ON "EmailEvent"("createdAt");
CREATE INDEX "EmailMasterTemplate_workspaceId_idx" ON "EmailMasterTemplate"("workspaceId");
CREATE INDEX "EmailMasterTemplate_sampleId_idx" ON "EmailMasterTemplate"("sampleId");
CREATE INDEX "TrackedLink_workspaceId_idx" ON "TrackedLink"("workspaceId");
CREATE INDEX "TrackedLink_scheduledEmailId_idx" ON "TrackedLink"("scheduledEmailId");
CREATE INDEX "TrackedLink_customerId_idx" ON "TrackedLink"("customerId");
CREATE UNIQUE INDEX "Suppression_workspaceId_email_key" ON "Suppression"("workspaceId", "email");
CREATE INDEX "Suppression_workspaceId_idx" ON "Suppression"("workspaceId");
CREATE INDEX "Suppression_email_idx" ON "Suppression"("email");
CREATE UNIQUE INDEX "WorkspaceIntegration_workspaceId_provider_key" ON "WorkspaceIntegration"("workspaceId", "provider");
CREATE INDEX "WorkspaceIntegration_workspaceId_idx" ON "WorkspaceIntegration"("workspaceId");
CREATE INDEX "WorkspaceIntegration_provider_idx" ON "WorkspaceIntegration"("provider");

ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceIntegration" ADD CONSTRAINT "WorkspaceIntegration_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMasterTemplate" ADD CONSTRAINT "EmailMasterTemplate_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
