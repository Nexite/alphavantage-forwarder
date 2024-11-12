import { format, subDays, parseISO } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { UTCDate } from '@date-fns/utc';
import { Holiday } from '@prisma/client';
import { dbClient, getClosedHolidays, getHolidays } from './db';

// returns true if the date is a holiday that is closed or if it is a weekend, date in yyyy-MM-dd format
const isClosed = (date: Date) => {
    const holiday = getClosedHolidays().has(format(date, 'yyyy-MM-dd'));
    return holiday || date.getDay() === 0 || date.getDay() === 6;
}
const isHoliday = (date: Date) => {
    return getClosedHolidays().has(format(date, 'yyyy-MM-dd'));
}

export const isTradingSession = () => {
    const holidays = getHolidays();
    const tzDate = new TZDate(new Date(), 'America/New_York');
    const isWeekend = tzDate.getDay() === 0 || tzDate.getDay() === 6;

    const holiday = holidays.get(format(tzDate, 'yyyy-MM-dd'));
    if (holiday) {
        if (holiday.type === 'CLOSED') return false;
        if (holiday.type === 'EARLY_CLOSE') return tzDate.getHours() < 13 && (tzDate.getHours() > 9 || (tzDate.getHours() === 9 && tzDate.getMinutes() >= 30));
    }
    // 9:30am - 4:00pm
    const isTradingHours = (tzDate.getHours() > 9 ||
        (tzDate.getHours() === 9 && tzDate.getMinutes() >= 30)) &&
        (tzDate.getHours() < 16 || (tzDate.getHours() === 16 && tzDate.getMinutes() === 0));

    return !isWeekend && isTradingHours;
}


export const isTradingDay = (date: string) => {
    const holidays = getClosedHolidays();
    // date in yyyy-MM-dd format
    const tzDate = new UTCDate(date);
    const isWeekend = tzDate.getDay() === 0 || tzDate.getDay() === 6;

    const holiday = holidays.has(format(tzDate, 'yyyy-MM-dd'));
    return !isWeekend && !holiday;
}

export const getLastTradingDay = (includeToday: boolean = true, startDate?: string) => {
    let date = new TZDate(startDate ? new UTCDate(startDate) : new Date(), 'America/New_York');
    if (isTradingSession()) {
        if (includeToday) return format(date, 'yyyy-MM-dd');
        date = new TZDate(subDays(date, 1), 'America/New_York');
    }

    if (date.getHours() < 9 || (date.getHours() === 9 && date.getMinutes() < 30)) {
        date = new TZDate(subDays(date, 1), 'America/New_York');
    }

    while (isClosed(date)) {
        date = new TZDate(subDays(date, 1), 'America/New_York');
    }

    return format(date, 'yyyy-MM-dd');
}

export const getCurrentTradingDay = () => {
    const date = new TZDate(new Date(), 'America/New_York');
    return isTradingSession() ? format(date, 'yyyy-MM-dd') : null;
}

export const generateDateRange = (startDate: Date, days: number): string[] => {
    return Array.from({ length: days }, (_, i) => {
        const date = subDays(startDate, i);
        return format(date, 'yyyy-MM-dd');
    }).sort();
}

export const fromDbToStr = (date: Date): string => {
    return format(new UTCDate(date), 'yyyy-MM-dd');
};

export const fromStrToDate = (dateStr: string): Date => {
    return new UTCDate(parseISO(dateStr));
};

// Add these functions to utils.ts
export function isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
}

export function getValidTradingDates(startDate: Date, endDate: Date): string[] {
    const dates: string[] = [];
    let currentDate = new UTCDate(startDate);

    while (currentDate <= endDate) {
        const dateStr = fromDbToStr(currentDate);
        if (!isWeekend(currentDate) && !isHoliday(currentDate)) {
            dates.push(dateStr);
        }
        // Increment by one day
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates.sort();
}

export function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

export const scheduleEOD = (taskFn: () => Promise<void>) => {
    scheduleEOD(taskFn);
}

export const getDaysAgo = (days: number, est: boolean = true) => {
    const date = est ? new TZDate(new UTCDate(), 'America/New_York') : new UTCDate();
    return new UTCDate(subDays(date, days));
}