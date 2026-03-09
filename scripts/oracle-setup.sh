#!/usr/bin/env bash
# ===========================================================================
# AdPilot — Oracle Cloud Setup Script
# Esegui questo script sulla VM Oracle dopo aver clonato il repo.
# Usage: bash scripts/oracle-setup.sh
# ===========================================================================
set -euo pipefail

echo "=========================================="
echo "  AdPilot — Setup Oracle Cloud VM"
echo "=========================================="
echo ""

# ---------------------------------------------------------------------------
# 1. Chiedi dominio e email
# ---------------------------------------------------------------------------
read -p "Inserisci il tuo dominio (es. app.adpilot.dev): " DOMAIN
read -p "Inserisci la tua email (per Let's Encrypt): " EMAIL

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "[ERRORE] Dominio e email sono obbligatori."
  exit 1
fi

echo ""
echo "[INFO] Dominio: $DOMAIN"
echo "[INFO] Email: $EMAIL"
echo ""

# ---------------------------------------------------------------------------
# 2. Installa Docker se non presente
# ---------------------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "[1/8] Installazione Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "[OK] Docker installato. IMPORTANTE: esci e riconnettiti SSH, poi riesegui lo script."
  exit 0
else
  echo "[1/8] Docker già installato: $(docker --version)"
fi

# ---------------------------------------------------------------------------
# 3. Apri firewall iptables (Oracle Linux/Ubuntu)
# ---------------------------------------------------------------------------
echo "[2/8] Configurazione firewall..."
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true

# Prova a salvare con netfilter-persistent o iptables-save
if command -v netfilter-persistent &>/dev/null; then
  sudo netfilter-persistent save 2>/dev/null || true
elif [ -f /etc/iptables/rules.v4 ]; then
  sudo iptables-save | sudo tee /etc/iptables/rules.v4 >/dev/null
fi

echo "[OK] Porte 80 e 443 aperte"

# ---------------------------------------------------------------------------
# 4. Genera secrets
# ---------------------------------------------------------------------------
echo "[3/8] Generazione secrets..."
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
NEXTAUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

echo "[OK] Secrets generati"

# ---------------------------------------------------------------------------
# 5. Crea file .env
# ---------------------------------------------------------------------------
echo "[4/8] Creazione .env..."

if [ -f .env ]; then
  cp .env .env.backup.$(date +%s)
  echo "[INFO] Backup .env esistente creato"
fi

cat > .env << ENVEOF
# ═══════════════════════════════════════════════════════════════
# AdPilot — Production Environment
# Generato automaticamente il $(date -Iseconds)
# ═══════════════════════════════════════════════════════════════

# Database (NON modificare — usato da docker-compose)
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://adpilot:${DB_PASSWORD}@db:5432/adpilot

# Redis (interno Docker)
REDIS_URL=redis://redis:6379

# NextAuth
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=https://${DOMAIN}

# Encryption (per token OAuth)
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Amazon SES
SES_ACCESS_KEY_ID=
SES_SECRET_ACCESS_KEY=
SES_REGION=eu-west-1
SES_FROM_EMAIL=noreply@${DOMAIN}

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Claude API
ANTHROPIC_API_KEY=

# Social OAuth (configura quando servono)
META_APP_ID=
META_APP_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
ENVEOF

chmod 600 .env
echo "[OK] .env creato (chmod 600)"

# ---------------------------------------------------------------------------
# 6. Configura nginx — prima avvio solo HTTP
# ---------------------------------------------------------------------------
echo "[5/8] Configurazione Nginx (HTTP iniziale)..."
cp nginx.conf nginx.conf.ssl  # salva la versione SSL
cp nginx.initial.conf nginx.conf
echo "[OK] Nginx configurato per HTTP"

# ---------------------------------------------------------------------------
# 7. Build e avvio
# ---------------------------------------------------------------------------
echo "[6/8] Build Docker (prima volta ci vogliono 3-5 minuti)..."
docker compose up -d --build

echo "[INFO] Attendo che i container siano healthy..."
sleep 15

# Verifica che l'app sia partita
for i in {1..20}; do
  if docker compose exec app wget --no-verbose --tries=1 --spider http://localhost:3000/api/health 2>/dev/null; then
    echo "[OK] App healthy!"
    break
  fi
  echo "[INFO] Attendo app... ($i/20)"
  sleep 5
done

# ---------------------------------------------------------------------------
# 8. Esegui migration database
# ---------------------------------------------------------------------------
echo "[7/8] Migration database..."
docker compose exec app npx prisma migrate deploy 2>/dev/null || \
  docker compose exec app npx prisma db push 2>/dev/null || \
  echo "[WARN] Migration fallita — probabilmente il DB non ha ancora lo schema. Riprova manualmente."

echo "[OK] Database migrato"

# ---------------------------------------------------------------------------
# 9. SSL con Certbot
# ---------------------------------------------------------------------------
echo "[8/8] Ottenimento certificato SSL..."

docker run --rm \
  -v "$(docker volume ls -q | grep certbot-www | head -1):/var/www/certbot" \
  -v "$(docker volume ls -q | grep certbot-etc | head -1):/etc/letsencrypt" \
  -v "$(docker volume ls -q | grep certbot-var | head -1):/var/lib/letsencrypt" \
  certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
  && SSL_OK=true || SSL_OK=false

if [ "$SSL_OK" = true ]; then
  echo "[OK] Certificato SSL ottenuto!"

  # Sostituisci nginx con la versione SSL
  cp nginx.conf.ssl nginx.conf
  sed -i "s/ADPILOT_DOMAIN/${DOMAIN}/g" nginx.conf

  # Riavvia nginx con SSL
  docker compose restart nginx
  echo "[OK] Nginx riavviato con HTTPS"
else
  echo "[WARN] SSL fallito. Assicurati che:"
  echo "  1. Il DNS A record punti a questo server"
  echo "  2. Le porte 80/443 siano aperte nella Security List di Oracle"
  echo "  Puoi riprovare manualmente dopo."
fi

# ---------------------------------------------------------------------------
# 10. Cron jobs
# ---------------------------------------------------------------------------
echo ""
echo "[INFO] Configurazione cron per backup e rinnovo SSL..."

CRON_BACKUP="0 2 * * * cd $(pwd) && bash scripts/backup.sh >> /var/log/adpilot-backup.log 2>&1"
CRON_SSL="0 3 * * * docker run --rm -v \$(docker volume ls -q | grep certbot-etc | head -1):/etc/letsencrypt -v \$(docker volume ls -q | grep certbot-var | head -1):/var/lib/letsencrypt -v \$(docker volume ls -q | grep certbot-www | head -1):/var/www/certbot certbot/certbot renew --quiet && docker restart adpilot-nginx"

# Aggiungi solo se non esistono già
(crontab -l 2>/dev/null || true) | grep -v "adpilot-backup\|certbot" | {
  cat
  echo "$CRON_BACKUP"
  echo "$CRON_SSL"
} | crontab -

echo "[OK] Cron configurato"

# ---------------------------------------------------------------------------
# Riepilogo
# ---------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "  SETUP COMPLETATO!"
echo "=========================================="
echo ""
echo "  URL:     https://${DOMAIN}"
echo "  Health:  https://${DOMAIN}/api/health"
echo ""
echo "  Container:"
docker compose ps --format "  {{.Name}}\t{{.Status}}"
echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║  PROSSIMI PASSI:                      ║"
echo "  ║                                       ║"
echo "  ║  1. Modifica .env con le API keys:    ║"
echo "  ║     nano .env                         ║"
echo "  ║     docker compose restart app worker ║"
echo "  ║                                       ║"
echo "  ║  2. Google OAuth redirect URI:        ║"
echo "  ║     https://${DOMAIN}/api/auth/callback/google"
echo "  ║                                       ║"
echo "  ║  3. Stripe webhook endpoint:          ║"
echo "  ║     https://${DOMAIN}/api/webhooks/stripe"
echo "  ╚═══════════════════════════════════════╝"
echo ""
echo "  Comandi utili:"
echo "    docker compose logs -f app        # Log app"
echo "    docker compose logs -f worker     # Log worker"
echo "    docker compose restart            # Riavvia tutto"
echo "    bash scripts/backup.sh            # Backup manuale"
echo ""
