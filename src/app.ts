import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { handleAlphaVantage } from './alphavantage';
import { handleAlpaca } from './alpaca';
import { customStrategy } from './customStrategy';

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
    const { symbol, minDays, maxDays, username } = req.query
    if (!authorizedUsers.includes(username as string)) {
        res.status(401).send("Unauthorized")
        return
    }
    const result = await customStrategy(symbol as string, parseInt((minDays as string ?? "10")), parseInt((maxDays as string ?? "365")))
    res.send(result)
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
