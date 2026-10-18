-- CreateTable
CREATE TABLE "InboxDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "threadId" TEXT,
    "toEmail" TEXT,
    "toName" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "html" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxDraft_workspaceId_threadId_key" ON "InboxDraft"("workspaceId", "threadId");

-- CreateIndex
CREATE INDEX "InboxDraft_workspaceId_updatedAt_idx" ON "InboxDraft"("workspaceId", "updatedAt");

-- AddForeignKey
ALTER TABLE "InboxDraft" ADD CONSTRAINT "InboxDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
