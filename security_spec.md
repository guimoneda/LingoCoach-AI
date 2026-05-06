# Security Specification - LingoCoach AI

## 1. Data Invariants
- **Evaluations**:
  - Must have a valid `userId` matching the authenticated user.
  - `fluencyScore` must be an integer between 0 and 100.
  - `createdAt` must be `request.time`.
  - Immutable after creation.
  - Only accessible by the owner.
- **Users**:
  - `uid` must match the document ID and the authenticated user's UID.
  - `email` must be valid.
  - `createdAt` is immutable.
  - Only accessible by the owner.

## 2. The Dirty Dozen (Test Payloads)

| ID | Target | Action | Payload / Scenario | Expected |
|----|--------|--------|---------------------|----------|
| D1 | evaluations | create | `userId: "other_user"` | DENY |
| D2 | evaluations | create | `fluencyScore: 150` | DENY |
| D3 | evaluations | create | `createdAt: "2023-01-01T00:00:00Z"` | DENY |
| D4 | evaluations | create | `{..., isVerified: true}` (ghost field) | DENY |
| D5 | users | create | `uid: "different_uid"` | DENY |
| D6 | users | update | changing `createdAt` | DENY |
| D7 | evaluations | create | `transcription` > 5000 chars | DENY |
| D8 | evaluations | get | ID: `../junk/path` | DENY |
| D9 | evaluations | list | No `where("userId", "==", uid)` filter | DENY |
| D10| evaluations | update | Any change to existing eval | DENY |
| D11| users | create | Missing `email` | DENY |
| D12| evaluations | create | `pronunciationTips` with invalid structure | DENY |

## 3. Test Runner (Draft)
A `firestore.rules.test.ts` will be implemented to verify these.
