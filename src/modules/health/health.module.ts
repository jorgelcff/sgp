import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { SgpModule } from "../sgp/sgp.module";

@Module({
  imports: [SgpModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
