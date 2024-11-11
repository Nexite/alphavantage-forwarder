import { format, subDays, parseISO } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { UTCDate } from '@date-fns/utc';

type Holiday = {
    date: string;
    type: 'closed' | 'earlyClose';
}

const holidays: Holiday[] = [
    // 2024, jan 1, jan 15, feb 19, may 27, june 19, july 4 (early close), sept 2, nov 28 (early close), dec 25 (early close)
    { date: "2024-01-01", type: "closed" },
    { date: "2024-01-15", type: "closed" },
    { date: "2024-02-19", type: "closed" },
    { date: "2024-05-27", type: "closed" },
    { date: "2024-06-19", type: "closed" },
    { date: "2024-07-04", type: "earlyClose" },
    { date: "2024-09-02", type: "closed" },
    { date: "2024-11-28", type: "earlyClose" },
    { date: "2024-12-25", type: "earlyClose" },
    // 2025, jan 1, jan 20, feb 17, april 18, may 26, june 19, july 4 (early close), sept 1, nov 27 (early close), dec 25 (early close)
    { date: "2025-01-01", type: "closed" },
    { date: "2025-01-20", type: "closed" },
    { date: "2025-02-17", type: "closed" },
    { date: "2025-04-18", type: "closed" },
    { date: "2025-05-26", type: "closed" },
    { date: "2025-06-19", type: "closed" },
    { date: "2025-07-04", type: "earlyClose" },
    { date: "2025-09-01", type: "closed" },
    { date: "2025-11-27", type: "earlyClose" },
    { date: "2025-12-25", type: "earlyClose" },
    // 2026, jan 1, jan 19, feb 16, apr 3, may 25, june 19, july 3, sept 7, nov 26 (early close), dec 25 (early close)
    { date: "2026-01-01", type: "closed" },
    { date: "2026-01-19", type: "closed" },
    { date: "2026-02-16", type: "closed" },
    { date: "2026-04-03", type: "closed" },
    { date: "2026-05-25", type: "closed" },
    { date: "2026-06-19", type: "closed" },
    { date: "2026-07-03", type: "closed" },
    { date: "2026-09-07", type: "closed" },
    { date: "2026-11-26", type: "earlyClose" },
    { date: "2026-12-25", type: "earlyClose" }
]

// returns true if the date is a holiday that is closed or if it is a weekend, date in yyyy-MM-dd format
const isClosed = (date: Date) => {
    const holiday = holidays.find(holiday => holiday.date === format(date, 'yyyy-MM-dd'));
    return (holiday && holiday.type === 'closed') || date.getDay() === 0 || date.getDay() === 6;
}

export const isTradingSession = () => {
    const tzDate = new TZDate(new Date(), 'America/New_York');
    const isWeekend = tzDate.getDay() === 0 || tzDate.getDay() === 6;

    const holiday = holidays.find(holiday => holiday.date === format(tzDate, 'yyyy-MM-dd'));
    if (holiday) {
        if (holiday.type === 'closed') return false;
        if (holiday.type === 'earlyClose') return tzDate.getHours() < 13 && (tzDate.getHours() > 9 || (tzDate.getHours() === 9 && tzDate.getMinutes() >= 30));
    }
    // 9:30am - 4:00pm
    const isTradingHours = (tzDate.getHours() > 9 ||
        (tzDate.getHours() === 9 && tzDate.getMinutes() >= 30)) &&
        (tzDate.getHours() < 16 || (tzDate.getHours() === 16 && tzDate.getMinutes() === 0));

    return !isWeekend && isTradingHours;
}


export const isTradingDay = (date: string) => {
    // date in yyyy-MM-dd format
    const tzDate = new UTCDate(date);
    const isWeekend = tzDate.getDay() === 0 || tzDate.getDay() === 6;

    const holiday = holidays.find(holiday => holiday.date === format(tzDate, 'yyyy-MM-dd'));
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
        if (!isWeekend(currentDate)) {
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