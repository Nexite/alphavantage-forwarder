-- CreateTable
CREATE TABLE "Ticker" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "timesCalled" INTEGER NOT NULL,
    "lastCall" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Ip" (
    "ip" TEXT NOT NULL PRIMARY KEY,
    "timesCalled" INTEGER NOT NULL,
    "lastCall" DATETIME NOT NULL
);
