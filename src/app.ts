import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { handleAlphaVantage } from './alphavantage';
import { handleAlpaca } from './alpaca';

dotenv.config();



const app = express();
const port = process.env.PORT || 3000;


export const authorizedUsers: string[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'authorized_users.json'), 'utf-8')
);


app.use(express.json());
app.use(express.static("public"))

app.get('/', handleAlphaVantage);

app.get('/alphavantage', handleAlphaVantage);

app.get('/alpaca', handleAlpaca);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
