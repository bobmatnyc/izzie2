# BYOK Multi-Tenant Status Report

**Date:** 2026-02-16
**Objective:** Assess readiness for multi-tenant BYOK (Bring Your Own Key) setup
**Target:** Enable users to bring their own OpenRouter API key with daily budget controls

---

## Executive Summary

| Area | Status | Readiness |
|------|--------|-----------|
| Encryption for API Keys | READY | Full encryption service exists |
| Multi-Tenant Architecture | READY | Audited and fixed (2026-02-02) |
| Per-User OpenRouter Config | NOT READY | No storage mechanism |
| Daily Budget System | NOT READY | Tracking exists, no limits |
| Overall BYOK Readiness | **50%** | Needs 2 key implementations |

---

## 1. Encryption for API Keys

### Status: READY

A comprehensive encryption service exists at `/src/lib/encryption/index.ts`:

**Key Features:**
- **Key Derivation:** Argon2id (OWASP recommended)
  - Memory cost: 64 MB
  - Time cost: 3 iterations
  - Parallelism: 4 threads
  - Hash length: 256 bits
- **Encryption:** AES-256-GCM (authenticated encryption)
  - 96-bit IV (unique per encryption)
  - 128-bit authentication tag
- **Passphrase Generation:** `adjective-noun-number` format (~40 bits entropy)

**Available Functions:**
```typescript
// Key generation and derivation
generateSalt(): string
generatePassphrase(): string
deriveKey(passphrase: string, salt: string): Promise<DerivedKey>
verifyPassphrase(passphrase: string, storedHash: string): Promise<boolean>

// Encryption/Decryption
encrypt(plaintext: string, key: Buffer): EncryptedData
decrypt(encryptedData: EncryptedData, key: Buffer): string
encryptJSON<T>(data: T, key: Buffer): EncryptedData
decryptJSON<T>(encryptedData: EncryptedData, key: Buffer): T
```

**Database Support (users table):**
```typescript
encryptionKeyHash: text('encryption_key_hash')      // Hash for verification
encryptionSalt: text('encryption_salt')             // Per-user salt
passphraseHint: text('passphrase_hint')             // Optional hint
encryptionEnabled: boolean('encryption_enabled')    // Feature flag
encryptionFailedAttempts: integer(...)              // Brute-force protection
encryptionLockedUntil: timestamp(...)               // Account lockout
```

**Security Assessment:**
- Derived keys are NEVER stored, only hashes for verification
- Each user has unique salt for key derivation
- Encryption keys exist only in memory during session
- Built-in brute-force protection with lockout

---

## 2. Multi-Tenant Architecture

### Status: READY (Audited 2026-02-02)

A comprehensive security audit was performed on 2026-02-02 (see `docs/research/multi-tenant-audit-2026-02-02.md`).

**PostgreSQL Tables:**
- All 21+ tables properly include `userId` with CASCADE delete constraints
- Proper foreign key relationships to users table

**Vulnerabilities Found and Fixed:**

| Issue | Location | Severity | Status |
|-------|----------|----------|--------|
| Entity API bypassed userId | `/api/entities/route.ts` | CRITICAL | FIXED |
| Entity detail API bypassed userId | `/api/entities/[id]/route.ts` | CRITICAL | FIXED |
| Memory search unauthenticated | `/api/memory/search/route.ts` | CRITICAL | FIXED |
| Gmail sync missing validation | `/api/gmail/sync/route.ts` | HIGH | FIXED |

**Helper Functions Created:**
`/src/lib/auth/ownership.ts`:
- `ensureUserOwnsResource()` - Boolean ownership check
- `assertUserOwnsResource()` - Throws error if ownership fails
- `filterOwnedResources()` - Filters array to only owned resources

**Weaviate Collections:**
- All collections have `userId` property
- Filtering properly implemented after fixes

---

## 3. Per-User OpenRouter Configuration

### Status: NOT READY

**Current Implementation:**

The AI client (`/src/lib/ai/client.ts`) uses a single system-wide API key:

```typescript
export class OpenRouterClient {
  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error('OPENROUTER_API_KEY is required');
    }
    this.client = new OpenAI({
      baseURL: OPENROUTER_BASE_URL,
      apiKey: key,
    });
  }
}
```

**Positive:** Constructor accepts optional `apiKey` parameter (good for BYOK).
**Problem:** No storage mechanism for per-user API keys.

**Missing Components:**

1. **Database Storage:** No table/column for user OpenRouter API keys
   - Need: `encrypted_openrouter_key` column or dedicated table

2. **Settings API:** No endpoints for managing API keys
   - Need: `/api/user/settings/api-key` endpoints

3. **UI:** No settings interface for API key management
   - Need: Settings page with API key input, validation, storage

4. **Key Retrieval Flow:** No logic to fetch user's key before LLM calls
   - Need: Middleware or service to decrypt and inject user's key

**Existing apiKeys Table (NOT SUITABLE):**
The existing `api_keys` table is for Izzie's own API keys (MCP access scopes), not for external service credentials:
```typescript
export const apiKeys = pgTable('api_keys', {
  keyHash: text('key_hash').notNull(),     // For Izzie API authentication
  scopes: text('scopes').array().notNull(), // MCP scopes like 'mcp:read'
  // ...
});
```

---

## 4. Budget System

### Status: PARTIAL (Tracking exists, no limits)

**What Exists:**

1. **LLM Usage Tracking** (`llmUsage` table):
   ```typescript
   export const llmUsage = pgTable('llm_usage', {
     userId: text('user_id').notNull(),
     operationType: text('operation_type').notNull(),
     model: text('model').notNull(),
     inputTokens: integer('input_tokens').notNull(),
     outputTokens: integer('output_tokens').notNull(),
     costUsd: real('cost_usd').notNull(),
     metadata: jsonb('metadata'),
   });
   ```

2. **Usage Tracker Service** (`/src/lib/llm/usage-tracker.ts`):
   - Cost calculation per model
   - Async tracking functions
   - Model-specific pricing (Claude, GPT, Gemini, Mistral)

3. **Training Session Budgets:**
   ```typescript
   discoveryBudgetTotal: integer('discovery_budget_total').default(500),
   discoveryBudgetUsed: integer('discovery_budget_used').default(0),
   trainingBudgetTotal: integer('training_budget_total').default(500),
   trainingBudgetUsed: integer('training_budget_used').default(0),
   ```

4. **Budget API** (`/api/train/budget/route.ts`):
   - Set/add training budget
   - Pause/resume/cancel training

**What's Missing:**

1. **Daily Spending Limits:** No `dailyBudget` or `dailyLimit` fields
2. **Enforcement Layer:** Tracking only, no blocking when limits exceeded
3. **General Chat Budget:** Budget only exists for training, not chat/API calls
4. **User-Configurable Limits:** No UI for users to set their own limits

**Missing Components:**

| Component | Description | Priority |
|-----------|-------------|----------|
| Daily budget field | `dailyBudgetUsd` column on users table | HIGH |
| Current day spend | `currentDaySpend` tracking (reset daily) | HIGH |
| Budget check middleware | Pre-LLM call budget validation | HIGH |
| Budget exceeded response | Graceful handling when limit hit | MEDIUM |
| Settings UI | User interface to configure limits | MEDIUM |
| Budget alerts | Notify users at 80%, 100% thresholds | LOW |

---

## 5. Gaps to Fill for BYOK Setup

### High Priority (Must Have)

| Gap | Description | Effort | Files to Create/Modify |
|-----|-------------|--------|------------------------|
| **Encrypted Key Storage** | Store encrypted OpenRouter keys per user | Medium | Schema migration, encryption service extension |
| **Settings API** | CRUD endpoints for user API keys | Medium | `/api/user/settings/api-key/route.ts` |
| **Key Injection** | Decrypt and use user's key in OpenRouterClient | Low | `/src/lib/ai/client.ts`, chat routes |
| **Daily Budget Schema** | Add budget fields to users table | Low | Schema migration |
| **Budget Enforcement** | Pre-call check + graceful rejection | Medium | Middleware or wrapper function |

### Medium Priority (Should Have)

| Gap | Description | Effort |
|-----|-------------|--------|
| **Settings UI** | React components for API key management | Medium |
| **Budget Settings UI** | Interface for daily limit configuration | Medium |
| **Key Validation** | Verify API key is valid before saving | Low |
| **Budget Dashboard** | Current spend vs. limit visualization | Medium |

### Low Priority (Nice to Have)

| Gap | Description | Effort |
|-----|-------------|--------|
| **Budget Alerts** | Email/Telegram notifications at thresholds | Medium |
| **Usage History** | Detailed per-day usage breakdown | Medium |
| **Key Rotation** | Allow users to update key while keeping history | Low |

---

## 6. Recommended Implementation Order

### Phase 1: Core BYOK Infrastructure (1-2 weeks)

1. **Database Migration:**
   ```typescript
   // Add to users table
   encryptedOpenrouterKey: text('encrypted_openrouter_key'),
   openrouterKeyIv: text('openrouter_key_iv'),
   openrouterKeyTag: text('openrouter_key_tag'),
   dailyBudgetUsd: real('daily_budget_usd').default(10),
   currentDaySpendUsd: real('current_day_spend_usd').default(0),
   budgetResetAt: timestamp('budget_reset_at'),
   ```

2. **API Key Service:**
   - `setUserApiKey(userId, apiKey, passphrase)` - Encrypt and store
   - `getUserApiKey(userId, passphrase)` - Decrypt and return
   - `deleteUserApiKey(userId)` - Remove key

3. **Settings API Endpoints:**
   - `POST /api/user/settings/api-key` - Save encrypted key
   - `DELETE /api/user/settings/api-key` - Remove key
   - `GET /api/user/settings/api-key/status` - Check if key exists

### Phase 2: Budget Enforcement (1 week)

1. **Budget Service:**
   - `checkBudget(userId)` - Returns remaining budget
   - `recordSpend(userId, costUsd)` - Track spend
   - `resetDailyBudgets()` - Cron job for daily reset

2. **Chat Integration:**
   - Pre-call budget check in `/api/chat/route.ts`
   - Graceful rejection with helpful message
   - Post-call cost recording

### Phase 3: User Interface (1-2 weeks)

1. **Settings Page:**
   - API key input with encryption
   - Daily budget configuration
   - Current usage display

2. **Budget Warnings:**
   - Toast notifications at 80% threshold
   - Clear "budget exceeded" messaging

---

## 7. Security Considerations

### For API Key Storage

1. **Never store plaintext API keys**
   - Use existing encryption service
   - Keys encrypted with user's passphrase

2. **Key access requires session + passphrase**
   - Two-factor key retrieval
   - Session alone insufficient

3. **Key rotation considerations**
   - Allow update without exposing old key
   - Audit log of key changes

### For Budget Enforcement

1. **Atomic operations**
   - Check and deduct in single transaction
   - Prevent race conditions

2. **Fail-safe behavior**
   - If budget check fails, deny request
   - Conservative approach

---

## 8. Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `/src/lib/encryption/index.ts` | Encryption service | Ready |
| `/src/lib/db/schema.ts` | Database schema | Needs migration |
| `/src/lib/ai/client.ts` | OpenRouter client | Needs modification |
| `/src/lib/llm/usage-tracker.ts` | Cost tracking | Ready |
| `/src/lib/auth/ownership.ts` | Multi-tenant helpers | Ready |
| `/docs/research/multi-tenant-audit-2026-02-02.md` | Security audit | Reference |
| `/docs/research/per-user-encryption-options-2026-02-02.md` | Encryption research | Reference |

---

## 9. Summary

**Ready to Use:**
- Encryption infrastructure (Argon2id + AES-256-GCM)
- Multi-tenant isolation (audited and fixed)
- Cost tracking (per-user, per-model)

**Needs Implementation:**
- Per-user OpenRouter API key storage (encrypted)
- Daily budget limits with enforcement
- Settings UI for key and budget management

**Estimated Total Effort:** 3-5 weeks for complete BYOK setup

---

*Generated by Research Agent - 2026-02-16*
