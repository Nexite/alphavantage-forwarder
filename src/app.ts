import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { handleAlphaVantage } from './alphavantage';
import { handleAlpaca } from './alpaca';
import cors from 'cors';
import { getHistoricalQuoteRange } from './quotes';
import { initializeDb } from './db';
import { alphaVantageQueue } from './queue';
import { getHistoricalOptionsRange } from './options';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

export const authorizedUsers: string[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'authorized_users.json'), 'utf-8')
);

// Initialize the application
async function startServer() {
  try {
    await initializeDb();
    console.log('Database initialized, holidays cached');

    app.use(express.json());
    app.use(express.static("public"));

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

    app.get('/historicalQuotes', async (req: Request, res: Response) => {
      const symbol = req.query.symbol as string;
      const days = parseInt(req.query.days as string);
      const skip = parseInt(req.query.skip as string) || 0;
      const quotes = await getHistoricalQuoteRange(symbol, days, skip);
      res.json(quotes);
    });

    app.get('/historicalOptions', async (req: Request, res: Response) => {
      const symbol = req.query.symbol as string;
      const days = parseInt(req.query.days as string);
      const skip = parseInt(req.query.skip as string) || 0;
      const options = await getHistoricalOptionsRange(symbol, days, skip);
      res.json(options);
    });

    app.get('/queue-status', (req, res) => {
      res.json(alphaVantageQueue.stats);
    });

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
