import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { SyncService } from "./application/sync.service";

async function runSync(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "error", "warn"],
  });

  try {
    const syncService = app.get(SyncService);
    await syncService.syncAll();
  } finally {
    await app.close();
  }
}

runSync().catch((error) => {
  console.error("Falha ao executar sync manual:", error);
  process.exit(1);
});
