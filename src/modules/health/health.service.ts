import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { MkauthService } from "../mkauth/infrastructure/mkauth.service";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mkauthService: MkauthService,
  ) {}

  async check(): Promise<{ sqlite: boolean; mkauth: boolean }> {
    const sqlite = await this.checkDatabase();
    const mkauth = await this.mkauthService.ping();

    return { sqlite, mkauth };
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
