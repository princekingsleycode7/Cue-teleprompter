# CueStage Security Specification

## 1. Data Invariants
1. **Strict Ownership**: Every `UserProfile` (`/users/{userId}`) and `CloudScript` (`/users/{userId}/scripts/{scriptId}`) belongs strictly to a single verified Firebase Auth user (`request.auth.uid == userId && request.auth.token.email_verified == true`).
2. **Master Gate Parent Integrity**: A `CloudScript` cannot be created or updated unless the parent `/users/{userId}` document exists.
3. **Immutable Identity & Timestamps**: `uid`, `id`, `ownerId`, and `createdAt` are immutable after document creation. `createdAt` and `updatedAt` must strictly equal `request.time`.
4. **Payload Bounds & Key Allowlisting**: All string lengths are bounded (`title <= 200`, `content <= 200000`, `id <= 128`, `displayName <= 120`, `email <= 200`), IDs match `^[a-zA-Z0-9_-]+$`, and shadow/ghost keys are rejected via `hasOnly()`.

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. **Unauthenticated Read**: Read `/users/userA/scripts/s1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Create `/users/userA` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Cross-User Profile Read (PII Leak)**: UserB reads `/users/userA` -> `PERMISSION_DENIED`.
4. **Cross-User Script List**: UserB lists `/users/userA/scripts` -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Create**: UserB creates `/users/userB/scripts/s1` with `ownerId: "userA"` -> `PERMISSION_DENIED`.
6. **Shadow / Ghost Field Injection**: UserA creates script with extra key `isAdmin: true` -> `PERMISSION_DENIED`.
7. **Orphaned Script Create**: UserA creates `/users/userA/scripts/s1` before `/users/userA` exists -> `PERMISSION_DENIED`.
8. **ID Poisoning**: UserA attempts create with `scriptId` containing spaces or `>128` chars -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: UserA creates script with backdated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
10. **Immutable Owner Mutation**: UserA updates script changing `ownerId` -> `PERMISSION_DENIED`.
11. **Oversized Content DoS**: UserA writes `content` exceeding `200000` characters -> `PERMISSION_DENIED`.
12. **Invalid Format Enum**: UserA writes `format: "exe"` -> `PERMISSION_DENIED`.
