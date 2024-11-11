import { Decimal } from "@prisma/client/runtime/library";
import { dbClient } from "./db";
import { 
    getCurrentTradingDay, 
    getLastTradingDay, 
    fromDbToStr,
    getValidTradingDates, 
    chunk,
    fromStrToDate
} from "./utils";
import TTLCache from "@isaacs/ttlcache";
import { format, subDays } from "date-fns";
import { UTCDate } from "@date-fns/utc";
import { queryQueue } from "./queue";

export const getStockPrice = async (symbol: string, date: string): Promise<number> => {
    symbol = symbol.toUpperCase().trim()
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

type HistoricalPrice = {
    id: string;
    symbol: string;
    date: Date;
    open: number | string;
    high: number | string;
    low: number | string;
    close: number | string;
    volume: number;
}

type AlphaVantageHistoricalResponse = {
    "Meta Data": {
        "2. Symbol": string;
        [key: string]: string;
    };
    "Time Series (Daily)": {
        [date: string]: {
            "1. open": string;
            "2. high": string;
            "3. low": string;
            "5. adjusted close": string;
            "6. volume": string;
            [key: string]: string;
        };
    };
}

const fetchHistoricalPrices = async (symbol: string, size: "compact" | "full" = "full"): Promise<HistoricalPrice[]> => {
    symbol = symbol.toUpperCase().trim()
    console.log(`fetching historical prices for ${symbol}`);
    const stockResponse = await queryQueue.add(() => fetch(`${process.env.API_URL}/alphavantage?symbol=${symbol}&username=nikhil&function=TIME_SERIES_DAILY_ADJUSTED&outputsize=${size}`));
    const stockData = await stockResponse.json() as AlphaVantageHistoricalResponse;
    symbol = stockData["Meta Data"]["2. Symbol"];
    
    const stockPrices = Object.entries(stockData["Time Series (Daily)"]).map(([date, data]) => ({
        id: `${symbol}-${date}`,
        symbol,
        date: new Date(date),
        open: data["1. open"],
        high: data["2. high"],
        low: data["3. low"],
        close: data["5. adjusted close"],
        volume: parseInt(data["6. volume"])
    }));
    
    console.log(`fetched historical prices for ${symbol}`);
    return stockPrices;
}


const quoteCache = new TTLCache<string, { close: number, lastUpdated: Date }>({
    ttl: 1000 * 60 * 5, // 24 hours
    max: 1000,
})

export const getStockQuote = async (symbol: string): Promise<{ close: number, lastUpdated: Date }> => {
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


// export const getOptionsChain = async (symbol: string, date: string) => {
//     symbol = symbol.toUpperCase().trim()
//     date = date.trim()
// }

export const updateAllStockPrices = async () => {

    //get what symbols already have stock information
    const stocksToUpdate = await dbClient.historicalStock.findMany({
        select: {
            symbol: true
        },
        distinct: ["symbol"]
    })

    // Process in larger parallel batches
    const BATCH_SIZE = 50; // Process 50 stocks simultaneously
    const chunks = chunk(stocksToUpdate, BATCH_SIZE);

    for (const batch of chunks) {
        // Fetch all prices in parallel
        const allStockPrices = await Promise.all(
            batch.map(stock => queryQueue.add(() => fetchHistoricalPrices(stock.symbol, "compact")))
        );

        // Bulk insert all prices at once
        await dbClient.historicalStock.createMany({
            data: allStockPrices.flat(),
            skipDuplicates: true
        });

        console.log(`Processed batch of ${batch.length} stocks`);
    }
}

type RawHistoricalPrice = { date: Date; close: number };

type HistoricalPricePoint = {
    date: string;
    close: number;
}

export const getHistoricalPrices = async (symbol: string, days: number): Promise<HistoricalPricePoint[]> => {
    symbol = symbol.toUpperCase().trim();
    const startDate = subDays(fromStrToDate(getLastTradingDay(false)), days);
    
    const historicalPrices = await dbClient.$queryRaw<RawHistoricalPrice[]>`
        WITH prices AS MATERIALIZED (
            SELECT date, close
            FROM "HistoricalStock"
            WHERE symbol = ${symbol}
            AND DATE(date AT TIME ZONE 'UTC') >= DATE(${startDate} AT TIME ZONE 'UTC')
            ORDER BY date DESC
            LIMIT ${days}
        )
        SELECT * FROM prices
    `;

    // if there are no prices, fetch the full historical prices and save to db
    if (historicalPrices.length === 0) {
        const fullHistoricalPrices = await fetchHistoricalPrices(symbol, "full");
        await dbClient.historicalStock.createMany({
            data: fullHistoricalPrices,
            skipDuplicates: true
        });
        
        return fullHistoricalPrices.map(({ date, close }) => ({
            date: fromDbToStr(date),
            close: Number(close)
        }));
    }

    return historicalPrices.map(({ date, close }) => ({
        date: fromDbToStr(date),
        close: Number(close)
    }));
};

type StockOverview = {
    Symbol: string;
    AssetType: string;
    Name: string;
    Description: string;
    CIK: string;
    Exchange: string;
    Currency: string;
    Country: string;
    Sector: string;
    Industry: string;
    Address: string;
    OfficialSite: string;
    FiscalYearEnd: string;
    LatestQuarter: string;
    MarketCapitalization: string;
    EBITDA: string;
    PERatio: string;
    PEGRatio: string;
    BookValue: string;
    DividendPerShare: string;
    DividendYield: string;
    EPS: string;
    RevenuePerShareTTM: string;
    ProfitMargin: string;
    OperatingMarginTTM: string;
    ReturnOnAssetsTTM: string;
    ReturnOnEquityTTM: string;
    RevenueTTM: string;
    GrossProfitTTM: string;
    DilutedEPSTTM: string;
    QuarterlyEarningsGrowthYOY: string;
    QuarterlyRevenueGrowthYOY: string;
    AnalystTargetPrice: string;
    AnalystRatingStrongBuy: string;
    AnalystRatingBuy: string;
    AnalystRatingHold: string;
    AnalystRatingSell: string;
    AnalystRatingStrongSell: string;
    TrailingPE: string;
    ForwardPE: string;
    PriceToSalesRatioTTM: string;
    PriceToBookRatio: string;
    EVToRevenue: string;
    EVToEBITDA: string;
    Beta: string;
    "52WeekHigh": string;
    "52WeekLow": string;
    "50DayMovingAverage": string;
    "200DayMovingAverage": string;
    SharesOutstanding: string;
    DividendDate: string;
    ExDividendDate: string;
}

export const getStockOverview = async (symbol: string): Promise<StockOverview> => {
    symbol = symbol.toUpperCase().trim()
    const stockResponse = await queryQueue.add(() => 
        fetch(`${process.env.API_URL}/alphavantage?symbol=${symbol}&username=nikhil&function=OVERVIEW`)
    );
    const stockData = await stockResponse.json();
    return stockData as StockOverview;
}