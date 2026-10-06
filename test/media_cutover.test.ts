import assert from "node:assert/strict";
import test from "node:test";
import type { DnsClient } from "../src/infrai_dns.js";
import {
  cutOverCreatorDelivery,
  cutoverRequestSchema,
} from "../src/media_cutover.js";

test("cuts creator delivery to a short TTL and returns the inverse change", async () => {
  const writes: Parameters<DnsClient["upsertCname"]>[0][] = [];
  const dns: DnsClient = {
    async getZoneId(domain) {
      assert.equal(domain, "studio.test");
      return "zone_42";
    },
    async upsertCname(input) {
      writes.push(input);
    },
  };
  const request = cutoverRequestSchema.parse({
    domain: "studio.test",
    asset: {
      id: "episode-17",
      ingestionHost: "ingest.studio.test",
      processingJob: "encode-episode-17",
    },
    delivery: {
      hostname: "watch.studio.test",
      currentTarget: "edge-a.example.net",
      nextTarget: "edge-b.example.net",
      ttl: 60,
    },
  });

  const result = await cutOverCreatorDelivery(dns, request);

  assert.deepEqual(writes, [
    {
      zone_id: "zone_42",
      name: "watch.studio.test",
      content: "edge-b.example.net",
      ttl: 60,
    },
  ]);
  assert.equal(result.pipeline.processingJob, "encode-episode-17");
  assert.equal(result.rollback.delivery.currentTarget, "edge-b.example.net");
  assert.equal(result.rollback.delivery.nextTarget, "edge-a.example.net");
});
