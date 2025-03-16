-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('CLOSED', 'EARLY_CLOSE');

-- CreateTable
CREATE TABLE "Symbol" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Symbol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyQuote" (
    "symbolId" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "DailyQuote_pkey" PRIMARY KEY ("symbolId","date")
);

-- CreateTable
CREATE TABLE "DailyOptionsChain" (
    "symbolId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "DailyOptionsChain_pkey" PRIMARY KEY ("symbolId","date")
);

-- CreateTable
CREATE TABLE "DailyOptionPut" (
    "contractId" TEXT NOT NULL,
    "date" DATE NOT NULL,
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
    "impliedVolatility" DECIMAL(65,30) NOT NULL,
    "delta" DECIMAL(65,30) NOT NULL,
    "gamma" DECIMAL(65,30) NOT NULL,
    "theta" DECIMAL(65,30) NOT NULL,
    "vega" DECIMAL(65,30) NOT NULL,
    "rho" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "DailyOptionPut_pkey" PRIMARY KEY ("contractId","date")
);

-- CreateTable
CREATE TABLE "DailyOptionCall" (
    "contractId" TEXT NOT NULL,
    "date" DATE NOT NULL,
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
    "impliedVolatility" DECIMAL(65,30) NOT NULL,
    "delta" DECIMAL(65,30) NOT NULL,
    "gamma" DECIMAL(65,30) NOT NULL,
    "theta" DECIMAL(65,30) NOT NULL,
    "vega" DECIMAL(65,30) NOT NULL,
    "rho" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "DailyOptionCall_pkey" PRIMARY KEY ("contractId","date")
);

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

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "HolidayType" NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyQuote_date_idx" ON "DailyQuote"("date");

-- CreateIndex
CREATE INDEX "DailyOptionsChain_date_idx" ON "DailyOptionsChain"("date");

-- CreateIndex
CREATE INDEX "DailyOptionPut_symbolId_expiration_idx" ON "DailyOptionPut"("symbolId", "expiration");

-- CreateIndex
CREATE INDEX "DailyOptionPut_symbolId_date_strike_idx" ON "DailyOptionPut"("symbolId", "date", "strike");

-- CreateIndex
CREATE INDEX "DailyOptionCall_symbolId_expiration_idx" ON "DailyOptionCall"("symbolId", "expiration");

-- CreateIndex
CREATE INDEX "DailyOptionCall_symbolId_date_strike_idx" ON "DailyOptionCall"("symbolId", "date", "strike");

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
ALTER TABLE "DailyQuote" ADD CONSTRAINT "DailyQuote_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyOptionsChain" ADD CONSTRAINT "DailyOptionsChain_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyOptionPut" ADD CONSTRAINT "DailyOptionPut_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyOptionPut" ADD CONSTRAINT "DailyOptionPut_symbolId_date_fkey" FOREIGN KEY ("symbolId", "date") REFERENCES "DailyOptionsChain"("symbolId", "date") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyOptionCall" ADD CONSTRAINT "DailyOptionCall_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyOptionCall" ADD CONSTRAINT "DailyOptionCall_symbolId_date_fkey" FOREIGN KEY ("symbolId", "date") REFERENCES "DailyOptionsChain"("symbolId", "date") ON DELETE RESTRICT ON UPDATE CASCADE;

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

