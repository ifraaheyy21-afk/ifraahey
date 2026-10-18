-- CreateTable
CREATE TABLE "InboxSentMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sendKey" TEXT NOT NULL,
    "threadId" TEXT,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "plainText" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "attachmentName" TEXT,
    "attachmentMimeType" TEXT,
    "attachmentSize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "failureReason" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxSentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxSentMessage_workspaceId_sendKey_key" ON "InboxSentMessage"("workspaceId", "sendKey");

-- CreateIndex
CREATE INDEX "InboxSentMessage_workspaceId_threadId_idx" ON "InboxSentMessage"("workspaceId", "threadId");

-- CreateIndex
CREATE INDEX "InboxSentMessage_workspaceId_createdAt_idx" ON "InboxSentMessage"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "InboxSentMessage" ADD CONSTRAINT "InboxSentMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
