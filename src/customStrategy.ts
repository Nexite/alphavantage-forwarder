import { TZDate } from "@date-fns/tz";
import { AlphaVantageOption } from "./alphavantage";
import { getStockPrice } from "./stocks";
import { getLastTradingDay } from "./utils";
import { UTCDate } from "@date-fns/utc";

// function getESTTradingDate(inputDate?: Date): string {
//     const date = inputDate || new Date();

//     // Get time in EST
//     const formatter = new Intl.DateTimeFormat('en-US', {
//         timeZone: 'America/New_York',
//         hour: 'numeric',
//         minute: 'numeric',
//         hour12: false,
//         year: 'numeric',
//         month: '2-digit',
//         day: '2-digit'
//     });

//     const [datePart, timePart] = formatter.format(date).split(', ');
//     const [month, day, year] = datePart.split('/');
//     const [hours, minutes] = timePart.split(':').map(Number);
//     if (hours < 9 || (hours === 9 && minutes < 30)) {
//         date.setDate(date.getDate() - 1);
//         const prevDayFormat = new Intl.DateTimeFormat('en-US', {
//             timeZone: 'America/New_York',
//             year: 'numeric',
//             month: '2-digit',
//             day: '2-digit'
//         });
//         const [prevMonth, prevDay, prevYear] = prevDayFormat.format(date).split('/');
//         return `${prevYear}-${prevMonth.padStart(2, '0')}-${prevDay.padStart(2, '0')}`;
//     }

//     return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
// }

export type CustomStrategyOutput = AlphaVantageOption & {
    daysToExpire: number;
    roi: number;
    annualizedRoi: number;
    totalReturn: number;
}

export const customStrategy = async (symbol: string, minDays: number, maxDays: number, date?: string) => {
    let optionsData: CustomStrategyOutput[]
    date ??= getLastTradingDay()

    const [optionsResponse, currentStockPrice]: [{ data: CustomStrategyOutput[] }, number] = await Promise.all([
        fetch(`${process.env.API_URL}/alphavantage?symbol=${symbol}&username=nikhil&function=${!date || date === getLastTradingDay() ? 'REALTIME_OPTIONS' : 'HISTORICAL_OPTIONS'}${date ? `&date=${date}` : ''}`).then(r => r.json()),
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

    const output = { 75: filteredOptions[0], 80: filteredOptions[1], 85: filteredOptions[2], 90: filteredOptions[3], 95: filteredOptions[4] }
    // console.log(output)

    return output
}

