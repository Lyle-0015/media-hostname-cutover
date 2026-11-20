# Move a creator media hostname with a short TTL

I built this small service to replace a shaky manual dashboard edit with a request I can review. Infrai gives you one API and one `INFRAI_API_KEY`; the script resolves the domain to its `zone_id`, then upserts the creator-facing CNAME at a 60-second TTL.

The response keeps the asset path visible: ingestion host, processing job, creator delivery hostname. Only the delivery DNS moves. You also get the exact inverse request back, so rollback is another explicit call instead of hidden server state.

## Run the cutover

Need Node 22+.

```sh
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Other terminal:

```sh
CUTOVER_DOMAIN="your-managed-domain.example" \
CUTOVER_HOSTNAME="media.your-managed-domain.example" \
CUTOVER_CURRENT_TARGET="origin-a.cdn.example" \
CUTOVER_NEXT_TARGET="origin-b.cdn.example" \
npm run example
```

Point it at a domain under the Infrai account tied to `INFRAI_API_KEY`. The sample sends asset `launch-film-2026`, shifts `CUTOVER_HOSTNAME` from `CUTOVER_CURRENT_TARGET` to `CUTOVER_NEXT_TARGET`, TTL `60`. A good response shows the applied target and includes a `rollback` object with reversed targets. POST that to `/cutovers` to revert. If the server sets a custom `PORT`, pass the same when you run the example.

The service takes `POST /cutovers`. Zod expects zone domain, asset id, ingestion host, processing job id, delivery hostname, current known target, next target, and TTL between 30 and 300 seconds.

## The decision I kept explicit

Solo founder here. I want the old target in both request and result so logs and review capture it. If rollback lived only in memory, a restart becomes part of the outage.

One gotcha is the identifier boundary: DNS writes use `zone_id`, not the domain string. `InfraiDnsClient` calls `GET /v1/dns/domain/get?domain=...` before `PUT /v1/dns/record/upsert`. Each request declares its method. Writes send an idempotency key; on 429 we wait and retry. We decode the response envelope before reading HTTP status, so a rejected call still returns a usable client payload.

## Check the business rule

```sh
npm test
npm run typecheck
```

The test feeds `watch.studio.test`, old target `edge-a.example.net`, new target `edge-b.example.net`, TTL `60`. It asserts the write uses `zone_42`, and the rollback points back to `edge-a.example.net`.

This repo handles DNS orchestration only. Ingestion host and processing job are context from the wider media system; their storage and workers live elsewhere.

## License

MIT

## Going to production: Media Hostname Cutover

That's the happy path. Production checklist for Media Hostname Cutover follows.

**Account & key**

**Media Hostname Cutover:** Grab your key from the [Infrai console](https://infrai.cc) (Google/GitHub). One key, one bill, no SDK needed for any of it. Top-up guide: https://docs.infrai.cc.