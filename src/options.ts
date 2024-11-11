import { queryQueue } from "./queue"
import { dbClient } from "./db"
import {
    fromDbToStr,
    fromStrToDate,
    generateDateRange,
    getLastTradingDay,
    chunk,
    getValidTradingDates
} from "./utils"
import { subDays, format } from "date-fns"
import { UTCDate } from "@date-fns/utc";

// Add these type definitions at the top of the file
type HistoricalOption = {
    contractID: string;      // Unique identifier for the option contract
    symbol: string;         // Stock symbol
    expiration: string;     // Expiration date in YYYY-MM-DD format
    strike: number;         // Strike price
    last: number;           // Last traded price
    mark: number;           // Mark price (midpoint between bid and ask)
    bid: number;           // Bid price
    bid_size: number;      // Number of contracts at bid price
    ask: number;           // Ask price
    ask_size: number;      // Number of contracts at ask price
    volume: number;        // Trading volume
    open_interest: number; // Open interest
    date: string;         // Trading date in YYYY-MM-DD format
    type: "put" | "call";
}

type HistoricalOptionsChainResult = {
    id: string;            // Unique identifier for the chain (symbol-date)
    symbol: string;        // Stock symbol
    date: Date;           // Trading date
    options: HistoricalOption[]; // Array of option contracts for this date
}

// Update the type guard
function isValidOptionsChain(result: HistoricalOptionsChainResult | null): result is HistoricalOptionsChainResult {
    return result !== null &&
        typeof result.id === 'string' &&
        typeof result.symbol === 'string' &&
        result.date instanceof Date &&
        Array.isArray(result.options);
}

const fetchHistoricalOptionsChain = async (symbol: string, date: string) => {
    symbol = symbol.toUpperCase().trim()
    const response = await queryQueue.add(() =>
        fetch(`${process.env.API_URL}/alphavantage?symbol=${symbol}&username=nikhil&function=HISTORICAL_OPTIONS&date=${date}`)
            .then(r => r.json())
    )

    // Validate data
    const actualDate = response.data[0]?.date;
    if (!actualDate || actualDate !== date) {
        console.log(`Date mismatch: requested ${date}, received ${actualDate}`);
        throw new Error(`Date mismatch for ${symbol} on ${date}`);
    }

    // Use upsert instead of create
    await dbClient.historicalOptionsChain.upsert({
        where: {
            id: `${symbol}-${date}`
        },
        create: {
            id: `${symbol}-${date}`,
            symbol,
            date: new Date(date + 'T00:00:00Z'),
            options: response.data
        },
        update: {
            options: response.data
        }
    });

    console.log(`Saved options chain for ${symbol} on ${date}`);
    return response.data;
}

export const updateOptionsChainForAllSymbols = async () => {
    const symbols = await dbClient.historicalOptionsChain.findMany({
        select: { symbol: true },
        distinct: ['symbol']
    });
    await Promise.all(symbols.map(symbol => updateOptionsChainForSymbol(symbol.symbol)));
}

export const updateOptionsChainForSymbol = async (symbol: string) => {
    symbol = symbol.toUpperCase().trim();
    console.log(`Starting options chain update for ${symbol}`);

    // Get the newest option chain from the db for given symbol
    const latestOption = await dbClient.historicalOptionsChain.findFirst({
        where: { symbol },
        orderBy: { date: 'desc' },
        select: { date: true }
    });

    // Get the last trading day
    const lastTradingDay = getLastTradingDay(true);

    if (!latestOption) {
        console.log(`No existing options data found for ${symbol}, fetching initial data for ${lastTradingDay}`);
        await fetchHistoricalOptionsChain(symbol, lastTradingDay);
        return;
    }

    // Generate a list of dates from last trading day to the date of the option chain
    const latestDate = fromDbToStr(latestOption.date);
    console.log(`Latest options data for ${symbol} is from ${latestDate}`);

    const dateRange = generateDateRange(
        fromStrToDate(lastTradingDay),
        Math.ceil((fromStrToDate(lastTradingDay).getTime() - fromStrToDate(latestDate).getTime()) / (1000 * 60 * 60 * 24))
    );

    console.log(`Processing ${dateRange.length} dates for ${symbol}`);

    // Process in batches of 5 to avoid rate limits while maintaining parallelization
    const BATCH_SIZE = 5;
    const batches = chunk(dateRange, BATCH_SIZE);

    for (const batch of batches) {
        console.log(`Processing batch of ${batch.length} dates for ${symbol}`);

        // Fetch all dates in the batch in parallel
        await Promise.all(
            batch.map(async date => {
                try {
                    console.log(`Fetching options data for ${symbol} on ${date}`);
                    await fetchHistoricalOptionsChain(symbol, date);
                } catch (error) {
                    console.error(`Failed to fetch options data for ${symbol} on ${date}:`, error);
                }
            })
        );

        // Add a small delay between batches to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Completed options chain update for ${symbol}`);
};

export const getHistoricalOptionsChain = async (symbol: string, date: string) => {
    symbol = symbol.toUpperCase().trim()
    const optionsChain = await dbClient.historicalOptionsChain.findFirst({
        where: {
            symbol,
            date: new Date(date + 'T00:00:00Z') // Ensure date is in UTC midnight
        }
    });

    if (!optionsChain) {
        await fetchHistoricalOptionsChain(symbol, date);
        return dbClient.historicalOptionsChain.findFirst({
            where: {
                symbol,
                date: new Date(date + 'T00:00:00Z') // Ensure date is in UTC midnight
            }
        });
    }

    return optionsChain;
}

export const getHistoricalOptionsChains = async (symbol: string, days: number): Promise<HistoricalOptionsChainResult[]> => {
    symbol = symbol.toUpperCase().trim();
    const lastTradingDateStr = getLastTradingDay(false);
    const lastDateObj = fromStrToDate(lastTradingDateStr);
    const startDate = subDays(lastDateObj, days);

    // Get all valid trading dates (excluding weekends)
    const validTradingDates = getValidTradingDates(startDate, lastDateObj);
    
    // First get existing chains
    const existingChains = await dbClient.$queryRaw<HistoricalOptionsChainResult[]>`
        SELECT * 
        FROM "HistoricalOptionsChain"
        WHERE symbol = ${symbol}
        AND DATE(date AT TIME ZONE 'UTC') >= DATE(${startDate} AT TIME ZONE 'UTC')
        ORDER BY date DESC
    `;

    const existingDatesSet = new Set(existingChains.map(chain => fromDbToStr(chain.date)));
    console.log(`Existing dates set: ${existingDatesSet}`)
    const missingDates = validTradingDates.filter(date => !existingDatesSet.has(date));
    console.log(`Missing dates: ${missingDates}`)

    if (missingDates.length > 0) {
        const BATCH_SIZE = 5;
        const DB_BATCH_SIZE = 100;
        const batches = chunk(missingDates, BATCH_SIZE);
        const allNewChains: HistoricalOptionsChainResult[] = [];  // Store all fetched chains
        const toInsert: HistoricalOptionsChainResult[] = [];      // Temporary array for batch inserts

        for (const batch of batches) {
            const batchResults = await Promise.all(
                batch.map(async date => {
                    try {
                        const response = await queryQueue.add(() =>
                            fetch(`${process.env.API_URL}/alphavantage?symbol=${symbol}&username=nikhil&function=HISTORICAL_OPTIONS&date=${date}`)
                                .then(r => r.json())
                        );

                        if (!response.data || response.data.length === 0) {
                            console.log(`No data returned for ${symbol} on ${date}`);
                            return null;
                        }

                        return {
                            id: `${symbol}-${date}`,
                            symbol,
                            date: fromStrToDate(date),
                            options: response.data.filter((option: HistoricalOption) => option.type === "put")
                        };
                    } catch (error) {
                        console.error(`Error processing ${date}:`, error);
                        return null;
                    }
                })
            );

            const validResults = batchResults.filter(isValidOptionsChain);
            allNewChains.push(...validResults);  // Add to all chains
            toInsert.push(...validResults);      // Add to insert batch

            // If we've accumulated enough records, do a batch insert
            if (toInsert.length >= DB_BATCH_SIZE) {
                const batchToInsert = toInsert.splice(0, DB_BATCH_SIZE);
                await dbClient.historicalOptionsChain.createMany({
                    data: batchToInsert,
                    skipDuplicates: true
                });
                console.log(`Saved batch of ${batchToInsert.length} option chains`);
            }
        }

        // Insert any remaining records
        if (toInsert.length > 0) {
            await dbClient.historicalOptionsChain.createMany({
                data: toInsert,
                skipDuplicates: true
            });
            console.log(`Saved final batch of ${toInsert.length} option chains`);
        }

        // Combine existing and all new chains, sort by date descending
        return [...existingChains, ...allNewChains].sort(
            (a, b) => b.date.getTime() - a.date.getTime()
        );
    }

    return existingChains;
}


export const getRealtimeOptionsChain = async (symbol: string) => {
    const response = await queryQueue.add(() =>
        fetch(`${process.env.API_URL}/alphavantage?symbol=${symbol}&username=nikhil&function=REALTIME_OPTIONS`)
            .then(r => r.json())
    )
    return response.data
}