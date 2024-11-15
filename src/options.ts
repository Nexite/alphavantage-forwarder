import { fromDbToStr, fromStrToDate, getLastTradingDay } from "./utils"

import { UTCDate } from "@date-fns/utc"
import { symbolManager } from "./symbolManager"
import { getDaysAgo, getValidTradingDates } from "./utils"
import { dbClient } from "./db"
import { requestAlphaVantage } from "./alphavantage"
import { OptionType, Prisma } from "@prisma/client"



const fetchOptionsForSymbol = async (symbol: string, date: string) => {
    // const dateObj = fromStrToDate(date)
    const options = await requestAlphaVantage({
        function: "HISTORICAL_OPTIONS",
        symbol: symbol,
        date: date
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
    console.log(alphaVantageOptionsChain)
    const date = fromStrToDate(options[0].date)
    const symbol = options[0].symbol
    console.log(date, symbol)

    const contracts = options.map(o => ({
        // id: `${o.contractID}-${options[0].date}`,
        contractId: o.contractID,
        date: date,
        expiration: fromStrToDate(o.expiration),
        strike: o.strike,
        symbolId: symbol,
        type: o.type == "call" ? OptionType.CALL : OptionType.PUT,
        // last: o.last !== "" ? o.last : null,
        mark: o.mark !== "" ? o.mark : null,
        bid: o.bid !== "" ? o.bid : null,
        // bidSize: o.bid_size !== "" ? parseInt(o.bid_size) : null,
        ask: o.ask !== "" ? o.ask : null,
        // askSize: o.ask_size !== "" ? parseInt(o.ask_size) : null,
        // volume: o.volume !== "" ? parseInt(o.volume) : null,
        // openInterest: o.open_interest !== "" ? parseInt(o.open_interest) : null,
        // impliedVolatility: o.implied_volatility !== "" ? o.implied_volatility : null,
        // delta: o.delta !== "" ? o.delta : null,
        // gamma: o.gamma !== "" ? o.gamma : null,
        // theta: o.theta !== "" ? o.theta : null,
        // vega: o.vega !== "" ? o.vega : null,
        // rho: o.rho !== "" ? o.rho : null
    }))
    // first create the dailyOptionsChain entry
    // check if the option chain already exists
    const existingOptionChain = await dbClient.dailyOptionsChain.findUnique({
        where: { symbolId_date: { symbolId: symbol, date: date } }
    })
    if (existingOptionChain) {
        // just create the contracts
        await dbClient.dailyOptionContract.createMany({ 
            data: contracts, 
            skipDuplicates: true 
        })
        return
    }
    await dbClient.dailyOptionsChain.create({
        data: {
            // id: `${symbol}-${options[0].date}`,
            symbolId: symbol,
            date: date,
            contracts: { create: contracts }
        }
    })

}

export const getHistoricalOptionsRange = async (symbol: string, days: number, skip: number = 0) => {
    await symbolManager.ensureSymbol(symbol)

    const startDate = getDaysAgo(days + skip)
    startDate.setHours(0, 0, 0, 0)
    const endDate = skip > 0 ? getDaysAgo(skip + 1, false) : fromStrToDate(getLastTradingDay(false))
    endDate.setHours(0, 0, 0, 0)
    console.log(endDate, fromStrToDate(getLastTradingDay(false)), skip)

    const tradingDates = await getValidTradingDates(startDate, endDate)

    // get the options chain for the symbol in the format {{date}: [options]} from the database
    console.time('get options')
    const options = await dbClient.dailyOptionsChain.findMany({
        where: {
            symbolId: symbol,
            date: {
                gte: startDate,
                lte: endDate
            }
        },
        select: {
            date: true,
            contracts: {
                select: {
                    expiration: true,
                    strike: true,
                },
                where: {
                    type: OptionType.PUT
                }
            }
        }
    })
    console.timeEnd('get options')

    const existingDates = new Set(options.map(o => fromDbToStr(o.date)));
    const missingDates = tradingDates.filter(date => !existingDates.has(date));

    if (missingDates.length > 0) {
        for (const [i, date] of missingDates.entries()) {
            console.log(`fetching options for ${symbol} on ${date} ${i}`)
            const missingOptions = await fetchOptionsForSymbol(symbol, date)
            // console.log(missingOptions)
            try {
                // create the entry, we don't need to wait for it though
                createDbEntryForOptionsChain(missingOptions)
            } catch (e) {
                console.error(`Error fetching options for ${symbol} on ${date} ${i}`)
                // return []
            }
        }
    }
    // console.log(options)

    return options
}