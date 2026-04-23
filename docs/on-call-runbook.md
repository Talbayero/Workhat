# On-Call Incident Response Runbook

> **For:** On-call engineers, support escalations, security incidents  
> **Updated:** April 2026  
> **Status:** Active

This runbook guides response to common Work Hat CRM incidents. Use the decision tree to identify the issue, then follow the resolution steps.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Incident Types & Decision Trees](#incident-types--decision-trees)
3. [Resolution Procedures](#resolution-procedures)
4. [Rollback Procedures](#rollback-procedures)
5. [Escalation Contacts](#escalation-contacts)

---

## Quick Reference

**Severity Scale:**
- **P1 (Critical):** User data loss, security breach, auth system down — Resolve in <1 hour
- **P2 (High):** Major feature broken, performance <50%, suspected breach — Resolve in <4 hours
- **P3 (Medium):** Feature degraded, performance <80%, audit gap — Resolve in <24 hours
- **P4 (Low):** Non-critical bug, cosmetic issue, documentation — Resolve in <1 week

**Key Commands:**
```bash
# Check recent errors
tail -f /var/log/workhat/api.log | grep ERROR

# View audit logs for incident
curl https://api.workhat.app/api/audit-logs?since=2026-04-22T10:00:00Z&action=security

# Check system health
curl https://health.workhat.app/status

# View rate limit status
redis-cli GET "workhat:ratelimit:*"

# Restart API service
sudo systemctl restart workhat-api
```

---

## Incident Types & Decision Trees

### Decision Tree 1: User Reports "Permission Denied"

```
User sees "Insufficient permissions" on feature they should have access to
│
├─ Is the user in the correct role?
│  ├─ YES → Check capability overrides
│  │   ├─ Override exists? → Remove revoke override or add grant
│  │   └─ No overrides? → Grant via user_capability_overrides table
│  └─ NO → Update user role
│
├─ Check audit logs:
│  curl https://api.workhat.app/api/audit-logs?actor_id=<user_id>&action=security.suspicious_request
│
└─ Resolution: Verify capability assignment + clear browser cache
```

**Resolution Steps:**

1. **Get user details:**
   ```sql
   SELECT id, email, role, org_id FROM users WHERE email = 'user@example.com';
   ```

2. **Check capability overrides:**
   ```sql
   SELECT capability, effect FROM user_capability_overrides
   WHERE user_id = 'user-123' AND org_id = 'org-456';
   ```

3. **If missing capability, grant it:**
   ```sql
   INSERT INTO user_capability_overrides (user_id, org_id, capability, effect)
   VALUES ('user-123', 'org-456', 'billing.manage', 'grant');
   ```

4. **Verify audit log entry:**
   ```sql
   SELECT * FROM audit_logs
   WHERE actor_id = 'user-123' AND action = 'security.suspicious_request'
   ORDER BY created_at DESC LIMIT 5;
   ```

5. **Ask user to refresh browser and try again**

**Expected outcome:** User can now access feature. Check audit logs confirm successful operation on retry.

---

### Decision Tree 2: Email Not Syncing Or Sending

```
Inbound emails not appearing or approved replies fail to send
│
├─ Is the affected path Gmail OAuth, IMAP/SMTP mailbox, or custom inbound?
│  ├─ Gmail OAuth → Check Gmail watch/API state
│  ├─ IMAP/SMTP mailbox → Check mailbox adapter diagnostics
│  └─ Custom inbound → Check webhook delivery diagnostics
│
├─ For Gmail
│  ├─ Is Gmail API responding?
│  │  └─ Rate limited? → Back off, retry after 60s
│  ├─ Is OAuth token expired?
│  │  └─ YES → User must re-authenticate via /api/email/gmail/connect
│  └─ Is webhook delivery failing?
│     └─ Check Pub/Sub delivery status
│
├─ For IMAP/SMTP mailbox
│  ├─ Is email_connections.status active?
│  ├─ Are inbound_enabled/outbound_enabled true for the failing direction?
│  ├─ Does /api/email/mailbox/diagnostics show env, auth, TLS, or provider guidance errors?
│  ├─ If inbound is stale, run /api/email/mailbox/sync for the connection
│  └─ If outbound fails, check SMTP host/port/TLS, sender identity, and app-password requirements
│
├─ For custom inbound
│  ├─ Is the channel active in Settings → Channels?
│  ├─ Is the provider posting to /api/inbound/email?channelId=<channel_id>?
│  ├─ Does the request include the current channel token?
│  ├─ Are duplicate deliveries being deduped in inbound_email_events?
│  └─ Is last_error_message populated on the channel?
│
├─ Check audit logs:
│  curl https://api.workhat.app/api/audit-logs?action=security.suspicious_request
│
└─ Escalate to DevOps if API is down
```

**Resolution Steps:**

1. **Check mailbox adapter diagnostics in the app:**
   - Go to Settings -> Channels.
   - Confirm the connection is `active` for the needed direction.
   - Open diagnostics and note `last_error_code`, `last_error_message`, `last_validated_at`, `last_inbound_sync_at`, and `last_outbound_send_at`.

2. **Check mailbox connection state in SQL:**
   ```sql
   SELECT id, provider, connection_type, provider_account_email, status,
          inbound_enabled, outbound_enabled, last_validated_at,
          last_inbound_sync_at, last_outbound_send_at,
          last_error_code, last_error_message, diagnostics_json
   FROM email_connections
   WHERE org_id = 'org-123'
   ORDER BY updated_at DESC;
   ```

3. **For IMAP/SMTP inbound, run a manual poll through the app/API:**
   ```bash
   curl -X POST https://work-hat.com/api/email/mailbox/sync \
     -H "Cookie: <admin-session-cookie>" \
     -H "Content-Type: application/json" \
     -d '{"connectionId":"connection-123"}'
   ```

4. **For scheduler issues, check `CRON_SECRET` and the polling endpoint:**
   ```bash
   curl https://work-hat.com/api/email/mailbox/poll \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

5. **For provider auth errors:**
   - `app_password_required`: switch the setup to App password and create a provider-issued password.
   - `imap_auth_failed` or `smtp_auth_failed`: verify username, password, provider security settings, and account lockouts.
   - `tls_failed`: verify SSL/TLS flags and ports, commonly IMAP 993 and SMTP 465/587.
   - `network_error`: verify provider hostname, firewall restrictions, and provider availability.

6. **Check Gmail API status when Gmail OAuth is affected:**
   ```bash
   curl -s "https://www.googleapis.com/gmail/v1/users/me/profile" \
     -H "Authorization: Bearer $OAUTH_TOKEN"
   ```

7. **Check rate limit status:**
   ```bash
   redis-cli GET "workhat:ratelimit:gmail_api"
   ```

8. **If rate limited, wait 60+ seconds, then retry**

9. **Check for expired tokens in logs:**
   ```bash
   tail -f /var/log/workhat/api.log | grep "GMAIL_TOKEN_EXPIRED\|401\|Unauthorized"
   ```

10. **If token expired, user must re-authenticate:**
   - Direct user to Settings -> Channels or `/api/email/gmail/connect`
   - They'll see "Gmail is disconnected" message
   - Click "Reconnect Gmail"

11. **Verify reconnection:**
   ```sql
   SELECT provider_account_email, status, token_expires_at, last_validated_at
   FROM email_connections
   WHERE org_id = 'org-123' AND provider = 'gmail';
   ```

12. **For custom inbound, inspect delivery status:**
   ```sql
   SELECT id, status, external_message_id, error_message, processed_at, created_at
   FROM inbound_email_events
   WHERE org_id = 'org-123' AND channel_id = 'channel-123'
   ORDER BY created_at DESC
   LIMIT 20;
   ```

13. **Check channel diagnostics:**
   ```sql
   SELECT id, provider, status, inbound_address,
          config_json->>'last_inbound_at' AS last_inbound_at,
          config_json->>'last_error_at' AS last_error_at,
          config_json->>'last_error_message' AS last_error_message
   FROM channels
   WHERE org_id = 'org-123' AND type = 'email';
   ```

14. **If custom inbound token errors are suspected:**
   - Regenerate the custom inbound token in Settings -> Channels.
   - Update the relay/provider secret.
   - Send a test delivery with a new `externalMessageId`.
   - Confirm one `message.received` workflow event and one inbound `messages` row.

**Expected outcome:** Emails sync again. Check audit logs for `conversation.created` entries confirming inbound processing.

---

### Decision Tree 3: Rate Limit Hitting Users

```
Users getting 429 (Too Many Requests)
│
├─ Is it legitimate traffic or attack?
│  ├─ Check request frequency: curl /api/audit-logs?action=security.rate_limit_hit
│  ├─ Legitimate spike?
│  │  └─ Increase SECURITY_RATE_LIMIT_MAX_REQUESTS_PER_WINDOW temporarily
│  └─ Attack pattern?
│     └─ IP blacklist + alert security team
│
├─ Identify user/IP
│  └─ GET /api/audit-logs?action=security.rate_limit_hit&since=NOW-1h
│
└─ Mitigate + communicate
```

**Resolution Steps:**

1. **Check rate limit hit frequency:**
   ```bash
   curl "https://api.workhat.app/api/audit-logs?action=security.rate_limit_hit&since=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)"
   ```

2. **Identify affected users:**
   ```sql
   SELECT actor_id, actor_email, COUNT(*) as hits
   FROM audit_logs
   WHERE action = 'security.rate_limit_hit'
   AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY actor_id, actor_email
   ORDER BY hits DESC;
   ```

3. **Is this an attack or legitimate spike?**
   - **Legitimate:** One user/org has actual high load
   - **Attack:** Many different IPs hitting same endpoint

4. **For legitimate spike, temporarily increase limit:**
   ```bash
   # Update environment and restart
   export SECURITY_RATE_LIMIT_MAX_REQUESTS_PER_WINDOW=200  # was 100
   systemctl restart workhat-api
   ```

5. **For attack, add to IP blacklist:**
   ```bash
   # Add to blacklist in api-gateway.ts
   BLACKLIST_IPS.add("192.168.1.1")  # attacker IP
   ```

6. **Notify affected users:**
   - "We had a temporary rate limit issue. It's now resolved. Please try again."
   - Do NOT expose internal rate limit details

**Expected outcome:** Users can make requests again. Rate limit hits drop in audit logs. Attack traffic detected and blocked.

---

### Decision Tree 3A: Onboarding Shows "Request Protection Temporarily Unavailable"

```
User cannot create org during onboarding
│
├─ Check response code
│  ├─ 503 with rate_limit_store_unavailable → Redis/Upstash unavailable
│  └─ Other error → Check /api/org/create logs
│
├─ Verify environment
│  ├─ UPSTASH_REDIS_REST_URL set?
│  ├─ UPSTASH_REDIS_REST_TOKEN set?
│  └─ Vercel deployment has current env values?
│
└─ Verify onboarding policy is deployed
   └─ /api/org/create should fail open on store outage after auth/body checks
```

**Resolution Steps:**

1. Confirm the deployed commit includes the `onboarding-create-org` gateway policy.
2. Check Vercel environment variables for `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. If env vars were added or changed, redeploy so the proxy picks them up.
4. Retry onboarding with a signed-in user.
5. If the error persists, inspect application logs for `[api-gateway] Rate limit store unavailable` and `/api/org/create` errors.

**Expected outcome:** Onboarding proceeds even during a transient rate-limit store outage, while normal API routes keep their fail-closed protection.

---

### Decision Tree 3B: Custom Inbound Channel Creation Fails

```
Onboarding Step 2 or Settings -> Channels cannot create custom inbound
│
├─ Does the API response mention migration incomplete?
│  └─ YES → Apply 0036_custom_inbound_email.sql completely
│
├─ Is the user allowed to manage integrations?
│  └─ Check integrations.manage capability
│
└─ Check /api/email/custom-inbound logs for database or admin-client errors
```

**Resolution Steps:**

1. Confirm migration `0036_custom_inbound_email.sql` was applied completely, not only the `inbound_email_events` table.
2. Verify the signed-in user has `integrations.manage`.
3. Check that `SUPABASE_SERVICE_ROLE_KEY` is configured because channel creation uses the admin client.
4. Retry channel creation and copy the endpoint/token for the relay before leaving the page.

**Expected outcome:** The channel is created, the webhook endpoint and token are visible, and the channel can ingest a test message.

---

### Decision Tree 4: Audit Log Corruption / Missing Entries

```
Audit logs missing or inconsistent
│
├─ Is audit logger failing silently?
│  ├─ Check admin client availability
│  ├─ Check Redis connectivity (for rate limiting context)
│  └─ Check database connectivity
│
├─ Check recent logs for errors:
│  tail -f /var/log/workhat/api.log | grep "\[audit-logger\]"
│
└─ Escalate to Data team for backup recovery if data loss suspected
```

**Resolution Steps:**

1. **Check admin client errors:**
   ```bash
   grep "\[admin-client\]" /var/log/workhat/api.log | tail -20
   ```

2. **Verify Supabase connectivity:**
   ```bash
   curl -s "https://[project].supabase.co/rest/v1/audit_logs?select=id&limit=1" \
     -H "Authorization: Bearer $SERVICE_ROLE_KEY"
   ```

3. **Check Redis connectivity:**
   ```bash
   redis-cli PING
   ```

4. **Check for audit logger warnings:**
   ```bash
   grep "\[audit-logger\]" /var/log/workhat/api.log | grep -i "error\|warning\|unavailable"
   ```

5. **If audit logs are missing, escalate immediately:**
   - Contact Data team for backup recovery
   - Do NOT make further changes without backup
   - This is a P1 compliance issue

**Expected outcome:** Audit logging is functional. Data recovery plan in place if needed.

---

### Decision Tree 5: Database Connection Timeout

```
API routes getting "Database connection refused"
│
├─ Is database up?
│  ├─ Run health check: curl https://health.workhat.app/db
│  ├─ Check Supabase dashboard for incidents
│  └─ If down, escalate to DevOps
│
├─ Is connection pool exhausted?
│  ├─ Check active connections
│  ├─ Are there stuck/idle connections?
│  └─ Kill idle connections if needed
│
└─ Fallback to read replicas if available
```

**Resolution Steps:**

1. **Check database status:**
   ```bash
   curl https://health.workhat.app/db
   # Expected: 200 OK, response time <100ms
   ```

2. **If Supabase is down:**
   - Check https://status.supabase.com
   - Wait for service restoration
   - Communicate status to users

3. **If database is up but slow, check connections:**
   ```sql
   SELECT count(*) as active_connections FROM pg_stat_activity;
   SELECT pid, usename, application_name, state, query_start 
   FROM pg_stat_activity WHERE state = 'idle';
   ```

4. **Kill stuck idle connections (if safe):**
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state = 'idle' AND query_start < NOW() - INTERVAL '10 minutes';
   ```

5. **Check connection pool settings:**
   ```
   SUPABASE_POOL_SIZE=20
   SUPABASE_POOL_TIMEOUT=30s
   ```

6. **If persistent, restart API service:**
   ```bash
   systemctl restart workhat-api
   ```

**Expected outcome:** Connections restored, <100ms response time, no 502 errors.

---

## Resolution Procedures

### Procedure: Grant User Capability

**When:** User needs access to a feature (e.g., billing management)

```sql
-- Check current role capabilities
SELECT * FROM role_capabilities WHERE role = 'agent';

-- Grant additional capability
INSERT INTO user_capability_overrides (user_id, org_id, capability, effect)
VALUES ('user-123', 'org-456', 'billing.manage', 'grant')
ON CONFLICT (user_id, org_id, capability) DO UPDATE
SET effect = 'grant';

-- Verify
SELECT * FROM user_capability_overrides 
WHERE user_id = 'user-123' AND org_id = 'org-456';

-- Log the change
INSERT INTO audit_logs (org_id, actor_id, action, resource_type, resource_id, success)
VALUES ('org-456', 'on-call-admin', 'user.role_changed', 'user', 'user-123', true);
```

### Procedure: Revoke User Capability

**When:** User should not have access (security incident or role change)

```sql
-- Revoke capability
INSERT INTO user_capability_overrides (user_id, org_id, capability, effect)
VALUES ('user-123', 'org-456', 'billing.manage', 'revoke')
ON CONFLICT (user_id, org_id, capability) DO UPDATE
SET effect = 'revoke';

-- Verify active sessions are invalidated
SELECT * FROM sessions WHERE user_id = 'user-123';

-- Force re-authentication (if available)
DELETE FROM sessions WHERE user_id = 'user-123';

-- Audit the action
INSERT INTO audit_logs (org_id, actor_id, action, resource_type, resource_id, success)
VALUES ('org-456', 'on-call-admin', 'user.role_changed', 'user', 'user-123', true);
```

### Procedure: Investigate Permission Escalation Attempt

**When:** Multiple failed capability checks from same user (potential attack)

```sql
-- Find suspicious patterns
SELECT actor_id, actor_email, COUNT(*) as failed_attempts,
       MIN(created_at) as first_attempt,
       MAX(created_at) as last_attempt
FROM audit_logs
WHERE action = 'security.suspicious_request'
  AND resource_type = 'capability'
  AND success = false
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY actor_id, actor_email
HAVING COUNT(*) > 5
ORDER BY failed_attempts DESC;

-- Get details of failed attempts
SELECT created_at, actor_id, actor_email, resource_id, error_message, ip_address
FROM audit_logs
WHERE action = 'security.suspicious_request'
  AND actor_id = 'suspicious-user-id'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Determine if account is compromised
-- If yes: Revoke all capabilities, force password reset, notify user
```

---

## Rollback Procedures

### Rollback: Capability Grant

If a capability grant was made in error:

```sql
-- Remove the override (falls back to role preset)
DELETE FROM user_capability_overrides 
WHERE user_id = 'user-123' AND capability = 'billing.manage';

-- Verify fallback
SELECT * FROM user_capability_overrides WHERE user_id = 'user-123';

-- Audit the rollback
INSERT INTO audit_logs (org_id, actor_id, action, resource_type, resource_id, success)
VALUES ('org-456', 'on-call-admin', 'user.role_changed', 'user', 'user-123', true);
```

### Rollback: Service Restart

If API service needs rollback:

```bash
# Get previous good version
git log --oneline -5

# Rollback to previous version
git reset --hard <commit-hash>

# Rebuild and restart
npm run build
systemctl restart workhat-api

# Verify health
curl https://health.workhat.app/status
```

---

## Escalation Contacts

| Issue Type | Owner | Slack | Phone |
|---|---|---|---|
| **Auth / Permissions** | Security team | #security-incidents | x5000 |
| **Database / Infrastructure** | DevOps | #devops | x5001 |
| **API / Performance** | Backend team | #backend-oncall | x5002 |
| **Data loss / Audit** | Data team | #data-oncall | x5003 |
| **Customer communication** | Support lead | #support-escalations | x5004 |

**Out-of-hours escalation:**
1. Page on-call engineer via PagerDuty
2. Post in #incidents Slack (auto-notifies on-call)
3. For P1 only: Call emergency number (from oncall doc)

---

## Post-Incident Checklist

After resolving any incident:

- [ ] Log all actions in audit_logs table
- [ ] Create incident post-mortem (if P1/P2)
- [ ] Update this runbook with new patterns discovered
- [ ] Verify no data loss occurred
- [ ] Check for related incidents (similar root cause?)
- [ ] Notify affected users
- [ ] Clear incident from status page

---

## Related Documentation

- [Security Hardening](./security-hardening.md) — Authorization, audit logging, rate limiting
- [Architecture](./architecture.md) — System design, integration points
- [Email Channels](./email-channels.md) — Gmail/custom inbound setup and diagnostics
- [Decisions](./decisions.md) — Why we made these choices

---

*On-Call Runbook — April 2026*
