import { Controller, Get } from "@nestjs/common";
import { BillingService } from "./application/billing.service";

@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("run")
  async runBilling(): Promise<{ status: string }> {
    await this.billingService.runBilling();
    return { status: "ok" };
  }
}
