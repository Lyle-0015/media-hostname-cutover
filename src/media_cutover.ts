import { z } from "zod";
import type { DnsClient } from "./infrai_dns.js";

export const cutoverRequestSchema = z
  .object({
    domain: z.string().min(1),
    asset: z.object({
      id: z.string().min(1),
      ingestionHost: z.string().min(1),
      processingJob: z.string().min(1),
    }),
    delivery: z.object({
      hostname: z.string().min(1),
      currentTarget: z.string().min(1),
      nextTarget: z.string().min(1),
      ttl: z.number().int().min(30).max(300).default(60),
    }),
  })
  .superRefine((request, context) => {
    if (request.delivery.currentTarget === request.delivery.nextTarget) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["delivery", "nextTarget"],
        message: "nextTarget must differ from currentTarget",
      });
    }
    if (!request.delivery.hostname.endsWith(`.${request.domain}`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["delivery", "hostname"],
        message: "hostname must belong to domain",
      });
    }
  });

export type CutoverRequest = z.infer<typeof cutoverRequestSchema>;

export type CutoverResult = {
  assetId: string;
  pipeline: {
    ingestion: string;
    processingJob: string;
    creatorDelivery: string;
  };
  applied: { target: string; ttl: number };
  rollback: CutoverRequest;
};

export async function cutOverCreatorDelivery(
  dns: DnsClient,
  request: CutoverRequest,
): Promise<CutoverResult> {
  const zone_id = await dns.getZoneId(request.domain);
  await dns.upsertCname({
    zone_id,
    name: request.delivery.hostname,
    content: request.delivery.nextTarget,
    ttl: request.delivery.ttl,
  });

  return {
    assetId: request.asset.id,
    pipeline: {
      ingestion: request.asset.ingestionHost,
      processingJob: request.asset.processingJob,
      creatorDelivery: request.delivery.hostname,
    },
    applied: {
      target: request.delivery.nextTarget,
      ttl: request.delivery.ttl,
    },
    rollback: {
      ...request,
      delivery: {
        ...request.delivery,
        currentTarget: request.delivery.nextTarget,
        nextTarget: request.delivery.currentTarget,
      },
    },
  };
}
