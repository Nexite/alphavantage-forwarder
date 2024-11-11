import { TZDate } from "@date-fns/tz";
import { AlphaVantageOption } from "./alphavantage";
import { getHistoricalPrices, getStockOverview, getStockPrice, getStockQuote } from "./stock";
import { fromDbToStr, fromStrToDate, getCurrentTradingDay, getLastTradingDay, isTradingDay, isTradingSession } from "./utils";
import { UTCDate } from "@date-fns/utc";
import { queryQueue } from './queue';
import { getHistoricalOptionsChains, getRealtimeOptionsChain } from "./options";

export type CustomStrategyOutput = AlphaVantageOption & {
    daysToExpire: number;
    roi: number;
    annualizedRoi: number;
    // totalReturn: number;
}

export const customStrategy = async (symbol: string, minDays: number, maxDays: number, date?: string) => {
    let optionsData: CustomStrategyOutput[]
    date ??= getLastTradingDay()

    const [optionsResponse, currentStockPrice]: [{ data: CustomStrategyOutput[] }, number] = await Promise.all([
        queryQueue.add(() =>
            fetch(`${process.env.API_URL}/alphavantage?symbol=${symbol}&username=nikhil&function=${!date || date === getLastTradingDay() ? 'REALTIME_OPTIONS' : 'HISTORICAL_OPTIONS'}${date ? `&date=${date}` : ''}`).then(r => r.json())
        ),
        getStockPrice(symbol, date)
    ]);

    console.log(`Getting ${!date || date === getLastTradingDay() ? 'realtime' : 'historical'} options`)

    optionsData = optionsResponse.data.filter((option: { type: string; }) => {
        return option.type === "put"
    });

    if (!currentStockPrice) {
        throw new Error(`Unable to get stock price for date ${date}`)
    }

    const currentDate = new UTCDate(date)

    optionsData.forEach((option) => {
        // calculate days to expire in EST
        const expirationDate = new TZDate(option.expiration, 'America/New_York')
        const diffDays = Math.ceil((expirationDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
        option.daysToExpire = diffDays

        // calculate roi
        const roi = option.bid / option.strike
        option.roi = roi

        // calculate annualizedRoi
        const annualizedRoi = roi * 365 / diffDays
        option.annualizedRoi = annualizedRoi

        // calculate total return
        // option.totalReturn = roi + annualizedRoi
    })

    // get the percent values
    const percentValues = [currentStockPrice * 0.75, currentStockPrice * 0.80, currentStockPrice * 0.85, currentStockPrice * 0.90, currentStockPrice * 0.95]

    // Pre-calculate strike price thresholds
    const strikeThresholds = new Map(
        percentValues.map(value => [value, optionsData.filter(
            option => option.strike <= value &&
                option.daysToExpire >= minDays &&
                option.daysToExpire <= maxDays
        ).sort((a, b) => b.annualizedRoi - a.annualizedRoi)
            .slice(0, 10)])
    );

    // Convert to output format
    const output = {
        75: strikeThresholds.get(percentValues[0]) || [],
        80: strikeThresholds.get(percentValues[1]) || [],
        85: strikeThresholds.get(percentValues[2]) || [],
        90: strikeThresholds.get(percentValues[3]) || [],
        95: strikeThresholds.get(percentValues[4]) || []
    };

    return output;
}



export const customStrategyHistorical = async (symbol: string, days: number, minDays: number, maxDays: number) => {
    const [historicalOptions, historicalPrices, stockOverview] = await Promise.all([
        getHistoricalOptionsChains(symbol, days),
        getHistoricalPrices(symbol, days),
        getStockOverview(symbol)
    ])

    console.log(`Historical options: ${historicalOptions.length}, historical prices: ${historicalPrices.length}`)

    // if the length of the historical options is less than the historical prices, then we need to re-fetch the latest options
    // if (historicalOptions.length < historicalPrices.length) {
    //     historicalOptions = await getHistoricalOptionsChains(symbol, days)
    // }
    // sort historical options by date

    if (isTradingSession()) {
        const currentStockPrice = (await getStockQuote(symbol))
        const currentOptions = await getRealtimeOptionsChain(symbol)
        historicalOptions.push({ id: `${symbol}-${getCurrentTradingDay()}`, symbol, date: new UTCDate(getCurrentTradingDay() ?? ''), options: currentOptions.filter((option: any) => option.type === 'put') })
        historicalPrices.push({ date: getCurrentTradingDay() ?? '', close: currentStockPrice.close })
    }


    historicalOptions.sort((a, b) => new UTCDate(b.date).getTime() - new UTCDate(a.date).getTime());
    // get first date
    historicalPrices.sort((a, b) => new UTCDate(b.date).getTime() - new UTCDate(a.date).getTime());

    const optionsAnalysis = [];
    const currentDate = new UTCDate()

    for (const [index, { close: price }] of historicalPrices.entries()) {
        const isLatest = index === 0;
        try {
            const optionsChain = historicalOptions[index].options as AlphaVantageOption[] as CustomStrategyOutput[]
            optionsChain.map((option) => {
                const expirationDate = new TZDate(option.expiration, 'America/New_York')
                const diffDays = Math.ceil((expirationDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
                option.daysToExpire = diffDays

                option.roi = option.bid / option.strike;
                option.annualizedRoi = option.roi * 365 / option.daysToExpire;
            })
        
        const percentValues = [price * 0.75, price * 0.80, price * 0.85, price * 0.90, price * 0.95];
        const strikeThresholds = new Map(
            percentValues.map(value => [value, optionsChain.filter(
                option => option.strike <= value &&
                    option.daysToExpire >= minDays &&
                    option.daysToExpire <= maxDays
            ).sort((a, b) => b.annualizedRoi - a.annualizedRoi)
                .slice(0, isLatest ? 10 : 1)])
        );
        const options = {
            75: strikeThresholds.get(percentValues[0]) || [],
            80: strikeThresholds.get(percentValues[1]) || [],
            85: strikeThresholds.get(percentValues[2]) || [],
            90: strikeThresholds.get(percentValues[3]) || [],
            95: strikeThresholds.get(percentValues[4]) || []
        };
            optionsAnalysis.push({ date: historicalPrices[index].date, options, close: price })
        } catch (e) {
            console.log(`Error processing options for date ${historicalPrices}: ${e}`)
        }
    }
    return { options: optionsAnalysis, "52high": stockOverview["52WeekHigh"], "52low": stockOverview["52WeekLow"] }
}