import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { handleAlphaVantage, requestAlphaVantage, AlphaVantageOption } from './alphavantage';
import { handleAlpaca } from './alpaca';
import cors from 'cors';
import { getQuoteRange } from './quotes';
import { initializeDb, dbClient } from './db';
import { alphaVantageQueue } from './alphaQueue';
import { getOptionsRange, getOptionsRangeForInterval, createDbEntryForOptionsChain } from './options';
import TTLCache from '@isaacs/ttlcache';
import compression from 'compression';
import { symbolManager } from './symbolManager';
import { initSchedule } from './schedule';
import { DateString, validateDateString, getLastTradingDay, fromStrToDate } from './utils';
import { Prisma } from '@prisma/client';
dotenv.config();

const app = express();
const port = process.env.HTTPS_PORT || 443;
const httpPort = process.env.HTTP_PORT || 80;

export const authorizedUsers: string[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'authorized_users.json'), 'utf-8')
);

const overviewCache = new TTLCache({
  ttl: 60 * 60 * 24 * 1000, // 1 day
  max: 1000
});

// Initialize the application
async function startServer() {
  try {
    await initializeDb();
    await symbolManager.init();
    initSchedule();
    console.log('Database initialized, holidays cached');

    app.use(express.json());
    app.use(express.static("public"));

    app.use(compression());
    app.use(cors({
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://options.nikhilgarg.com',
        'https://stocks.nikhilgarg.com'
      ]
    }));

    app.get('/', handleAlpaca);
    app.get('/alphavantage', handleAlphaVantage);
    app.get('/alpaca', handleAlpaca);

    app.get('/historicalQuotes', async (req: Request, res: Response) => {
      try {
        const symbol = req.query.symbol as string;
        // validate symbol, if it is not all letters, lowecase or uppercase, return 400
        if (!/^[A-Za-z]+$/.test(symbol)) {
          return res.status(400).json({ error: 'Invalid symbol' });
        }
        const days = parseInt(req.query.days as string);
        const skip = parseInt(req.query.skip as string) || 0;
        console.log('historicalQuotes', symbol, days, skip)
        const quotes = await getQuoteRange(symbol, days, skip);
        res.json(quotes);
      } catch (error) {
        console.error('Failed to get historical quotes', error);
        res.status(500).json({ error: 'Failed to get historical quotes' });
      }
    });

    app.get('/historicalOptions', async (req: Request, res: Response) => {
      try {
        const symbol = req.query.symbol as string;
        // validate symbol, if it is not all letters, lowecase or uppercase, return 400
        if (!/^[A-Za-z]+$/.test(symbol)) {
          return res.status(400).json({ error: 'Invalid symbol' });
        }
        const days = parseInt(req.query.days as string);
        const skip = parseInt(req.query.skip as string) || 0;
        console.log('historicalOptions', symbol, days, skip)
        const options = await getOptionsRange(symbol, days, skip);
        res.json(options);
      } catch (error) {
        console.error('Failed to get historical options', error);
        res.status(500).json({ error: 'Failed to get historical options' });
      }
    });

    app.get('/queue-status', (req, res) => {
      try {
        res.json(alphaVantageQueue.stats);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get queue status' });
      }
    });

    app.get('/symbols', async (req, res) => {
      try {
        const symbols = symbolManager.getKnownSymbols();
        res.json(symbols);
      } catch (error) {
        console.error('Failed to get symbols', error);
        res.status(500).json({ error: 'Failed to get symbols' });
      }
    });

    app.get('/overview', async (req, res) => {
      try {
        const symbol = req.query.symbol as string;
        // validate symbol, if it is not all letters, lowecase or uppercase, return 400
        if (!/^[A-Za-z]+$/.test(symbol)) {
          return res.status(400).json({ error: 'Invalid symbol' });
        }
        const cachedResult = overviewCache.get(symbol);
        if (cachedResult) {
          res.json(cachedResult);
        } else {
          console.log('Cache miss for overview', symbol);
          const result = await requestAlphaVantage({ function: 'OVERVIEW', symbol: symbol.toUpperCase() });
          overviewCache.set(symbol, result);
          res.json(result);
        }
      } catch (error) {
        console.error('Failed to get overview', error);
        res.status(500).json({ error: 'Failed to get overview' });
      }
    });

    app.get('/options-interval', async (req, res) => {
      try {
        const symbol = req.query.symbol as string;
        const startDate = req.query.startDate as DateString;
        const endDate = req.query.endDate as DateString;

        if (!symbol || !startDate) {
          console.log('Missing required parameters', symbol, startDate, endDate)
          return res.status(400).json({ error: 'Missing required parameters' });
        }

        if (!validateDateString(startDate) || (endDate && !validateDateString(endDate))) {
          console.log('Invalid date string', symbol, startDate, endDate)
          return res.status(400).json({ error: 'Invalid date string' });
        }

        const options = await getOptionsRangeForInterval(symbol, startDate, endDate);
        res.json(options);
      } catch (error) {
        console.error('Failed to get options interval', error);
        res.status(500).json({ error: 'Failed to get options interval' });
      }
    });

    app.get('/latestQuote', async (req, res) => {
      try {
        const symbol = req.query.symbol as string;
        if (!/^[A-Za-z]+$/.test(symbol)) {
          return res.status(400).json({ error: 'Invalid symbol' });
        }

        const lastTradingDay = getLastTradingDay();
        const quote = await dbClient.dailyQuote.findUnique({
          where: {
            symbolId_date: {
              symbolId: symbol.toUpperCase(),
              date: fromStrToDate(lastTradingDay)
            }
          }
        });

        if (quote) {
          res.json({
            date: quote.date,
            price: quote.price.toNumber()
          });
          return;
        }

        // If not in database, fetch from AlphaVantage
        const quotes = await requestAlphaVantage({
          function: 'TIME_SERIES_DAILY_ADJUSTED',
          symbol: symbol.toUpperCase(),
          outputsize: 'compact'
        });

        const latestQuote = quotes['Time Series (Daily)'][lastTradingDay];
        if (!latestQuote) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        // Store in database
        await dbClient.dailyQuote.create({
          data: {
            symbolId: symbol.toUpperCase(),
            date: fromStrToDate(lastTradingDay),
            price: new Prisma.Decimal(latestQuote['5. adjusted close'])
          }
        });

        res.json({
          date: fromStrToDate(lastTradingDay),
          price: Number(latestQuote['5. adjusted close'])
        });
      } catch (error) {
        console.error('Failed to get latest quote', error);
        res.status(500).json({ error: 'Failed to get latest quote' });
      }
    });

    app.get('/latestOptions', async (req, res) => {
      try {
        const symbol = req.query.symbol as string;
        if (!/^[A-Za-z]+$/.test(symbol)) {
          return res.status(400).json({ error: 'Invalid symbol' });
        }

        const lastTradingDay = getLastTradingDay();
        const options = await dbClient.dailyOptionsChain.findUnique({
          where: {
            symbolId_date: {
              symbolId: symbol.toUpperCase(),
              date: fromStrToDate(lastTradingDay)
            }
          },
          include: {
            puts: true,
            calls: true
          }
        });

        if (options) {
          res.json({
            date: options.date,
            puts: options.puts.map(put => ({
              contractId: put.contractId,
              expiration: put.expiration,
              strike: put.strike.toNumber(),
              bid: put.bid.toNumber(),
              ask: put.ask.toNumber()
            })),
            calls: options.calls.map(call => ({
              contractId: call.contractId,
              expiration: call.expiration,
              strike: call.strike.toNumber(),
              bid: call.bid.toNumber(),
              ask: call.ask.toNumber()
            }))
          });
          return;
        }

        // If not in database, fetch from AlphaVantage
        const optionsResponse = await requestAlphaVantage({
          function: 'HISTORICAL_OPTIONS',
          symbol: symbol.toUpperCase(),
          date: lastTradingDay
        });

        if (!optionsResponse.data?.length) {
          return res.status(404).json({ error: 'Options not found' });
        }

        // Store in database
        await createDbEntryForOptionsChain(optionsResponse);

        res.json({
          date: fromStrToDate(lastTradingDay),
          puts: optionsResponse.data
            .filter((o: AlphaVantageOption) => o.type === 'put')
            .map((o: AlphaVantageOption) => ({
              contractId: o.contractID,
              expiration: fromStrToDate(o.expiration),
              strike: Number(o.strike),
              bid: Number(o.bid),
              ask: Number(o.ask)
            })),
          calls: optionsResponse.data
            .filter((o: AlphaVantageOption) => o.type === 'call')
            .map((o: AlphaVantageOption) => ({
              contractId: o.contractID,
              expiration: fromStrToDate(o.expiration),
              strike: Number(o.strike),
              bid: Number(o.bid),
              ask: Number(o.ask)
            }))
        });
      } catch (error) {
        console.error('Failed to get latest options', error);
        res.status(500).json({ error: 'Failed to get latest options' });
      }
    });

    // Check if SSL certificates exist
    const sslPath = path.join(__dirname, '..');
    const keyPath = path.join(sslPath, 'key.pem');
    const certPath = path.join(sslPath, 'cert.pem');

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      // Create HTTP server for redirecting
      const httpApp = express();

      // Redirect all HTTP traffic to HTTPS
      httpApp.use((req, res) => {
        res.redirect(`https://${req.hostname}${req.url}`);
      });

      // Start HTTP server for redirecting
      http.createServer(httpApp).listen(httpPort, () => {
        console.log(`HTTP Server running on port ${httpPort} (redirecting to HTTPS)`);
      });

      // Start HTTPS server
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };

      https.createServer(httpsOptions, app).listen(port, () => {
        console.log(`HTTPS Server running on port ${port}`);
      });
    } else {
      // Development without SSL - use a different port
      const devPort = 3000;
      http.createServer(app).listen(devPort, () => {
        console.log(`HTTP Server running on port ${devPort} (development)`);
      });
    }

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
