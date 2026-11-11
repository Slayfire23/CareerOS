# Remote access plan: Vercel to the laptop's AI service (proposal for approval)

Date: October 31, 2026. **Plan only.** No tunnel, public endpoint, DNS record, or production setting has been created or changed.

## Requirement (as decided)

- CareerOS stays on Vercel. The AI service (FastAPI) and Ollama run on your laptop.
- Your brother uses the Vercel site from your parents' house, with his own account and connection. He never connects to the laptop himself.
- The connection that matters is **Vercel's serverless functions → the laptop's AI service**, and it must be secure.
- The laptop is on during the day and off at night. The AI services should start with Windows.
- When the laptop is offline, CareerOS works normally except for local AI analysis.

## Architecture (both options)

```
Brother's browser ──HTTPS──▶ Vercel (Next.js: auth, owner-scoped data, limits, validation)
                                   │ signed request (HMAC, timestamp, request id)
                                   ▼
                        [ secure connection: option A or B ]
                                   ▼
Laptop: FastAPI on 127.0.0.1:8010 ──▶ Ollama on 127.0.0.1:11434 (never exposed)
```

What stays the same:
- Next.js remains the only authorization boundary.
- The AI service still verifies the HMAC signature, refuses replays through its shared store, and validates every finding strictly. Next.js validates again.
- Ollama and FastAPI keep listening on localhost only. Nothing on the laptop opens an inbound port.

## Option A: Cloudflare Tunnel with Cloudflare Access (recommended)

- **How it works:** `cloudflared` runs on the laptop as a Windows service and keeps an *outbound-only* connection to Cloudflare. A hostname on your Cloudflare-managed domain (for example `ai.<your-domain>`) routes through the tunnel to `http://127.0.0.1:8010`. A Cloudflare Access policy lets requests through only if they carry a valid **service token** (`CF-Access-Client-Id` and `CF-Access-Client-Secret`). Vercel holds that token as server-side environment variables.
- **Security:**
  - Requests without the token are stopped at Cloudflare's edge before they reach the laptop. With HMAC this makes two independent locks, plus no inbound ports.
  - The token can be rotated or revoked in the Cloudflare dashboard.
  - **Tradeoff:** Cloudflare terminates TLS at its edge, so the request content (minimized profile evidence) is readable inside Cloudflare's network. The consent and privacy wording must say that data passes through Cloudflare.
- **Reliability:**
  - When the laptop is off, Cloudflare answers with an error quickly (HTTP 530 or 502), and Next.js shows "local AI unavailable".
  - `cloudflared` reconnects on its own after sleep or network changes.
  - Runs well as a Windows service.
- **Setup complexity:** moderate. It needs a domain whose DNS is on Cloudflare, `cloudflared` installed as a service, a named tunnel, an Access application with a service-token policy, and two Vercel environment variables. Roughly an hour.
- **Cost:** tunnels and Access for teams under 50 users are free on Cloudflare's Zero Trust Free plan. You'll need a domain on Cloudflare: free if you already have one, otherwise about $10–15 a year.

## Option B: Tailscale

Tailscale builds a private, end-to-end-encrypted (WireGuard) network between *devices*. That's ideal for people connecting their own devices, but Vercel functions aren't devices:
- **B1: Tailscale Funnel.** It publishes a laptop port as a public HTTPS URL on `*.ts.net`. TLS terminates on the laptop, so Tailscale cannot read the traffic. But the endpoint is open to the internet: only our HMAC protects it, with no edge filter. It's free.
- **B2: Join Vercel functions to the tailnet.** This would need an ephemeral auth key and a userspace Tailscale client inside each short-lived function. It isn't a supported pattern for Vercel's Node runtime; it adds cold-start delay and an auth key stored on Vercel. It isn't practical.
- **Security:** B1 is end-to-end encrypted, with no third party reading content, but has no access gate in front of the laptop. HMAC and replay protection are strong, but they are a single layer facing the internet.
- **Reliability:** good. The laptop's Tailscale reconnects automatically; when it's offline, Funnel requests fail.
- **Setup complexity:** low for B1 (install Tailscale, enable Funnel, set the URL in Vercel). No domain needed.
- **Cost:** the free Personal plan is intended for **non-commercial** use. Fine for this family project; it would need a paid plan if CareerOS became commercial.

## Comparison

| | Cloudflare Tunnel + Access | Tailscale Funnel |
| --- | --- | --- |
| Inbound ports on the laptop | None | None |
| Gate before traffic reaches the laptop | Yes (service token at the edge) | No (public URL; HMAC only) |
| Who can read the traffic | Cloudflare (TLS ends at its edge) | Only the laptop (TLS ends there) |
| Works from Vercel serverless | Yes: plain HTTPS plus two headers | B1 yes (public URL); B2 not practical |
| Offline behavior | Fast error from Cloudflare | Connection failure |
| Starts with Windows | `cloudflared` Windows service | Tailscale service |
| Setup | Moderate; needs a domain on Cloudflare | Easy; no domain |
| Cost | $0 (plus a domain if you have none) | $0 for non-commercial use |

**Recommendation: Cloudflare Tunnel + Access.** It's the only option that stops unauthenticated traffic before it reaches your laptop, and it works with Vercel in a standard way. The cost is that Cloudflare can read the traffic in transit; the consent text would say so. If you'd rather no third party could read the data, Tailscale Funnel is the alternative, accepting a public endpoint protected by HMAC alone.

## Work this would include (after your approval)

1. **Laptop services that start with Windows:**
   - Ollama (its app already starts at sign-in; switch it to start without a sign-in if you need that)
   - the AI service as a Windows service (for example via NSSM or Task Scheduler) on 127.0.0.1:8010, with `AI_ENVIRONMENT=production`
   - `cloudflared` as a Windows service
2. **Replay store for the laptop:** the AI service requires a shared store in production. Options: Upstash Redis on its free tier (no local process; needs the internet, which the tunnel needs anyway), or Valkey in Docker, which needs Docker Desktop running all day. Recommendation: Upstash.
3. **Next.js:**
   - **New settings:** `AI_SERVICE_URL` set to the tunnel hostname, plus the two Access token variables as server-only settings, sent only to the AI service.
   - **Offline check:** a cached readiness check (for example every 60 seconds) so the page can show "Local AI is offline" before anyone tries a run.
   - **Timeouts:** the per-provider timeout must fit Vercel's maximum function duration on your plan. This must be checked against the evaluation's measured latency.
4. **Consent and privacy:** bump the version and update the wording so it names your computer as where local AI runs (and Cloudflare, if chosen) and says what passes through.
5. **Production migrations for the analysis tables:** these need your separate approval.
6. **Monitoring:** a simple way to see whether the laptop service is online, plus log retention without content.

Nothing above will be configured until you approve it.
