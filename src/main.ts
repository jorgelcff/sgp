import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express from "express";
import { resolve } from "node:path";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "error", "warn"],
  });

  app.use("/assets", express.static(resolve("./assets")));

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.log(`API iniciada na porta ${port}.`);
}

bootstrap().catch((error) => {
  console.error("Falha ao iniciar a aplicação:", error);
  process.exit(1);
});
