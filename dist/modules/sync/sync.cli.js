"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../../app.module");
const sync_service_1 = require("./application/sync.service");
async function runSync() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
        logger: ["log", "error", "warn"],
    });
    try {
        const syncService = app.get(sync_service_1.SyncService);
        await syncService.syncAll();
    }
    finally {
        await app.close();
    }
}
runSync().catch((error) => {
    console.error("Falha ao executar sync manual:", error);
    process.exit(1);
});
//# sourceMappingURL=sync.cli.js.map