import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import * as db from './db';
import TTLCache from '@isaacs/ttlcache';

dotenv.config();

const cache = new TTLCache<string, string>({ max: 10000, ttl: 5 * 60 * 1000 })


const app = express();
const port = process.env.PORT || 3000;


const authorizedUsers: string[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'authorized_users.json'), 'utf-8')
);


app.use(express.json());

app.get('/', async (req: Request, res: Response) => {
  const alphaAdvantageUrl = 'https://www.alphavantage.co/query';
  const apiKey = process.env.ALPHA_ADVANTAGE_API_KEY;
  // get request params
  const query = req.query;

  if (!query.username || !authorizedUsers.includes(query.username as string)) {
    res.status(401).send('Unauthorized');
    return;
  }
  delete query.username;

  const queryParams = Object.fromEntries(Object.entries({ ...query, apikey: apiKey }).sort());

  // check cache
  const cacheKey = JSON.stringify(queryParams);
  if (cache.has(cacheKey)) {
    res.send(cache.get(cacheKey));
  } else {
    // make request to alpha vantage
    const response = await fetch(`${alphaAdvantageUrl}?${new URLSearchParams(queryParams as Record<string, string>)}`);
    // response might be csv or json but forward it
    if (response.headers.get('content-type') === 'application/json') {
      const data = await response.json();
      // update cache
      cache.set(cacheKey, JSON.stringify(data));

      // set json header
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } else {
      const data = await response.text();
      cache.set
      res.send(data);
    }
  }

  console.log(`NEW REQUEST: ${req.ip}, ${query.function}, ${query.symbol}`);
  // metrics
  if (query.symbol) await db.ticker(query.symbol as string);
  // get ip
  if (req.ip) await db.ip(req.ip);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
