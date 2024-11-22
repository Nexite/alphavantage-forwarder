import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { handleAlphaVantage } from './alphavantage';
import { handleAlpaca } from './alpaca';
import cors from 'cors';
import { getQuoteRange } from './quotes';
import { initializeDb } from './db';
import { alphaVantageQueue } from './queue';
import { getOptionsRange } from './options';

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
        'https://options.nikhilgarg.com',
        'https://stocks.nikhilgarg.com' 
      ]
    }));

    app.get('/', handleAlpaca);
    app.get('/alphavantage', handleAlphaVantage);
    app.get('/alpaca', handleAlpaca);

    app.get('/historicalQuotes', async (req: Request, res: Response) => {
      const symbol = req.query.symbol as string;
      const days = parseInt(req.query.days as string);
      const skip = parseInt(req.query.skip as string) || 0;
      console.log('historicalQuotes', symbol, days, skip)
      const quotes = await getQuoteRange(symbol, days, skip);
      res.json(quotes);
    });

    app.get('/historicalOptions', async (req: Request, res: Response) => {
      const symbol = req.query.symbol as string;
      const days = parseInt(req.query.days as string);
      const skip = parseInt(req.query.skip as string) || 0;
      console.log('historicalOptions', symbol, days, skip)
      const options = await getOptionsRange(symbol, days, skip);
      res.json(options);
    });

    app.get('/queue-status', (req, res) => {
      res.json(alphaVantageQueue.stats);
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
      http.createServer(httpApp).listen(80, () => {
        console.log('HTTP Server running on port 80 (redirecting to HTTPS)');
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
      // Development without SSL
      http.createServer(app).listen(port, () => {
        console.log(`HTTP Server running on port ${port}`);
      });
    }

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
