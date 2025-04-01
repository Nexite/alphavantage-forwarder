import cron from 'node-cron';
import { fetchRealtimeOptionsForSymbol, RealtimeOption } from './options';
import { symbolManager } from './symbolManager';
import { TZDate } from '@date-fns/tz';
import { dbClient } from './db';
import { Prisma } from '@prisma/client';
import { isTradingSession } from './utils';

// Increased batch size since we're using bulk operations
const BATCH_SIZE = 20;

export const initSchedule = () => {
    console.log('CRON jobs scheduled');
    cron.schedule('*/15 * * * *', async () => {
        try {
            // check if it is trading session, if not, skip
            if (!isTradingSession()) {
                return;
            }
            
            // get date with time of hour in EST and minute to the nearest 15 minutes
            const now = new Date();
            const hour = now.getHours();
            // round to the nearest 15 minutes
            const minute = Math.round(now.getMinutes() / 15) * 15;
            const timestamp = new TZDate(new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).toISOString(), 'America/New_York');

            const symbols = await symbolManager.getKnownSymbols();
            
            // Fetch all data first to get it as close to the 15-minute mark as possible
            console.log(`Fetching options data for ${symbols.length} symbols`);
            const optionsData = await Promise.all(
                symbols.map(async (symbol) => {
                    try {
                        const { data } = await fetchRealtimeOptionsForSymbol(symbol);
                        return { symbol, data };
                    } catch (error) {
                        console.error(`Error fetching data for ${symbol}:`, error);
                        return { symbol, data: null };
                    }
                })
            );

            // Filter out failed fetches and empty results
            const validOptionsData = optionsData.filter(({ data }) => data && data.length > 0);
            console.log(`Successfully fetched data for ${validOptionsData.length} symbols`);

            // Process in batches
            for (let i = 0; i < validOptionsData.length; i += BATCH_SIZE) {
                const batch = validOptionsData.slice(i, i + BATCH_SIZE);
                console.log(`Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(validOptionsData.length / BATCH_SIZE)}`);
                
                try {
                    // Create all chains first
                    await dbClient.intervalOptionsChain.createMany({
                        data: batch.map(({ symbol }) => ({
                            symbolId: symbol,
                            timestamp: timestamp
                        })),
                        skipDuplicates: true
                    });

                    // Prepare bulk puts and calls data
                    const puts: Prisma.IntervalOptionPutCreateManyInput[] = [];
                    const calls: Prisma.IntervalOptionCallCreateManyInput[] = [];

                    batch.forEach(({ symbol, data }) => {
                        // Type assertion is safe here since we filtered out null data above
                        for (const option of data!) {
                            const commonFields = {
                                symbolId: symbol,
                                timestamp: timestamp,
                                contractId: option.contractID,
                                expiration: new Date(option.expiration),
                                strike: new Prisma.Decimal(option.strike),
                                last: new Prisma.Decimal(option.last),
                                mark: new Prisma.Decimal(option.mark),
                                bid: new Prisma.Decimal(option.bid),
                                bidSize: parseInt(option.bid_size),
                                ask: new Prisma.Decimal(option.ask),
                                askSize: parseInt(option.ask_size),
                                volume: parseInt(option.volume),
                                openInterest: parseInt(option.open_interest)
                            };

                            if (option.type === 'put') {
                                puts.push(commonFields);
                            } else if (option.type === 'call') {
                                calls.push(commonFields);
                            }
                        }
                    });

                    console.log(`Processing ${puts.length} puts and ${calls.length} calls in batch ${i / BATCH_SIZE + 1}`);

                    // Bulk insert puts and calls without transaction
                    if (puts.length > 0) {
                        await dbClient.intervalOptionPut.createMany({
                            data: puts,
                            skipDuplicates: true
                        });
                    }

                    if (calls.length > 0) {
                        await dbClient.intervalOptionCall.createMany({
                            data: calls,
                            skipDuplicates: true
                        });
                    }

                    console.log(`Successfully processed batch ${i / BATCH_SIZE + 1}`);
                } catch (error) {
                    console.error(`Error processing batch ${i / BATCH_SIZE + 1}:`, error);
                    // Continue with next batch even if this one fails
                }
            }

            console.log('Completed interval options chain creation');
        } catch (error) {
            console.error('CRON job failed:', error);
        }
    }, {
        timezone: 'America/New_York'
    });
}