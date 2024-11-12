import { format } from "date-fns"
import { requestAlphaVantage } from "./alphavantage"
import { dbClient } from "./db"
import { fromDbToStr, fromStrToDate, getDaysAgo, getValidTradingDates } from "./utils"
import { UTCDate } from "@date-fns/utc"
import { symbolManager } from "./symbolManager"
import { DailyQuote, Prisma } from "@prisma/client"


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
            id: `${symbol}-${date}`,
            symbolId: symbol,
            date: dateObj,
            price: new Prisma.Decimal(quote['5. adjusted close'])
        })
    })
    await dbClient.dailyQuote.createMany({ data: entriesToCreate, skipDuplicates: true })

    return entriesToCreate.filter(q => datesToReturn.includes(format(q.date, 'yyyy-MM-dd')))
}

export const getHistoricalQuoteRange = async (symbol: string, days: number, skip: number = 0) => {
    await symbolManager.ensureSymbol(symbol)

    // get day {days} ago
    const startDate = getDaysAgo(days + skip)
    startDate.setHours(0, 0, 0, 0)
    const endDate = skip > 0 ? getDaysAgo(skip + 1, false) : new UTCDate()
    endDate.setHours(0, 0, 0, 0)
    console.log(endDate, skip)

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

    const missingQuotes = missingDates.length > 0 ? await updateQuotesForSymbol(symbol, missingDates) : []
    quotes.push(...(missingQuotes.map(q => ({
        date: q.date,
        price: q.price
    }))))
    
    return quotes
}