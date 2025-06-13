import { format, subDays, parseISO } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { UTCDate } from '@date-fns/utc';
import { getClosedHolidays, getHolidays } from './db';

// returns true if the date is a holiday that is closed or if it is a weekend, date in yyyy-MM-dd format

// string in the format of YYYY-MM-DD
export type DateString = `${number}-${number}-${number}`
export const validateDateString = (dateString: string): boolean => {
    return /^(\d{4})-(\d{2})-(\d{2})$/.test(dateString);
}

export const extractDateString = (dateString: string): {day: number, month: number, year: number} => {
    const [year, month, day] = dateString.split('-').map(Number);
    return { day, month, year };
}

export const isClosed = (date: Date) => {
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

export const getLastTradingDay = (includeToday: boolean = true, startDate?: DateString): DateString => {
    // Initialize date in NY timezone, using provided startDate or current date
    let date = new TZDate(startDate ? new UTCDate(startDate) : new Date(), 'America/New_York');

    // If we're currently in a trading session
    if (isTradingSession()) {
        // Return today's date if includeToday is true
        if (includeToday) return format(date, 'yyyy-MM-dd') as DateString;
        // Otherwise move to previous day
        date = new TZDate(subDays(date, 1), 'America/New_York');
    }

    // If before market open (9:30 AM), move to previous day
    if (date.getHours() < 9 || (date.getHours() === 9 && date.getMinutes() < 30)) {
        // console.log('before market open')
        date = new TZDate(subDays(date, 1), 'America/New_York');
    }

    // Keep moving back days until we find a non-closed trading day
    // (not a weekend or holiday)
    while (isClosed(date)) {
        // console.log("is closed", date)
        date = new TZDate(subDays(date, 1), 'America/New_York');
    }

    // Return the date formatted as YYYY-MM-DD
    return format(date, 'yyyy-MM-dd') as DateString;
}

export const getCurrentTradingDay = (): DateString | null => {
    const date = new TZDate(new Date(), 'America/New_York');
    return isTradingSession() ? format(date, 'yyyy-MM-dd') as DateString : null;
}

export const generateDateRange = (startDate: Date, days: number): DateString[] => {
    return Array.from({ length: days }, (_, i) => {
        const date = subDays(startDate, i);
        return format(date, 'yyyy-MM-dd') as DateString;
    }).sort();
}

export const fromDbToStr = (date: Date): DateString => {
    return format(new UTCDate(date), 'yyyy-MM-dd') as DateString;
};

export const fromStrToDate = (dateStr: string): Date => {
    return new UTCDate(dateStr);
};

// Add these functions to utils.ts
export function isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
}

export function getValidTradingDates(startDate: Date, endDate: Date): DateString[] {
    const dates: DateString[] = [];
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

export const isValidSymbol = (symbol: string): boolean => {
    // Matches:
    // - Regular symbols (AAPL, GOOGL)
    // - Symbols with dots (BRK.B, NEE-U)
    // - Symbols with hyphens (BA-A, FOUR-A)
    // - Symbols with plus signs (QBTS+)
    // - Symbols with dots and special characters (VAL.WS)
    return /^[A-Za-z]+([.-][A-Za-z0-9]+)?\+?$/.test(symbol);
}