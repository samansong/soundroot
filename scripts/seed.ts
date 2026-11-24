// Seeds a fictional Ghana-first demo world. All names, studios and amounts are fictional.
// Usage: npm run seed            (fresh DB; renders original beats with the built-in synthesizer)
//        node scripts/seed.ts --if-empty
import fs from "node:fs";
import path from "node:path";
import { all, insert, now, one, run, uuid, db } from "../src/server/db.ts";
import { loadActor, newUser, type Role } from "../src/server/auth.ts";
import { renderBeat, type Genre } from "../src/server/audio/synth.ts";
import { encodeWav } from "../src/server/audio/wav.ts";
import { attachBeatAudio, createBeat, ensureProducerProfile, setBeatStatus, setLicenses } from "../src/server/modules/catalog.ts";
import { createBeatOrder, handlePaymentWebhook, signPayload, startCheckout } from "../src/server/modules/billing.ts";
import { addComment, addVersion, approveVersion, createProject, finalize } from "../src/server/modules/projects.ts";
import { createManualBooking } from "../src/server/modules/studio.ts";
import { tick } from "../src/server/queue.ts";
import { zonedToUtc, localDate } from "../src/server/tz.ts";

// Demo credentials (development only). Every demo account uses this password.
export const DEMO_PASSWORD = "soundroot-demo";

const dbFile = path.resolve(process.cwd(), process.env.DATABASE_PATH || "data/soundroot.db");
if (process.argv.includes("--if-empty") && fs.existsSync(dbFile) && one("SELECT 1 FROM users LIMIT 1")) {
  console.log("Database already seeded — skipping.");
  process.exit(0);
}
if (one("SELECT 1 FROM users LIMIT 1")) {
  console.error("Database not empty. Run `npm run reset` to wipe and reseed.");
  process.exit(1);
}

const t0 = Date.now();
const user = (email: string, name: string, roles: Role[], phone?: string) => newUser({ email, name, roles, password: DEMO_PASSWORD, phone });

// ---------- People
const admin = user("admin@soundroot.test", "Platform Admin", ["admin"]);
const ama = user("ama@soundroot.test", "Ama Kumi", ["artist"], "+233 24 000 0001");
const jay = user("jay@soundroot.test", "Jay Mensah", ["artist"]);
const kwesi = user("kwesi@soundroot.test", "Kwesi Arthur-Boateng", ["artist"]);
const efua = user("efua@soundroot.test", "Efua Owusu", ["studio_owner", "artist"]);
const kofiEng = user("kofi.eng@soundroot.test", "Kofi Mensah", ["engineer"]);
const yaw = user("yaw@soundroot.test", "Yaw Darko", ["engineer"]);
const abena = user("abena@soundroot.test", "Abena Sarpong", ["studio_owner"]);

const producers: { id: string; name: string; city: string; bio: string; hue: number }[] = [
  { id: user("kofi.sound@soundroot.test", "Kofi Sound", ["beatmaker"]), name: "Kofi Sound", city: "Accra", bio: "Afrobeats & afro-soul. Warm keys, live percussion, big low end.", hue: 28 },
  { id: user("accrakeys@soundroot.test", "Accra Keys", ["beatmaker"]), name: "Accra Keys", city: "Accra", bio: "Amapiano with a Ghanaian accent — log drums, jazz chords, late nights.", hue: 268 },
  { id: user("soniclab@soundroot.test", "Sonic Lab", ["beatmaker"]), name: "Sonic Lab", city: "Tema", bio: "Gospel and soul productions built around real piano voicings.", hue: 168 },
  { id: user("kumasikid@soundroot.test", "Kumasi Kid", ["beatmaker"]), name: "Kumasi Kid", city: "Kumasi", bio: "Asakaa drill from the Garden City. Sliding 808s only.", hue: 350 },
  { id: user("adwoa@soundroot.test", "Adwoa Waves", ["beatmaker"]), name: "Adwoa Waves", city: "Cape Coast", bio: "Highlife guitars meet afro-house grooves. Palm-wine for the club.", hue: 45 },
];
for (const p of producers) {
  const actor = loadActor(p.id)!;
  ensureProducerProfile(actor, p.name);
  run("UPDATE producer_profiles SET city=?, bio=?, hue=?, payout_verified=1 WHERE user_id=?", p.city, p.bio, p.hue, p.id);
}

// ---------- Beats (rendered from scratch — original audio)
const beats: { p: number; title: string; genre: Genre; bpm: number; key: string; mood: string; hue: number; free?: boolean; status?: "draft" | "exclusive_sold"; prices: [number, number, number, number] }[] = [
  { p: 0, title: "Golden Coast", genre: "Afrobeats", bpm: 102, key: "A minor", mood: "Sunny", hue: 28, free: true, prices: [120, 250, 600, 3500] },
  { p: 1, title: "Night Drive", genre: "Amapiano", bpm: 112, key: "F minor", mood: "Late night", hue: 268, prices: [150, 300, 700, 4000] },
  { p: 2, title: "Higher Ground", genre: "Gospel", bpm: 94, key: "Eb major", mood: "Uplifting", hue: 168, prices: [100, 220, 500, 3000] },
  { p: 4, title: "Palm Wine Sunset", genre: "Highlife", bpm: 124, key: "G major", mood: "Joyful", hue: 45, free: true, prices: [120, 260, 600, 3200] },
  { p: 3, title: "Kejetia Run", genre: "Asakaa Drill", bpm: 142, key: "C# minor", mood: "Dark", hue: 350, prices: [180, 350, 800, 4500] },
  { p: 0, title: "Osu Nights", genre: "Hiplife", bpm: 92, key: "D minor", mood: "Nostalgic", hue: 210, prices: [110, 240, 550, 3000] },
  { p: 4, title: "Volta Rising", genre: "Afro House", bpm: 122, key: "E minor", mood: "Hypnotic", hue: 190, prices: [150, 300, 650, 3800] },
  { p: 2, title: "Harmattan Haze", genre: "Afro Soul", bpm: 88, key: "Bb major", mood: "Mellow", hue: 18, free: true, prices: [100, 200, 450, 2800] },
  { p: 0, title: "Labadi Breeze", genre: "Afrobeats", bpm: 106, key: "C minor", mood: "Romantic", hue: 330, prices: [130, 260, 600, 3500] },
  { p: 1, title: "Log Drum Theory", genre: "Amapiano", bpm: 113, key: "G minor", mood: "Energetic", hue: 290, prices: [160, 320, 750, 4200] },
  { p: 3, title: "Garden City Smoke", genre: "Asakaa Drill", bpm: 140, key: "F# minor", mood: "Aggressive", hue: 5, prices: [170, 340, 780, 4400] },
  { p: 1, title: "Jamestown Lights", genre: "Afro Soul", bpm: 96, key: "F major", mood: "Dreamy", hue: 240, free: true, prices: [120, 240, 520, 3000] },
  { p: 0, title: "Ocean Echo", genre: "Afrobeats", bpm: 100, key: "E minor", mood: "Chill", hue: 200, status: "draft", prices: [100, 220, 500, 3000] },
  { p: 1, title: "After Hours", genre: "Amapiano", bpm: 114, key: "D minor", mood: "Late night", hue: 300, status: "exclusive_sold", prices: [200, 380, 800, 5000] },
];

const STORED = (name: string, data: Uint8Array) => ({ name, data });
function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  // Minimal STORED zip writer (no compression) for demo trackout packs.
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (d: Uint8Array) => { let c = 0xffffffff; for (const b of d) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parts: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name); const c = crc(f.data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(c, 14); h.writeUInt32LE(f.data.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(name.length, 26);
    parts.push(h, name, Buffer.from(f.data));
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(c, 16); cd.writeUInt32LE(f.data.length, 20); cd.writeUInt32LE(f.data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + f.data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cdBuf, end]));
}

const beatIds: string[] = [];
for (const [i, b] of beats.entries()) {
  const owner = loadActor(producers[b.p].id)!;
  const { id } = createBeat(owner, { title: b.title, genre: b.genre, bpm: b.bpm, key: b.key, mood: b.mood, description: `${b.mood} ${b.genre.toLowerCase()} instrumental in ${b.key} at ${b.bpm} BPM. Produced by ${producers[b.p].name}.` });
  run("UPDATE beats SET hue=?, art_seed=? WHERE id=?", b.hue, 1000 + i * 7919, id);
  process.stdout.write(`  rendering ${b.title.padEnd(20)} (${b.genre})… `);
  const pcm = renderBeat({ genre: b.genre, bpm: b.bpm, key: b.key, seed: 1000 + i * 7919, seconds: 44 });
  const wav = encodeWav(pcm);
  attachBeatAudio(owner, id, "master", { name: `${b.title.replace(/\s+/g, "_")}.wav`, type: "audio/wav", data: wav });
  attachBeatAudio(owner, id, "stems", { name: `${b.title.replace(/\s+/g, "_")}_trackouts.zip`, type: "application/zip", data: zip([STORED("README.txt", new TextEncoder().encode(`${b.title} — trackout pack (demo).\nIn production this archive holds the individual stems.`)), STORED("full_mix.wav", wav)]) });
  setLicenses(owner, id, [
    { tier: "free", enabled: !!b.free, price: 0 },
    { tier: "basic", enabled: true, price: b.prices[0] },
    { tier: "premium", enabled: true, price: b.prices[1] },
    { tier: "unlimited", enabled: true, price: b.prices[2] },
    { tier: "exclusive", enabled: true, price: b.prices[3] },
  ]);
  while (one("SELECT 1 FROM jobs WHERE status='queued'")) await tick();
  if (b.status !== "draft") {
    setBeatStatus(owner, id, "publish", true);
    run("UPDATE beats SET published_at=?, plays=? WHERE id=?", new Date(Date.now() - (beats.length - i) * 86400_000 * 2.3).toISOString(), Math.floor(80 + ((i * 397) % 900)), id);
  }
  beatIds.push(id);
  console.log("ok");
}

// ---------- Beat sales through the real checkout + signed webhook path
async function buy(buyer: string, beatIdx: number, tier: string) {
  const actor = loadActor(buyer)!;
  const lic = one("SELECT id FROM license_versions WHERE beat_id=? AND tier=? AND is_current=1", beatIds[beatIdx], tier)!;
  const { orderId, free } = createBeatOrder(actor, { licenseVersionId: lic.id, acceptTerms: true });
  if (free) return orderId;
  const { providerRef } = startCheckout(actor, { orderId, idempotencyKey: uuid(), method: "momo" });
  const p = one("SELECT amount_minor, currency FROM payments WHERE provider_ref=?", providerRef)!;
  const body = JSON.stringify({ id: `evt_seed_${uuid()}`, type: "charge.succeeded", created: 0, data: { reference: providerRef, amount: p.amount_minor, currency: p.currency, channel: "momo", fee: Math.round(p.amount_minor * 0.0195) } });
  handlePaymentWebhook(body, signPayload(body));
  return orderId;
}
await buy(ama, 0, "premium");
await buy(jay, 0, "basic");
await buy(kwesi, 1, "unlimited");
await buy(jay, 4, "basic");
await buy(kwesi, 2, "premium");
await buy(ama, 7, "free");
// "After Hours" was sold exclusively (publish first, then buy the exclusive).
{
  const owner = loadActor(producers[1].id)!;
  const idx = beats.findIndex((b) => b.title === "After Hours");
  setBeatStatus(owner, beatIds[idx], "publish", true);
  await buy(kwesi, idx, "exclusive");
}

// ---------- Studios
function studio(owner: string, s: { name: string; slug: string; tagline: string; description: string; city: string; address: string; hue: number; deposit: number }) {
  const id = uuid();
  insert("studios", { id, owner_user_id: owner, name: s.name, slug: s.slug, tagline: s.tagline, description: s.description, city: s.city, address: s.address, timezone: "Africa/Accra", open_hour: 9, close_hour: 22, deposit_pct: s.deposit, cancellation_policy: "Free cancellation up to 24 hours before your session. Within 24 hours the deposit is non-refundable; reschedules are free once per booking.", hue: s.hue, created_at: now() });
  insert("memberships", { id: uuid(), studio_id: id, user_id: owner, role: "owner", can_view_finance: 1, created_at: now() });
  return id;
}
const accra = studio(efua, { name: "Accra Sound Lab", slug: "accra-sound-lab", tagline: "Recording · Mixing · Mastering in East Legon", description: "A treated live room, an isolated vocal booth and two in-house engineers who've worked on highlife, gospel and afrobeats records. Bring your references — we'll bring the vibe.", city: "Accra", address: "East Legon, Accra", hue: 168, deposit: 30 });
const kumasi = studio(abena, { name: "Garden City Records", slug: "garden-city-records", tagline: "Drill & hiplife HQ in Kumasi", description: "Where the Asakaa sound gets recorded. Fast turnarounds, loud 808s, honest feedback.", city: "Kumasi", address: "Adum, Kumasi", hue: 350, deposit: 40 });
const roomA = uuid(), roomB = uuid();
insert("rooms", { id: roomA, studio_id: accra, name: "Studio A — Live Room", capacity: 8, description: "Live room with console, drum kit and keys" });
insert("rooms", { id: roomB, studio_id: accra, name: "Booth B — Vocals", capacity: 3, description: "Isolated vocal booth" });
const svc = (studioId: string, name: string, dur: number, ghs: number, desc: string) => { const id = uuid(); insert("services", { id, studio_id: studioId, name, duration_min: dur, rate_minor: ghs * 100, description: desc }); return id; };
const svcRec = svc(accra, "Recording session", 120, 400, "2 hours with an engineer, rough mix bounce included");
const svcMix = svc(accra, "Mixing session", 180, 600, "Per song, two revision rounds");
const svcVox = svc(accra, "Vocal session", 60, 200, "1 hour in Booth B, comped takes");
svc(accra, "Mastering", 60, 250, "Streaming-ready master + loudness report");
const kRoom = uuid();
insert("rooms", { id: kRoom, studio_id: kumasi, name: "The Pit", capacity: 5 });
svc(kumasi, "Drill session", 120, 350, "Recording with 808-tuned monitoring");
svc(kumasi, "Mix & master", 180, 700, "Full song, one revision");
insert("memberships", { id: uuid(), studio_id: accra, user_id: kofiEng, role: "engineer", can_view_finance: 0, created_at: now() });
insert("memberships", { id: uuid(), studio_id: accra, user_id: yaw, role: "engineer", can_view_finance: 0, created_at: now() });
insert("memberships", { id: uuid(), studio_id: kumasi, user_id: yaw, role: "engineer", can_view_finance: 0, created_at: now() });

// Clients + bookings (today and past week)
const owner = loadActor(efua)!;
const client = (name: string, userId: string | null, email?: string, phone?: string, notes = "") => { const id = uuid(); insert("clients", { id, studio_id: accra, user_id: userId, name, email: email ?? null, phone: phone ?? null, private_notes: notes, created_at: now() }); return id; };
const cAma = client("Ama K.", ama, "ama@soundroot.test", "+233 24 000 0001", "Prefers SM7B for spoken parts, U87 for singing. Usually brings own snacks 🙂");
const cJay = client("Jay Mensah", jay, "jay@soundroot.test", undefined, "Owes GHS 200 from March. Polite reminder before next session.");
const cKojo = client("Kojo B.", null, undefined, "+233 20 555 0199");
const cAkos = client("Akosua Frimpong", null, "akosua@example.com");
const tz = "Africa/Accra";
const today = localDate(new Date(), tz);
const at = (dayOffset: number, h: number, m = 0) => zonedToUtc(localDate(new Date(Date.now() + dayOffset * 86400_000), tz), h, m, tz).toISOString();
const manual = (startsAt: string, serviceId: string, roomId: string, clientId: string, engineer: string | null, paid: number) => {
  // Seed bypasses "is this in the past" checks by inserting through the manual (staff) path.
  return createManualBooking(owner, { studioId: accra, serviceId, roomId, engineerId: engineer, startsAt, clientId, paidMajor: paid, notes: "" }).bookingId;
};
const hourNow = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
// Upcoming sessions: today if the slot is still ahead, otherwise tomorrow.
const slot = (h: number, m = 0) => (hourNow < h ? at(0, h, m) : at(1, h, m));
manual(slot(10), svcRec, roomA, cAma, kofiEng, 400);
manual(slot(12, 30), svcMix, roomA, cJay, kofiEng, 0); // deposit/balance due
manual(slot(16), svcVox, roomB, cKojo, yaw, 200);
manual(at(2, 11), svcRec, roomA, cAkos, yaw, 120);
// Past week: completed sessions with collected payments → revenue chart
const pastRevenue = [[6, 400], [5, 800], [4, 600], [3, 1200], [2, 650], [1, 1400]] as const;
for (const [d, ghs] of pastRevenue) {
  const id = uuid();
  const clientId = [cAma, cKojo, cAkos, cJay][d % 4];
  insert("bookings", { id, studio_id: accra, room_id: d % 2 ? roomA : roomB, service_id: d % 2 ? svcRec : svcVox, engineer_user_id: kofiEng, client_id: clientId, starts_at: at(-d, 13), ends_at: at(-d, 15), status: "completed", quoted_minor: ghs * 100, deposit_minor: 0, paid_minor: ghs * 100, source: "manual", created_at: at(-d - 2, 9) });
  const orderId = uuid();
  insert("orders", { id: orderId, reference: `CASH-SEED${d}`, buyer_id: efua, kind: "booking", status: "paid", total_minor: ghs * 100, currency: "GHS", booking_id: id, created_at: at(-d, 15), paid_at: at(-d, 15) });
  for (const t of ["collected", "seller_payable"]) insert("ledger_entries", { id: uuid(), order_id: orderId, event_key: `cash:${orderId}`, account: `studio:${accra}`, entry_type: t, amount_minor: ghs * 100, currency: "GHS", created_at: at(-d, 15, 5) });
}
insert("expenses", { id: uuid(), studio_id: accra, description: "Generator diesel", amount_minor: 35000, spent_on: localDate(new Date(Date.now() - 3 * 86400_000), tz), created_by: efua, created_at: now() });
insert("expenses", { id: uuid(), studio_id: accra, description: "Mic cable replacements", amount_minor: 12000, spent_on: today, created_by: efua, created_at: now() });

// ---------- Projects
console.log("  rendering project mixes…");
const p1 = createProject(owner, { studioId: accra, title: "Higher Ground", clientId: cAma, engineerId: kofiEng, deliverables: "Mixed & mastered WAV, instrumental, acapella, stems", revisionAllowance: 3, dueDate: localDate(new Date(Date.now() + 9 * 86400_000), tz), priceMajor: 1500 }).id;
run("UPDATE projects SET paid_minor=50000, hue=168 WHERE id=?", p1);
const eng = loadActor(kofiEng)!;
const amaA = loadActor(ama)!;
const mix = (seed: number, seconds: number, genre: Genre = "Gospel", bpm = 94, key = "Eb major") => encodeWav(renderBeat({ genre, bpm, key, seed, seconds }));
const v1 = addVersion(eng, p1, { name: "Mix_v1.wav", type: "audio/wav", data: mix(4242, 96) }, { label: "Mix v1", notes: "First balance. Vocals sitting a bit back on purpose — tell me what you think." });
addComment(amaA, v1.id, { body: "Bring the lead vocal forward here.", timestampMs: 42_000, kind: "revision_request" });
addComment(amaA, v1.id, { body: "Love the piano voicings in the intro!", timestampMs: 6_500 });
const v2 = addVersion(eng, p1, { name: "Mix_v2.wav", type: "audio/wav", data: mix(4243, 96) }, { label: "Mix v2", notes: "Lead up 1.5 dB from 0:38, de-essed, wider pads in the chorus." });
addComment(eng, v2.id, { body: "Updated in the latest mix — lead is up 1.5 dB here.", timestampMs: 42_000 });
addComment(eng, v2.id, { body: "Pads widened from here into the chorus.", timestampMs: 78_000 });

const p2 = createProject(owner, { studioId: accra, title: "Sika (Gold)", clientId: cAma, engineerId: yaw, deliverables: "Master WAV + instrumental", revisionAllowance: 2, dueDate: localDate(new Date(Date.now() - 2 * 86400_000), tz), priceMajor: 800 }).id;
run("UPDATE projects SET hue=45 WHERE id=?", p2);
const yawA = loadActor(yaw)!;
const s1 = addVersion(yawA, p2, { name: "Sika_master_v1.wav", type: "audio/wav", data: mix(777, 70, "Highlife", 124, "G major") }, { label: "Master v1" });
approveVersion(amaA, s1.id);
finalize(yawA, p2, s1.id);

const p3 = createProject(owner, { studioId: accra, title: "Midnight in Osu (EP)", clientId: cJay, engineerId: kofiEng, deliverables: "4 songs mixed & mastered", revisionAllowance: 2, dueDate: localDate(new Date(Date.now() + 20 * 86400_000), tz), priceMajor: 4200 }).id;
run("UPDATE projects SET hue=268 WHERE id=?", p3);
addVersion(eng, p3, { name: "Track1_rough.wav", type: "audio/wav", data: mix(31337, 60, "Amapiano", 112, "F minor") }, { label: "Track 1 rough" });

insert("project_messages", { id: uuid(), project_id: p1, author_id: ama, body: "Can we also get a version without the ad-libs for radio?", created_at: now() });
insert("project_messages", { id: uuid(), project_id: p1, author_id: kofiEng, body: "Yes — I'll include a clean version in the final package.", created_at: now() });

// ---------- Moderation sample
insert("reports", { id: uuid(), reporter_id: jay, beat_id: beatIds[10], reason: "The main melody sounds like it was sampled from an uncleared record released in 2019.", status: "open", created_at: now() });

console.log(`\nSeeded in ${((Date.now() - t0) / 1000).toFixed(1)}s.  Users: ${all("SELECT COUNT(*) n FROM users")[0].n}, beats: ${beatIds.length}. Demo password: ${DEMO_PASSWORD}`);
db().close();
process.exit(0);
