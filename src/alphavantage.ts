import { authorizedUsers } from "./app";
import { Request, Response } from 'express';
import TTLCache from '@isaacs/ttlcache';
import * as db from './db';
import { alphaVantageQueue } from './alphaQueue';

const cache = new TTLCache<string, string>({ max: 200, ttl: 5 * 60 * 1000 })

export type AlphaVantageOption = {
    contractID: string;
    symbol: string;
    expiration: string;
    strike: number;
    type: string;
    last: number;
    mark: number;
    bid: number;
    bid_size: number;
    ask: number;
    ask_size: number;
    volume: number;
    open_interest: number;
    date: string;
    // symbol,expiration,strike,type,last,mark,bid,bid_size,ask,ask_size,volume,open_interest,date
}

type AlphaVantageQuery = {
    function: string;
} & Record<string, string>

export const rawRequestAlphaVantage = async (query: AlphaVantageQuery, priority?: number): Promise<ReturnType<typeof fetch>> => {
    return await alphaVantageQueue.addToQueue(query, priority, true);
}

export const requestAlphaVantage = async (query: AlphaVantageQuery, priority?: number) => {
    return await alphaVantageQueue.addToQueue(query, priority, false)
}

export const handleAlphaVantage = async (req: Request, res: Response) => {
    try {
        // get request params
        const query = req.query;

        if (!query.username || !authorizedUsers.includes(query.username as string)) {
            res.status(401).send('Unauthorized');
            return;
        }
        delete query.username;

        const queryParams = Object.fromEntries(Object.entries(query).sort());

        // check cache
        const cacheKey = JSON.stringify(queryParams);
        if (cache.has(cacheKey)) {
            if (!queryParams.datatype || queryParams.datatype !== 'csv') res.setHeader('Content-Type', 'application/json');
            res.send(cache.get(cacheKey));
            return;
        }

        // make request to alpha vantage through queue
        const response = await rawRequestAlphaVantage(queryParams as AlphaVantageQuery);
        
        // response might be csv or json but forward it
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            const data = await response.json();
            // update cache
            if (!data.Information) {
                cache.set(cacheKey, JSON.stringify(data));
            }

            // set json header
            res.setHeader('Content-Type', 'application/json');
            res.send(data);
        } else {
            const data = await response.text();
            cache.set(cacheKey, data)
            res.send(data);
        }

        console.log(`NEW ALPHAVANTAGE REQUEST: ${req.ip}, ${query.function}, ${query.symbol}`);
        
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
}