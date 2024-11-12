import { PrismaClient } from '@prisma/client';

export const dbClient = new PrismaClient()

let cachedHolidays: Array<{ id: string, date: Date, type: 'CLOSED' | 'EARLY_CLOSE' }> = [];

export const initializeDb = async () => {
    // Load holidays into memory on startup
    cachedHolidays = await dbClient.holiday.findMany();
}

export const getHolidays = () => cachedHolidays;