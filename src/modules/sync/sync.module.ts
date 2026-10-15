import { Module } from "@nestjs/common";
import { SyncService } from "./application/sync.service";
import { SyncController } from "./sync.controller";
import { SyncCron } from "./sync.cron";
import { MkauthModule } from "../mkauth/mkauth.module";
import { BillingModule } from "../billing/billing.module";

@Module({
  imports: [MkauthModule, BillingModule],
  controllers: [SyncController],
  providers: [SyncService, SyncCron],
  exports: [SyncService],
})
export class SyncModule {}
