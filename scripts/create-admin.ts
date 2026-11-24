// Creates a platform admin account (or grants admin to an existing user).
// Usage: node scripts/create-admin.ts --email you@example.com --name "Your Name"
// Password: taken from ADMIN_PASSWORD if set, otherwise a strong one is generated and printed once.
import crypto from "node:crypto";
import { one, run, db } from "../src/server/db.ts";
import { newUser } from "../src/server/auth.ts";
import { audit } from "../src/server/audit.ts";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim() || "Platform Admin";
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: node scripts/create-admin.ts --email you@example.com --name "Your Name"');
  process.exit(1);
}

const existing = one("SELECT id FROM users WHERE email=?", email);
if (existing) {
  run("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')", existing.id);
  audit(null, "user.role_add", "user", existing.id, { role: "admin", via: "create-admin script" });
  console.log(`Granted admin to existing user ${email}. Their password is unchanged.`);
} else {
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString("base64url");
  if (password.length < 10) {
    console.error("ADMIN_PASSWORD must be at least 10 characters.");
    process.exit(1);
  }
  const id = newUser({ email, name, password, roles: ["admin", "artist"] });
  audit(null, "user.create_admin", "user", id, { via: "create-admin script" });
  console.log(`Created admin ${email}.`);
  if (generated) console.log(`Password (shown once — store it in your password manager): ${password}`);
}
db().close();
