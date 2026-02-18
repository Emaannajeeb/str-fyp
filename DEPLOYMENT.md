# Deployment Guide

This guide covers deploying the Streamflow Office Payroll application to production.

## Quick Start with Docker Compose

The easiest way to deploy locally or on a single server:

```bash
# 1. Copy environment file
cp .env.production.example .env

# 2. Edit .env with your production values
# IMPORTANT: Generate new secrets for production!

# 3. Start all services
docker compose up -d

# 4. Run database migrations
docker compose exec app pnpm prisma migrate deploy

# 5. (Optional) Seed initial data
docker compose exec app pnpm prisma:seed
```

## Docker Compose Services

The `docker-compose.yml` includes:

1. **postgres**: PostgreSQL 16 database
2. **app**: Next.js application server
3. **worker**: Background reconciliation worker

All services include health checks and automatic restarts.

## Production Environment Variables

See `.env.production.example` for all required variables.

### Critical Security Notes:

1. **Rotate Secrets Regularly** (every 90 days):
   - `NEXTAUTH_SECRET`
   - `JWT_SECRET`
   - `STREAMFLOW_WEBHOOK_SECRET`
   - `ENCRYPTION_KEY_32B` (requires data re-encryption)

2. **Generate Secrets**:
   ```bash
   # Generate a secure secret
   openssl rand -base64 32
   ```

3. **Never commit `.env` files** to version control.

## Health Checks

### Application Health Check
- Endpoint: `GET /api/health`
- Returns: `{ ok: true, version: "0.1.0", timestamp: "..." }`
- Used by Docker healthcheck

### Worker Health Check
- Endpoint: `GET /api/health/worker` (when worker runs in app container)
- Or: `http://localhost:3001/api/health/worker` (standalone worker)
- Returns: `{ ok: true, service: "reconciliation-worker", timestamp: "..." }`

## Deployment Options

### Option 1: Single VM/Server (Recommended for Small to Medium Scale)

**Requirements:**
- Ubuntu 20.04+ or similar Linux distribution
- Docker and Docker Compose installed
- Minimum 2GB RAM, 2 CPU cores
- 20GB+ disk space

**Steps:**

1. **Install Docker and Docker Compose:**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

2. **Clone and configure:**
   ```bash
   git clone <your-repo>
   cd streamflow-office-payroll
   cp .env.production.example .env
   # Edit .env with production values
   ```

3. **Deploy:**
   ```bash
   docker compose up -d
   docker compose exec app pnpm prisma migrate deploy
   ```

4. **Set up reverse proxy (Nginx):**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

5. **Set up SSL (Let's Encrypt):**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

### Option 2: Container Platform (Kubernetes, Docker Swarm, etc.)

For Kubernetes, you'll need to:
1. Create ConfigMap/Secrets for environment variables
2. Deploy PostgreSQL (or use managed service)
3. Deploy app and worker as separate deployments
4. Set up ingress for external access
5. Configure persistent volumes for database

Example Kubernetes manifests are not included but can be generated from the Docker Compose setup.

### Option 3: Serverless/Platform-as-a-Service

**Vercel (App only):**
- Deploy Next.js app to Vercel
- Use external PostgreSQL (managed service)
- Run worker separately (see "Worker Alternatives" below)

**Railway/Render:**
- Can deploy Docker Compose setup directly
- Managed PostgreSQL available
- Automatic SSL and domain setup

## Worker Alternatives

### Option 1: Docker Container (Current)
The worker runs as a separate Docker container with `pnpm worker:reconcile`.

### Option 2: Cron Job
If you prefer not to run a separate container, you can use a cron job:

```bash
# Add to crontab (crontab -e)
*/5 * * * * cd /path/to/app && docker compose exec -T worker pnpm worker:reconcile
```

Or run directly on the host:
```bash
*/5 * * * * cd /path/to/app && NODE_ENV=production pnpm worker:reconcile
```

### Option 3: Serverless Functions
For serverless platforms, create a function that runs the reconciliation:

```typescript
// Example: Vercel Serverless Function
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  await runReconciliation();
  res.json({ ok: true });
}
```

Then trigger via:
- Vercel Cron Jobs
- GitHub Actions scheduled workflows
- External cron service (cron-job.org, etc.)

## Production Checklist

- [ ] All environment variables set in `.env`
- [ ] All secrets rotated from defaults
- [ ] Database migrations run (`pnpm prisma migrate deploy`)
- [ ] SSL/TLS configured (HTTPS)
- [ ] Reverse proxy configured (if using single VM)
- [ ] Worker running (container or cron)
- [ ] Health checks passing
- [ ] Monitoring set up (optional but recommended)
- [ ] Backups configured for database
- [ ] Log aggregation set up (optional)

## Monitoring

### Health Check Monitoring
Set up external monitoring to check:
- `https://your-domain.com/api/health` (every 1 minute)
- Worker health endpoint (if exposed)

### Logs
View logs:
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
docker compose logs -f worker
docker compose logs -f postgres
```

### Database Backups
Set up regular backups:
```bash
# Manual backup
docker compose exec postgres pg_dump -U postgres streamflow_payroll > backup.sql

# Automated backup (add to crontab)
0 2 * * * docker compose exec -T postgres pg_dump -U postgres streamflow_payroll > /backups/backup-$(date +\%Y\%m\%d).sql
```

## Troubleshooting

### Application won't start
1. Check environment variables: `docker compose config`
2. Check logs: `docker compose logs app`
3. Verify database connection
4. Ensure all required secrets are set

### Worker not running
1. Check worker logs: `docker compose logs worker`
2. Verify worker has access to database
3. Check worker health endpoint

### Database connection issues
1. Verify `DATABASE_URL` format
2. Check PostgreSQL is healthy: `docker compose ps postgres`
3. Check network connectivity between containers

## Scaling

For higher traffic:
1. **Horizontal scaling**: Run multiple app containers behind a load balancer
2. **Database**: Use managed PostgreSQL (AWS RDS, DigitalOcean, etc.)
3. **Caching**: Add Redis for rate limiting and session storage
4. **CDN**: Use Cloudflare or similar for static assets
5. **Worker**: Run multiple worker instances (ensure idempotency)

## Security Best Practices

1. **Keep dependencies updated**: `pnpm update`
2. **Regular security audits**: `pnpm audit`
3. **Rotate secrets regularly** (every 90 days)
4. **Use strong passwords** for database
5. **Enable firewall** on server (only allow 80, 443, SSH)
6. **Use SSH keys** instead of passwords
7. **Enable 2FA** for all admin accounts
8. **Regular backups** with encryption
9. **Monitor logs** for suspicious activity
10. **Keep Docker and system updated**

## Support

For issues or questions:
1. Check logs first
2. Review this deployment guide
3. Check GitHub issues
4. Review application logs in `/var/log` or container logs
