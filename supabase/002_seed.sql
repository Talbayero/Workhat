-- ============================================================
-- Work Hat CRM — Bootstrap Seed Data  (single-tenant V1)
-- Run AFTER 001_schema.sql
-- ============================================================

-- ── Companies ───────────────────────────────────────────────
insert into public.companies (
  id, name, domain, industry, account_owner, tier,
  health_score, open_conversations, active_contacts, arr, notes, tags
) values
  (
    'c1000000-0000-0000-0000-000000000001',
    'Acme Corp', 'acme.com', 'Manufacturing', 'Marcos',
    'priority', 62, 3, 2, 120000,
    'Large account with active technical escalations.',
    '{"enterprise","priority"}'
  ),
  (
    'c1000000-0000-0000-0000-000000000002',
    'Globex Inc', 'globex.io', 'SaaS', 'Anika',
    'standard', 91, 1, 1, 45000,
    'Steady account with healthy product adoption.',
    '{"mid-market"}'
  ),
  (
    'c1000000-0000-0000-0000-000000000003',
    'Initech', 'initech.com', 'IT Services', 'Marcos',
    'watch', 48, 2, 1, 78000,
    'Billing pressure and churn-risk indicators.',
    '{"watch","finance"}'
  ),
  (
    'c1000000-0000-0000-0000-000000000004',
    'Brightwave', 'brightwave.co', 'Agency', 'Jordan',
    'standard', 85, 2, 2, 32000,
    'Positive relationship, expanding use cases.',
    '{"growth"}'
  ),
  (
    'c1000000-0000-0000-0000-000000000005',
    'Mesa Dental Group', 'mesadental.com', 'Healthcare', 'Anika',
    'watch', 55, 2, 1, 61000,
    'Account sensitive to billing and permissions issues.',
    '{"healthcare","watch"}'
  )
on conflict (id) do nothing;

-- ── Contacts ────────────────────────────────────────────────
insert into public.contacts (
  id, full_name, first_name, last_name, email, phone,
  company_id, status, tier, notes, tags,
  preferred_channel, location, lifecycle_stage, last_activity_at
) values
  (
    'd1000000-0000-0000-0000-000000000001',
    'Jamie Rivera', 'Jamie', 'Rivera',
    'jamie@acme.com', '+1 (555) 010-1001',
    'c1000000-0000-0000-0000-000000000001',
    'vip', 'Priority account',
    'Primary technical stakeholder and escalation owner on the customer side.',
    '{"enterprise","decision-maker"}',
    'Email', 'Austin, TX', 'Expansion',
    now() - interval '30 minutes'
  ),
  (
    'd1000000-0000-0000-0000-000000000002',
    'Sam Lee', 'Sam', 'Lee',
    'sam@globex.io', '+1 (555) 010-1002',
    'c1000000-0000-0000-0000-000000000002',
    'active', 'Growth account',
    'Reliable product admin and strong feedback source.',
    '{"mid-market"}',
    'Email', 'Chicago, IL', 'Active customer',
    now() - interval '5 hours'
  ),
  (
    'd1000000-0000-0000-0000-000000000003',
    'Taylor Morgan', 'Taylor', 'Morgan',
    'taylor@initech.com', '+1 (555) 010-1003',
    'c1000000-0000-0000-0000-000000000003',
    'watch', 'Watch account',
    'Finance-sensitive contact involved in dispute resolution.',
    '{"at-risk","technical"}',
    'Email', 'Denver, CO', 'Renewal risk',
    now() - interval '1 hour'
  ),
  (
    'd1000000-0000-0000-0000-000000000004',
    'Lena Okafor', 'Lena', 'Okafor',
    'lena@brightwave.co', '+1 (555) 010-1004',
    'c1000000-0000-0000-0000-000000000004',
    'vip', 'Champion',
    'Highly engaged product advocate with upgrade potential.',
    '{"champion","product-feedback"}',
    'Email', 'New York, NY', 'Expansion',
    now() - interval '6 hours'
  ),
  (
    'd1000000-0000-0000-0000-000000000005',
    'Raj Sharma', 'Raj', 'Sharma',
    'raj@mesadental.com', '+1 (555) 010-1005',
    'c1000000-0000-0000-0000-000000000005',
    'active', 'Standard',
    'Operations contact tied to billing and access issues.',
    '{"healthcare","billing"}',
    'Email', 'Phoenix, AZ', 'Active customer',
    now() - interval '45 minutes'
  ),
  (
    'd1000000-0000-0000-0000-000000000006',
    'Priya Chen', 'Priya', 'Chen',
    'priya@brightwave.co', '+1 (555) 010-1006',
    'c1000000-0000-0000-0000-000000000004',
    'active', 'Technical contact',
    'Owns integrations and automation workflows for the account.',
    '{"technical","integration"}',
    'Email', 'Seattle, WA', 'Active customer',
    now() - interval '3 hours'
  )
on conflict (id) do nothing;

-- ── Conversations ───────────────────────────────────────────
insert into public.conversations (
  id, subject, status, priority,
  contact_id, company_id, assigned_to_name,
  risk_level, ai_confidence, preview, intent, tags,
  last_message_at
) values
  (
    'e1000000-0000-0000-0000-000000000001',
    'Login issue after SSO migration',
    'waiting_on_internal', 'high',
    'd1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'Marcos',
    'yellow', 'yellow',
    'It says "SAML assertion invalid". Here is a screenshot: [attachment]. This needs to be fixed today.',
    'Technical escalation',
    '{"sso","auth"}',
    now() - interval '2 hours'
  ),
  (
    'e1000000-0000-0000-0000-000000000002',
    'Export not generating CSV correctly',
    'open', 'normal',
    'd1000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000002',
    'Anika',
    'green', 'green',
    'The CSV export is generating broken files — all columns are merged into one. Started happening after last week''s update.',
    'Bug report',
    '{"export","bug"}',
    now() - interval '5 hours'
  ),
  (
    'e1000000-0000-0000-0000-000000000003',
    'Billing discrepancy on March invoice',
    'waiting_on_internal', 'urgent',
    'd1000000-0000-0000-0000-000000000003',
    'c1000000-0000-0000-0000-000000000003',
    'Marcos',
    'red', 'red',
    'We were charged $4,200 but our contract says $3,800. This needs to be corrected immediately or we will pause our subscription.',
    'Billing dispute',
    '{"billing","urgent"}',
    now() - interval '1 hour'
  ),
  (
    'e1000000-0000-0000-0000-000000000004',
    'Feature request: bulk user import',
    'open', 'low',
    'd1000000-0000-0000-0000-000000000004',
    'c1000000-0000-0000-0000-000000000004',
    'Jordan',
    'green', 'green',
    'We have about 200 new users to add next quarter. A CSV import feature would save us a lot of time.',
    'Feature request',
    '{"feature","feedback"}',
    now() - interval '1 day'
  ),
  (
    'e1000000-0000-0000-0000-000000000005',
    'Enterprise API returning 503 errors',
    'open', 'urgent',
    'd1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'Marcos',
    'red', 'red',
    'Our integration has been down for 40 minutes. The API keeps returning 503 on all endpoints. Revenue impact is mounting.',
    'Outage / reliability',
    '{"api","outage"}',
    now() - interval '30 minutes'
  ),
  (
    'e1000000-0000-0000-0000-000000000006',
    'Permission error on admin console',
    'waiting_on_customer', 'normal',
    'd1000000-0000-0000-0000-000000000005',
    'c1000000-0000-0000-0000-000000000005',
    'Anika',
    'yellow', 'green',
    'I keep getting "Access denied" when trying to add users. We''ve been waiting on this for two days.',
    'Access & permissions',
    '{"permissions","admin"}',
    now() - interval '2 days'
  ),
  (
    'e1000000-0000-0000-0000-000000000007',
    'Onboarding questions for new team members',
    'open', 'low',
    'd1000000-0000-0000-0000-000000000006',
    'c1000000-0000-0000-0000-000000000004',
    'Jordan',
    'green', 'green',
    'We''re adding three engineers next week. Can you share onboarding docs and set them up with sandbox access?',
    'Onboarding',
    '{"onboarding","setup"}',
    now() - interval '4 hours'
  ),
  (
    'e1000000-0000-0000-0000-000000000008',
    'Webhook not firing on order events',
    'open', 'high',
    'd1000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000002',
    'Anika',
    'yellow', 'yellow',
    'Our order webhook stopped firing about 12 hours ago. No errors in the dashboard. We rely on this for fulfillment.',
    'Integration issue',
    '{"webhook","integration"}',
    now() - interval '12 hours'
  ),
  (
    'e1000000-0000-0000-0000-000000000009',
    'Renewal terms — requesting multi-year discount',
    'waiting_on_customer', 'normal',
    'd1000000-0000-0000-0000-000000000003',
    'c1000000-0000-0000-0000-000000000003',
    'Marcos',
    'yellow', 'green',
    'We''re open to a 2-year commitment if you can offer 15% off. Can you get back to us by Friday?',
    'Renewal / upsell',
    '{"renewal","commercial"}',
    now() - interval '3 days'
  )
on conflict (id) do nothing;

-- ── Messages ────────────────────────────────────────────────
insert into public.messages (
  conversation_id, sender_type, direction, author_name, body_text, is_note, created_at
) values

  -- Conv 1: SSO login issue
  (
    'e1000000-0000-0000-0000-000000000001', 'customer', 'inbound',
    'Jamie Rivera',
    'Hi, since you migrated our SSO last week none of our users can log in. This is blocking our entire team.',
    false, now() - interval '2 hours'
  ),
  (
    'e1000000-0000-0000-0000-000000000001', 'agent', 'outbound',
    'Marcos',
    'Hi Jamie, I''m really sorry to hear that. I''m escalating this internally right now. Can you share the error message you see?',
    false, now() - interval '1 hour 45 minutes'
  ),
  (
    'e1000000-0000-0000-0000-000000000001', 'customer', 'inbound',
    'Jamie Rivera',
    'It says "SAML assertion invalid". Here is a screenshot: [attachment]. This needs to be fixed today.',
    false, now() - interval '1 hour 30 minutes'
  ),
  (
    'e1000000-0000-0000-0000-000000000001', 'agent', 'internal',
    'Marcos',
    'Flagging for eng: SAML cert may have changed during migration. Need someone to verify the IdP config.',
    true, now() - interval '1 hour 20 minutes'
  ),

  -- Conv 2: CSV export bug
  (
    'e1000000-0000-0000-0000-000000000002', 'customer', 'inbound',
    'Sam Lee',
    'The CSV export is generating broken files — all columns are merged into one. Started happening after last week''s update.',
    false, now() - interval '5 hours'
  ),
  (
    'e1000000-0000-0000-0000-000000000002', 'agent', 'outbound',
    'Anika',
    'Hi Sam, thanks for flagging this. I''ve reproduced the issue and filed a bug. Engineering is investigating. I''ll keep you updated.',
    false, now() - interval '4 hours 30 minutes'
  ),

  -- Conv 3: Billing dispute
  (
    'e1000000-0000-0000-0000-000000000003', 'customer', 'inbound',
    'Taylor Morgan',
    'We were charged $4,200 but our contract says $3,800. This needs to be corrected immediately or we will pause our subscription.',
    false, now() - interval '3 hours'
  ),
  (
    'e1000000-0000-0000-0000-000000000003', 'agent', 'outbound',
    'Marcos',
    'Hi Taylor, I completely understand your frustration. I''m pulling up your contract and invoice now and will have a resolution within 2 hours.',
    false, now() - interval '2 hours 45 minutes'
  ),
  (
    'e1000000-0000-0000-0000-000000000003', 'agent', 'internal',
    'Marcos',
    'Invoice discrepancy confirmed — looks like an incorrect promo code wasn''t applied. Flagging for billing team to issue credit.',
    true, now() - interval '1 hour'
  ),

  -- Conv 5: API 503
  (
    'e1000000-0000-0000-0000-000000000005', 'customer', 'inbound',
    'Jamie Rivera',
    'Our integration has been down for 40 minutes. The API keeps returning 503 on all endpoints. Revenue impact is mounting.',
    false, now() - interval '40 minutes'
  ),
  (
    'e1000000-0000-0000-0000-000000000005', 'agent', 'outbound',
    'Marcos',
    'On it Jamie. I can see elevated errors in the dashboard. Paging the on-call engineer right now.',
    false, now() - interval '30 minutes'
  ),

  -- Conv 8: Webhook
  (
    'e1000000-0000-0000-0000-000000000008', 'customer', 'inbound',
    'Sam Lee',
    'Our order webhook stopped firing about 12 hours ago. No errors in the dashboard. We rely on this for fulfillment.',
    false, now() - interval '12 hours'
  )
;

-- ── Knowledge entries ───────────────────────────────────────
insert into public.knowledge_entries (
  id, title, summary, body, category, tags, used_in_drafts, last_updated, updated_by
) values
  (
    'f1000000-0000-0000-0000-000000000001',
    'Standard return & restocking policy',
    'Covers the 30-day return window, restocking fee structure, and loyalty exceptions for repeat buyers with 5+ orders.',
    'Returns are accepted within 30 days of delivery. A 15% restocking fee applies to all returns unless waived by an authorized agent.

Loyalty exception: Customers with 5 or more lifetime orders who have not previously requested a fee waiver are eligible for a one-time restocking fee waiver. Agents must confirm order count in the order management system before granting the exception.

Escalation: Any return exception above $500 in order value requires manager approval before processing.',
    'policy', '{"returns","policy","loyalty"}', 14, current_date - 2, 'Marcos'
  ),
  (
    'f1000000-0000-0000-0000-000000000002',
    'Shipping delay escalation SOP',
    'Step-by-step process for handling shipping delay complaints, including carrier contact, customer communication, and compensation thresholds.',
    'When a customer reports a shipping delay exceeding 3 business days beyond the estimated delivery date:

1. Pull the tracking information from the order system.
2. Contact the carrier directly if tracking shows "in transit" with no movement for 48+ hours.
3. If the carrier confirms a delay, proactively email the customer with an updated ETA before they reach out again.
4. Offer a $10 store credit for delays of 5–10 days or a full refund of shipping costs for delays exceeding 10 days.
5. Escalate to the logistics manager if the carrier cannot provide an ETA.',
    'sop', '{"shipping","escalation","sop"}', 9, current_date - 5, 'Anika'
  ),
  (
    'f1000000-0000-0000-0000-000000000003',
    'Billing dispute resolution SOP',
    'Defines the three-step verification process for billing discrepancies and the approval chain for credits above $200.',
    'Step 1 — Verify the discrepancy: Pull the customer''s invoice and contract side-by-side. Confirm whether the error is an incorrect price, missing discount, or duplicate charge.

Step 2 — Issue acknowledgement: Within 30 minutes of opening the ticket, send a templated acknowledgement email confirming you have the case and will respond with a resolution within 4 business hours.

Step 3 — Resolution:
- Credits up to $200 can be issued by any agent.
- Credits $200–$500 require team lead approval.
- Credits above $500 require finance team sign-off.',
    'sop', '{"billing","dispute","sop"}', 7, current_date - 1, 'Marcos'
  ),
  (
    'f1000000-0000-0000-0000-000000000004',
    'Refund eligibility matrix',
    'Decision tree for full vs. partial refunds across order types: digital, physical, subscription, and enterprise contracts.',
    'Use this matrix to determine refund eligibility before issuing any credit:

Physical orders: Full refund within 30 days if unopened. Partial refund (minus restocking fee) within 60 days if opened and in resalable condition. No refund after 60 days.

Digital products: Full refund within 7 days of first access. No refund after 7 days unless there is a documented product defect.

Subscription plans: Pro-rated refund for the unused portion if cancelled mid-cycle. Annual plans: pro-rated for first 90 days only.

Enterprise contracts: Governed by individual contract terms. Refer all enterprise refund requests to the account manager.',
    'policy', '{"refund","eligibility","policy"}', 11, current_date - 7, 'Jordan'
  ),
  (
    'f1000000-0000-0000-0000-000000000005',
    'Tone guide: frustrated or upset customers',
    'How to write to customers who are angry, disappointed, or at churn risk — including phrase starters and what to avoid.',
    'Core principle: Lead with acknowledgement, not explanation.

Do not open with: "I understand you are frustrated" (feels scripted), "Unfortunately..." (signals bad news), or "As per our policy..." (feels deflective).

Open with: "You''re right to flag this." / "This shouldn''t have happened." / "I can see why this is frustrating."

After acknowledging, move immediately to the concrete next step. Never end a message to a frustrated customer with a question unless it is absolutely required to proceed.

Signature tone: Warm but direct. No filler phrases. One clear resolution step per message.',
    'tone', '{"tone","frustrated","empathy"}', 18, current_date - 3, 'Anika'
  ),
  (
    'f1000000-0000-0000-0000-000000000006',
    'Tone guide: feature request responses',
    'How to acknowledge feature requests without over-promising, including how to communicate roadmap uncertainty.',
    'When responding to a feature request:

1. Thank the customer specifically for the suggestion (not generically).
2. Confirm you are logging it — never say "we''ll build this" unless it is already on the roadmap.
3. Ask a clarifying question to deepen the use case: "Could you tell me more about the workflow this would support?"
4. If the feature is already planned, share a vague timeline (e.g., "We''re exploring this for later this year") — never give a hard date.
5. Close with appreciation and a note that you''ll update them if it moves forward.',
    'tone', '{"tone","feature-request","roadmap"}', 6, current_date - 10, 'Jordan'
  ),
  (
    'f1000000-0000-0000-0000-000000000007',
    'SSO & SAML troubleshooting guide',
    'Covers the five most common SSO failures, root cause indicators, and the escalation path for identity provider issues.',
    'Common SSO failures and what they usually mean:

1. "SAML assertion invalid" — The Identity Provider certificate may have rotated. Ask the customer to re-export their SAML metadata and share it.
2. "Audience mismatch" — The SP Entity ID in the IdP does not match our configured value. Walk the customer through re-entering it.
3. "Clock skew" — Server time on the IdP is more than 5 minutes off. Ask their IT team to sync NTP.
4. "NameID format mismatch" — Our system expects emailAddress format. Confirm this is set in the IdP.
5. "Redirect URI not allowed" — The callback URL in the IdP is incorrect. Provide the correct URL from the admin console.

If none of the above resolve the issue, escalate to the integrations team with the SAML trace.',
    'sop', '{"sso","saml","auth","troubleshooting"}', 5, current_date - 4, 'Marcos'
  ),
  (
    'f1000000-0000-0000-0000-000000000008',
    'Enterprise SLA commitments',
    'Details the uptime guarantees, response time targets, and credit schedule for enterprise plan customers.',
    'Enterprise customers are entitled to the following SLA commitments:

Uptime: 99.9% monthly uptime guarantee, excluding scheduled maintenance windows.

Response times:
- P1 (outage / full service unavailable): 15-minute acknowledgement, 2-hour resolution target.
- P2 (major feature degraded): 1-hour acknowledgement, 8-hour resolution target.
- P3 (minor issue, workaround exists): 4-hour acknowledgement, 48-hour resolution target.

Credits:
- 99.0–99.9% uptime: 5% monthly invoice credit.
- 95.0–99.0% uptime: 15% monthly invoice credit.
- Below 95% uptime: 30% monthly invoice credit.

Credits must be requested within 30 days of the incident. Refer credit requests to the billing team.',
    'escalation', '{"sla","enterprise","uptime","credits"}', 3, current_date - 14, 'Jordan'
  )
on conflict (id) do nothing;

-- ── Knowledge chunks ────────────────────────────────────────
insert into public.knowledge_chunks (entry_id, chunk_index, text) values
  ('f1000000-0000-0000-0000-000000000001', 0, 'Returns are accepted within 30 days of delivery. A 15% restocking fee applies to all returns unless waived by an authorized agent.'),
  ('f1000000-0000-0000-0000-000000000001', 1, 'Loyalty exception: Customers with 5 or more lifetime orders who have not previously requested a fee waiver are eligible for a one-time restocking fee waiver.'),
  ('f1000000-0000-0000-0000-000000000001', 2, 'Any return exception above $500 in order value requires manager approval before processing.'),

  ('f1000000-0000-0000-0000-000000000002', 0, 'When a customer reports a shipping delay exceeding 3 business days beyond the estimated delivery date, pull tracking information from the order system.'),
  ('f1000000-0000-0000-0000-000000000002', 1, 'If the carrier confirms a delay, proactively email the customer with an updated ETA before they reach out again.'),
  ('f1000000-0000-0000-0000-000000000002', 2, 'Offer a $10 store credit for delays of 5–10 days or a full refund of shipping costs for delays exceeding 10 days.'),

  ('f1000000-0000-0000-0000-000000000003', 0, 'Within 30 minutes of opening the ticket, send a templated acknowledgement email confirming you have the case and will respond within 4 business hours.'),
  ('f1000000-0000-0000-0000-000000000003', 1, 'Credits up to $200 can be issued by any agent. Credits $200–$500 require team lead approval. Credits above $500 require finance team sign-off.'),

  ('f1000000-0000-0000-0000-000000000005', 0, 'Lead with acknowledgement, not explanation. Open with: "You''re right to flag this." / "This shouldn''t have happened."'),
  ('f1000000-0000-0000-0000-000000000005', 1, 'Never end a message to a frustrated customer with a question unless it is absolutely required to proceed.'),

  ('f1000000-0000-0000-0000-000000000007', 0, '"SAML assertion invalid" — The Identity Provider certificate may have rotated. Ask the customer to re-export their SAML metadata.'),
  ('f1000000-0000-0000-0000-000000000007', 1, '"Audience mismatch" — The SP Entity ID in the IdP does not match our configured value. Walk the customer through re-entering it.'),
  ('f1000000-0000-0000-0000-000000000007', 2, 'If none of the above resolve the issue, escalate to the integrations team with the SAML trace.'),

  ('f1000000-0000-0000-0000-000000000008', 0, 'Enterprise customers: P1 (outage) = 15-minute acknowledgement, 2-hour resolution target.'),
  ('f1000000-0000-0000-0000-000000000008', 1, 'Credits must be requested within 30 days of the incident. Refer credit requests to the billing team.')
on conflict (entry_id, chunk_index) do nothing;
