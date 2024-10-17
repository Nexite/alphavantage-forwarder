import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', async (req: Request, res: Response) => {
    const alphaAdvantageUrl = 'https://www.alphavantage.co/query';
    const apiKey = process.env.ALPHA_ADVANTAGE_API_KEY;
    console.log(apiKey);
    // get request params
    const queryParams = {...req.query, apikey: apiKey};
    // make request to alpha vantage
    const response = await fetch(`${alphaAdvantageUrl}?${new URLSearchParams(queryParams as Record<string, string>)}`);
    const data = await response.json();
    console.log(data);
    res.send(data);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
