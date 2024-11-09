import { Decimal } from "@prisma/client/runtime/library";
import { dbClient } from "./db";
import { getCurrentTradingDay, getLastTradingDay } from "./utils";
import TTLCache from "@isaacs/ttlcache";
import { format } from "date-fns";

export const getStockPrice = async (symbol: string, date: string): Promise<number> => {

    const isCurrentTradingDay = getCurrentTradingDay() === date ? true : false
    if (isCurrentTradingDay) {
        console.log("getting stock quote")
        return (await getStockQuote(symbol)).close
    }

    else {
        console.log("getting historical stock price")
        symbol = symbol.toUpperCase().trim()
        date = date.trim()
        const price = (await dbClient.historicalStock.findFirst({
            where: {
                id: `${symbol}-${date}`
            },
            select: {
                close: true
            }
        }))?.close

        if (!price) {
            const stockPrices = await fetchHistoricalPrices(symbol)
            await dbClient.historicalStock.createMany({
                data: stockPrices,
                skipDuplicates: true
            })

            // console.log(stockPrices[0])
            return stockPrices.find((stock: any) => stock.id === `${symbol}-${date}`)?.close as number

        }

        return price.toNumber()
    }
}

const fetchHistoricalPrices = async (symbol: string, size: "compact" | "full" = "full") => {
    console.log(`fetching historical prices for ${symbol}`)
    const stockResponse = await fetch(`${process.env.API_URL}/alphavantage?symbol=${symbol}&username=nikhil&function=TIME_SERIES_DAILY_ADJUSTED&outputsize=${size}`);
    const stockData = await stockResponse.json();
    symbol = stockData["Meta Data"]["2. Symbol"]
    // console.log(stockData[0])
    const stockPrices = Object.entries(stockData["Time Series (Daily)"]).map(([date, data]: any) => ({
        id: `${symbol}-${date}`,
        symbol,
        date: new Date(date),
        open: data["1. open"],
        high: data["2. high"],
        low: data["3. low"],
        close: data["5. adjusted close"],
        volume: parseInt(data["6. volume"])
    }))
    console.log(`fetched historical prices for ${symbol}`)
    return stockPrices
}


const quoteCache = new TTLCache<string, { close: number, lastUpdated: Date }>({
    ttl: 1000 * 60 * 5, // 24 hours
    max: 1000,
})

const getStockQuote = async (symbol: string): Promise<{ close: number, lastUpdated: Date }> => {
    symbol = symbol.toUpperCase().trim()
    // const cached = quoteCache.get(symbol)
    // if (cached) {
    //     return cached
    // }
    const stockResponse = await fetch(`${process.env.API_URL}/alphavantage?symbol=${symbol}&username=nikhil&function=GLOBAL_QUOTE&entitlement=realtime`);
    const stockData = await stockResponse.json();
    const quote: number = stockData["Global Quote"]["05. price"]
    quoteCache.set(symbol, { close: quote, lastUpdated: new Date() })
    return { close: quote, lastUpdated: new Date() }
}


export const getOptionsChain = async (symbol: string, date: string) => {
    symbol = symbol.toUpperCase().trim()
    date = date.trim()
}

export const updateAllStockPrices = async () => {
    // Get latest date per symbol using orderBy and distinct
    const latestDates = await dbClient.historicalStock.findMany({
        distinct: ['symbol'],
        orderBy: {
            date: 'desc'
        },
        select: {
            symbol: true,
            date: true
        },
    })

    console.log(latestDates)

    // const stocksToUpdate = latestDates.filter((stock) => format(new UTCDate(stock.date), 'yyyy-MM-dd') !== getLastTradingDay(false)).map((stock) => stock.symbol)
    // console.log(stocksToUpdate)

    const stocksToUpdate = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "ADBE", "CSCO", "PEP", "ABNB", "NOW", "ZM", "SQ", "PYPL", "TM", "AVGO", "TXN", "V", "WMT", "DIS", "KO", "PEP", "ABNB", "NOW", "ZM", "SQ", "PYPL", "TM", "AVGO", "TXN", "V", "WMT", "DIS", "KO"]

    // Process in batches of 300
    const BATCH_SIZE = 300;
    for (let i = 0; i < stocksToUpdate.length; i += BATCH_SIZE) {
        const batch = stocksToUpdate.slice(i, i + BATCH_SIZE);
        
        // Collect all stock prices first
        const allStockPrices = await Promise.all(
            batch.map(stock => fetchHistoricalPrices(stock))
        );
        console.log(`fetched historical prices for ${batch.length} stocks`)
        
        // Flatten the array of arrays into a single array of prices
        const flattenedPrices = allStockPrices.flat();
        console.log(`flattened ${flattenedPrices.length} historical prices`)
        
        // Make a single database request for the entire batch
        await dbClient.historicalStock.createMany({
            data: flattenedPrices,
            skipDuplicates: true
        });
        console.log(`created ${flattenedPrices.length} historical prices`)
    }
    console.log("done")
}