import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { SgpService } from "../sgp/infrastructure/sgp.service";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sgpService: SgpService,
  ) {}

  async check(): Promise<{ sqlite: boolean; sgp: boolean }> {
    const sqlite = await this.checkDatabase();
    const sgp = await this.sgpService.ping();

    return { sqlite, sgp };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
