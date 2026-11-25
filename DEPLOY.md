# Deploying SoundzRoot to a VPS (domain on Bluehost)

You keep your domain at Bluehost and run SoundzRoot on a small Linux server. The scripts in `deploy/` handle the server side.

**Architecture on the server**

```
Internet ──HTTPS──> Caddy (:443, auto certificates) ──> Next.js app on 127.0.0.1:3000 (systemd)
                                                         ├─ data/soundroot.db      (SQLite database)
                                                         └─ data/storage/          (private audio files)
                    daily timer ──> /var/backups/soundroot (database + storage, 14 days)
```

## 1. Get a server

- Ubuntu **24.04** LTS, at least **2 GB RAM** (4 GB is comfortable), 40 GB+ disk. Audio files add up, so plan disk for your catalog.
- Any provider works (Hetzner, DigitalOcean, Vultr, Linode, Bluehost VPS). For users in Ghana, a European region usually gives the best latency among low-cost providers.
- Add your SSH key when creating it. Note the server's **public IPv4 address**.

## 2. Point your domain at it (Bluehost)

In Bluehost: **Domains → your domain → DNS → Add record**

| Type | Host | Points to | TTL |
| --- | --- | --- | --- |
| A | `app` (for app.yourdomain.com) or `@` (for the bare domain) | your server's IPv4 | 1 hour |

If you use the bare domain and Bluehost already has an A record for `@` (your current website), editing it moves the whole site. Using a subdomain like `app` leaves your existing site untouched.

DNS can take from a few minutes to a few hours. Check with `nslookup app.yourdomain.com`; it should show your server's IP before you continue, so Caddy can get the HTTPS certificate.

## 3. Provision (one command)

SSH in as root (or a sudo user) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/samansong/soundroot/main/deploy/setup-server.sh -o setup-server.sh
sudo DOMAIN=app.yourdomain.com bash setup-server.sh
```

The script:

- installs Node 24, Caddy and a firewall (only SSH, 80, 443 open)
- creates the `soundroot` user and clones the repo to `/opt/soundroot`
- writes `/etc/soundroot/soundroot.env` with freshly generated secrets
- builds the app, starts it as the `soundroot` systemd service, and enables daily backups

If the GitHub repository is **private**, the clone needs credentials. Either make it public, or clone it yourself first with a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) into `/opt/soundroot` and run the script with `REPO=git@github.com:samansong/soundroot.git`.

## 4. Create your admin account

```bash
sudo -u soundroot bash -c 'cd /opt/soundroot && set -a && . /etc/soundroot/soundroot.env && set +a && node scripts/create-admin.ts --email you@example.com --name "Your Name"'
```

This prints a generated password once; store it in your password manager. Everyone else signs up normally at `/signup`.

### Demo data — read this first

`SEED_DEMO=1` loads the fictional demo world (beats, studios, projects). **Every demo account, including `admin@soundroot.test`, uses the public password `soundroot-demo`.** On a public server that means anyone can sign in as admin. Only seed a private or throwaway server, and if you do, change or delete those accounts before sharing the URL:

```bash
sudo SEED_DEMO=1 bash /opt/soundroot/deploy/deploy.sh --no-pull   # empty database only
```

## 5. Everyday operations

| Task | Command |
| --- | --- |
| Deploy the latest `main` | `sudo bash /opt/soundroot/deploy/deploy.sh` |
| Live logs | `journalctl -u soundroot -f` |
| Restart / stop | `sudo systemctl restart soundroot` / `sudo systemctl stop soundroot` |
| Back up now | `sudo systemctl start soundroot-backup` |
| List backups | `ls -lh /var/backups/soundroot` |
| Edit secrets / settings | `sudo nano /etc/soundroot/soundroot.env` then restart |

`deploy.sh` takes a backup, pulls, installs, builds, restarts and checks the app responds. If the check fails it exits with an error and points you to the logs.

### Restoring a backup

```bash
sudo systemctl stop soundroot
cd /opt/soundroot
sudo -u soundroot cp /var/backups/soundroot/soundroot-<timestamp>.db data/soundroot.db
sudo -u soundroot rm -f data/soundroot.db-wal data/soundroot.db-shm
sudo -u soundroot tar -xzf /var/backups/soundroot/storage-<timestamp>.tar.gz -C data
sudo systemctl start soundroot
```

Backups live on the same server, so they don't protect against losing the server. Copy `/var/backups/soundroot` off the machine regularly (your provider's snapshot feature, or `rsync` to another host or object storage).

## Before taking real money

This deployment is ready for a demo or pilot. Payments still go through the built-in **sandbox** provider (`/pay/...`, clearly marked test mode); no real money moves. Before launch:

1. Integrate a licensed provider that supports MoMo and cards in Ghana (e.g. Paystack, Flutterwave, Hubtel, MTN MoMo API) with marketplace settlement and seller KYC. Replace `sandboxAuthorize` and the hosted page; the webhook handler, ledger and fulfilment already enforce signature, amount and dedup checks.
2. Add phone (SMS/WhatsApp) verification. Email verification and transactional email are built in; see "Email (Resend)" below.
3. Add MFA for admin accounts.
4. When you outgrow one server, move to the production stack in `README.md` (PostgreSQL, Redis worker, object storage, FFmpeg worker).

## Email (Resend)

SoundzRoot sends branded emails from `notice@soundzroot.com`: a welcome email on sign-up, studio staff invites, and a copy of every in-app notification (sales, orders, bookings, project updates, payouts, disputes). They go out through the job queue, so a Resend outage only delays them.

1. In Resend, verify the domain `soundzroot.com` (Domains → add the DNS records it shows at your DNS host).
2. Create an API key with **Sending access**, then put it on the server:
   ```bash
   sudo nano /etc/soundroot/soundroot.env      # set RESEND_API_KEY=re_...
   sudo systemctl restart soundroot
   ```
3. Send yourself a test of each template:
   ```bash
   sudo -u soundroot bash -c 'cd /opt/soundroot && set -a && . /etc/soundroot/soundroot.env && set +a && node scripts/email.ts test --to you@example.com'
   ```

Without a key, emails are only logged (`journalctl -u soundroot | grep "\[email\]"`). Preview the designs locally with `node scripts/email.ts preview`.
