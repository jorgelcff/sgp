"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SyncCron_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncCron = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const sync_service_1 = require("./application/sync.service");
const billing_service_1 = require("../billing/application/billing.service");
let SyncCron = SyncCron_1 = class SyncCron {
    constructor(syncService, billingService) {
        this.syncService = syncService;
        this.billingService = billingService;
        this.logger = new common_1.Logger(SyncCron_1.name);
        this.running = false;
    }
    async handleCron() {
        if (this.running) {
            this.logger.warn("Cron anterior ainda em execucao. Ignorando.");
            return;
        }
        this.running = true;
        const startedAt = Date.now();
        const startedIso = new Date(startedAt).toISOString();
        this.logger.log(`Cron iniciado: ${startedIso}`);
        try {
            await this.syncService.syncAll();
            await this.billingService.runBilling();
            const durationMs = Date.now() - startedAt;
            this.logger.log(`Cron finalizado. Duracao=${durationMs}ms.`);
        }
        finally {
            this.running = false;
        }
    }
};
exports.SyncCron = SyncCron;
__decorate([
    (0, schedule_1.Cron)("*/20 * * * *"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SyncCron.prototype, "handleCron", null);
exports.SyncCron = SyncCron = SyncCron_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [sync_service_1.SyncService,
        billing_service_1.BillingService])
], SyncCron);
//# sourceMappingURL=sync.cron.js.map