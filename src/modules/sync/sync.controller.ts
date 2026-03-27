import { Controller, Get } from "@nestjs/common";
import { SyncService } from "./application/sync.service";

@Controller("sync")
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get("manual")
  async manualSync(): Promise<{ status: string }> {
    await this.syncService.syncAll();
    return { status: "ok" };
  }
}
