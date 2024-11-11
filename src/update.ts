import { updateOptionsChainForAllSymbols } from "./options";
import { updateAllStockPrices } from "./stock";
import { scheduleEOD } from "./utils";

export const updateAllThings = async () => {
    await updateAllStockPrices();
    await updateOptionsChainForAllSymbols();
}

export const queueEODTasks = () => {
    scheduleEOD(async () => {
        await updateAllThings();
    });
}