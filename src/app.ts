import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { handleAlphaVantage } from './alphavantage';
import { handleAlpaca } from './alpaca';
import { customStrategy, customStrategyHistorical } from './customStrategy';
import { getLastTradingDay, isTradingDay } from './utils';
import { getHistoricalOptionsChains } from './options';
import { getHistoricalPrices } from './stock';
import { updateAllThings } from './update';
import cors from 'cors';
import https from 'https';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const privateKey = fs.readFileSync( 'key.pem' );
const publicKey = fs.readFileSync( 'cert.pem' );

export const authorizedUsers: string[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'authorized_users.json'), 'utf-8')
);

app.use((req, res, next) => {
    if (!req.secure) {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

app.use(express.json());
app.use(express.static("public"))

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://options.nikhilgarg.com'
  ]
}));

app.get('/', handleAlpaca);

app.get('/alphavantage', handleAlphaVantage);

app.get('/alpaca', handleAlpaca);

app.get('/customStrategy', async (req: Request, res: Response) => {
  const { symbol, minDays, maxDays, username, date } = req.query
  if (!authorizedUsers.includes(username as string)) {
    res.status(401).send("Unauthorized")
    return
  }
  let lastTradingDate = date

  if (date && !isTradingDay(date as string)) {
    lastTradingDate = getLastTradingDay(false, date as string)
    // res.status(400).send("Not a valid trading day")
    // return
  }
  try {
    const result = await customStrategy(symbol as string, parseInt((minDays as string ?? "10")), parseInt((maxDays as string ?? "365")), lastTradingDate as string)
    res.send(result)
  } catch (error) {
    console.log(error)
    res.status(500).send({ error: error })
  }
})

app.get('/historicalOptions', async (req: Request, res: Response) => {
  const { symbol, days } = req.query
  // const options = await getHistoricalOptionsChain(symbol as string, date as string)
  const options = await getHistoricalOptionsChains(symbol as string, parseInt(days as string))
  res.send(options)
})

app.get('/historicalPrices', async (req: Request, res: Response) => {
  const { symbol, days } = req.query
  const prices = await getHistoricalPrices(symbol as string, parseInt(days as string))
  res.send(prices)
})

app.get('/customStrategyHistorical', async (req: Request, res: Response) => {
  try {
    const { symbol, days, minDays, maxDays } = req.query
    const result = await customStrategyHistorical(symbol as string, parseInt(days as string) || 30, parseInt(minDays as string) || 10, parseInt(maxDays as string) || 365)
    res.send(result)
  } catch (error) {
    console.log(error)
    res.status(500).send({ error: error })
  }
})

app.get('/update', async (req: Request, res: Response ) => {
  try {
    await updateAllThings()
    res.send("Updated")
  } catch (error) {
    console.log(error)
    res.status(500).send({ error: error })
  }
})

// Create HTTPS server
const httpsServer = https.createServer({
    key: privateKey,
    cert: publicKey
}, app);

// Listen on HTTPS port (usually 443)
httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443');
});

// Optionally keep HTTP server on port 80 to redirect to HTTPS
app.listen(80, () => {
    console.log('HTTP Server running on port 80');
});
