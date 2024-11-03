import { Request, Response } from 'express';
import { AlphaVantageOption } from './alphavantage';
import * as db from './db';
import { authorizedUsers } from "./app";
import { json2csv } from 'json-2-csv';
import TTLCache from '@isaacs/ttlcache';

export interface SnapshotRoot {
    greeks: Greeks
    impliedVolatility: number
    latestQuote: LatestQuote
    latestTrade: LatestTrade
}

export interface Greeks {
    delta: number
    gamma: number
    rho: number
    theta: number
    vega: number
}

export interface LatestQuote {
    ap: number
    as: number
    ax: string
    bp: number
    bs: number
    bx: string
    c: string
    t: string
}

export interface LatestTrade {
    c: string
    p: number
    s: number
    t: string
    x: string
}

const cache = new TTLCache<string, string>({ max: 200, ttl: 1 * 60 * 1000 })

const fetchSnapshots = async (ticker: string, page: string | null = null) => {
    const params: { feed: string; limit: string; page_token?: string } = { "feed": "indicative", "limit": "1000" }
    if (page) {
        params["page_token"] = page
    }
    const response = await fetch(`https://data.alpaca.markets/v1beta1/options/snapshots/${ticker}?${new URLSearchParams(params as Record<string, string>)}`,
        { method: "GET", headers: { "APCA-API-KEY-ID": process.env.ALPACA_API_KEY_ID!, "APCA-API-SECRET-KEY": process.env.ALPACA_API_KEY_SECRET! } }
    )

    const data = await response.json();

    let snapshots: Record<string, SnapshotRoot> = data.snapshots

    if (data.next_page_token) {
        const nextPage = await fetchSnapshots(ticker, data.next_page_token)
        snapshots = { ...snapshots, ...nextPage }
    }

    return snapshots
}


const parseSnapshots = (snapshots: Record<string, SnapshotRoot>) => {
    const options: AlphaVantageOption[] = []
    if (!snapshots) return options
    for (const [symbol, snapshot] of Object.entries(snapshots)) {
        // https://polygon.io/knowledge-base/article/how-do-you-read-an-options-symbol
        // remove last 9 characters
        const temp = symbol.slice(0, -9)
        // count number of digits
        const nums = temp.match(/\d/g)?.length

        const [, ticker, expiration, optionType, strike] = (nums == 6 ? symbol.match(/^([A-Za-z]{1,5})(\d{6})([CP])([\d.]+)/) : symbol.match(/^([A-Za-z]{1,5})\d{1}(\d{6})([CP])([\d.]+)/))!

        // transform snapshot.latestQuote.t to mm/d/yy format
        const date = new Date(snapshot.latestQuote.t)
        const month = date.getMonth() + 1
        const day = date.getDate()
        const year = date.getFullYear()
        const dateString = `${month}/${day}/${year}`

        const strikePrice = Number(strike) / 1000
        // convert yymmdd to mm/dd/yy
        const expirationStr = `${expiration.slice(2, 4)}/${expiration.slice(4, 6)}/${expiration.slice(0, 2)}`
        options.push({
            contractID: symbol,
            symbol: ticker,
            expiration: expirationStr,
            strike: strikePrice as unknown as number,
            type: optionType == "P" ? "put" : "call",
            last: snapshot.latestTrade?.p || 0,
            mark: snapshot.latestQuote.ap,
            bid: snapshot.latestQuote.bp,
            bid_size: snapshot.latestQuote.bs,
            ask: snapshot.latestQuote.ap,
            ask_size: snapshot.latestQuote.as,
            volume: -1,
            open_interest: -1,
            date: dateString,
        })

    }
    // sort by expiration then strike then type
    options.sort((a, b) => {
        const aExp = new Date(a.expiration)
        const bExp = new Date(b.expiration)
        if (aExp > bExp) return 1
        if (aExp < bExp) return -1
        if (a.strike > b.strike) return 1
        if (a.strike < b.strike) return -1
        if (a.type > b.type) return 1
        if (a.type < b.type) return -1
        return 0
    })

    return options
}


export const handleAlpaca = async (req: Request, res: Response) => {
    try {

        const { symbol, username } = req.query
        if (!username || !authorizedUsers.includes(username as string)) {
            res.status(401).send('Unauthorized');
            return;
        }

        if (typeof symbol !== "string") {
            res.status(400).json({ error: "Invalid ticker" })
            return
        }

        // check if ticker is in cache
        if (cache.has(symbol)) {
            res.send(cache.get(symbol));
        } else {

            const snapshots = await fetchSnapshots(symbol)
            const options = parseSnapshots(snapshots)


            // convert options to csv
            const csv = await json2csv(options)
            cache.set(symbol, csv)
            res.send(csv)
        }

        // metrics
        console.log(`NEW ALPACA REQUEST: ${req.ip}, ${symbol}`);
        if (symbol) await db.ticker(symbol as string);
        // get ip
        if (req.ip) await db.ip(req.ip);
    }
    catch (e) {
        console.error(e)
        res.status(500).json({ error: "Internal server error" })
    }
}
