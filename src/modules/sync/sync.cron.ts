import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SyncService } from "./application/sync.service";
import { BillingService } from "../billing/application/billing.service";

@Injectable()
export class SyncCron {
  private readonly logger = new Logger(SyncCron.name);
  private running = false;

  constructor(
    private readonly syncService: SyncService,
    private readonly billingService: BillingService,
  ) {}

  @Cron("*/20 * * * *")
  async handleCron(): Promise<void> {
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
    } finally {
      this.running = false;
    }
  }
}
