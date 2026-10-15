import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { MkauthModule } from "../mkauth/mkauth.module";

@Module({
  imports: [MkauthModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
