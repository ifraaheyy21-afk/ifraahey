-- AlterTable
ALTER TABLE "InboxSentMessage" ADD COLUMN "providerRfcMessageId" TEXT;

-- CreateIndex
CREATE INDEX "InboxSentMessage_workspaceId_providerMessageId_idx" ON "InboxSentMessage"("workspaceId", "providerMessageId");

-- CreateIndex
CREATE INDEX "InboxSentMessage_workspaceId_providerRfcMessageId_idx" ON "InboxSentMessage"("workspaceId", "providerRfcMessageId");

-- CreateTable
CREATE TABLE "InboxReceivedMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "providerEmailId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "scheduledEmailId" TEXT,
    "inboxSentMessageId" TEXT,
    "customerId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT,
    "plainText" TEXT NOT NULL,
    "rfcMessageId" TEXT,
    "attachments" JSONB,
    "authenticationFailed" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxReceivedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxThreadState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "lastReadAt" TIMESTAMP(3),
    "markedUnread" BOOLEAN NOT NULL DEFAULT false,
    "folder" TEXT,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxThreadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxReceivedMessage_workspaceId_providerEmailId_key" ON "InboxReceivedMessage"("workspaceId", "providerEmailId");

-- CreateIndex
CREATE INDEX "InboxReceivedMessage_workspaceId_threadId_idx" ON "InboxReceivedMessage"("workspaceId", "threadId");

-- CreateIndex
CREATE INDEX "InboxReceivedMessage_workspaceId_receivedAt_idx" ON "InboxReceivedMessage"("workspaceId", "receivedAt");

-- CreateIndex
CREATE INDEX "InboxReceivedMessage_workspaceId_rfcMessageId_idx" ON "InboxReceivedMessage"("workspaceId", "rfcMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxThreadState_workspaceId_threadId_key" ON "InboxThreadState"("workspaceId", "threadId");

-- CreateIndex
CREATE INDEX "InboxThreadState_workspaceId_idx" ON "InboxThreadState"("workspaceId");

-- AddForeignKey
ALTER TABLE "InboxReceivedMessage" ADD CONSTRAINT "InboxReceivedMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxThreadState" ADD CONSTRAINT "InboxThreadState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
