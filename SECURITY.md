# Security Features

This document outlines the security measures implemented in the Streamflow Office Payroll application.

## Input Validation

All API route handlers use **Zod** for input validation. Request bodies and query parameters are validated before processing.

### Example:
```typescript
const createEmployeeSchema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
  startDate: z.string().datetime(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE']).optional(),
});

const data = createEmployeeSchema.parse(body);
```

## Rate Limiting

Rate limiting is implemented to prevent abuse and DoS attacks. The system supports:

- **In-memory storage** (development): Simple Map-based storage
- **Upstash Redis** (production): Distributed rate limiting

### Pre-configured Rate Limiters:

- **strict**: 5 requests per minute
- **standard**: 20 requests per minute
- **auth**: 5 requests per 15 minutes (for login attempts)
- **api**: 100 requests per minute

### Usage:
```typescript
import { rateLimiters } from '@/lib/middleware/rate-limit';

export const POST = async (request: NextRequest) => {
  return rateLimiters.auth(request, async (req) => {
    // Handler logic
  });
};
```

### Environment Variables:
- `UPSTASH_REDIS_REST_URL` (optional): Upstash Redis REST URL
- `UPSTASH_REDIS_REST_TOKEN` (optional): Upstash Redis REST token

If not provided, the system falls back to in-memory rate limiting.

## CSRF Protection

CSRF protection uses the **double-submit cookie pattern**:

1. Server sets a CSRF token in a cookie (readable by JavaScript)
2. Client reads the token and sends it in the `X-CSRF-Token` header
3. Server compares the cookie token with the header token

### Usage:
```typescript
import { withCsrfProtection } from '@/lib/middleware/csrf';

export const POST = withCsrfProtection(async (request: NextRequest) => {
  // Handler logic
});
```

### Client-side:
```typescript
// Get CSRF token
const { token } = await fetch('/api/csrf-token').then(r => r.json());

// Include in requests
fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': token,
  },
  // ...
});
```

## Encryption

Sensitive off-chain data is encrypted using **AES-256-GCM** (Galois/Counter Mode).

### Features:
- Authenticated encryption (prevents tampering)
- Random IV for each encryption (same plaintext produces different ciphertext)
- Base64-encoded output

### Usage:
```typescript
import { encrypt, decrypt } from '@/lib/crypto';

// Encrypt sensitive data
const encrypted = encrypt('sensitive data');

// Decrypt when needed
const decrypted = decrypt(encrypted);
```

### Environment Variable:
- `ENCRYPTION_KEY_32B`: Base64-encoded 32-byte encryption key

Generate with:
```bash
openssl rand -base64 32
```

## Audit Logging

All significant actions are logged with:
- **Actor ID**: User who performed the action
- **IP Address**: Client IP (from `X-Forwarded-For` header)
- **User Agent**: Client user agent string
- **Hash**: SHA-256 hash of the log entry for integrity verification

### Usage:
```typescript
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';

const metadata = getRequestMetadata(request);

await createAuditLog({
  organizationId: session.organizationId,
  actorId: session.userId,
  action: 'CREATE',
  entity: 'EMPLOYEE',
  entityId: employee.id,
  after: { /* changes */ },
  ...metadata, // Includes ip and userAgent
});
```

## Security Headers

Security headers are configured in `middleware.ts`:
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

## Best Practices

1. **Always validate input** with Zod schemas
2. **Use rate limiting** on sensitive endpoints (auth, payments, etc.)
3. **Protect POST/PUT/DELETE routes** with CSRF protection
4. **Encrypt sensitive data** before storing in database
5. **Log all significant actions** with audit logging
6. **Never log sensitive data** (passwords, tokens, etc.) in audit logs

## Testing

Run security-related tests:
```bash
pnpm test lib/crypto.test.ts
```

## Production Checklist

- [ ] Set `ENCRYPTION_KEY_32B` to a secure random key
- [ ] Configure Upstash Redis for rate limiting (optional but recommended)
- [ ] Ensure all POST routes have CSRF protection
- [ ] Verify all routes have Zod validation
- [ ] Review audit logs regularly
- [ ] Keep dependencies up to date
- [ ] Use HTTPS in production
- [ ] Configure proper CORS policies


