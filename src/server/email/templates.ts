// Branded HTML emails. Table layout + inline styles so they render in Gmail, Outlook and Apple Mail.
// Images are served from APP_URL/email/*; every email also has a plain-text part.

export interface Rendered { subject: string; html: string; text: string }

const C = { ink: "#070d10", ink1: "#0b1519", ink2: "#102026", line: "#1d343b", text: "#eef4f2", text2: "#b4c6c2", muted: "#7f9894", gold: "#f2b84b", gold2: "#ffd27a", teal: "#3fd1b3", plum: "#9b7bf0", rose: "#f0688b", clay: "#e7774f" };
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const abs = (path?: string | null) => (!path ? appUrl() : /^https?:/.test(path) ? path : `${appUrl()}${path.startsWith("/") ? "" : "/"}${path}`);
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const first = (name: string) => name.trim().split(/\s+/)[0] || "there";

/** Per-notification-type look: emoji, label and accent colour. */
const KINDS: Record<string, { icon: string; label: string; color: string }> = {
  sale: { icon: "💸", label: "New sale", color: C.gold },
  order: { icon: "🎧", label: "Your order", color: C.teal },
  payment: { icon: "💳", label: "Payment", color: C.teal },
  booking: { icon: "🎙️", label: "Studio booking", color: C.teal },
  project: { icon: "🎚️", label: "Project update", color: C.plum },
  message: { icon: "💬", label: "New message", color: C.plum },
  payout: { icon: "💰", label: "Payout", color: C.gold },
  dispute: { icon: "⚖️", label: "Dispute", color: C.rose },
  moderation: { icon: "🛡️", label: "Moderation", color: C.rose },
  finance: { icon: "📊", label: "Finance", color: C.clay },
};

/** A row of coloured bars — the SoundzRoot "equalizer" motif, built from table cells so it never breaks. */
function equalizer(heights = [6, 14, 22, 12, 28, 18, 9, 24, 16, 30, 12, 20, 8, 26, 14, 22, 10, 18, 6, 24, 13, 28, 9, 17, 22, 11, 26, 15, 7, 20], colors = [C.gold, C.clay, C.plum, C.teal]) {
  const cells = heights
    .map((h, i) => `<td valign="bottom" style="padding:0 2px;"><div style="width:6px;height:${h}px;border-radius:3px;background:${colors[Math.floor((i / heights.length) * colors.length)]};opacity:${0.55 + (h / 30) * 0.45};font-size:0;line-height:0;">&nbsp;</div></td>`)
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr style="height:30px;">${cells}</tr></table>`;
}

function button(label: string, href: string, color = C.gold) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${color}" style="border-radius:999px;background:${color};background-image:linear-gradient(135deg, ${C.gold2}, ${color});">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:#1b1305;text-decoration:none;border-radius:999px;">${esc(label)} &rarr;</a></td></tr></table>`;
}

function pill(text: string, color: string) {
  return `<span style="display:inline-block;padding:6px 14px;border-radius:999px;border:1px solid ${color}55;background:${color}1f;color:${color};font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${text}</span>`;
}

/** Page chrome shared by every email: preheader, wordmark, optional hero photo, glass card, footer. */
function layout(o: { preheader: string; hero?: { img: string; alt: string }; body: string; footerNote: string }) {
  const hero = o.hero
    ? `<tr><td style="padding:0;"><img src="${abs(o.hero.img)}" width="600" alt="${esc(o.hero.alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:24px 24px 0 0;"></td></tr>`
    : `<tr><td style="padding:28px 0 6px;background:${C.ink1};border-radius:24px 24px 0 0;">${equalizer()}</td></tr>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>SoundzRoot</title>
<style>
  @media (max-width:620px){ .sr-pad{padding-left:22px!important;padding-right:22px!important} .sr-h1{font-size:26px!important;line-height:32px!important} .sr-col{display:block!important;width:100%!important;padding:0 0 12px!important} }
  a{color:${C.gold}}
</style></head>
<body style="margin:0;padding:0;background:${C.ink};" bgcolor="${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.ink};">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ink}" style="background:${C.ink};background-image:radial-gradient(circle at 20% 0%, #1b2f22 0%, ${C.ink} 45%), radial-gradient(circle at 90% 30%, #241a3a 0%, ${C.ink} 40%);">
<tr><td align="center" style="padding:28px 12px 40px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td style="padding:0 6px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-family:${FONT};font-size:15px;font-weight:800;letter-spacing:4px;color:${C.gold};">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${C.teal};margin-right:8px;vertical-align:middle;"></span>SOUNDZROOT
        </td>
        <td align="right" style="font-family:${FONT};font-size:12px;color:${C.muted};">Made in Accra · Built for the continent</td>
      </tr></table>
    </td></tr>
    <tr><td style="border-radius:24px;background:${C.ink1};border:1px solid ${C.line};box-shadow:0 30px 80px rgba(0,0,0,.5);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${hero}
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.gold};background-image:linear-gradient(90deg, ${C.gold2}, ${C.gold} 25%, ${C.clay} 50%, ${C.plum} 75%, ${C.teal});">&nbsp;</td></tr>
        <tr><td class="sr-pad" style="padding:36px 44px 40px;font-family:${FONT};color:${C.text};">${o.body}</td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:30px 20px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${C.muted};">
      ${equalizer([4, 8, 12, 6, 10, 14, 8, 5, 11, 7, 13, 6], [C.muted])}
      <p style="margin:16px 0 6px;">${o.footerNote}</p>
      <p style="margin:0;"><a href="${appUrl()}/beats" style="color:${C.text2};text-decoration:none;">Beats</a> &nbsp;·&nbsp; <a href="${appUrl()}/studios" style="color:${C.text2};text-decoration:none;">Studios</a> &nbsp;·&nbsp; <a href="${appUrl()}/projects" style="color:${C.text2};text-decoration:none;">Projects</a></p>
      <p style="margin:10px 0 0;">© ${new Date().getFullYear()} SoundzRoot · Accra, Ghana</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const h1 = (t: string) => `<h1 class="sr-h1" style="margin:18px 0 0;font-family:${FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.5px;color:${C.text};">${t}</h1>`;
const p = (t: string, extra = "") => `<p style="margin:14px 0 0;font-size:16px;line-height:26px;color:${C.text2};${extra}">${t}</p>`;

// ---------------------------------------------------------------- Notifications (every in-app notification)

export function notificationEmail(d: { name: string; type: string; title: string; body: string; link?: string | null }): Rendered {
  const k = KINDS[d.type] ?? { icon: "🎵", label: "Update", color: C.teal };
  const href = abs(d.link);
  const body = `
    ${pill(`${k.icon}&nbsp; ${k.label}`, k.color)}
    ${h1(esc(d.title))}
    ${p(`Hi ${esc(first(d.name))},`)}
    ${d.body ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr>
      <td width="4" style="background:${k.color};border-radius:4px;font-size:0;">&nbsp;</td>
      <td style="padding:16px 20px;background:${C.ink2};border-radius:0 14px 14px 0;font-size:16px;line-height:25px;color:${C.text};">${esc(d.body)}</td>
    </tr></table>` : ""}
    <div style="margin-top:28px;">${button(d.link ? "Open in SoundzRoot" : "Go to SoundzRoot", href, C.gold)}</div>
    ${p(`Or paste this link into your browser:<br><a href="${esc(href)}" style="color:${C.muted};word-break:break-all;">${esc(href)}</a>`, "font-size:13px;line-height:20px;")}`;
  return {
    subject: `${k.icon} ${d.title}`,
    html: layout({ preheader: d.body || d.title, body, footerNote: "You're receiving this because of activity on your SoundzRoot account." }),
    text: `${d.title}\n\nHi ${first(d.name)},\n\n${d.body}\n\nOpen: ${href}\n\n— SoundzRoot`,
  };
}

// ---------------------------------------------------------------- Welcome / onboarding

const STEPS: Record<string, { icon: string; color: string; title: string; text: string; href: string }[]> = {
  artist: [
    { icon: "🎧", color: C.gold, title: "Find your sound", text: "Search beats by genre, mood, BPM and key. Preview anything instantly.", href: "/beats" },
    { icon: "📜", color: C.teal, title: "License with clarity", text: "Clear tiers, MoMo or card checkout, and a license PDF for every purchase.", href: "/beats" },
    { icon: "🎙️", color: C.plum, title: "Book a studio", text: "Pick a room and engineer, pay a deposit, and track your mixes to master.", href: "/studios" },
  ],
  beatmaker: [
    { icon: "⬆️", color: C.gold, title: "Upload your first beat", text: "We make a tagged preview automatically. Your masters stay private.", href: "/producer" },
    { icon: "🏷️", color: C.teal, title: "Set your license tiers", text: "Basic, premium and exclusive — terms are locked into every sale.", href: "/producer" },
    { icon: "💰", color: C.plum, title: "Get paid to MoMo", text: "Watch sales land in your dashboard and cash out to mobile money.", href: "/producer" },
  ],
  studio_owner: [
    { icon: "🗓️", color: C.gold, title: "Set your availability", text: "Rooms, services and opening hours — the calendar can't double-book.", href: "/studio" },
    { icon: "👥", color: C.teal, title: "Bring your team & clients", text: "Invite engineers, and add your existing clients at 0% commission.", href: "/studio" },
    { icon: "📈", color: C.plum, title: "See real revenue", text: "Deposits, balances and cash collected, ready to export.", href: "/studio" },
  ],
  engineer: [
    { icon: "🗓️", color: C.gold, title: "Check your sessions", text: "Every booking assigned to you, in one calendar.", href: "/studio" },
    { icon: "🎚️", color: C.teal, title: "Share mixes", text: "Upload versions and collect timestamped feedback on the waveform.", href: "/projects" },
    { icon: "✅", color: C.plum, title: "Deliver the master", text: "Clients approve a version and unlock finals once paid.", href: "/projects" },
  ],
};

export function welcomeEmail(d: { name: string; roles: string[] }): Rendered {
  const role = ["studio_owner", "beatmaker", "engineer", "artist"].find((r) => d.roles.includes(r)) ?? "artist";
  const steps = STEPS[role];
  const cta = { artist: ["Explore beats", "/beats"], beatmaker: ["Open your producer studio", "/producer"], studio_owner: ["Set up your studio", "/studio"], engineer: ["Open your sessions", "/studio"] }[role] as [string, string];
  const cards = steps
    .map((s, i) => `<tr><td style="padding:${i ? 12 : 0}px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.ink2};border:1px solid ${C.line};border-radius:16px;"><tr>
        <td width="64" valign="top" style="padding:18px 0 18px 18px;">
          <div style="width:46px;height:46px;line-height:46px;text-align:center;border-radius:14px;background:${s.color}26;border:1px solid ${s.color}55;font-size:22px;">${s.icon}</div>
        </td>
        <td valign="top" style="padding:18px 20px 18px 14px;font-family:${FONT};">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:${s.color};">STEP ${i + 1}</div>
          <a href="${abs(s.href)}" style="display:block;margin-top:4px;font-size:17px;font-weight:700;color:${C.text};text-decoration:none;">${s.title}</a>
          <div style="margin-top:4px;font-size:14px;line-height:21px;color:${C.text2};">${s.text}</div>
        </td>
      </tr></table></td></tr>`)
    .join("");
  const body = `
    ${pill("🎉&nbsp; Welcome aboard", C.gold)}
    ${h1(`Welcome to SoundzRoot, ${esc(first(d.name))}.`)}
    ${p("Beats, studios and delivery — the whole journey from idea to master, in one place. Here's how to get going:")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">${cards}</table>
    <div style="margin-top:30px;">${button(cta[0], abs(cta[1]))}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px;border-top:1px solid ${C.line};"><tr>
      <td class="sr-col" width="33%" style="padding:20px 8px 0 0;font-family:${FONT};"><div style="font-size:22px;font-weight:800;color:${C.teal};">MoMo</div><div style="font-size:13px;color:${C.muted};">&amp; card payments</div></td>
      <td class="sr-col" width="33%" style="padding:20px 8px 0;font-family:${FONT};"><div style="font-size:22px;font-weight:800;color:${C.plum};">0%</div><div style="font-size:13px;color:${C.muted};">fees on your own clients</div></td>
      <td class="sr-col" width="33%" style="padding:20px 0 0 8px;font-family:${FONT};"><div style="font-size:22px;font-weight:800;color:${C.gold};">24/7</div><div style="font-size:13px;color:${C.muted};">secure downloads</div></td>
    </tr></table>`;
  return {
    subject: `Welcome to SoundzRoot, ${first(d.name)} 🎶`,
    html: layout({ preheader: "Your account is ready — here's how to get started.", hero: { img: "/email/welcome.jpg", alt: "A young listener lost in music" }, body, footerNote: "You're receiving this because you created a SoundzRoot account." }),
    text: `Welcome to SoundzRoot, ${first(d.name)}!\n\n${steps.map((s, i) => `${i + 1}. ${s.title} — ${s.text} ${abs(s.href)}`).join("\n")}\n\n${cta[0]}: ${abs(cta[1])}\n\n— SoundzRoot`,
  };
}

// ---------------------------------------------------------------- Studio staff invite

export function inviteEmail(d: { studioName: string; inviterName: string; role: string; path: string; expiresInHours: number }): Rendered {
  const href = abs(d.path);
  const role = d.role === "engineer" ? "an engineer" : d.role === "manager" ? "a manager" : `a ${d.role}`;
  const body = `
    ${pill("🎙️&nbsp; Studio invite", C.teal)}
    ${h1(`Join ${esc(d.studioName)} on SoundzRoot`)}
    ${p(`<b style="color:${C.text};">${esc(d.inviterName)}</b> invited you to join <b style="color:${C.text};">${esc(d.studioName)}</b> as ${esc(role)}. You'll see your assigned sessions, share mixes with clients and deliver masters — all in one place.`)}
    <div style="margin-top:28px;">${button("Accept invite", href, C.teal)}</div>
    ${p(`This invite expires in ${d.expiresInHours} hours. If you weren't expecting it, you can ignore this email.`, `font-size:13px;line-height:20px;color:${C.muted};`)}`;
  return {
    subject: `${d.inviterName} invited you to ${d.studioName} on SoundzRoot`,
    html: layout({ preheader: `You've been invited to join ${d.studioName}.`, hero: { img: "/email/studio.jpg", alt: "Studio session" }, body, footerNote: "You're receiving this because a studio on SoundzRoot invited this address." }),
    text: `${d.inviterName} invited you to join ${d.studioName} on SoundzRoot as ${role}.\n\nAccept: ${href}\n\nExpires in ${d.expiresInHours} hours.`,
  };
}
