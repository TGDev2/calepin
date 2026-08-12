-- CreateTable
CREATE TABLE "character_edit_history" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "role" TEXT,
    "importance" "character_importance" NOT NULL,
    "appearance" TEXT,
    "initialSituation" TEXT,
    "apparentDesire" TEXT,
    "deepNeed" TEXT,
    "fear" TEXT,
    "contradiction" TEXT,
    "secret" TEXT,
    "past" TEXT,
    "plannedArc" TEXT,
    "speechStyle" TEXT,
    "heldKnowledge" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "elementsToPreserve" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "changedFields" "character_field"[] DEFAULT ARRAY[]::"character_field"[],
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedById" TEXT NOT NULL,

    CONSTRAINT "character_edit_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_edit_history_characterId_editedAt_idx" ON "character_edit_history"("characterId", "editedAt");

-- AddForeignKey
ALTER TABLE "character_edit_history" ADD CONSTRAINT "character_edit_history_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_edit_history" ADD CONSTRAINT "character_edit_history_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
