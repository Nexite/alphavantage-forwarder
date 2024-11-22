import { dbClient } from "./db";

class SymbolManager {
    private knownSymbols = new Set<string>();

    async ensureSymbol(symbolId: string) {
        symbolId = symbolId.toUpperCase();
        if (!this.knownSymbols.has(symbolId)) {
            await dbClient.symbol.upsert({
                where: { id: symbolId },
                update: {},
                create: { id: symbolId }
            });
            this.knownSymbols.add(symbolId);
        }
    }
}

export const symbolManager = new SymbolManager();