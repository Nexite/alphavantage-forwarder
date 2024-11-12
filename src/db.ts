import { PrismaClient, Holiday } from '@prisma/client';

export const dbClient = new PrismaClient()

let cachedHolidays: Map<string, Holiday> = new Map();

let closedHolidays = new Set<string>();

export const initializeDb = async () => {
    // Load holidays into memory on startup
    const holidays = await dbClient.holiday.findMany();
    cachedHolidays = new Map(holidays.map(h => [h.id, h]));
    closedHolidays = new Set(holidays.filter(h => h.type === 'CLOSED').map(h => h.id));
}

export const getHolidays = () => cachedHolidays;

export const getClosedHolidays = () => closedHolidays;