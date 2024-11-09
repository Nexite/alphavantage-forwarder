import Alpaca from "@alpacahq/alpaca-trade-api";
import { verbose } from "sqlite3";

class DataStream {
    alpaca: Alpaca;
    constructor({ apiKey, secretKey, feed }: { apiKey: string, secretKey: string, feed: string }) {
        this.alpaca = new Alpaca({
            keyId: apiKey,
            secretKey,
            feed,
            verbose: true,
        });

        const socket = this.alpaca.option_stream;

        socket.onConnect(function () {
            console.log("Connected");
            console.log(socket.getSubscriptions());
            socket.subscribe({ quotes: ["QQQ240916C00475000"] });
            console.log(socket.getSubscriptions());
            // socket.subscribeForQuotes(["AAPL"]);
            // socket.subscribeForTrades(["FB"]);
            // socket.subscribeForBars(["SPY"]);
            // socket.subscribeForStatuses(["*"]);
        });

        socket.onError((err) => {
            console.log("error: ", err);
        });

        // socket.onStockTrade((trade) => {
        //     console.log("trade: ", trade);
        // });

        socket.onOptionQuote((quote) => {
            console.log("quote: ", quote);
        });

        // socket.onStockBar((bar) => {
        //     console.log("bar: ", bar);
        // });

        // socket.onStatuses((s) => {
        //     console.log("status: ", s);
        // });

        socket.onStateChange((state) => {
            console.log("state: ", state);
        });

        // socket.onDisconnect(() => {
        //     console.log("Disconnected");
        // });

        socket.connect();

        // unsubscribe from FB after a second
        // setTimeout(() => {
        //     // socket.unsubscribeFromTrades(["FB"]);
        // }, 1000);
    }
}

let stream = new DataStream({
    apiKey: process.env.ALPACA_API_KEY_ID!,
    secretKey: process.env.ALPACA_API_KEY_SECRET!,
    feed: "iex",
});

const alpaca = new Alpaca({
    keyId: process.env.ALPACA_API_KEY_ID!,
    secretKey: process.env.ALPACA_API_KEY_SECRET!,
    feed: "iex",
});


(async () => {
    const start = Date.now();
    const trades = await alpaca.getLatestQuote(["SPY"]);
    const duration = Date.now() - start;
    console.log(`Request took ${duration}ms`);
    console.log(trades);
})();
