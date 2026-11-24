# SoundRoot — MVP

The operating system for African music production: **beat commerce**, **studio operations** and **project delivery** in one responsive web app, built from *SoundRoot Developer Product Specification v1.0*.

## Quick start

Requires **Node 22.13+** (built and tested on Node 24). No database server, Docker or native modules needed.

```powershell
npm install
npm run dev        # seeds the demo world on first run (~90 s: it synthesizes real audio), then serves http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Seed if empty, then start the dev server and the in-process job worker |
| `npm run reset` | Wipe `data/` and reseed |
| `npm test` | Acceptance tests for every scenario in spec §15 (isolated temp DB) |
| `npm run build` / `start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |

### Demo accounts (development seed only)

Password for all: `soundroot-demo`. The sign-in page has one-click chips for each.

| Role | Email |
| --- | --- |
| Artist | `ama@soundroot.test` (also `jay@`, `kwesi@`) |
| Beatmaker | `kofi.sound@`, `accrakeys@`, `soniclab@`, `kumasikid@`, `adwoa@soundroot.test` |
| Studio owner | `efua@soundroot.test` (Accra Sound Lab), `abena@soundroot.test` (Garden City Records) |
| Engineer | `kofi.eng@soundroot.test`, `yaw@soundroot.test` (no finance access) |
| Platform admin | `admin@soundroot.test` |

All names, studios and amounts are fictional. All 14 catalog beats are original audio rendered by the built-in synthesizer (`src/server/audio/synth.ts`): Afrobeats, Amapiano log drums, Highlife Karplus–Strong guitar, Asakaa drill 808 glides, Gospel, Hiplife, Afro House and Afro Soul.

## Architecture

A **modular monolith**, as the spec recommends (§10): one Next.js app, with business logic split into modules that never import UI code.

```
src/
  app/                    Next.js App Router: pages + REST handlers under /api/v1 (thin)
  components/             Player engine, audio-reactive visuals, generative artwork, UI kit
  server/
    modules/
      identity.ts         signup/login, roles, notifications, data export
      catalog.ts          beats, immutable license versions, discovery, preview pipeline
      billing.ts          orders, checkout, signed webhooks, ledger, entitlements, refunds, payouts, license PDF
      studio.ts           availability, collision-safe bookings, CRM, staff, finance reports
      projects.ts         versions, timestamped feedback, approvals, gated delivery
      admin.ts            moderation, disputes, verification, audit
    auth.ts               scrypt passwords, DB sessions, role/tenant authorization helpers
    db.ts / schema.sql    data layer (UUIDs, minor-unit money, FKs)
    storage.ts            private object storage + HMAC-signed expiring URLs (Range support)
    queue.ts              durable DB-backed job queue + sweeps (audio processing, webhook retries, hold expiry)
    audio/                WAV codec, waveform peaks, tagged preview transcode, synthesizer
```

**Authorization is enforced in every service function** (role, studio membership and resource ownership), not only in the UI. Memberships are reloaded on every request, so revoking staff access takes effect immediately. Cross-tenant lookups return 404 so they don't reveal that a resource exists.

### How the spec's hard requirements are met

| Requirement | Implementation |
| --- | --- |
| BM-03 immutable licenses | Editing a tier inserts a new `license_versions` row. Orders snapshot the exact terms and the buyer's acceptance time. |
| BM-05 exclusive concurrency | Atomic conditional `UPDATE … WHERE hold expired` reserves the beat. Only one buyer can hold it; a sold exclusive unpublishes the beat and keeps existing leases valid. |
| ST-02 booking collisions | `BEGIN IMMEDIATE` transaction checks room **and** engineer overlap plus blackouts. Holds expire after 15 min. |
| §13 payments | Pending → processing → paid/failed/expired. Webhooks are HMAC-verified, deduplicated by event id, and checked for amount/currency. Ledger rows are unique per event, so replays are no-ops. The client redirect is never trusted. |
| PR-03/04 review & delivery | Each upload is a new immutable version. Comments store `timestamp_ms`, approval binds to a version id and is audited, and final files unlock only after approval plus a verified paid balance. |
| ST-05 finance | Revenue cards come from the ledger (cash actually collected), separate from booking value. Manual cash entries are audited, and CSV exports guard against CSV injection. |
| No double-charging | Commission applies only to platform-originated bookings (7%) and beat sales (12%). Walk-ins and the studio's own clients pay 0%. |
| Audio protection | Private storage, 2-minute signed download URLs, magic-byte validation, a quarantine scan gate, and tagged 30 s previews. |

### Sandbox payment provider

`/pay/[ref]` simulates a licensed PSP's hosted checkout (MoMo / card, **test mode**). Approving it makes the "provider" enqueue a **signed webhook**, which the worker delivers to `/api/v1/webhooks/payments` with exponential-backoff retries. To go live, swap `sandboxAuthorize` and the hosted page for your chosen provider's checkout. The webhook handler, ledger and fulfilment code stay the same.

## Going to production

The dev setup uses zero-dependency building blocks that map one-to-one onto the spec's production stack:

| Dev | Production (spec §10) |
| --- | --- |
| `node:sqlite` file | PostgreSQL. The SQL is portable; add an exclusion constraint on `bookings (room_id, tstzrange)` |
| DB-backed job queue, in-process worker | Redis + BullMQ (or SQS), with the worker as a separate container |
| Local `data/storage` + HMAC URLs | S3/R2/GCS private bucket with native presigned URLs |
| WAV-only preview transcode in TypeScript | FFmpeg worker (MP3/FLAC decode, MP3 previews, loudness) |
| Magic-byte scan gate | ClamAV / provider scanning with a quarantine bucket |
| `[email]` console log | Transactional email provider (plus SMS/WhatsApp after the pilot) |
| Sandbox PSP | Licensed provider with Ghana marketplace settlement and seller KYC |

Also needed before launch: secrets manager (`URL_SIGNING_SECRET`, `PAYMENT_WEBHOOK_SECRET`; see `.env.example`), MFA for admins, email/phone verification links, CI/CD with migration checks, error tracking, backups (RPO 24 h / RTO 4 h), and an OpenAPI document for `/api/v1`.

## Design

A night-studio aesthetic: deep ink, kente gold and lagoon teal. One shared Web Audio analyser drives the ambient light field, the hero orb's radial spectrum, the player-bar spectrum and live waveforms, so the whole app reacts to whatever is playing. Every beat gets deterministic generative cover art. Playback persists across navigation. The app is keyboard accessible (Space toggles play, ←/→ seek on focused waveforms) and respects `prefers-reduced-motion`.
