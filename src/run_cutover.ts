function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before running the example`);
  return value;
}

const domain = requiredEnvironment("CUTOVER_DOMAIN");
const hostname = requiredEnvironment("CUTOVER_HOSTNAME");
const currentTarget = requiredEnvironment("CUTOVER_CURRENT_TARGET");
const nextTarget = requiredEnvironment("CUTOVER_NEXT_TARGET");
const port = process.env.PORT ?? "3000";

const response = await fetch(`http://localhost:${port}/cutovers`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    domain,
    asset: {
      id: "launch-film-2026",
      ingestionHost: `uploads.${domain}`,
      processingJob: "transcode-launch-film-2026",
    },
    delivery: {
      hostname,
      currentTarget,
      nextTarget,
      ttl: 60,
    },
  }),
});

const body: unknown = await response.json();
console.log(JSON.stringify(body, null, 2));
if (!response.ok) {
  throw new Error(`Cutover request failed with HTTP ${response.status}`);
}
