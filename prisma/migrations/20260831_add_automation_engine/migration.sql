-- CreateEnum
CREATE TYPE "AutomationWorkflowStatus" AS ENUM ('draft', 'active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('queued', 'running', 'waiting', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AutomationStepStatus" AS ENUM ('pending', 'running', 'waiting', 'completed', 'skipped', 'failed');

-- AlterTable
ALTER TABLE "ScheduledEmail" ADD COLUMN     "automationNodeId" TEXT,
ADD COLUMN     "automationRunId" TEXT;

-- CreateTable
CREATE TABLE "CustomerTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationWorkflow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationWorkflowStatus" NOT NULL DEFAULT 'draft',
    "definition" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'queued',
    "idempotencyKey" TEXT,
    "triggerNodeId" TEXT,
    "currentNodeId" TEXT,
    "input" JSONB,
    "context" JSONB,
    "output" JSONB,
    "error" TEXT,
    "resumeAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationStepRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AutomationStepStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerTag_workspaceId_idx" ON "CustomerTag"("workspaceId");

-- CreateIndex
CREATE INDEX "CustomerTag_customerId_idx" ON "CustomerTag"("customerId");

-- CreateIndex
CREATE INDEX "CustomerTag_normalizedName_idx" ON "CustomerTag"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTag_customerId_normalizedName_key" ON "CustomerTag"("customerId", "normalizedName");

-- CreateIndex
CREATE INDEX "AutomationWorkflow_workspaceId_idx" ON "AutomationWorkflow"("workspaceId");

-- CreateIndex
CREATE INDEX "AutomationWorkflow_workspaceId_status_idx" ON "AutomationWorkflow"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AutomationWorkflow_updatedAt_idx" ON "AutomationWorkflow"("updatedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_workspaceId_idx" ON "AutomationRun"("workspaceId");

-- CreateIndex
CREATE INDEX "AutomationRun_workflowId_idx" ON "AutomationRun"("workflowId");

-- CreateIndex
CREATE INDEX "AutomationRun_customerId_idx" ON "AutomationRun"("customerId");

-- CreateIndex
CREATE INDEX "AutomationRun_status_resumeAt_idx" ON "AutomationRun"("status", "resumeAt");

-- CreateIndex
CREATE INDEX "AutomationRun_createdAt_idx" ON "AutomationRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_workflowId_idempotencyKey_key" ON "AutomationRun"("workflowId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AutomationStepRun_runId_idx" ON "AutomationStepRun"("runId");

-- CreateIndex
CREATE INDEX "AutomationStepRun_status_idx" ON "AutomationStepRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationStepRun_runId_nodeId_attempt_key" ON "AutomationStepRun"("runId", "nodeId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledEmail_automationRunId_automationNodeId_key" ON "ScheduledEmail"("automationRunId", "automationNodeId");

-- AddForeignKey
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationWorkflow" ADD CONSTRAINT "AutomationWorkflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "AutomationWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStepRun" ADD CONSTRAINT "AutomationStepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
