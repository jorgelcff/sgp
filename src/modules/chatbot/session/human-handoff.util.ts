import { ConfigService } from "@nestjs/config";

const DEFAULT_HUMAN_HANDOFF_HOURS = 4;

export function getHumanHandoffThresholdMs(configService: ConfigService): number {
  const hours =
    configService.get<number>("HUMAN_HANDOFF_HOURS") ?? DEFAULT_HUMAN_HANDOFF_HOURS;

  return hours * 60 * 60 * 1000;
}

export function isHumanHandoffActive(
  atendimentoHumanoEm: Date | null,
  thresholdMs: number,
  now: number = Date.now(),
): boolean {
  if (!atendimentoHumanoEm) {
    return false;
  }

  return now - atendimentoHumanoEm.getTime() < thresholdMs;
}
