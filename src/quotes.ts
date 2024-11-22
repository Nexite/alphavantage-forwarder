import { format, subDays } from "date-fns"
import { requestAlphaVantage } from "./alphavantage"
import { dbClient } from "./db"
import { fromDbToStr, fromStrToDate, getDaysAgo, getLastTradingDay, getValidTradingDates, isTradingSession } from "./utils"
import { UTCDate } from "@date-fns/utc"
import { symbolManager } from "./symbolManager"
import { DailyQuote, Prisma } from "@prisma/client"
import { TZDate } from "@date-fns/tz"


const updateQuotesForSymbol = async (symbol: string, datesToReturn: string[]) => {

    const quotes = (await requestAlphaVantage({
        function: 'TIME_SERIES_DAILY_ADJUSTED',
        symbol: symbol,
        outputsize: 'full'
    }))['Time Series (Daily)']

    const entriesToCreate: DailyQuote[] = []
    Object.entries(quotes).forEach(async ([date, quote]: [string, any]) => {
        const dateObj = fromStrToDate(date)
        dateObj.setHours(0, 0, 0, 0)
        entriesToCreate.push({
            symbolId: symbol,
            date: dateObj,
            price: new Prisma.Decimal(quote['5. adjusted close'])
        })
    })
    await dbClient.dailyQuote.createMany({ data: entriesToCreate, skipDuplicates: true })

    return entriesToCreate.filter(q => datesToReturn.includes(format(q.date, 'yyyy-MM-dd')))
}


const fetchRealtimeQuote = async (symbol: string) => {
    const quotes = (await requestAlphaVantage({
        function: 'GLOBAL_QUOTE',
        entitlement: 'realtime',
        symbol: symbol,
    }))['Global Quote']

    return quotes['05. price']
}


type HistoricalQuoteRangeResult = {
    date: Date
    price: number
}

export const getHistoricalQuoteRange = async (symbol: string, days: number, skip: number = 0): Promise<HistoricalQuoteRangeResult[]> => {
    await symbolManager.ensureSymbol(symbol)

    const startDate = getDaysAgo(days + skip)
    startDate.setHours(0, 0, 0, 0)
    let endDate = skip > 0 ? getDaysAgo(skip + 1, false) : fromStrToDate(getLastTradingDay(false))
    endDate.setHours(0, 0, 0, 0)

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

    const tradingDates = await getValidTradingDates(startDate, endDate)

    const quotes = await dbClient.dailyQuote.findMany({
        where: {
            symbolId: symbol,
            date: {
                gte: startDate,
                lte: endDate
            }
        },
        select: {
            date: true,
            price: true
        }
    })

    const existingDates = new Set(quotes.map(q => fromDbToStr(q.date)));
    const missingDates = tradingDates.filter(date => !existingDates.has(date));

    // if (missingDates.length > 0) {
    //     console.log('creating holiday entry for ', missingDates.length)
    //     await dbClient.holiday.createMany({
    //         data: missingDates.map(date => ({
    //             id: `${date}`,
    //             date: fromStrToDate(date),
    //             type: 'CLOSED'
    //         })),
    //         skipDuplicates: true
    //     })
    // }

    const missingQuotes = missingDates.length > 0 ? await updateQuotesForSymbol(symbol, missingDates) : []
    quotes.push(...(missingQuotes.map(q => ({
        date: q.date,
        price: q.price
    }))))

    if (fetchRealtime) {
        console.log('fetching realtime quote')
        const realtimeQuote = await fetchRealtimeQuote(symbol)
        const realtimeDate = new UTCDate()
        realtimeDate.setHours(0, 0, 0, 0)
        quotes.push({
            date: realtimeDate,
            price: new Prisma.Decimal(realtimeQuote)
        })
    }

    return quotes.map(q => ({
        date: q.date,
        price: q.price.toNumber()
    })).sort((a, b) => b.date.getTime() - a.date.getTime())
}

export const getQuoteRange = async (symbol: string, days: number, skip: number = 0): Promise<HistoricalQuoteRangeResult[]> => {
    const quotes = await getHistoricalQuoteRange(symbol, days, skip)

    if (isTradingSession()) {
        const realtimeQuote = await fetchRealtimeQuote(symbol)
        const realtimeDate = new UTCDate()
        realtimeDate.setHours(0, 0, 0, 0)
        quotes.push({
            date: realtimeDate,
            price: Number(realtimeQuote)
        })
    }

    return quotes.sort((a, b) => b.date.getTime() - a.date.getTime())
}