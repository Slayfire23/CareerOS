# Replay store options (Milestone 3, Phase 3)

The AI service must remember each signed request id for 10 minutes, shared across processes and restarts, and refuse requests when the store is unavailable. Each analysis needs one `SET key 1 NX EX 600`, plus the occasional readiness `PING`. The keys are random UUIDs with no personal data.

**Expected load:** at the approved caps, at most about 40 analyses a day, or about 1,200 replay commands a month. Readiness checks every 30 seconds would add about 86,000 commands a month.

Prices below are from public pages and pricing summaries found on October 30, 2026. **Confirm on the provider's own pricing page, for the chosen region, before signing up** (Phase 4, needs approval).

| Option | Model | Cost at CareerOS volume | Notes |
| --- | --- | --- | --- |
| **Upstash Redis** | Serverless, pay per command | Free tier: 256 MB, 500K commands a month, one free database. Pay-as-you-go: $0.20 per 100K commands. Expected **$0/month**, and under $1 even on pay-as-you-go | TLS by default, regions on most clouds, works from any host. No idle charge. Recommended unless Phase 4 hosting brings its own store |
| Redis Cloud (Essentials) | Fixed plan by memory | Free 30 MB plan for learning and test projects; paid plans reported to start around $5/month | Free plan is described as a test tier; paid entry is a fixed monthly cost |
| Render Key Value (Valkey 8) | Fixed instance | Free instance has no persistence (data lost on restart); paid instances persist. Current prices not confirmed | Sensible only if the AI service is hosted on Render (same network) |
| Google Cloud Memorystore for Valkey | Provisioned node | Smallest node about $0.03 an hour (about $22+ a month), billed even when idle | Overkill at this scale; only if hosting is on Google Cloud and private networking is required |
| AWS ElastiCache Serverless | Serverless, minimum charges | Not priced here | Only if hosting is on AWS |
| Single process, no store | n/a | $0 | Rejected: the guarantee depends on deployment settings that are easy to lose later |

## Recommendation

- **Production (Phase 4):** Upstash Redis in the region closest to the AI service host, with TLS. It costs about $0 at expected volume, has no idle charge, and doesn't depend on which host is chosen.
  - Revisit if Phase 4 picks a host with a built-in store on the same private network (for example Render Key Value on a paid plan).
  - If the store loses data during a provider failover, the replay window can reopen for at most the 120-second signature window. This is accepted and documented.
- **Local development and CI:** the `valkey/valkey:8` Docker image (BSD-licensed, Redis protocol compatible) on `127.0.0.1:6379`. Free, and nothing leaves the machine.
- **Unit tests:** an in-memory fake with the same interface, including a "store down" mode.
