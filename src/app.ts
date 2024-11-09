import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { handleAlphaVantage } from './alphavantage';
import { handleAlpaca } from './alpaca';
import { customStrategy } from './customStrategy';
import { getStockPrice, updateAllStockPrices } from './stocks';
import { getLastTradingDay, isTradingDay, isTradingSession } from './utils';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;


export const authorizedUsers: string[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'authorized_users.json'), 'utf-8')
);


app.use(express.json());
app.use(express.static("public"))

app.get('/', handleAlpaca);

app.get('/alphavantage', handleAlphaVantage);

app.get('/alpaca', handleAlpaca);

app.get('/customStrategy', async (req: Request, res: Response) => {
  const { symbol, minDays, maxDays, username, date } = req.query
  if (!authorizedUsers.includes(username as string)) {
    res.status(401).send("Unauthorized")
    return
  }
  if (date && !isTradingDay(date as string)) {
    res.status(400).send("Not a valid trading day")
    return
  }
  try {
    const result = await customStrategy(symbol as string, parseInt((minDays as string ?? "10")), parseInt((maxDays as string ?? "365")), date as string)
    res.send(result)
  } catch (error) {
    console.log(error)
    res.status(500).send({ error: error })
  }
})

app.get('/stockPrice', async (req: Request, res: Response) => {
  const { symbol, date } = req.query
  // date in format YYYY-MM-DD, if it is in the future, return null
  console.log(new Date(date as string), new Date())
  if (new Date(date as string) > new Date()) {
    res.send(null)
    return
  }

  const stock = await getStockPrice(symbol as string, date as string)
  res.send({price: stock})
})

app.get('/lastTradingDay', async (req: Request, res: Response) => {
  const lastTradingDay = getLastTradingDay()
  console.log(isTradingSession())
  res.send(lastTradingDay)
})

app.get('/test', async (req: Request, res: Response) => {
  await updateAllStockPrices()
  res.send("done")
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
