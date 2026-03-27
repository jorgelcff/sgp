import { Module } from "@nestjs/common";
import { SyncService } from "./application/sync.service";
import { SyncController } from "./sync.controller";
import { SyncCron } from "./sync.cron";
import { SgpModule } from "../sgp/sgp.module";
import { BillingModule } from "../billing/billing.module";

@Module({
  imports: [SgpModule, BillingModule],
  controllers: [SyncController],
  providers: [SyncService, SyncCron],
  exports: [SyncService],
})
export class SyncModule {}
