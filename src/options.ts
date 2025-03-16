import { chunk, fromDbToStr, fromStrToDate, getLastTradingDay, isTradingSession } from "./utils"
import { symbolManager } from "./symbolManager"
import { getDaysAgo, getValidTradingDates } from "./utils"
import { dbClient } from "./db"
import { requestAlphaVantage } from "./alphavantage"
import { Prisma } from "@prisma/client"
import { TZDate } from "@date-fns/tz"
import { format, subDays } from "date-fns"
import { UTCDate } from "@date-fns/utc"
import { Request, Response } from 'express';
import { Queue } from "./queue"

// Create a queue for background database operations
const dbQueue = new Queue()

const fetchHistoricalOptionsForSymbol = async (symbol: string, date: string) => {
    const options = await requestAlphaVantage({
        function: "HISTORICAL_OPTIONS",
        symbol: symbol,
        date: date
    })
    return options
}

type RealtimeOptionsResponse = {
    endpoint: string
    message: string
    data: RealtimeOption[]
}

export type RealtimeOption = Omit<AlphaVantageOption, 'implied_volatility' | 'delta' | 'gamma' | 'theta' | 'vega' | 'rho'>

export const fetchRealtimeOptionsForSymbol: (symbol: string) => Promise<RealtimeOptionsResponse> = async (symbol: string) => {
    const options = await requestAlphaVantage({
        function: "REALTIME_OPTIONS",
        symbol: symbol
    })
    return options
}

type AlphaVantageOption = {
    contractID: string
    symbol: string
    expiration: string
    strike: string
    type: "call" | "put"
    last: string
    mark: string
    bid: string
    bid_size: string
    ask: string
    ask_size: string
    volume: string
    open_interest: string
    date: string
    implied_volatility: string
    delta: string
    gamma: string
    theta: string
    vega: string
    rho: string
}

type AlphaVantageOptionsChainResponse = {
    endpoint: string
    message: string
    data: AlphaVantageOption[]
}

const createDbEntryForOptionsChain = async (alphaVantageOptionsChain: AlphaVantageOptionsChainResponse) => {
    const options = alphaVantageOptionsChain.data
    if (!options?.length) return

    // Process options in smaller chunks to reduce memory usage
    const puts: Prisma.DailyOptionPutCreateManyInput[] = []
    const calls: Prisma.DailyOptionCallCreateManyInput[] = []

    for (const o of options) {
        const common = {
            contractId: o.contractID,
            date: fromStrToDate(o.date),
            expiration: fromStrToDate(o.expiration),
            strike: new Prisma.Decimal(o.strike),
            symbolId: o.symbol.toUpperCase(),
            last: new Prisma.Decimal(o.last),
            mark: new Prisma.Decimal(o.mark),
            bid: new Prisma.Decimal(o.bid),
            ask: new Prisma.Decimal(o.ask),
            bidSize: parseInt(o.bid_size),
            askSize: parseInt(o.ask_size),
            volume: parseInt(o.volume),
            openInterest: parseInt(o.open_interest),
            impliedVolatility: new Prisma.Decimal(o.implied_volatility),
            delta: new Prisma.Decimal(o.delta),
            gamma: new Prisma.Decimal(o.gamma),
            theta: new Prisma.Decimal(o.theta),
            vega: new Prisma.Decimal(o.vega),
            rho: new Prisma.Decimal(o.rho),
        }

        if (o.type === "put") {
            puts.push(common)
        } else {
            calls.push(common)
        }
    }

    // Ensure symbol exists before transaction
    await symbolManager.ensureSymbol(options[0].symbol.toUpperCase())


    await dbClient.dailyOptionsChain.upsert({
        where: {
            symbolId_date: { symbolId: options[0].symbol.toUpperCase(), date: fromStrToDate(options[0].date) }
        },
        create: { symbolId: options[0].symbol.toUpperCase(), date: fromStrToDate(options[0].date) },
        update: {}
    })

    let retries = 3
    while (retries > 0) {
        try {
            await dbClient.$transaction(async (tx) => {

                if (puts.length > 0) {
                    await tx.dailyOptionPut.createMany({
                        data: puts,
                        skipDuplicates: true
                    })
                }

                if (calls.length > 0) {
                    await tx.dailyOptionCall.createMany({
                        data: calls,
                        skipDuplicates: true
                    })
                }
            }, {
                timeout: 120000, // 2 minute timeout
                maxWait: 120000, // 2 minute max wait
                isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted // Less strict isolation level
            })
        } catch (error) {
            retries--
            if (retries === 0) console.error(`Transaction failed for symbol ${options[0].symbol}, giving up`)
            console.log(`Transaction failed for symbol ${options[0].symbol}, retrying... (${retries} attempts left)`)
            await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second before retrying
        }
    }
}

type HistoricalOptionsRangeResult = {
    date: Date
    puts: {
        contractId: string
        expiration: Date
        strike: number | Prisma.Decimal
        ask: number | Prisma.Decimal
        bid: number | Prisma.Decimal
    }[]
}

const queueOptionsForStorage = (optionsData: AlphaVantageOptionsChainResponse) => {
    dbQueue.add(async () => {
        await createDbEntryForOptionsChain(optionsData);
        return; // explicitly return void
    });
}

export const getHistoricalOptionsRange = async (symbol: string, days: number, skip: number = 0): Promise<HistoricalOptionsRangeResult[]> => {
    const upperSymbol = symbol.toUpperCase()
    await symbolManager.ensureSymbol(upperSymbol)

    const startDate = getDaysAgo(days + skip)
    startDate.setHours(0, 0, 0, 0)
    let endDate = skip > 0 ? getDaysAgo(skip + 1, false) : fromStrToDate(getLastTradingDay(false))
    // console.log(`startDate: ${fromDbToStr(startDate)} endDate: ${fromDbToStr(endDate)}`)

    // interesting behavior here, for the trading day that lands on the current date, the historical options endpoint isn't updated until 9pm est. this next if statement accounts for that.
    const estDate = new TZDate(new UTCDate(), 'America/New_York')
    let fetchRealtime: boolean = false
    if (fromDbToStr(endDate) === format(estDate, 'yyyy-MM-dd')) {
        // console.log(`endDate: ${fromDbToStr(endDate)} estDate: ${format(estDate, 'yyyy-MM-dd')}`)
        if (estDate.getHours() < 21) {
            endDate = subDays(endDate, 1)
            fetchRealtime = true
        }
    }

    endDate.setHours(0, 0, 0, 0)
    const tradingDates = await getValidTradingDates(startDate, endDate)
    // console.log("tradingDates ", tradingDates)

    // Optimize the query to only get what we need
    let options = await dbClient.dailyOptionsChain.findMany({
        where: {
            symbolId: upperSymbol,
            date: {
                gte: startDate,
                lte: endDate
            }
        },
        select: {
            date: true,
            puts: {
                select: {
                    expiration: true,
                    strike: true,
                    bid: true,
                    ask: true,
                    contractId: true
                }
            }
        }
    })

    const existingDates = new Set(options.map(o => fromDbToStr(o.date)))
    const missingDates = tradingDates.filter(date => !existingDates.has(date))
    // console.log(`missingDates: ${missingDates}`)
    if (missingDates.length > 0) {
        const batches = chunk(missingDates, 35)

        for (const batch of batches) {
            // console.log(`Processing batch of ${batch.length} dates`)

            // Fetch all dates in parallel
            const missingOptions = await Promise.all(
                batch.map(date => fetchHistoricalOptionsForSymbol(upperSymbol, date))
            )

            // Queue the database operations instead of waiting for them
            missingOptions.forEach(options => queueOptionsForStorage(options))

            // Transform the new data directly
            const newOptions = missingOptions.map(optionsResponse => {
                // console.log(optionsResponse)
                return {
                    date: fromStrToDate(optionsResponse.data[0].date),
                    puts: optionsResponse.data
                        .filter((o: AlphaVantageOption) => o.type === 'put')
                        .map((p: AlphaVantageOption) => ({
                            contractId: p.contractID,
                            expiration: fromStrToDate(p.expiration),
                            strike: Number(p.strike),
                            bid: Number(p.bid),
                            ask: Number(p.ask)
                        }))
                }
            })

            // Add new options to results
            options = [...options, ...newOptions]
        }
    }

    if (fetchRealtime) {
        const realtimeOptions = (await fetchRealtimeOptionsForSymbol(upperSymbol)).data.filter((o) => o.type === 'put')
        options = [{
            date: new Date(realtimeOptions[0].date),
            puts: realtimeOptions.map((o) => ({
                contractId: o.contractID,
                expiration: new Date(o.expiration),
                strike: new Prisma.Decimal(o.strike),
                bid: new Prisma.Decimal(o.bid),
                ask: new Prisma.Decimal(o.ask)
            }))
        }, ...options]
    }

    return options.map(o => ({
        date: o.date,
        puts: o.puts.map(p => ({
            contractId: p.contractId,
            expiration: p.expiration,
            strike: typeof p.strike === 'number' ? p.strike : p.strike.toNumber(),
            bid: typeof p.bid === 'number' ? p.bid : p.bid.toNumber(),
            ask: typeof p.ask === 'number' ? p.ask : p.ask.toNumber()
        }))
    }))
}


export const getOptionsRange = async (symbol: string, days: number, skip: number = 0): Promise<HistoricalOptionsRangeResult[]> => {
    let options = await getHistoricalOptionsRange(symbol, days, skip)

    // if it is currently a trading session, add in the live option price
    if (isTradingSession()) {
        const realtimeOptions = (await fetchRealtimeOptionsForSymbol(symbol)).data.filter((o) => o.type === 'put')
        options = [{
            date: new Date(realtimeOptions[0].date),
            puts: realtimeOptions.map((o) => ({
                contractId: o.contractID,
                expiration: new Date(o.expiration),
                strike: new Prisma.Decimal(o.strike),
                bid: new Prisma.Decimal(o.bid),
                ask: new Prisma.Decimal(o.ask)
            }))
        }, ...options]
    }

    return options.sort((a, b) => b.date.getTime() - a.date.getTime())
}
