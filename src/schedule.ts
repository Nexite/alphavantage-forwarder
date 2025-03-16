import cron from 'node-cron';
import { fetchRealtimeOptionsForSymbol, RealtimeOption } from './options';
import { symbolManager } from './symbolManager';
import { TZDate } from '@date-fns/tz';
import { dbClient } from './db';
import { Prisma } from '@prisma/client';
// every 15 minutes

export const initSchedule = () => {
    console.log('CRON jobs scheduled');
    cron.schedule('*/15 * * * *', async () => {
        try {
            // get date with time of hour in EST and minute to the nearest 15 minutes
            const now = new Date();
            const hour = now.getHours();
            // round to the nearest 15 minutes
            const minute = Math.round(now.getMinutes() / 15) * 15;
            const timestamp = new TZDate(new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).toISOString(), 'America/New_York');
            console.log(timestamp);
            const symbols = await symbolManager.getKnownSymbols();
            const operations: ((prisma: Prisma.TransactionClient) => Promise<any>)[] = []
            console.log(`Creating interval options chain for ${symbols.length} symbols`);
            for (const symbol of symbols) {
                operations.push(async (prisma) => {
                    try {
                        const { data } = await fetchRealtimeOptionsForSymbol(symbol);
                        console.log(`Fetched ${data.length} options for ${symbol}`);
                        const puts: RealtimeOption[] = [];
                        const calls: RealtimeOption[] = [];

                        for (const option of data) {
                            if (option.type === 'put') {
                                puts.push(option);
                            } else if (option.type === 'call') {
                                calls.push(option);
                            }
                        }
                        
                        console.log(`Processing ${puts.length} puts and ${calls.length} calls for ${symbol}`);

                        return prisma.intervalOptionsChain.create({
                            data: {
                                symbolId: symbol,
                                timestamp: timestamp,
                                puts: {
                                    create: puts.map(p => ({
                                        contractId: p.contractID,
                                        // timestamp: timestamp,
                                        // symbolId: symbol,
                                        expiration: new Date(p.expiration),
                                        strike: new Prisma.Decimal(p.strike),
                                        last: new Prisma.Decimal(p.last),
                                        mark: new Prisma.Decimal(p.mark),
                                        bid: new Prisma.Decimal(p.bid),
                                        bidSize: parseInt(p.bid_size),
                                        ask: new Prisma.Decimal(p.ask),
                                        askSize: parseInt(p.ask_size),
                                        volume: parseInt(p.volume),
                                        openInterest: parseInt(p.open_interest)
                                    }))
                                },
                                calls: {
                                    create: calls.map(c => ({
                                        contractId: c.contractID,
                                        // timestamp: timestamp,
                                        // symbolId: symbol,
                                        expiration: new Date(c.expiration),
                                        strike: new Prisma.Decimal(c.strike),
                                        last: new Prisma.Decimal(c.last),
                                        mark: new Prisma.Decimal(c.mark),
                                        bid: new Prisma.Decimal(c.bid),
                                        bidSize: parseInt(c.bid_size),
                                        ask: new Prisma.Decimal(c.ask),
                                        askSize: parseInt(c.ask_size),
                                        volume: parseInt(c.volume),
                                        openInterest: parseInt(c.open_interest)
                                    }))
                                }
                            }
                        });
                    } catch (error) {
                        console.error(`Error processing symbol ${symbol}:`, error);
                        throw error; // Re-throw to fail the transaction
                    }
                })
            }
            console.log(`loaded ${operations.length} operations, executing transactions`);
            try {
                await dbClient.$transaction(async (prisma) => {
                    await Promise.all(operations.map(op => op(prisma)));
                }, {
                    timeout: 120000, // 2 minute timeout
                    maxWait: 120000  // 2 minute max wait
                });
                console.log('Completed interval options chain creation');
            } catch (txError) {
                console.error('Transaction failed:', txError);
            }
        } catch (error) {
            console.error('CRON job failed:', error);
        }
    }, {
        timezone: 'America/New_York'
    });
}