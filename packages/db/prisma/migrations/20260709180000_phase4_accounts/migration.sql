-- Phase 4: account status, email verification, one-time tokens; public-signup setting.

ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Existing users are fully active and treated as verified.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

CREATE INDEX "User_status_idx" ON "User"("status");

CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VerificationToken_tokenHash_idx" ON "VerificationToken"("tokenHash");
CREATE INDEX "VerificationToken_userId_kind_idx" ON "VerificationToken"("userId", "kind");

ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Public signup off by default (invite-only until admin enables it).
INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('app.public_signup', 'false'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('app.base_url', '""'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Notify admins when someone self-signs up (Telegram if configured).
INSERT INTO "NotificationRule" ("name", "eventType", "severityMin", "enabled", "scopeAll", "oltIds", "channels", "behavior")
SELECT 'Signup i ri → Telegram', 'user.signup', 'info', true, true, ARRAY[]::INTEGER[], '[{"type":"telegram"}]'::jsonb, 'every'
WHERE NOT EXISTS (SELECT 1 FROM "NotificationRule" r WHERE r.name = 'Signup i ri → Telegram');
