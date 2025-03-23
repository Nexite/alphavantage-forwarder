-- CreateIndex
CREATE INDEX "DailyOptionCall_symbolId_date_idx" ON "DailyOptionCall"("symbolId", "date");

-- CreateIndex
CREATE INDEX "DailyOptionPut_symbolId_date_idx" ON "DailyOptionPut"("symbolId", "date");

-- CreateIndex
CREATE INDEX "IntervalOptionCall_symbolId_timestamp_idx" ON "IntervalOptionCall"("symbolId", "timestamp");

-- CreateIndex
CREATE INDEX "IntervalOptionPut_symbolId_timestamp_idx" ON "IntervalOptionPut"("symbolId", "timestamp");
