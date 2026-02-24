# Budget Overage Investigation: Discovery Process Analysis

**Investigation Date:** February 24, 2026
**Subject:** Discovery process budget consumption analysis for Izzie2
**Priority:** HIGH - Budget control needed for discovery operations

## Executive Summary

The Izzie2 discovery process is consuming excessive budget through **automated scheduled operations** that run independently of user-defined daily budget limits. The current budget system only enforces limits on user-initiated API calls but does not control discovery operations, which can process hundreds of emails hourly via scheduled cron jobs.

**Key Finding:** Discovery operations use the system API key and bypass user budget controls entirely.

---

## 1. Discovery Operations Identified

### Primary Discovery Processes

| Operation | Schedule | Cost per Item | Volume | Budget Impact |
|-----------|----------|---------------|---------|---------------|
| **Email Entity Extraction** | Hourly cron | ~$0.0005 | Up to 100 emails/hour | High |
| **Calendar Entity Extraction** | On-demand | ~$0.0003 | ~50 events/session | Medium |
| **Contact Deduplication** | Manual script | ~$0.0001 per decision | Variable | Low |
| **Relationship Discovery** | Daily at 3 AM | ~$0.00005 per pair | Large batches | Medium |

### Automated Scheduled Jobs (Inngest)

```typescript
// Primary budget consumers:
1. ingest-emails.ts - Cron: '0 * * * *' (HOURLY)
2. discover-relationships.ts - Cron: '0 3 * * *' (DAILY)
3. Entity Discoverer Agent - Event-triggered
```

---

## 2. Budget Usage Analysis

### Current Budget Structure

**Daily Budget System** (`src/lib/services/budget-guard.service.ts`):
- Tracks user spending in `llmUsage` table via `dailyBudgetCents`
- Enforced only when `usingUserKey = true` (BYOK users)
- Budget resets daily at user-defined `budgetResetHour`
- **Does NOT control system API key usage**

### Budget Bypass Issue

**Discovery operations use system API key:**
```typescript
// In entity-extractor.ts:
private get client() {
  if (!this._client) {
    this._client = getAIClient(); // SYSTEM key, not user key
  }
  return this._client;
}
```

**System key usage is not budget-controlled:**
- All scheduled discovery operations run with system credentials
- `checkBudgetAndGetKey()` returns system key when user has no API key
- No budget enforcement for system API usage

---

## 3. High-Cost Discovery Operations

### Email Processing Pipeline (Highest Impact)

**Location:** `src/lib/events/functions/ingest-emails.ts`
**Schedule:** Every hour (`'0 * * * *'`)
**Process:**
```
Gmail API → Email Fetch → Entity Extraction → Graph Storage
         ↓                ↓                 ↓
    No cost         AI API call        No cost
                   (Budget consumed here)
```

**Cost Details:**
- Model: Mistral Small via OpenRouter (`MODELS.CLASSIFIER`)
- Rate: ~$0.0005 per email (including entities + relationships)
- Volume: Up to 100 emails per hour per user
- **Potential cost: $0.05/hour per active user**

**Code Evidence:**
```typescript
// ingest-emails.ts line 234-235:
const extractor = getEntityExtractor();
const extractionResult = await extractor.extractFromEmail(email);
```

### Entity Discoverer Agent (Medium Impact)

**Trigger:** Event-driven via `izzie/agent.entity-discoverer`
**Process:** Scans recent emails (50 max) and calendar events, emits extraction events
**Cost:** Indirect - triggers more email processing

### Relationship Discovery (Daily Impact)

**Schedule:** Daily at 3 AM
**Process:** Batch analysis of entity pairs for relationship inference
**Estimated cost:** ~$0.00005 per entity pair in large batches

---

## 4. Budget Tracking Implementation

### Current Cost Tracking

**LLM Usage Tracker** (`src/lib/llm/usage-tracker.ts`):
- Records all AI calls in `llmUsage` table
- Calculates costs using `LLM_COST_RATES`
- **Does track system API usage but doesn't enforce limits**

**Cost Calculation:**
```typescript
// Mistral Small pricing:
'mistralai/mistral-small-3.2-24b-instruct': { input: 0.1, output: 0.3 },
```

### Daily Spend Service

**Location:** `src/lib/services/daily-spend.service.ts`
**Function:** Calculates daily spend from `llmUsage` table
**Issues:**
- Only used for BYOK user budget enforcement
- System API costs are tracked but not limited
- No discovery-specific budget categories

---

## 5. Root Cause Analysis

### Discovery Budget Not Implemented

**Problem:** The TRAINING_RULES.md mentions separate discovery and training budgets:

```typescript
// From TRAINING_RULES.md:
COST_PER_EMAIL_EXTRACTION = 0.05   // ~$0.0005 per email
COST_PER_CALENDAR_EXTRACTION = 0.03

// Budget exhaustion behavior:
// - Session status changes to `budget_exhausted`
// - Processing stops immediately
```

**Reality:** This budget system is not implemented in the codebase. Discovery operations run unrestricted.

### System vs User API Key Confusion

1. **Discovery operations use system API key** → No budget limits
2. **User interactions use user API key** → Budget limited (BYOK users only)
3. **No unified budget enforcement** across both key types

### Scheduled Operations Run Unrestricted

- Hourly email ingestion runs regardless of budget status
- No mechanism to pause discovery when budget exceeded
- No per-user discovery budget allocation

---

## 6. Cost Analysis Examples

### Scenario: Active Email User

**User profile:** 200 emails/week, BYOK user with $5 daily budget

**Current daily costs:**
- Discovery (system key): 200÷7 ≈ 29 emails × $0.0005 = **$0.0145**
- User interactions: Variable, budget-limited to $5.00
- **Discovery costs are invisible and unlimited**

### Scenario: Heavy Gmail User

**User profile:** 500+ emails/week

**Potential hourly cost:**
- Cron processes up to 100 emails/hour
- Peak cost: 100 × $0.0005 = **$0.05/hour**
- Daily peak: $1.20 in discovery costs alone
- **No mechanism to prevent runaway costs**

---

## 7. Recommendations

### A. Immediate Actions (High Priority)

1. **Implement Discovery Budget Enforcement**
   ```typescript
   // Add to budget-guard.service.ts:
   interface ExtendedBudgetResult {
     allowed: boolean;
     discoveryBudgetExceeded?: boolean;
     dailyDiscoverySpend?: number;
     dailyDiscoveryLimit?: number;
   }
   ```

2. **Separate Discovery Spend Tracking**
   - Add `operationType` filtering in daily-spend.service.ts
   - Track 'discovery' vs 'user-interaction' costs separately
   - Implement discovery budget limits per user

3. **Add Discovery Budget Controls to User Settings**
   ```typescript
   // Add to user settings schema:
   dailyDiscoveryBudgetCents: number | null;  // Separate from interaction budget
   discoveryBudgetResetHour: number;          // Can be different timing
   ```

### B. Implementation Plan

#### Phase 1: Budget Enforcement (Week 1)
```typescript
// 1. Extend checkBudgetAndGetKey() to handle discovery operations:
export async function checkDiscoveryBudgetAndGetKey(
  userId: string,
  operationType: 'discovery' | 'user-interaction'
): Promise<BudgetCheckResult>

// 2. Add discovery budget check before entity extraction:
// In entity-extractor.ts:
const budgetCheck = await checkDiscoveryBudgetAndGetKey(userId, 'discovery');
if (!budgetCheck.allowed) {
  throw new Error('Discovery budget exceeded');
}
```

#### Phase 2: Scheduled Job Controls (Week 2)
```typescript
// 3. Add budget checks to scheduled functions:
// In ingest-emails.ts before processing:
const budgetOk = await checkDiscoveryBudgetAndGetKey(user.userId, 'discovery');
if (!budgetOk.allowed) {
  console.log(`Skipping user ${user.email} - discovery budget exceeded`);
  continue;
}

// 4. Add graceful degradation - reduce processing frequency when approaching limit
```

#### Phase 3: User Controls (Week 3)
```typescript
// 5. UI controls for discovery budget management
// 6. Separate discovery/interaction budget displays
// 7. Discovery pause/resume controls
```

### C. Alternative Approaches

#### Option 1: Discovery Quotas (Simpler)
- Limit discovery to X emails/day per user regardless of cost
- Easier to implement, predictable
- Less flexible than budget-based approach

#### Option 2: Smart Scheduling (Advanced)
- Process discovery during user's low-activity hours
- Batch operations to reduce per-email overhead
- Adaptive scheduling based on budget status

#### Option 3: Freemium Model (Business-focused)
- Free tier: Limited discovery quota
- Paid tier: Higher discovery budgets
- Premium tier: Unlimited discovery

---

## 8. Implementation Checklist

### Budget System Enhancement
- [ ] Add `dailyDiscoveryBudgetCents` to user settings table
- [ ] Extend `checkBudgetAndGetKey()` for discovery operations
- [ ] Add discovery spend filtering to `getCurrentDailySpendCents()`
- [ ] Update `trackLLMUsage()` to differentiate discovery vs user operations

### Discovery Operation Controls
- [ ] Add budget checks to `ingest-emails.ts` scheduled function
- [ ] Add budget checks to `EntityExtractor.extractFromEmail()`
- [ ] Add budget checks to relationship discovery functions
- [ ] Implement graceful degradation when budget exceeded

### User Interface Updates
- [ ] Discovery budget settings in user preferences
- [ ] Separate budget displays for discovery vs interactions
- [ ] Discovery pause/resume controls
- [ ] Budget exhaustion notifications

### Monitoring and Alerts
- [ ] Discovery budget utilization dashboards
- [ ] Automated alerts when approaching budget limits
- [ ] Cost reporting by operation type
- [ ] Discovery operation pause/resume logging

---

## 9. Technical Specifications

### Database Schema Changes

```sql
-- Add discovery budget fields to user settings
ALTER TABLE user_settings ADD COLUMN daily_discovery_budget_cents INTEGER DEFAULT 100; -- $1 default
ALTER TABLE user_settings ADD COLUMN discovery_budget_reset_hour INTEGER DEFAULT 0;

-- Add operation type to LLM usage for better tracking
ALTER TABLE llm_usage ADD COLUMN operation_category VARCHAR(20) DEFAULT 'user-interaction';
-- Categories: 'discovery', 'user-interaction', 'training'
```

### Configuration Updates

```typescript
// Add to DEFAULT_EXTRACTION_CONFIG:
interface ExtractionConfig {
  // ... existing fields
  budgetCheck: boolean;           // Enable budget checking (default: true)
  maxCostPerOperation: number;    // Fail-safe per-operation limit
  operationType: 'discovery' | 'user-interaction';
}
```

---

## 10. Risk Assessment

### High-Impact Risks
1. **Runaway Costs:** Unlimited discovery processing can accumulate significant costs
2. **User Surprise:** Discovery costs are invisible to users with daily budgets
3. **System Scalability:** As user base grows, discovery costs scale linearly

### Medium-Impact Risks
1. **Implementation Complexity:** Adding discovery budget requires careful integration
2. **User Experience:** Budget exhaustion might interrupt important discovery
3. **False Budget Exhaustion:** Incorrect budget calculations could pause legitimate operations

### Mitigation Strategies
1. **Implement graduated warnings** at 70%, 85%, 95% of discovery budget
2. **Add manual override capabilities** for critical discovery operations
3. **Provide detailed cost breakdowns** so users understand discovery spending
4. **Implement per-operation cost limits** as fail-safes

---

## 11. Success Metrics

### Budget Control Effectiveness
- Discovery costs stay within user-defined limits
- Zero unexpected budget overages reported by users
- Discovery operations pause appropriately when budget exceeded

### User Experience
- Users can set and monitor discovery budgets easily
- Discovery operations resume automatically after budget reset
- Clear cost attribution between discovery and user interactions

### System Performance
- Discovery operations maintain current processing speed when within budget
- Graceful degradation when approaching budget limits
- No impact on user interaction performance

---

## Conclusion

The budget overage issue stems from **discovery operations using unlimited system API keys** while user budget controls only apply to BYOK scenarios. The solution requires implementing **separate discovery budget tracking and enforcement** across all scheduled operations.

**Priority Actions:**
1. Implement discovery budget checks in `checkBudgetAndGetKey()`
2. Add budget enforcement to `ingest-emails.ts` scheduled function
3. Separate discovery vs user interaction spend tracking
4. Add user controls for discovery budget management

This will provide users with **predictable discovery costs** and **prevent runaway budget consumption** while maintaining the current functionality and performance of the discovery system.

**Estimated Implementation Time:** 2-3 weeks
**Estimated Cost Savings:** 70-90% reduction in unexpected budget overages
**Risk Level:** Medium (requires careful integration with existing scheduled operations)