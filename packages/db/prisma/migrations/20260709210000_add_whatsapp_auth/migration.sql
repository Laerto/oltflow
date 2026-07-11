-- WhatsApp (Baileys) multi-device auth store. `data` holds AES-GCM encrypted BufferJSON.
CREATE TABLE "WhatsappAuth" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsappAuth_pkey" PRIMARY KEY ("id")
);
