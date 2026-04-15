"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const express_1 = __importDefault(require("express"));
const node_path_1 = require("node:path");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ["log", "error", "warn"],
    });
    app.use("/assets", express_1.default.static((0, node_path_1.resolve)("./assets")));
    app.enableShutdownHooks();
    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port);
    const logger = new common_1.Logger("Bootstrap");
    logger.log(`API iniciada na porta ${port}.`);
}
bootstrap().catch((error) => {
    console.error("Falha ao iniciar a aplicação:", error);
    process.exit(1);
});
//# sourceMappingURL=main.js.map