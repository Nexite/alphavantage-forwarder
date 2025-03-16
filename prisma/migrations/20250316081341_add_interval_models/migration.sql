-- CreateTable
CREATE TABLE "IntervalOptionsChain" (
    "symbolId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntervalOptionsChain_pkey" PRIMARY KEY ("symbolId","timestamp")
);

-- CreateTable
CREATE TABLE "IntervalOptionPut" (
    "contractId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "symbolId" TEXT NOT NULL,
    "expiration" DATE NOT NULL,
    "strike" DECIMAL(65,30) NOT NULL,
    "last" DECIMAL(65,30) NOT NULL,
    "mark" DECIMAL(65,30) NOT NULL,
    "bid" DECIMAL(65,30) NOT NULL,
    "bidSize" INTEGER NOT NULL,
    "ask" DECIMAL(65,30) NOT NULL,
    "askSize" INTEGER NOT NULL,
    "volume" INTEGER NOT NULL,
    "openInterest" INTEGER NOT NULL,

    CONSTRAINT "IntervalOptionPut_pkey" PRIMARY KEY ("contractId","timestamp")
);

-- CreateTable
CREATE TABLE "IntervalOptionCall" (
    "contractId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "symbolId" TEXT NOT NULL,
    "expiration" DATE NOT NULL,
    "strike" DECIMAL(65,30) NOT NULL,
    "last" DECIMAL(65,30) NOT NULL,
    "mark" DECIMAL(65,30) NOT NULL,
    "bid" DECIMAL(65,30) NOT NULL,
    "bidSize" INTEGER NOT NULL,
    "ask" DECIMAL(65,30) NOT NULL,
    "askSize" INTEGER NOT NULL,
    "volume" INTEGER NOT NULL,
    "openInterest" INTEGER NOT NULL,

    CONSTRAINT "IntervalOptionCall_pkey" PRIMARY KEY ("contractId","timestamp")
);

-- CreateIndex
CREATE INDEX "IntervalOptionsChain_symbolId_timestamp_idx" ON "IntervalOptionsChain"("symbolId", "timestamp");

-- CreateIndex
CREATE INDEX "IntervalOptionPut_symbolId_expiration_idx" ON "IntervalOptionPut"("symbolId", "expiration");

-- CreateIndex
CREATE INDEX "IntervalOptionPut_symbolId_timestamp_strike_idx" ON "IntervalOptionPut"("symbolId", "timestamp", "strike");

-- CreateIndex
CREATE INDEX "IntervalOptionCall_symbolId_expiration_idx" ON "IntervalOptionCall"("symbolId", "expiration");

-- CreateIndex
CREATE INDEX "IntervalOptionCall_symbolId_timestamp_strike_idx" ON "IntervalOptionCall"("symbolId", "timestamp", "strike");

-- AddForeignKey
ALTER TABLE "IntervalOptionsChain" ADD CONSTRAINT "IntervalOptionsChain_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntervalOptionPut" ADD CONSTRAINT "IntervalOptionPut_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntervalOptionPut" ADD CONSTRAINT "IntervalOptionPut_symbolId_timestamp_fkey" FOREIGN KEY ("symbolId", "timestamp") REFERENCES "IntervalOptionsChain"("symbolId", "timestamp") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntervalOptionCall" ADD CONSTRAINT "IntervalOptionCall_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntervalOptionCall" ADD CONSTRAINT "IntervalOptionCall_symbolId_timestamp_fkey" FOREIGN KEY ("symbolId", "timestamp") REFERENCES "IntervalOptionsChain"("symbolId", "timestamp") ON DELETE RESTRICT ON UPDATE CASCADE;
