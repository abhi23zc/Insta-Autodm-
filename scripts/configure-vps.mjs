import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const [domain, email] = process.argv.slice(2);
if (!domain || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain) ||
    !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /["'\\$#]/.test(email)) {
  console.error("Usage: node scripts/configure-vps.mjs dm.example.com you@example.com");
  process.exit(1);
}
let content = readFileSync(new URL(".env.vps.example", root), "utf8");
const values = {
  APP_DOMAIN: domain.toLowerCase(),
  NEXTAUTH_URL: `https://${domain.toLowerCase()}`,
  NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
  WEBHOOK_VERIFY_TOKEN: randomBytes(32).toString("hex"),
  EMAIL_SERVER: `smtps://${encodeURIComponent(email)}:APP_PASSWORD@smtp.gmail.com:465`,
  EMAIL_FROM: `"OpenReply <${email}>"`,
  ALLOWED_EMAILS: email,
};
for (const [key, value] of Object.entries(values)) {
  content = content.replace(new RegExp(`^${key}=.*$`, "m"), () => `${key}=${value}`);
}
const target = fileURLToPath(new URL(".env.vps", root));
try {
  writeFileSync(target, content, { flag: "wx", mode: 0o600 });
} catch (error) {
  if (error.code === "EEXIST") {
    console.error(".env.vps already exists; keeping its secrets unchanged.");
    process.exit(1);
  }
  throw error;
}
console.log("Created .env.vps with new production secrets. Set EMAIL_SERVER's App Password before deploying.");
console.log("If restoring existing data, use the original ENCRYPTION_KEY so provider credentials remain readable.");
