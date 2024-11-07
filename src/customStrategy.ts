import { AlphaVantageOption } from "./alphavantage";

export type CustomStrategyOutput = AlphaVantageOption & {
    daysToExpire: number;
    roi: number;
    annualizedRoi: number;
    totalReturn: number;
}

export const customStrategy = async (symbol: string, minDays: number, maxDays: number) => {
    // get the stock data from the alphavantage api
    const stockResponse = await fetch(`http://stocks.nikhilgarg.com/alphavantage?symbol=${symbol}&username=nikhil&function=TIME_SERIES_DAILY_ADJUSTED`);
    const stockData = await stockResponse.json();

    // get the options data from the alphavantage api
    const optionsResponse = await fetch(`http://stocks.nikhilgarg.com/alphavantage?symbol=${symbol}&username=nikhil&function=REALTIME_OPTIONS`);
    const optionsData: CustomStrategyOutput[] = (await optionsResponse.json()).data.filter((option: { type: string; }) => {
        return option.type === "put"
    });

    const currentStockPrice = stockData["Time Series (Daily)"][Object.keys(stockData["Time Series (Daily)"])[0]]["4. close"]

    const currentDate = new Date()

    optionsData.forEach((option) => {
        // calculate days to expire
        const expirationDate = new Date(option.expiration)
        const diffDays = Math.ceil((expirationDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
        option.daysToExpire = diffDays

        // calculate roi
        const roi = option.bid / option.strike
        option.roi = roi

        // calculate annualizedRoi
        const annualizedRoi = roi * 365 / diffDays
        option.annualizedRoi = annualizedRoi

        // calculate total return
        option.totalReturn = roi + annualizedRoi
    })

    // get the percent values
    const percentValues = [currentStockPrice * 0.75, currentStockPrice * 0.80, currentStockPrice * 0.85, currentStockPrice * 0.90, currentStockPrice * 0.95]

    // find the best option for each percent value
    const filteredOptions = percentValues.map((value) => {
        const filteredOptions = optionsData.filter((option: CustomStrategyOutput, idx: number) => {
            return option.strike <= value && option.daysToExpire >= minDays && option.daysToExpire <= maxDays
        })

        // sort highest to lowest
        return filteredOptions.sort((a: CustomStrategyOutput, b: CustomStrategyOutput) => {
            return b.annualizedRoi - a.annualizedRoi
        })[0]
    })

    const output = {75: filteredOptions[0], 80: filteredOptions[1], 85: filteredOptions[2], 90: filteredOptions[3], 95: filteredOptions[4]}
    console.log(output)
    
    return output
}

