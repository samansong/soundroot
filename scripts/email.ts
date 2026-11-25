// Email tools.
//   node scripts/email.ts preview [outDir]          Render every template to HTML files for a look in the browser.
//   node scripts/email.ts test --to you@example.com  Send one of each template through Resend (needs RESEND_API_KEY).
import fs from "node:fs";
import path from "node:path";
import { inviteEmail, notificationEmail, verifyEmail, welcomeEmail } from "../src/server/email/templates.ts";
import { deliver } from "../src/server/email/send.ts";

const samples = {
  "welcome-artist": welcomeEmail({ name: "Ama Mensah", roles: ["artist"], verify: { path: "/verify-email/sample-token", expiresInHours: 48 } }),
  "verify": verifyEmail({ name: "Ama Mensah", path: "/verify-email/sample-token", expiresInHours: 48 }),
  "welcome-beatmaker": welcomeEmail({ name: "Kofi Sound", roles: ["beatmaker"] }),
  "welcome-studio": welcomeEmail({ name: "Efua Owusu", roles: ["studio_owner"] }),
  "sale": notificationEmail({ name: "Kofi Sound", type: "sale", title: "You made a sale 🎉", body: "Midnight in Osu — Premium lease · GHS 450.00", link: "/producer" }),
  "order": notificationEmail({ name: "Ama Mensah", type: "order", title: "Your license is ready", body: "Order SR-7Q2K — downloads unlocked", link: "/orders/demo" }),
  "booking": notificationEmail({ name: "Ama Mensah", type: "booking", title: "Session confirmed", body: "Your deposit for Accra Sound Lab is received.", link: "/library" }),
  "project": notificationEmail({ name: "Ama Mensah", type: "project", title: "New version: Mix v3", body: "Gold Coast Nights", link: "/projects" }),
  "invite": inviteEmail({ studioName: "Accra Sound Lab", inviterName: "Efua Owusu", role: "engineer", path: "/invite/demo-token", expiresInHours: 72 }),
};

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "preview") {
  const out = path.resolve(rest[0] || "email-preview");
  fs.mkdirSync(out, { recursive: true });
  for (const [name, m] of Object.entries(samples)) fs.writeFileSync(path.join(out, `${name}.html`), m.html);
  fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><meta charset=utf-8><title>Email previews</title><body style="font-family:sans-serif;background:#111;color:#eee;padding:20px">${Object.entries(samples).map(([n, m]) => `<p><a style="color:#f2b84b" href="${n}.html">${n}</a> — ${m.subject}</p>`).join("")}`);
  console.log(`Wrote ${Object.keys(samples).length} previews to ${out}`);
} else if (cmd === "test") {
  const to = rest[rest.indexOf("--to") + 1];
  if (!to || rest.indexOf("--to") < 0) { console.error("Usage: node scripts/email.ts test --to you@example.com"); process.exit(1); }
  if (!process.env.RESEND_API_KEY) { console.error("RESEND_API_KEY is not set."); process.exit(1); }
  for (const name of ["welcome-artist", "sale", "invite"] as const) {
    const r = await deliver(to, samples[name], `test-${name}-${Date.now()}`);
    console.log(name, JSON.stringify(r));
  }
} else {
  console.error("Usage: node scripts/email.ts preview [outDir] | test --to you@example.com");
  process.exit(1);
}
