import { dbClient } from "./db";

class SymbolManager {
    private knownSymbols: Set<string>;
    private pendingPromises: Map<string, Promise<void>>;

    constructor() {
        this.knownSymbols = new Set<string>();
        this.pendingPromises = new Map<string, Promise<void>>();
    }

    async init() {
        const symbols = await dbClient.symbol.findMany();
        symbols.forEach((symbol) => {
            this.knownSymbols.add(symbol.id);
        });
    }

    getKnownSymbols() {
        return Array.from(this.knownSymbols);
    }

    async ensureSymbol(symbolId: string) {
        symbolId = symbolId.toUpperCase();
        if (!this.knownSymbols.has(symbolId)) {
            // If there's already a pending promise for this symbol, wait for it
            const existingPromise = this.pendingPromises.get(symbolId);
            if (existingPromise) {
                console.log(`waiting for existing promise for ${symbolId}`)
                await existingPromise;
                return;
            }

            // Create a new promise for this symbol
            const promise = (async () => {
                try {
                    await dbClient.symbol.upsert({
                        where: { id: symbolId },
                        update: {},
                        create: { id: symbolId }
                    });
                    this.knownSymbols.add(symbolId);
                } finally {
                    this.pendingPromises.delete(symbolId);
                }
            })();

            // Store the promise so other requests can wait for it
            this.pendingPromises.set(symbolId, promise);
            await promise;
        }
    }
}

export const symbolManager = new SymbolManager();