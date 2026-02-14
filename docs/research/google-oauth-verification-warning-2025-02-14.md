# Google OAuth "App Not Verified" Warning - Research

**Research Date:** 2025-02-14
**Issue:** User sees "Google hasn't verified this app" warning during OAuth consent
**Developer:** bob@matsuoka.com

---

## Executive Summary

The "Google hasn't verified this app" warning appears because your OAuth application is in **Testing** publishing status with **sensitive/restricted scopes** (Gmail, Calendar, Drive, etc.). This research provides immediate workarounds and long-term solutions.

**Quick Fix (Immediate):**
1. Add user email to test users list in Google Cloud Console
2. User clicks "Advanced" → "Go to [App Name] (unsafe)" to proceed

**Long-Term Solutions:**
1. Keep Testing mode + add all users as test users (up to 100 users)
2. Submit for verification (production use, unlimited users)
3. Reduce scopes to avoid verification requirements

---

## Why This Warning Appears

### Root Cause
Google shows this warning when **ALL** of these conditions are met:

1. **Publishing Status:** OAuth consent screen is in "Testing" mode
2. **Sensitive Scopes:** App requests restricted/sensitive scopes (Gmail, Drive, Calendar, etc.)
3. **User Not Listed:** User's email is not in the test users list
4. **No Verification:** App has not completed Google's verification process

### Your Current Configuration

From `/src/lib/auth/index.ts` (lines 154-170):

```typescript
scope: [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',              // Restricted
  'https://www.googleapis.com/auth/calendar.events',       // Restricted
  'https://www.googleapis.com/auth/gmail.readonly',        // Restricted
  'https://www.googleapis.com/auth/gmail.modify',          // Restricted (most sensitive)
  'https://www.googleapis.com/auth/gmail.send',            // Restricted
  'https://www.googleapis.com/auth/gmail.settings.basic',  // Restricted
  'https://www.googleapis.com/auth/tasks',                 // Standard
  'https://www.googleapis.com/auth/drive.readonly',        // Restricted
  'https://www.googleapis.com/auth/contacts',              // Restricted
  'https://www.googleapis.com/auth/contacts.readonly',     // Restricted
  'https://www.googleapis.com/auth/chat.spaces.readonly',  // Restricted
  'https://www.googleapis.com/auth/chat.messages.readonly' // Restricted
]
```

**Verdict:** 12 out of 15 scopes are restricted/sensitive, triggering verification requirements.

---

## Solution 1: Add Test Users (Immediate - No Verification Needed)

### When to Use
- **Private beta** with <100 users
- **Development/testing** environment
- **Internal tools** for your organization
- **Avoiding verification process** (saves months of time)

### Steps

1. **Open Google Cloud Console**
   - Go to https://console.cloud.google.com/
   - Select your project

2. **Navigate to OAuth Consent Screen**
   - APIs & Services → OAuth consent screen
   - Or direct link: https://console.cloud.google.com/apis/credentials/consent

3. **Add Test Users**
   - Under "Test users" section, click "ADD USERS"
   - Enter user emails (one per line):
     ```
     user1@gmail.com
     user2@example.com
     bob@matsuoka.com
     ```
   - Click "SAVE"

4. **Verify Publishing Status**
   - Confirm "Publishing status" shows **"Testing"**
   - Confirm "User type" shows **"External"** (or "Internal" for Google Workspace)

5. **Test**
   - User completes OAuth flow
   - Warning still appears BUT user can click "Advanced" → "Go to [App Name] (unsafe)"
   - After clicking through, user is authenticated normally

### Limitations
- **Maximum 100 test users** in Testing mode
- Users must click "Advanced" link to proceed (can't be automated)
- Test users see warning but can bypass it
- Must manually add each user's email

### User Experience

**What User Sees:**
```
Google hasn't verified this app

The app is requesting access to sensitive info in your Google Account.
Until the developer (bob@matsuoka.com) verifies this app with Google,
you shouldn't use it.

[Go back] [Advanced]

↓ (After clicking "Advanced")

Go to [App Name] (unsafe)
If you understand the risks, you can continue to [App Name].

[Continue]
```

---

## Solution 2: Google Workspace Internal Apps (No Verification)

### When to Use
- **Google Workspace organization** (not personal Gmail)
- **Internal tools** for your company only
- **Unlimited users** within your organization
- **No external users** outside your Workspace domain

### Steps

1. **Verify Google Workspace Admin Access**
   - Must be Google Workspace admin to configure internal apps
   - Cannot use personal Gmail accounts

2. **Change OAuth Consent Screen User Type**
   - Google Cloud Console → OAuth consent screen
   - Click "MAKE INTERNAL"
   - Confirm change (irreversible without verification)

3. **Benefits**
   - **No verification required** for any scopes
   - **No user limit** (all Workspace users)
   - **No warning screen** for users in your domain
   - **Immediate deployment**

4. **Limitations**
   - Only users in your Google Workspace domain can authenticate
   - External users (Gmail, other domains) blocked entirely
   - Requires Google Workspace (not free Gmail)
   - Cannot switch back to External without verification

---

## Solution 3: Submit for Verification (Production - Unlimited Users)

### When to Use
- **Public application** with unlimited users
- **Production deployment** requiring no warnings
- **Professional credibility** (no "unsafe" warnings)
- **Marketing/sales** (smooth user experience)

### Verification Requirements

#### Mandatory Requirements

1. **Verified Domain Ownership**
   - Must own domain (e.g., izzie.bot)
   - Add verification meta tag or DNS record
   - Verify via Google Search Console

2. **Privacy Policy URL**
   - Publicly accessible privacy policy page
   - Must explain data usage for each scope
   - Example: https://izzie.bot/privacy

3. **Terms of Service URL** (recommended)
   - Publicly accessible terms of service
   - Example: https://izzie.bot/terms

4. **YouTube Video Demo** (for restricted scopes)
   - Unlisted YouTube video showing:
     - OAuth flow start to finish
     - How each restricted scope is used
     - User data access and display
     - Data deletion/revocation flow
   - 2-5 minutes recommended

5. **OAuth Scopes Justification**
   - Written explanation for EACH restricted scope
   - Why the scope is necessary for app functionality
   - Alternative approaches considered
   - User benefit for granting scope

6. **Application Homepage**
   - Public homepage explaining app functionality
   - Must match OAuth consent screen description
   - Example: https://izzie.bot

#### Security Requirements

1. **Security Assessment**
   - If app has ≤100 users: Self-assessment form
   - If app has >100 users: Third-party security assessment
   - If app handles payments: PCI DSS compliance

2. **Secure Token Storage**
   - Encrypted token storage (at rest and in transit)
   - Secure token refresh mechanism
   - Token revocation support

3. **Security Contacts**
   - Valid security contact email
   - Incident response plan

### Verification Process Timeline

**Stage 1: Initial Submission (Week 1)**
- Complete OAuth consent screen
- Submit all required documentation
- Google reviews initial submission

**Stage 2: Review Process (Weeks 2-6)**
- Google's OAuth team reviews application
- May request clarifications or additional info
- Video demo review
- Security assessment review

**Stage 3: Testing (Weeks 6-8)**
- Google testers use your application
- Verify all scopes are used appropriately
- Check security measures

**Stage 4: Approval/Rejection (Week 8+)**
- Approved: App published, warnings removed
- Rejected: Detailed feedback, resubmission allowed
- Partial approval: Some scopes approved, others rejected

**Total Timeline:** 2-3 months average (can be longer for complex apps)

### Steps to Submit

1. **Prepare Documentation**
   - Privacy policy page
   - Terms of service page
   - YouTube demo video
   - Scope justification document

2. **Configure OAuth Consent Screen**
   - Google Cloud Console → OAuth consent screen
   - Add all required URLs
   - Add app logo (400x400 px PNG)
   - Write clear app description

3. **Submit for Verification**
   - Click "PUBLISH APP" button
   - Choose "Submit for verification"
   - Complete verification questionnaire
   - Upload supporting documents

4. **Respond to Review Requests**
   - Google may email questions
   - Respond within 7 days to avoid delays
   - Provide additional info if requested

5. **Post-Approval**
   - Verification badge appears
   - Users see "Verified by Google"
   - No warnings during OAuth flow

---

## Solution 4: Reduce Scopes (Avoid Verification)

### When to Use
- **Minimal viable product** with limited features
- **Avoiding verification process** entirely
- **Public application** but limited scope needs
- **Development/prototyping** phase

### Scope Classification

**Non-Sensitive Scopes (No Verification):**
- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/userinfo.profile`

**Restricted Scopes (Require Verification):**
- All Gmail scopes (readonly, modify, send, settings)
- All Calendar scopes
- All Drive scopes
- All Contacts scopes
- All Chat scopes

### Trade-Offs

**Pros:**
- No verification needed
- No user warnings
- Immediate deployment
- No maintenance burden

**Cons:**
- **Cannot access Gmail, Calendar, Drive, etc.**
- **Severely limits functionality**
- May require architectural changes
- Not viable for most production apps

### If You Can Reduce Scopes

1. **Analyze Scope Usage**
   - Which scopes are actually used?
   - Which are "nice to have" vs critical?
   - Can functionality be moved to different API?

2. **Remove Unused Scopes**
   - Update `src/lib/auth/index.ts` scope array
   - Test OAuth flow
   - Verify app functionality intact

3. **Alternative APIs**
   - Consider public APIs that don't require OAuth
   - Use webhooks instead of polling
   - Third-party integrations (Zapier, etc.)

---

## Comparison Matrix

| Solution | Verification Needed? | User Limit | User Warning? | Timeline | Best For |
|----------|---------------------|------------|---------------|----------|----------|
| **Testing + Test Users** | ❌ No | 100 users | ⚠️ Yes (bypassable) | Immediate | Private beta, development |
| **Internal (Workspace)** | ❌ No | Unlimited* | ❌ No | Immediate | Company internal tools |
| **Full Verification** | ✅ Yes | Unlimited | ❌ No | 2-3 months | Public production apps |
| **Reduce Scopes** | ❌ No | Unlimited | ❌ No | Immediate | Limited functionality MVP |

*Unlimited within your Google Workspace domain only

---

## Recommended Approach for Your Project

Based on your application (izzie.bot with Gmail, Calendar, Drive, Contacts, Tasks integration):

### Phase 1: Immediate (This Week)
**Use Testing Mode + Test Users**

1. Add all current users to test users list (max 100)
2. Update user onboarding to explain warning and "Advanced" link
3. Document bypass process in help docs
4. Continue development without verification delays

**Why:** Unblocks users immediately, no verification overhead, supports up to 100 users.

### Phase 2: Growth (Months 2-4)
**Submit for Verification**

**When to trigger:**
- Approaching 80+ test users (hitting limit)
- Planning public launch/marketing
- Want professional credibility
- User feedback requests smoother onboarding

**Preparation (Start 1 month before submission):**
1. Create privacy policy page
2. Create terms of service page
3. Record demo video (2-5 minutes)
4. Write scope justification document
5. Set up verified domain (izzie.bot already owned)

**Timeline:** Start 2 months before you need verification complete.

### Phase 3: Post-Verification (Month 5+)
**Production Deployment**

- All users see smooth OAuth flow
- No warnings or bypass steps
- Professional verification badge
- Unlimited user scaling

---

## Implementation Steps for Your Project

### Step 1: Add Test Users (Today)

```bash
# No code changes needed - Console only

1. Visit: https://console.cloud.google.com/apis/credentials/consent
2. Click "ADD USERS" under "Test users"
3. Add user emails (including bob@matsuoka.com)
4. Click "SAVE"
5. Test OAuth flow with added user
```

### Step 2: Update User Documentation (This Week)

Create user guide explaining bypass process:

```markdown
# Connecting Your Google Account

When connecting your Google account, you may see a warning:
"Google hasn't verified this app"

This is normal for applications in beta testing. Here's how to proceed:

1. Click "Advanced" at the bottom of the warning screen
2. Click "Go to Izzie (unsafe)"
3. Review the permissions requested
4. Click "Continue" to grant access

Why do you see this warning?
- Our app is in private beta (testing mode)
- Google requires verification for public apps
- We'll complete verification before public launch
- Your data is secure and never shared

Is it safe?
- Yes! This warning appears because we're in beta testing
- We use industry-standard OAuth 2.0 security
- Your credentials are never stored by our app
- You can revoke access anytime in Google Account settings
```

### Step 3: Monitor Test User Limit

```typescript
// Add to admin dashboard
async function getTestUserCount() {
  // Query Google Cloud API to get current test user count
  // Alert when approaching 80 users (80% of 100 limit)

  if (testUserCount >= 80) {
    console.warn('Approaching test user limit. Start verification process.');
  }
}
```

### Step 4: Prepare for Verification (Future)

When approaching 80 test users:

1. **Start Documentation**
   - Draft privacy policy
   - Draft terms of service
   - Outline scope justifications

2. **Record Demo Video**
   - Script showing OAuth flow
   - Demonstrate each scope usage
   - Show data access and deletion

3. **Domain Verification**
   - Already own izzie.bot ✅
   - Add Google Search Console verification

4. **Submit for Review**
   - Allow 2-3 months for approval
   - Respond promptly to Google requests

---

## References

### Official Documentation
- [OAuth Consent Screen Configuration](https://support.google.com/cloud/answer/10311615)
- [OAuth App Verification](https://support.google.com/cloud/answer/9110914)
- [Restricted Scopes List](https://developers.google.com/identity/protocols/oauth2/scopes)

### Your Configuration
- OAuth Config: `/src/lib/auth/index.ts` (lines 149-174)
- Current Scopes: 15 total (12 restricted)
- Developer Email: bob@matsuoka.com
- App Domain: izzie.bot

### Key Contacts
- Google Cloud Console: https://console.cloud.google.com/
- OAuth Consent Screen: https://console.cloud.google.com/apis/credentials/consent
- Support: https://support.google.com/cloud/

---

## Appendix: Scope-by-Scope Justification Template

Use this template when submitting for verification:

### gmail.readonly
**Why Needed:** Allow users to search and retrieve their email messages for context-aware AI responses.
**User Benefit:** AI can reference email content when answering questions about projects, contacts, and tasks.
**Alternatives Considered:** IMAP access (rejected: less secure), Email forwarding (rejected: poor UX)

### gmail.modify
**Why Needed:** Enable AI to organize emails (labels, archives) and create filters based on user preferences.
**User Benefit:** Automated email organization and cleanup based on user's workflow patterns.
**Alternatives Considered:** Manual user actions (rejected: defeats automation purpose)

### gmail.send
**Why Needed:** Allow AI to send emails on behalf of user (drafts, replies, scheduled sends).
**User Benefit:** AI can compose and send emails based on user instructions and context.
**Alternatives Considered:** Draft-only (rejected: requires extra user step)

### gmail.settings.basic
**Why Needed:** Create and manage Gmail filters for automated email organization.
**User Benefit:** AI creates personalized filters based on user's email patterns and preferences.
**Alternatives Considered:** Manual filter creation (rejected: defeats automation purpose)

### calendar
**Why Needed:** Read and create calendar events for scheduling and time management assistance.
**User Benefit:** AI can schedule meetings, suggest optimal times, and manage calendar conflicts.
**Alternatives Considered:** Read-only calendar (rejected: cannot create events)

### drive.readonly
**Why Needed:** Access user's Google Drive files for context-aware document assistance.
**User Benefit:** AI can reference and summarize documents when answering questions.
**Alternatives Considered:** Manual file upload (rejected: poor UX for frequent access)

### contacts
**Why Needed:** Access contact information for email composition and communication assistance.
**User Benefit:** AI can address emails correctly and suggest relevant contacts for tasks.
**Alternatives Considered:** Manual contact entry (rejected: duplicates existing contact data)

### tasks
**Why Needed:** Create and manage Google Tasks from email and calendar context.
**User Benefit:** AI can extract action items from emails/meetings and create tasks automatically.
**Alternatives Considered:** Third-party task managers (rejected: fragmented user experience)

---

**End of Research Document**

**Next Steps:**
1. Add user to test users list immediately
2. Update user documentation with bypass instructions
3. Monitor test user count (set up alerts at 80 users)
4. Start verification preparation when approaching limit
