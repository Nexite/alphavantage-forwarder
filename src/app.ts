import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

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
    const queryParams = {...query, apikey: apiKey};
    // make request to alpha vantage
    const response = await fetch(`${alphaAdvantageUrl}?${new URLSearchParams(queryParams as Record<string, string>)}`);
    const data = await response.json();
    res.send(data);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
