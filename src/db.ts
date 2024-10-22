import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const ticker = async (ticker: string) => {
    await prisma.ticker.upsert({
        where: { name: ticker },
        update: { timesCalled: { increment: 1 } },
        create: { name: ticker, timesCalled: 1, lastCall: new Date() }
    });
}

export const ip = async (ip: string) => {
    await prisma.ip.upsert({
        where: { ip },
        update: { timesCalled: { increment: 1 } },
        create: { ip, timesCalled: 1, lastCall: new Date() }
    });
}
