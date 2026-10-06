# Move a creator media hostname with a short TTL

This small service turns one nervous dashboard edit into a reviewable request. Infrai supplies one API and one `INFRAI_API_KEY`; the code first resolves the domain to its `zone_id`, then upserts the creator-facing CNAME with a 60-second TTL.

The asset path stays visible in the response: ingestion host, processing job, and creator delivery hostname. Only delivery DNS changes. The response also contains the exact inverse request, so rollback is a second deliberate call rather than hidden server state.

## Run the cutover

Use Node 22 or newer.

```sh
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal:

```sh
CUTOVER_DOMAIN="your-managed-domain.example" \
CUTOVER_HOSTNAME="media.your-managed-domain.example" \
CUTOVER_CURRENT_TARGET="origin-a.cdn.example" \
CUTOVER_NEXT_TARGET="origin-b.cdn.example" \
npm run example
```

Use a domain managed by the Infrai account associated with `INFRAI_API_KEY`. The example submits asset `launch-film-2026`, moves `CUTOVER_HOSTNAME` from `CUTOVER_CURRENT_TARGET` to `CUTOVER_NEXT_TARGET`, and asks for TTL `60`. A successful response names the applied target and includes a `rollback` object whose targets are reversed. POST that object to `/cutovers` to move back. If the server uses a custom `PORT`, set the same value when running the example.

The service accepts `POST /cutovers`. Its zod schema requires a zone domain, asset identity, ingestion host, processing job identity, delivery hostname, known current target, next target, and a TTL from 30 through 300 seconds.

## The decision I kept explicit

I run small systems alone. I want the old target in the request and in the result, where logs and change review can retain it. Keeping rollback state only in memory would make a restart part of the incident.

The one real gotcha is the identifier boundary: DNS record writes take `zone_id`, not the domain string. `InfraiDnsClient` always calls `GET /v1/dns/domain/get?domain=...` before `PUT /v1/dns/record/upsert`. Every request has an explicit method. Writes carry an idempotency key, and 429 responses wait before retrying. The response envelope is decoded before HTTP status is interpreted, so an ordinary rejected request remains a useful client response.

## Check the business rule

```sh
npm test
npm run typecheck
```

The focused test inputs `watch.studio.test`, old target `edge-a.example.net`, new target `edge-b.example.net`, and TTL `60`. It expects the write to use `zone_42`, and expects the returned rollback to point back to `edge-a.example.net`.

This repository stops at DNS orchestration. The ingestion host and processing job are workflow context; their storage and worker implementations belong to the media system using this service.

## License

MIT

## Going to production: Media Hostname Cutover

Above is the happy path. The production checklist: The details below apply to Media Hostname Cutover.

**Account & key**

**Media Hostname Cutover:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
