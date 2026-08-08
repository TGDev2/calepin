-- The email sign-in rate-limit ledger (CAL-025).
--
-- `VerificationToken` cannot carry this counter: its three fields are the
-- `@auth/prisma-adapter` contract, pinned by `prisma/schema.test.ts`. This
-- table exists solely to count requests per address in the last hour.

-- CreateTable
CREATE TABLE "email_sign_in_requests" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_sign_in_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_sign_in_requests_identifier_createdAt_idx" ON "email_sign_in_requests"("identifier", "createdAt");
