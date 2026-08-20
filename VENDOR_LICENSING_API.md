# Vendor Licensing API — Complete Reference

> **This file is the single source of truth for the Vendor Licensing / Software Control API.**
> It was written by directly reading every controller, DTO, and service in
> `apps/api/src/modules/vendor-licensing/` on 2026-08-20 — nothing here is aspirational or
> paraphrased. Every endpoint, field name, status code, and error message below is copied from
> the actual implementation. If something isn't in this document, it doesn't exist in the API yet
> (see the **Missing APIs** section for known gaps). You do not need to read the backend source
> code to build the Admin Dashboard — everything you need is here.

**Scope reminder:** this is a backend-only system. There is no admin UI in this codebase and none
should be built here — a separate Admin Software (consuming the Private Admin API below) is a
different project.

```
CUSTOMER SOFTWARE  ---->  /vendor-license/*   ---->  Backend / Database
                                                             ^
YOUR ADMIN DASHBOARD -->  /vendor-admin/*    ------------- -+
```

---

## Table of contents

1. [Connection information](#1-connection-information)
2. [Authentication](#2-authentication)
3. [Enums / constants reference](#3-enums--constants-reference)
4. [Admin API: Packages](#4-admin-api-packages)
5. [Admin API: Customers (= Companies)](#5-admin-api-customers--companies)
6. [Admin API: Licenses](#6-admin-api-licenses)
7. [Device limit management](#7-device-limit-management)
8. [Admin API: Devices](#8-admin-api-devices)
9. [Admin API: Subscriptions](#9-admin-api-subscriptions)
10. [Admin API: Dashboard](#10-admin-api-dashboard)
11. [Client Software API (public, not for the dashboard)](#11-client-software-api-public-not-for-the-dashboard)
12. [Error responses](#12-error-responses)
13. [Rate limiting](#13-rate-limiting)
14. [Pagination, search, filtering — index](#14-pagination-search-filtering--index)
15. [Date/time format](#15-datetime-format)
16. [Security notes for the dashboard developer](#16-security-notes-for-the-dashboard-developer)
17. [Admin Dashboard screen → API mapping](#17-admin-dashboard-screen--api-mapping)
18. [Complete workflow examples](#18-complete-workflow-examples)
19. [Missing APIs](#19-missing-apis)
20. [Postman collection](#20-postman-collection)

---

## 1. Connection information

### Development base URL
```
http://localhost:4000/api/v1
```

### Production base URL
There is no hardcoded production domain anywhere in this codebase, by design — the port and app
name come from environment variables (`apps/api/src/config/configuration.ts`,
`APP_PORT` / `.env`), and whatever process/reverse-proxy runs `apps/api` in production determines
the public hostname. **Your Admin Dashboard must read this from its own environment/config, not
hardcode it.** Expected format, once deployed:
```
https://<your-api-host>/api/v1
```
Ask whoever manages the production deployment for the actual value — it is not defined in this
repository.

### Every route in this document is relative to the base URL above
E.g. "`POST /vendor-admin/auth/login`" means `POST {baseUrl}/vendor-admin/auth/login`.

### Content-Type
Every request with a body must send:
```
Content-Type: application/json
```
Every response body is JSON. The global validation pipe is strict: `whitelist: true,
forbidNonWhitelisted: true` — sending a field that isn't in that endpoint's documented request
body below will make the **entire request fail with 400**, not silently ignore the extra field.
This exact class of bug (`osInfo` vs `platform`) was caught during development — send exactly the
field names documented here, nothing more.

### Bearer token format
For every Private Admin API request:
```
Authorization: Bearer <accessToken>
```
where `<accessToken>` is the string returned by `POST /vendor-admin/auth/login`. No other header
is required or checked.

### Public vs. Admin — how to tell which is which
| | Route prefix | Needs `Authorization` header? |
|---|---|---|
| **Private Admin API** (for your dashboard) | `/vendor-admin/*` | Yes, on every route except `POST /vendor-admin/auth/login` |
| **Client Software API** (for the installed ERP app — not for your dashboard) | `/vendor-license/*` | No — never send an admin token here, and it wouldn't be accepted anyway (see §2) |

---

## 2. Authentication

### `POST /vendor-admin/auth/login`
- **Auth required:** No.
- **Rate limit:** 10 requests / 5 minutes / IP (see §13).
- **Request body:**
  ```json
  { "email": "owner@bizovix.com", "password": "YourPassword123" }
  ```
  DTO fields (`VendorAdminLoginDto`): `email` (string, must be a valid email, **required**),
  `password` (string, minimum 6 characters, **required**). No other fields are accepted.
- **Success response — HTTP 201:**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "admin": { "id": "cmt11oq9x0000bnvoace6trdg", "email": "owner@bizovix.com", "name": "Bizovix Owner" },
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```
  **The token is at `data.accessToken`. The admin profile is nested at `data.admin`.**
- **Error — HTTP 401** (wrong email or password — the message is identical for both, to avoid
  revealing which one was wrong):
  ```json
  { "success": false, "message": "Invalid email or password" }
  ```
- **Error — HTTP 429:** see §13.
- **Token lifetime:** controlled by env var `VENDOR_ADMIN_JWT_EXPIRES_IN` (default `12h`). There is
  **no refresh-token endpoint** — when the token expires, call login again.

There is no self-registration endpoint. The first (and any additional) admin login is created
from the command line on the server, not through the API:
```bash
cd apps/api
pnpm vendor-admin:create -- --email=you@yourcompany.com --password=YourPass123 --name="Your Name"
```

### `GET /vendor-admin/auth/me`
- **Auth required:** Yes.
- **Purpose:** verify the current token is still valid and fetch the logged-in admin's profile —
  call this on dashboard load to decide whether to show the login screen.
- **Success response — HTTP 200:**
  ```json
  { "success": true, "data": { "id": "cmt11oq9x0000bnvoace6trdg", "email": "owner@bizovix.com", "name": "Bizovix Owner" } }
  ```
  **Note the shape difference from login:** here the admin object is `data` directly — there is
  **no** `data.admin` wrapper like login has. Do not write `response.data.admin.email` for this
  endpoint; it must be `response.data.email`.
- **Error — HTTP 401** (missing header, malformed token, expired token, or bad signature):
  ```json
  { "success": false, "message": "Unauthorized" }
  ```
- **Error — HTTP 401** (token is well-formed and unexpired, but the admin account it names has
  since been deactivated in the database):
  ```json
  { "success": false, "message": "Admin account is no longer active" }
  ```

### Isolation from the tenant/customer authentication system
This vendor-admin identity (`VendorAdminUser` table) is **completely separate** from the ERP's own
tenant/user/organization login system. This was verified directly:
- A tenant/customer JWT sent to any `/vendor-admin/*` route → **401 Unauthorized**.
- A vendor-admin JWT sent to any tenant/ERP route (e.g. `/auth/me`) → **401 Unauthorized**.
- A customer's license key can **never** be used as an admin credential — the Client Software API
  and Private Admin API accept completely different kinds of secrets (license key + device id vs.
  a signed JWT), and neither one works against the other's routes.

---

## 3. Enums / constants reference

Every enum value below is copied verbatim from `packages/database/prisma/schema.prisma`. These
are the only legal values for the corresponding field — anything else is rejected by validation.

**`VendorLicenseType`** (a license's commercial type):
```
ONE_TIME | SUBSCRIPTION | TRIAL
```

**`VendorLicenseStatus`** (a license's live authorization state — checked by `/activate`,
`/verify`, `/heartbeat`):
```
ACTIVE | EXPIRED | SUSPENDED | REVOKED
```

**`VendorSubscriptionStatus`** (a subscription's billing state — separate from license status,
see §9):
```
ACTIVE | EXPIRED | SUSPENDED | CANCELLED
```

**`VendorBillingCycle`** (only meaningful on `SUBSCRIPTION`-type packages/subscriptions):
```
MONTHLY | QUARTERLY | YEARLY
```

**`VendorDeviceStatus`** (a single device activation's state):
```
ACTIVE | DEACTIVATED
```

**License/audit event `type` strings** — see the exhaustive table in §10 (Activity feed). This is
a free-text field, not a database enum, but the set of values the code actually writes is fixed
and fully enumerated there.

---

## 4. Admin API: Packages

A package is the sellable plan definition. Issuing a license or subscription always references
one, and the package supplies the *default* device limit and (for `SUBSCRIPTION`) billing cycle —
**these defaults can always be overridden per-license** (see §7).

### Package fields (as actually returned by the API)
| Field | Type | Meaning |
|---|---|---|
| `id` | string | |
| `code` | string, unique | e.g. `"BIZ-LIFETIME"` |
| `name` | string | display name |
| `description` | string \| null | |
| `type` | `VendorLicenseType` | |
| `billingCycle` | `VendorBillingCycle` \| null | only set on `SUBSCRIPTION` packages |
| `maxDevices` | number | **the default device limit for new licenses issued from this package** |
| `durationDays` | number \| null | trial length (for `TRIAL`); one billing period's length in days (for `SUBSCRIPTION`, informational — actual period math uses `billingCycle`); `null` = perpetual (for `ONE_TIME`) |
| `price` | string \| null | returned as a decimal **string**, e.g. `"499.00"`, not a number |
| `currency` | string | default `"USD"` |
| `features` | object \| null | free-form JSON, echoed back to the client software on activate/verify |
| `isActive` | boolean | |
| `sortOrder` | number | default `0` |
| `createdAt`, `updatedAt` | ISO-8601 string | |
| `_count.licenseKeys` | number | *(list/get only)* how many licenses have ever been issued from this package |

### `GET /vendor-admin/packages`
No query parameters. Returns **all** packages (not paginated — see §14), sorted by `sortOrder`
then `createdAt`, each including `_count.licenseKeys`.
- **Success — HTTP 200:** `{ "success": true, "data": [ { ...package fields... }, ... ] }`

### `POST /vendor-admin/packages`
- **Request body** (`CreateVendorPackageDto`):

  | Field | Required | Type | Notes |
  |---|---|---|---|
  | `code` | yes | string | must be non-empty |
  | `name` | yes | string | must be non-empty |
  | `type` | yes | enum | `ONE_TIME` \| `SUBSCRIPTION` \| `TRIAL` |
  | `maxDevices` | yes | integer ≥ 1 | **this is what a new license's device limit defaults to** |
  | `description` | no | string | |
  | `billingCycle` | no | enum | only meaningful for `type: SUBSCRIPTION`; if omitted on a SUBSCRIPTION package, defaults to `MONTHLY` **at license-issuance time**, not here — the package record itself will show `billingCycle: null` until you set it |
  | `durationDays` | no | integer ≥ 1 | |
  | `price` | no | number | |
  | `currency` | no | string | |
  | `features` | no | object | any JSON object |
  | `isActive` | no | boolean | |

- **Example — one-time package:**
  ```json
  { "code": "BIZ-LIFETIME", "name": "Business Lifetime", "type": "ONE_TIME", "maxDevices": 3, "price": 499, "currency": "USD" }
  ```
- **Example — SaaS monthly package:**
  ```json
  { "code": "SAAS-MONTHLY", "name": "SaaS Monthly", "type": "SUBSCRIPTION", "billingCycle": "MONTHLY", "maxDevices": 3, "durationDays": 30, "price": 49 }
  ```
- **Example — trial package:**
  ```json
  { "code": "TRIAL-14", "name": "14-Day Trial", "type": "TRIAL", "maxDevices": 1, "durationDays": 14 }
  ```
  > At least one `TRIAL`-type, `isActive: true` package **must exist** before the client software's
  > self-serve `POST /vendor-license/trial` will work — see §11.
- **Success — HTTP 201:** the created package object (without `_count`).

### `GET /vendor-admin/packages/:id`
- **Success — HTTP 200:** the package, including `_count.licenseKeys`.
- **Error — HTTP 404:** `{ "success": false, "message": "Package not found" }`

### `PATCH /vendor-admin/packages/:id`
- **Request body:** every field from the create DTO, all optional (`UpdateVendorPackageDto` is a
  partial of `CreateVendorPackageDto` — same field names/types/enum values as above, just none
  required).
- **Example — deactivate a package (retire it from new sales without touching existing licenses):**
  ```json
  { "isActive": false }
  ```
- **Example — reprice:**
  ```json
  { "price": 599 }
  ```
- **Success — HTTP 200:** the updated package.
- **Error — HTTP 404:** package not found.

**There is no DELETE endpoint for packages** (and none for customers/licenses either — see §19).
A package referenced by any issued license cannot be hard-deleted in this system's data model;
use `PATCH { "isActive": false }` to retire it instead. Existing licenses on a deactivated package
keep working exactly as before — deactivating only blocks it from being chosen for *new* licenses
going forward in whatever UI/workflow you build (the API itself does not currently block issuing
against an inactive package either — see §19).

---

## 5. Admin API: Customers (= Companies)

**Important:** there is no separate "Company" entity or CRUD API. `VendorCustomer` **is** the
company record — it holds `companyName` plus a primary contact (`contactName`, `email`, `phone`).
Every place this document says "customer," it means the company account. Use these same
`/vendor-admin/customers/*` endpoints for whatever "Companies" screen you build — see §17 for the
exact recommended mapping and §8/§10 for where per-company device/license/subscription rollups
live.

### Customer fields (as actually returned)
| Field | Type |
|---|---|
| `id` | string |
| `companyName` | string |
| `contactName` | string \| null |
| `email` | string — **globally unique** across all customers |
| `phone` | string \| null |
| `address` | string \| null |
| `organizationId` | string \| null — optional free-text cross-reference to the main ERP's own tenant id, if this customer is a hosted SaaS tenant; not validated or enforced |
| `notes` | string \| null |
| `createdAt`, `updatedAt` | ISO-8601 string |
| `_count.licenseKeys` | number | *(list only)* |

### `GET /vendor-admin/customers`
- **Query parameters** (`QueryVendorCustomersDto` — these are the only three supported; there is
  no `status`, `package`, or `type` filter on this endpoint):

  | Param | Type | Default | Behavior |
  |---|---|---|---|
  | `search` | string | none | case-insensitive substring match against `companyName`, `email`, OR `contactName` |
  | `page` | integer ≥ 1 | `1` | |
  | `pageSize` | integer ≥ 1 | `20` | |

  Example: `GET /vendor-admin/customers?search=karim&page=1&pageSize=20`
- **Success — HTTP 200** (paginated — see §14 for the exact envelope shape):
  ```json
  {
    "success": true,
    "data": [ { "id": "...", "companyName": "Karim Builders", "email": "karim@example.com", "_count": { "licenseKeys": 2 }, "...": "..." } ],
    "meta": { "page": 1, "pageSize": 20, "total": 7, "totalPages": 1 }
  }
  ```

### `POST /vendor-admin/customers`
- **Request body** (`CreateVendorCustomerDto`):

  | Field | Required | Type |
  |---|---|---|
  | `companyName` | yes | non-empty string |
  | `email` | yes | valid email, must not already exist |
  | `contactName` | no | string |
  | `phone` | no | string |
  | `address` | no | string |
  | `organizationId` | no | string |
  | `notes` | no | string |

  ```json
  { "companyName": "Karim Builders", "contactName": "Karim", "email": "karim@example.com", "phone": "01700000000" }
  ```
- **Success — HTTP 201:** the created customer (no `_count` on this response).
- **Error — HTTP 409** (email already belongs to another customer — verified with a real duplicate
  request):
  ```json
  { "success": false, "message": "A customer with this email already exists" }
  ```
  Search first if you want to distinguish "reuse this customer" from "this is an error" in your
  UI: `GET /vendor-admin/customers?search=<email>`.

### `GET /vendor-admin/customers/:id`
Full detail, including every license the customer has:
```json
{
  "success": true,
  "data": {
    "id": "...", "companyName": "Karim Builders", "email": "karim@example.com", "...": "...",
    "licenseKeys": [
      {
        "id": "...", "licenseKey": "BZVX-...", "type": "ONE_TIME", "status": "ACTIVE", "maxDevices": 5,
        "expiresAt": null, "...": "...",
        "package": { "id": "...", "code": "BIZ-LIFETIME", "name": "Business Lifetime", "...": "..." },
        "subscription": null,
        "_count": { "activations": 3 }
      }
    ]
  }
}
```
- `licenseKeys[].package` — full package object, always present.
- `licenseKeys[].subscription` — full subscription object (see §9 for its fields) if this license
  is a `SUBSCRIPTION`; otherwise `null`.
- `licenseKeys[].\_count.activations` — count of **currently `ACTIVE`** device activations only
  (deactivated devices are not counted here).
- There is no `devices` array directly on this response — for the actual device list of a
  license, call `GET /vendor-admin/licenses/:id/devices` (§8) using `licenseKeys[].id`.
- **Error — HTTP 404:** `{ "success": false, "message": "Customer not found" }`

### `PATCH /vendor-admin/customers/:id`
Same fields as create, all optional (`UpdateVendorCustomerDto`).
```json
{ "phone": "01711111111" }
```
- **Success — HTTP 200:** updated customer (no `licenseKeys` nested — that's only on the `GET :id`
  detail route).
- **Error — HTTP 404:** customer not found.
- **Error — HTTP 409:** `{ "message": "A customer with this email already exists" }` — if you
  change `email` to one that already belongs to a different customer.

---

## 6. Admin API: Licenses

A license is the credential a customer's installed software activates against. It covers **all
three commercial types** — issuing a `SUBSCRIPTION`-type license also transactionally creates the
paired subscription record (§9) in the same call. **There is no separate "create subscription"
endpoint — the backend creates it automatically.**

### License fields (as actually returned)
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `licenseKey` | string, unique | format `BZVX-XXXXX-XXXXX-XXXXX-XXXXX`, e.g. `BZVX-K7XPQ-9MNRT-2WXYZ-QJ8FH` — 4 groups of 5 characters from a 32-symbol alphabet (`ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `0/O/1/I/L` to avoid transcription errors), generated with `crypto.randomBytes`, checked against existing keys and retried on collision |
| `customerId` | string | |
| `packageId` | string | |
| `type` | `VendorLicenseType` | |
| `status` | `VendorLicenseStatus` | **the single source of truth** — this is what `/activate`, `/verify`, `/heartbeat` check |
| `maxDevices` | number | overridable independently of the package default — see §7 |
| `issuedAt`, `startsAt` | ISO-8601 string | both set to creation time, currently always equal |
| `expiresAt` | ISO-8601 string \| null | `null` = perpetual (typical for `ONE_TIME`) |
| `lastValidatedAt` | ISO-8601 string \| null | updated on every successful `/activate` or `/heartbeat` call from the client software |
| `revokedAt`, `revokedReason` | ISO-8601 string \| null, string \| null | set only by `POST .../revoke` |
| `notes` | string \| null | |
| `convertedToLicenseId` | string \| null | set on a `TRIAL` license once converted — points at the new paid license's id |
| `convertedAt` | ISO-8601 string \| null | |
| `createdAt`, `updatedAt` | ISO-8601 string | |

**Nested relations, present depending on endpoint (noted per-endpoint below):**
`customer` (full customer object), `package` (full package object), `subscription` (full
subscription object, or `null` if not a SUBSCRIPTION license), `activations` (array of device
activations, see §8 for fields), `events` (array of audit events, most recent 20, see §10),
`convertedToLicense` (`{ id, licenseKey }` only, or `null`), `_count.activations` (count of
currently-`ACTIVE` activations only — appears on `list`, not on `get`).

### `GET /vendor-admin/licenses`
- **Query parameters** (`QueryVendorLicensesDto`):

  | Param | Type | Notes |
  |---|---|---|
  | `status` | enum | exact match against `VendorLicenseStatus` |
  | `type` | enum | exact match against `VendorLicenseType` |
  | `packageId` | string | exact match |
  | `customerId` | string | exact match |
  | `search` | string | case-insensitive substring match against **license key, customer company name, OR customer email** |
  | `expiringWithinDays` | integer ≥ 0 | when set, filters to licenses with `expiresAt` between now and now+N days; **if you don't also pass `status`, this silently adds `status=ACTIVE` to the filter** (i.e. it only ever shows currently-active licenses approaching expiry, never already-expired ones) |
  | `page` | integer ≥ 1 | default `1` |
  | `pageSize` | integer ≥ 1 | default `20` |

  Example: `GET /vendor-admin/licenses?type=TRIAL&status=ACTIVE&page=1&pageSize=20`
- **Success — HTTP 200** (paginated, see §14): each item includes `customer`, `package`,
  `_count.activations` — **does not** include `subscription`, `activations` array, or `events` on
  the list view (fetch `GET /vendor-admin/licenses/:id` for those).

### `POST /vendor-admin/licenses` — issue a license (= create a subscription, for SUBSCRIPTION packages)
- **Request body** (`IssueVendorLicenseDto`) — **exactly one** of `customerId` or `newCustomer`
  must be given:

  | Field | Required | Type | Notes |
  |---|---|---|---|
  | `customerId` | one-of | string | use an existing customer |
  | `newCustomer` | one-of | object | same shape as `CreateVendorCustomerDto` (§5) — creates the customer in the same request |
  | `packageId` | yes | string | |
  | `type` | no | enum | overrides the package's own `type` for this one license; if omitted, uses the package's type |
  | `maxDevices` | no | integer ≥ 1 | overrides the package's `maxDevices` default for this one license |
  | `expiresAt` | no | ISO-8601 date string | overrides the package's `durationDays`-computed expiry |
  | `notes` | no | string | |

- **Body — existing customer:**
  ```json
  { "customerId": "cmt13el8g0003bnic147bfn9a", "packageId": "cmt13ekd20000bniciwc0xg9a" }
  ```
- **Body — new customer inline:**
  ```json
  {
    "newCustomer": { "companyName": "Karim Builders", "email": "karim@example.com" },
    "packageId": "cmt13ekd20000bniciwc0xg9a"
  }
  ```
- **Success — HTTP 201:** the full license record, with `customer`, `package`, `subscription`
  (present and populated **only** if the resolved `type` is `SUBSCRIPTION`, otherwise `null`),
  `activations: []` (always empty at issuance — no device has activated yet), `events` (contains
  one `ISSUED` event, and one `SUBSCRIPTION_CREATED` event too if a subscription was created —
  see §10), `convertedToLicense: null`.
  ```json
  {
    "success": true,
    "data": {
      "id": "cmt13el8i0005bnic39bllsey", "licenseKey": "BZVX-RC9NJ-UMHCF-K8WX4-XP45B",
      "type": "ONE_TIME", "status": "ACTIVE", "maxDevices": 3, "expiresAt": null,
      "customer": { "...": "..." }, "package": { "...": "..." }, "subscription": null,
      "activations": [], "events": [ { "type": "ISSUED", "...": "..." } ], "convertedToLicense": null
    }
  }
  ```
- **Errors:**
  - **HTTP 400** `{ "message": "Provide either customerId or newCustomer" }` — neither given.
  - **HTTP 404** `{ "message": "Package not found" }` — bad `packageId`.
  - **HTTP 409** `{ "message": "A customer with this email already exists" }` — `newCustomer.email`
    collides with an existing customer. If you want to add a license to an existing customer, use
    `customerId` instead (search for them first: `GET /vendor-admin/customers?search=<email>`).

### `GET /vendor-admin/licenses/:id`
Full detail — see the "nested relations" note above for exactly what's included.
- **Error — HTTP 404:** `{ "message": "License not found" }`

### `PATCH /vendor-admin/licenses/:id`
- **Request body** (`UpdateVendorLicenseDto`), all optional:

  | Field | Type |
  |---|---|
  | `maxDevices` | integer ≥ 1 |
  | `packageId` | string (must exist) |
  | `expiresAt` | ISO-8601 date string |
  | `notes` | string |

  ```json
  { "maxDevices": 5 }
  ```
- **Success — HTTP 200:** updated license (full detail shape).
- **Audit behavior:** if `maxDevices` is the field that actually changed (compared to its prior
  value), the logged event is `DEVICE_LIMIT_CHANGED` with a message like `"Device limit changed
  from 3 to 5"`. Any other combination of fields logs a generic `UPDATED` event instead. See §10.
- **Error — HTTP 404:** license not found, or (if changing `packageId`) the new package doesn't
  exist.

### `POST /vendor-admin/licenses/:id/extend`
- **Request body** (`ExtendVendorLicenseDto`) — **exactly one** of:
  ```json
  { "days": 30 }
  ```
  ```json
  { "newExpiresAt": "2027-01-01T00:00:00.000Z" }
  ```
  With `days`, the new expiry is computed from `max(currentExpiresAt, now)` — extending a license
  that still has time left adds to what's left; extending one that already lapsed starts counting
  from today.
- **Success — HTTP 201:** updated license. If the license's `status` was `EXPIRED`, it is
  automatically flipped back to `ACTIVE`. (If it was `SUSPENDED` or `REVOKED`, extending does
  **not** change status — a suspended license stays suspended even with a later expiry date; you
  must call `reactivate` separately.)
- **Error — HTTP 400:** `{ "message": "Provide either days or newExpiresAt" }` if neither given.

### `POST /vendor-admin/licenses/:id/suspend`
```json
{ "reason": "payment overdue" }
```
`reason` is optional. Sets `status: SUSPENDED`. Devices remain registered (not deactivated) but
`/activate`, `/verify`, `/heartbeat` will all report `valid: false` for every device on this
license until reactivated. **Cascades:** if this license has a subscription, the subscription's
`status` is also set to `SUSPENDED` (unless it was already `CANCELLED`, which is left alone).
- **Success — HTTP 201:** updated license (with the cascaded subscription status already reflected
  in the response — this was specifically verified end-to-end, including a subtle bug where an
  earlier version of this cascade showed stale data in the immediate response; fixed and
  reverified).

### `POST /vendor-admin/licenses/:id/reactivate`
No body. Restores `status: ACTIVE` — **or** `EXPIRED` if `expiresAt` has actually passed since it
was suspended (reactivate does not un-expire a license; use `extend` for that). If the license has
a `SUSPENDED` subscription, it's set to the same resolved status (`ACTIVE` or `EXPIRED`).
- **Error — HTTP 400:** `{ "message": "A revoked license cannot be reactivated, issue a new one instead" }` if `status` is currently `REVOKED`.

### `POST /vendor-admin/licenses/:id/revoke`
```json
{ "reason": "chargeback" }
```
`reason` is optional. **Permanent, hard termination — cannot be undone via reactivate.**
- Every currently-`ACTIVE` device activation on this license is set to `DEACTIVATED`.
- If this license has a subscription (any status except already-`CANCELLED`), it's set to
  `CANCELLED` with `cancelReason` defaulting to `"License revoked"` if no reason was given.
- License itself: `status: REVOKED`, `revokedAt: <now>`, `revokedReason: <reason or null>`.
- **Success — HTTP 201:** updated license, `activations` in the response will all show
  `status: "DEACTIVATED"`.

### `POST /vendor-admin/licenses/:id/convert-trial`
```json
{ "packageId": "cmt13ekd20000bniciwc0xg9a", "maxDevices": 3, "expiresAt": "2027-01-01T00:00:00.000Z" }
```
`packageId` required; `maxDevices` and `expiresAt` optional (same semantics as issuing — §6). Only
valid on a license with `type: TRIAL` that hasn't already been converted. Internally this calls
the exact same issuance logic as `POST /vendor-admin/licenses` — a **brand-new license** is
created for the same customer (with its own new license key), and the original trial is stamped
with `convertedToLicenseId`/`convertedAt`.
- **Success — HTTP 201:**
  ```json
  { "success": true, "data": { "trial": { "id": "...", "convertedToLicenseId": "cmtNEW...", "convertedAt": "2026-08-20T...", "...": "..." }, "newLicense": { "id": "cmtNEW...", "licenseKey": "BZVX-...", "...": "..." } } }
  ```
  Note the response is `{ trial, newLicense }`, **not** the license shape directly like other
  license endpoints.
- **Errors — HTTP 400:**
  - `{ "message": "Only a TRIAL license can be converted" }`
  - `{ "message": "This trial has already been converted" }`

---

## 7. Device limit management

**This is the mechanism for "how many devices can activate this one license," fully
admin-controllable.**

- **Where the default comes from:** a package's `maxDevices` field (§4) — e.g. `maxDevices: 3` on
  the package means every new license issued from it starts with `maxDevices: 3`.
- **Overriding at issuance:** pass `maxDevices` in the body of `POST /vendor-admin/licenses` (§6)
  to set a different limit for just that one license, independent of its package's default.
- **Changing it later, on an already-issued license:**
  ```
  PATCH /vendor-admin/licenses/:id
  { "maxDevices": 5 }
  ```
  This is the **only** field/route needed — increasing (3→5) or decreasing (5→2) both use the
  exact same call, just a different number.
- **What happens if you lower the limit below the current active device count (verified
  behavior, not assumption):** the API **does not** automatically deactivate any existing device
  to bring the count down. All currently-`ACTIVE` devices stay active and keep working —
  `PATCH` only changes the stored `maxDevices` number. The new, lower limit is enforced going
  forward: the *next* device that tries to `/activate` (a brand-new `deviceId`, or a previously
  `DEACTIVATED` one on this license trying to reactivate) will be rejected with `409` if the
  current active count is already at or above the new limit. In other words: lowering the limit
  never kicks anyone off immediately; it just stops new activations until the count naturally
  drops below the new ceiling (e.g. via `/vendor-license/deactivate` or an admin-forced
  `POST .../devices/:deviceId/revoke`, §8) or you decide to manually free up slots yourself.

---

## 8. Admin API: Devices

Two ways to list devices: **globally**, across every license at once (for an "All Devices"
dashboard screen), or **scoped to one license** (for a License Details screen). Both return the
same underlying device/activation record, described once below.

### Device/activation fields (as actually returned)
| Field | Type | Notes |
|---|---|---|
| `id` | string | the activation record's own id |
| `licenseKeyId` | string | present on the **per-license** endpoint only — the global endpoint nests this as `license.id` instead (see below) |
| `deviceId` | string | the fingerprint/identifier the client software generates and sends — this is **not** the same as `id` above |
| `deviceName` | string \| null | |
| `hostname` | string \| null | |
| `platform` | string \| null | e.g. `"windows"` — free text, whatever the client sends |
| `appVersion` | string \| null | |
| `ipAddress` | string \| null | present on the **per-license** endpoint only (not returned by the global one) — captured server-side from the request, not client-supplied |
| `status` | `VendorDeviceStatus` | `ACTIVE` \| `DEACTIVATED` |
| `activatedAt` | ISO-8601 string | set once, on first activation — **not** updated on later re-activations of the same `deviceId` |
| `lastSeenAt` | ISO-8601 string | updated by `/activate` and `/heartbeat` — **this is what "online/offline" is computed from** |
| `lastVerifiedAt` | ISO-8601 string \| null | updated by `/verify` only — deliberately separate from `lastSeenAt` so a verify call doesn't itself count as "the app is running" for online-status purposes |
| `deactivatedAt` | ISO-8601 string \| null | present on the **per-license** endpoint only |

### Online vs. offline — exact rule (shared by both endpoints and the dashboard)
A device counts as **online** if `status: ACTIVE` **and** `lastSeenAt` is within the last **10
minutes** (`ONLINE_WINDOW_MINUTES = 10`, a fixed backend constant — not currently configurable via
an API or env var). Note that `/activate` itself sets `lastSeenAt` to the activation time (it's
not left blank until the first heartbeat), so a device that just activated is immediately online,
not "offline until its first heartbeat." This 10-minute window assumes the client software calls
`/heartbeat` meaningfully more often than that (e.g. every 5 minutes) — if it heartbeats less
frequently, more devices will show as "offline" than are actually running. **Offline** =
`status: ACTIVE` but last seen more than 10 minutes ago. A `DEACTIVATED` device is neither online
nor offline — it's simply excluded from both counts (see `devices.totalActive` vs
`devices.currentlyOnline` in the dashboard summary, §10).

### `GET /vendor-admin/devices` — global device list (all licenses)
For an "All Devices" screen. Not scoped to any one license or customer unless you filter for it.

- **Auth required:** Yes (same `VendorAdminAuthGuard` as every other admin route).
- **Query parameters** (`QueryVendorDevicesDto`), all optional:

  | Param | Type | Behavior |
  |---|---|---|
  | `search` | string | case-insensitive substring match across `deviceId`, `hostname`, `deviceName`, the device's license key (the **real**, unmasked value is matched server-side even though the response masks it — see below), the customer's `companyName`, OR the customer's `email` |
  | `status` | enum | exact match against `VendorDeviceStatus` (`ACTIVE` \| `DEACTIVATED`) |
  | `onlineStatus` | `"online"` \| `"offline"` | derived filter — **not** a raw status value; see the online/offline rule above. Passing this implicitly restricts to `status: ACTIVE` (a `DEACTIVATED` device can never be online or offline) |
  | `licenseId` | string | exact match — same id you'd use in `/vendor-admin/licenses/:id` |
  | `customerId` | string | exact match, via the device's license's customer |
  | `packageId` | string | exact match, via the device's license's package |
  | `page` | integer ≥ 1 | default `1` |
  | `pageSize` | integer ≥ 1 | default `20` |

  Example: `GET /vendor-admin/devices?onlineStatus=online&packageId=cmt...&page=1&pageSize=20`

- **Success — HTTP 200** (paginated, same envelope as every other list endpoint — see §14):
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "cmt15289p000dbn20l9yajb9i",
        "deviceId": "dev-1",
        "deviceName": null,
        "hostname": "PC-ONE",
        "platform": "windows",
        "appVersion": null,
        "status": "ACTIVE",
        "online": true,
        "activatedAt": "2026-08-20T06:27:46.142Z",
        "lastSeenAt": "2026-08-20T06:27:46.355Z",
        "lastVerifiedAt": null,
        "license": {
          "id": "cmt1527r90009bn20onvja58n",
          "licenseKeyMasked": "BZVX-*****-*****-*****-BPZEH",
          "status": "ACTIVE",
          "customer": { "id": "cmt1527r70007bn20vyje0dld", "companyName": "Device Test Co", "email": "devicetest@example.com" },
          "package": { "id": "cmt151ouv0005bn20tecop89n", "code": "TESTPKG", "name": "Test Pkg" }
        }
      }
    ],
    "meta": { "page": 1, "pageSize": 20, "total": 2, "totalPages": 1 }
  }
  ```
  Two things this endpoint gives you that the per-license one below doesn't:
  - **`online`** — a ready-computed boolean, so the dashboard doesn't need to re-derive it from
    `lastSeenAt` itself (the per-license endpoint still requires that).
  - **`license.licenseKeyMasked`** — the full license key is a working credential (whoever has it
    can call the client API), so a bulk cross-customer listing masks it: the product prefix and
    the last segment stay visible (e.g. `BZVX-*****-*****-*****-BPZEH`), enough to recognize/search
    by by tail without exposing the whole secret in a table that might get screenshotted or land in
    a support ticket. `search` above still matches against the **real, unmasked** value
    server-side — masking only affects what's returned, not what's searchable. (The per-license
    `GET /vendor-admin/licenses/:id/devices` endpoint and every other license endpoint still
    return the **full, unmasked** key — unchanged, since there you already have single-license
    context, e.g. to hand the key to that one customer.)
- No error cases beyond the standard 401 (missing/bad admin token) and 400 (bad query param) —
  there's no `:id` in the URL to 404 on.

### `GET /vendor-admin/licenses/:id/devices` — devices for one license
No query parameters — returns **every** activation on this license regardless of status
(`ACTIVE` and `DEACTIVATED` both included), sorted by `lastSeenAt` descending, with the full
(unmasked) fields listed in the table above.
- **Success — HTTP 200:** `{ "success": true, "data": [ { ...device fields above... } ] }`
- **Error — HTTP 404:** `{ "message": "License not found" }`

### `POST /vendor-admin/licenses/:id/devices/:deviceId/revoke`
No body. Force-deactivates one specific device (sets `status: DEACTIVATED`,
`deactivatedAt: <now>`), freeing its slot against `maxDevices` immediately. Logs a
`DEVICE_REVOKED` event.
- **Success — HTTP 201:** the updated activation record.
- **Error — HTTP 404:** `{ "message": "Device activation not found" }` if that `deviceId` was
  never activated on this license.

### Device reactivation — investigated and resolved, no admin endpoint needed
**There is no admin endpoint to un-revoke a single device, and none needs to be added** — this
was specifically investigated (re-read the activation code, then verified live) rather than
assumed. A `DEACTIVATED` device already safely regains access the moment the **client software**
calls `POST /vendor-license/activate` again with the same `licenseKey` + `deviceId` (§11):
verified end-to-end — revoke a device via the admin endpoint above, then call `/activate` again
with that exact `deviceId`, and it returns `HTTP 201`, `deviceAuthorized: true`, with its original
`activatedAt` timestamp preserved (it's treated as resuming the same install, not a new one). The
normal device-limit check still applies (a revoked device coming back **does** consume a slot
again, same as any other new activation).

**Important nuance for how you present "revoke" in the dashboard:** revoking a device is not a
permanent ban on that specific piece of hardware — it only frees the slot right now. If that same
machine still has the license key stored locally and calls `/activate` again (e.g. automatically,
on its next app launch), it will succeed again, exactly like any other device would, as long as
the license itself is still valid and has a free slot. There is currently no way to permanently
blocklist one specific `deviceId` from ever using a given license again while leaving the license
otherwise active for other devices — the only ways to stop a specific machine for good are (a)
revoke the entire license (locks out every device on it, §6), or (b) lower `maxDevices` (§7) so no
free slot remains for it to reclaim. If your dashboard needs a true per-device permanent block,
that would be a new feature, not present today.

---

## 9. Admin API: Subscriptions

A `VendorSubscription` is the SaaS billing-cycle relationship for a `SUBSCRIPTION`-type license.
It's a separate record from the license (rather than folded into it) because a subscription's
status lifecycle genuinely differs from a license's: **a cancelled subscription still grants
access until the end of the paid period**, whereas a suspended/revoked *license* locks out
immediately. Every admin action here **cascades onto the parent license's `status`/`expiresAt`**
so the client-facing `/activate`, `/verify`, `/heartbeat` endpoints never need to look at this
table at all — they only ever check the license.

**There is no `POST /vendor-admin/subscriptions` create endpoint.** A subscription is created
**automatically, transactionally**, by `POST /vendor-admin/licenses` whenever the resolved license
`type` is `SUBSCRIPTION` (§6) — do not build a "create subscription" form separate from "issue
license"; they are the same action.

### Subscription fields (as actually returned)
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `licenseKeyId` | string, unique | one subscription per license, 1:1 |
| `customerId` | string | |
| `packageId` | string | |
| `billingCycle` | `VendorBillingCycle` | `MONTHLY` \| `QUARTERLY` \| `YEARLY` |
| `status` | `VendorSubscriptionStatus` | `ACTIVE` \| `EXPIRED` \| `SUSPENDED` \| `CANCELLED` |
| `startedAt` | ISO-8601 string | |
| `currentPeriodEnd` | ISO-8601 string | mirrors the license's `expiresAt` at all times |
| `cancelledAt` | ISO-8601 string \| null | |
| `cancelReason` | string \| null | |
| `createdAt`, `updatedAt` | ISO-8601 string | |

**Nested relations** (present on `get`/`list`/every action response): `customer` (full),
`package` (full), `licenseKey` — **only** `{ id, licenseKey, status, maxDevices }`, not the full
license object.

### Lifecycle
```
ACTIVE  --suspend-->  SUSPENDED  --activate-->  ACTIVE (or EXPIRED, if the period already lapsed)
ACTIVE  --cancel-->   CANCELLED  --renew-->     ACTIVE
ACTIVE  --(period passes, hourly cron)-->  EXPIRED
```
`cancel` does **not** immediately end access — the underlying license stays `ACTIVE` until
`currentPeriodEnd`, at which point an hourly background job flips both the license and the
subscription to `EXPIRED` automatically. This matches standard "cancel at period end" SaaS
behavior.

### How subscription status affects license verification
The client-facing `/activate`/`/verify`/`/heartbeat` endpoints (§11) check **only the license's
own `status`/`expiresAt`** — never the subscription table directly. This works because every
subscription action below writes its result onto the license too:
- `suspend` → license also → `SUSPENDED` (client calls immediately start failing with
  `valid: false, reason: "License is suspended"`)
- `activate` (reactivate) → license also → `ACTIVE` (or `EXPIRED` if the period already lapsed)
- `cancel` → license is **left untouched** (still `ACTIVE`) — access continues until period end
- `renew` → license → `ACTIVE`, `expiresAt` → the new `currentPeriodEnd`

### `GET /vendor-admin/subscriptions`
- **Query parameters** (`QueryVendorSubscriptionsDto`):

  | Param | Type |
  |---|---|
  | `status` | enum, exact match |
  | `billingCycle` | enum, exact match |
  | `packageId` | string, exact match |
  | `customerId` | string, exact match |
  | `search` | string — matches customer company name, customer email, OR the license's key |
  | `expiringWithinDays` | integer ≥ 0 — filters `currentPeriodEnd` into the next N days; if `status` isn't also passed, defaults to `status=ACTIVE` (same behavior as the license list's equivalent param) |
  | `page`, `pageSize` | integer ≥ 1, default `1`/`20` |

- **Success — HTTP 200** (paginated, §14).

### `GET /vendor-admin/subscriptions/:id`
- **Error — HTTP 404:** `{ "message": "Subscription not found" }`

### `POST /vendor-admin/subscriptions/:id/renew`
```json
{ "periods": 1 }
```
`periods` optional, default `1` — number of billing cycles to add. Extends `currentPeriodEnd` by
N cycles from `max(currentPeriodEnd, now)`. Clears any prior cancellation
(`cancelledAt`/`cancelReason` → `null`) and restores **both** the subscription and its license to
`ACTIVE` — this works even on a `CANCELLED` or `EXPIRED` subscription (i.e. "renew" is also how
you win back a lapsed/cancelled customer, not just extend a currently-active one).
- **Success — HTTP 201:** updated subscription, including the nested `licenseKey.status` already
  reflecting `ACTIVE`.

### `POST /vendor-admin/subscriptions/:id/suspend`
```json
{ "reason": "payment failed" }
```
Optional `reason`. Cascades to `SUSPENDED` on the license.
- **Error — HTTP 400:** `{ "message": "A cancelled subscription cannot be suspended, renew it first" }`

### `POST /vendor-admin/subscriptions/:id/activate`
**Note the name collision with the unrelated client-side `POST /vendor-license/activate` (§11) —
these are two completely different endpoints for two completely different actions (reactivating a
subscription vs. registering a device). Do not confuse them when wiring up the dashboard.**

No body. Only valid when the subscription's current `status` is `SUSPENDED`.
- **Error — HTTP 400:** `{ "message": "Only a suspended subscription can be reactivated this way; use renew for expired/cancelled ones" }`

### `POST /vendor-admin/subscriptions/:id/cancel`
```json
{ "reason": "customer request" }
```
Optional `reason`. Stops auto-renewal only. **License is left `ACTIVE`** — see the lifecycle note
above.

---

## 10. Admin API: Dashboard

All five endpoints below are `GET`, take no query parameters (except `activity`'s `limit`), and
require the admin token like every other `/vendor-admin/*` route.

### `GET /vendor-admin/dashboard/summary`
**One call, every top-level metric.** Full exact response shape:
```json
{
  "success": true,
  "data": {
    "totalCustomers": 7,
    "totalLicenses": 8,
    "licensesByStatus": { "active": 6, "suspended": 1, "revoked": 1, "expired": 0 },
    "licensesByType": { "oneTime": 2, "subscription": 3, "trial": 3 },
    "trials": { "active": 2, "expired": 0, "converted": 1, "totalCustomers": 3 },
    "customersByChannel": { "oneTime": 2, "saas": 3, "trial": 3 },
    "subscriptions": {
      "active": 1, "expired": 0, "suspended": 1, "cancelled": 1,
      "expiringSoon": { "in7Days": 0, "in30Days": 0 }
    },
    "expiringSoon": { "in7Days": 0, "in30Days": 3 },
    "devices": {
      "currentlyOnline": 4, "offline": 2, "totalActive": 6, "totalInstallations": 9,
      "onlineWindowMinutes": 10
    },
    "downloads": { "total": 128, "last30Days": 41 },
    "byPackage": [
      { "packageId": "...", "packageName": "Business Lifetime", "packageCode": "BIZ-LIFETIME", "activeLicenseCount": 1 }
    ]
  }
}
```

**Exact field-by-field mapping to every metric you asked for:**

| You need | Read from |
|---|---|
| Total customers | `data.totalCustomers` |
| Total companies | same value as above — see §5, customer = company |
| Total downloads | `data.downloads.total` |
| Total installations | `data.devices.totalInstallations` — every device activation **ever created**, including later-deactivated ones (not just currently-active) |
| Registered devices (currently active) | `data.devices.totalActive` |
| Online devices | `data.devices.currentlyOnline` |
| Offline devices | `data.devices.offline` (= `totalActive - currentlyOnline`, already computed for you) |
| Trial customers | `data.trials.totalCustomers` (distinct customers who have ever had a trial) |
| Active trials | `data.trials.active` (excludes converted ones) |
| Expired trials | `data.trials.expired` (excludes converted ones) |
| Converted trials | `data.trials.converted` |
| One-time customers | `data.customersByChannel.oneTime` (distinct customers with ≥1 ONE_TIME license) |
| SaaS customers | `data.customersByChannel.saas` |
| Total licenses | `data.totalLicenses` |
| Active licenses | `data.licensesByStatus.active` |
| Suspended licenses | `data.licensesByStatus.suspended` |
| Revoked licenses | `data.licensesByStatus.revoked` |
| Expired licenses | `data.licensesByStatus.expired` |
| Active subscriptions | `data.subscriptions.active` |
| Expired subscriptions | `data.subscriptions.expired` |
| Cancelled subscriptions | `data.subscriptions.cancelled` |
| (Suspended subscriptions — not explicitly requested, but tracked too) | `data.subscriptions.suspended` |
| Licenses expiring soon | `data.expiringSoon.in7Days` and `.in30Days` (counts, `ACTIVE` licenses only) |
| Subscriptions expiring soon | `data.subscriptions.expiringSoon.in7Days` / `.in30Days` |
| Package usage (top-level) | `data.byPackage[]` — for a fuller per-package breakdown use `GET .../dashboard/packages` below |
| Company usage | not on this endpoint — use `GET .../dashboard/companies` below |
| Recent activity / recent activations | not on this endpoint — use `GET .../dashboard/activity` below |

### `GET /vendor-admin/dashboard/packages`
Per-package usage detail (a richer version of `summary`'s `byPackage`):
```json
{
  "success": true,
  "data": [
    {
      "id": "...", "code": "BIZ-LIFETIME", "name": "Business Lifetime", "type": "ONE_TIME",
      "billingCycle": null, "isActive": true,
      "activeLicenseCount": 1, "totalIssued": 2, "activeDeviceCount": 3
    }
  ]
}
```
`totalIssued` = every license ever issued from this package, any status. `activeDeviceCount` =
currently-`ACTIVE` device activations across all licenses of this package.

### `GET /vendor-admin/dashboard/downloads`
```json
{
  "success": true,
  "data": {
    "total": 128, "last30Days": 41,
    "byPlatform": [ { "platform": "windows", "count": 90 }, { "platform": "unknown", "count": 5 } ],
    "byVersion": [ { "version": "1.4.2", "count": 60 } ],
    "byDay": [ { "day": "2026-08-20T00:00:00.000Z", "count": 3 } ]
  }
}
```
`byPlatform`/`byVersion` cover **all-time** data, not just the last 30 days. `byDay` covers only
the **last 30 days**. A download tracked without a `platform`/`version` value groups under the
literal string `"unknown"`.

### `GET /vendor-admin/dashboard/companies`
**Not paginated — returns every customer.** This is the primary "who's using what" screen data:
```json
{
  "success": true,
  "data": [
    {
      "id": "...", "companyName": "Karim Builders", "email": "karim@example.com",
      "organizationId": null, "createdAt": "2026-08-20T05:41:23.584Z",
      "licenses": [
        {
          "id": "...", "licenseKey": "BZVX-...", "type": "ONE_TIME", "status": "ACTIVE",
          "package": { "id": "...", "name": "Business Lifetime", "code": "BIZ-LIFETIME" },
          "subscription": null,
          "maxDevices": 5, "activeDeviceCount": 3, "onlineDeviceCount": 2,
          "expiresAt": null, "remainingDays": null,
          "lastActivity": "2026-08-20T05:54:00.000Z"
        }
      ]
    }
  ]
}
```
Mapping: **Company name** → `companyName`. **Customer/contact** → this same object's
`email`/`organizationId` (note: `contactName`/`phone` are **not** included on this particular
endpoint — fetch `GET /vendor-admin/customers/:id` for those). **Package** →
`licenses[].package`. **License / license type / status** → `licenses[].licenseKey` /
`.type` / `.status`. **Device count / online devices** → `licenses[].activeDeviceCount` /
`.onlineDeviceCount`. **Expiry / remaining days** → `licenses[].expiresAt` / `.remainingDays`.
**Last activity** → `licenses[].lastActivity` (the most recent `lastSeenAt` across all of that
license's devices, or `null` if none have ever activated).

### `GET /vendor-admin/dashboard/activity?limit=50`
`limit` is an optional query parameter (plain number, e.g. `?limit=50`); if omitted, defaults to
`50` server-side. This is a **merged, time-sorted** feed of license/subscription events and
downloads:
```json
{
  "success": true,
  "data": [
    {
      "kind": "LICENSE_EVENT", "id": "...", "type": "SUSPENDED", "message": "payment overdue",
      "companyName": "Karim Builders", "licenseKeyId": "...", "actorAdminId": "cmt11oq9x...",
      "createdAt": "2026-08-20T05:54:21.633Z"
    },
    {
      "kind": "DOWNLOAD", "id": "...", "type": "DOWNLOAD", "message": "windows 1.4.2",
      "companyName": "downloader@example.com", "licenseKeyId": null, "actorAdminId": null,
      "createdAt": "2026-08-20T05:50:00.000Z"
    }
  ]
}
```
- `kind` distinguishes the two merged sources: `"LICENSE_EVENT"` or `"DOWNLOAD"`.
- For downloads, `companyName` falls back to the tracked email if no company name was given, or
  the literal string `"Unknown"` if neither was provided.
- **`actorAdminId`** is the audit trail: `null` means system- or client-software-triggered (no
  human admin involved); a string id means that admin performed the action. See the full event
  type table below for which is which.
- This endpoint does **not** support `page`/offset pagination — only `limit` (see §14, §19).

### Complete list of every `type` string that appears in the activity feed (ground truth — every
string the code actually writes, nothing invented)

| `type` | Triggered by | `actorAdminId` | Meaning |
|---|---|---|---|
| `ISSUED` | `POST /vendor-admin/licenses`, or the trial-conversion's internal re-issue, **or** self-serve `POST /vendor-license/trial` | set (admin action) **or** `null` (self-serve trial) — check which | A license was created |
| `SUBSCRIPTION_CREATED` | `POST /vendor-admin/licenses` when the issued type is `SUBSCRIPTION` | set | Paired subscription record created alongside the license |
| `UPDATED` | `PATCH /vendor-admin/licenses/:id`, when the changed field(s) don't include `maxDevices` | set | Generic license field(s) changed |
| `DEVICE_LIMIT_CHANGED` | `PATCH /vendor-admin/licenses/:id`, specifically when `maxDevices` changed | set | Message includes the before/after numbers |
| `EXTENDED` | `POST /vendor-admin/licenses/:id/extend` | set | |
| `SUSPENDED` | `POST /vendor-admin/licenses/:id/suspend` | set | |
| `REACTIVATED` | `POST /vendor-admin/licenses/:id/reactivate` | set | |
| `REVOKED` | `POST /vendor-admin/licenses/:id/revoke` | set | |
| `TRIAL_CONVERTED` | `POST /vendor-admin/licenses/:id/convert-trial` | set | Logged on the **original trial's** event list |
| `DEVICE_REVOKED` | `POST /vendor-admin/licenses/:id/devices/:deviceId/revoke` | set | Admin forcibly deactivated one device |
| `EXPIRED` | The hourly background job (`@Cron(EVERY_HOUR)`) | `null` | A license's `expiresAt` passed; auto-flipped from `ACTIVE` to `EXPIRED` |
| `SUBSCRIPTION_RENEWED` | `POST /vendor-admin/subscriptions/:id/renew` | set | |
| `SUBSCRIPTION_SUSPENDED` | `POST /vendor-admin/subscriptions/:id/suspend` | set | |
| `SUBSCRIPTION_REACTIVATED` | `POST /vendor-admin/subscriptions/:id/activate` | set | |
| `SUBSCRIPTION_CANCELLED` | `POST /vendor-admin/subscriptions/:id/cancel` | set | |
| `DEVICE_ACTIVATED` | Client software's `POST /vendor-license/activate` | `null` | |
| `DEVICE_DEACTIVATED` | Client software's `POST /vendor-license/deactivate` | `null` | |

Never logged, by design: passwords, JWTs/access tokens, or any other secret — only ids and
human-readable messages appear in event `message`/`metadata`.

**No dedicated `/vendor-admin/audit` or `/vendor-admin/events` endpoint exists separately from
`dashboard/activity`** — that endpoint (plus the `events` array nested on
`GET /vendor-admin/licenses/:id`, limited to the 20 most recent for that one license) is the
entire audit-log surface today.

---

## 11. Client Software API (public, not for the dashboard)

**Everything in this section is called by the software installed at a customer site — not by your
Admin Dashboard.** No login, no `Authorization` header. Security model: the server is always the
authority — nothing the client asserts about its own state is trusted; every decision is made
server-side against the database on every single call.

All six routes are rate-limited by IP — see §13.

### `POST /vendor-license/activate`
- **Request body** (`ActivateLicenseDto`):

  | Field | Required | Type |
  |---|---|---|
  | `licenseKey` | yes | non-empty string |
  | `deviceId` | yes | non-empty string — a fingerprint/identifier the client software generates and persists locally |
  | `deviceName` | no | string |
  | `hostname` | no | string |
  | `platform` | no | string — e.g. `"windows"` |
  | `appVersion` | no | string |

  ```json
  { "licenseKey": "BZVX-K7XPQ-9MNRT-2WXYZ-QJ8FH", "deviceId": "machine-fingerprint-hash", "deviceName": "Karim's PC", "hostname": "DESKTOP-ABC", "platform": "windows", "appVersion": "1.4.2" }
  ```
  Re-activating the same `deviceId` (e.g. app restart) is idempotent and does **not** consume a
  new device slot.
- **Success — HTTP 201:**
  ```json
  {
    "success": true,
    "data": {
      "valid": true,
      "licenseStatus": "ACTIVE",
      "licenseType": "ONE_TIME",
      "deviceAuthorized": true,
      "currentDeviceCount": 2,
      "maxDevices": 3,
      "expiresAt": null,
      "remainingDays": null,
      "activationId": "cmt...",
      "package": { "code": "BIZ-LIFETIME", "name": "Business Lifetime", "features": null }
    }
  }
  ```
  **`reason` is absent from the JSON entirely when there's nothing to report** (it's only present,
  as a string, when `valid` or `deviceAuthorized` is `false`). There is no `subscriptionStatus`
  field on this response — subscription state is fully reflected through `licenseStatus` per the
  cascade design in §9; a suspended-subscription license shows exactly the same
  `licenseStatus: "SUSPENDED"` a directly-suspended license would.
- **Error — HTTP 404:** `{ "message": "Invalid license key" }`
- **Error — HTTP 409** (license itself invalid — checked **before** the device-limit check):
  - `{ "message": "License has been revoked" }`
  - `{ "message": "License is suspended" }`
  - `{ "message": "License has expired" }`
- **Error — HTTP 409** (device limit — verified under real concurrent load, see below):
  `{ "message": "Device limit reached (max 3 device(s)) for this license" }`

**Concurrency guarantee (load-tested, not just checked in code):** the device-limit check and the
device-count write happen inside one database transaction that takes a row lock on the license
(`SELECT ... FOR UPDATE`) before counting. Firing 5 truly-simultaneous activation requests against
a license with `maxDevices: 3` and 0 existing devices produced **exactly 3 successes and 2×409s,
every time** — two devices can never both slip past a stale count and push the license over its
limit.

### `POST /vendor-license/verify`
- **When to call it:** a lightweight, read-only "am I still authorized" check — e.g. at app
  startup, or before a sensitive action — **without** it counting as an "the app is currently
  running" signal for the online/offline dashboard number (that's what heartbeat is for).
- **Request body** (`VerifyLicenseDto`): `{ "licenseKey": "...", "deviceId": "..." }` — both required.
- **Success — HTTP 200:** identical shape to `/activate`'s response, minus `activationId`.
- **Side effect:** updates only `lastVerifiedAt` on the device record — does **not** touch
  `lastSeenAt`.
- **Error — HTTP 404:** `{ "message": "Invalid license key" }`, or
  `{ "message": "Device is not activated for this license" }` if that `deviceId` never called
  `/activate` on this license.

### `POST /vendor-license/heartbeat`
- **When to call it:** periodically while the app is running (e.g. every 5 minutes) — **this is
  what feeds the "currently online" dashboard number** (§8, §10).
- **Request body** (`HeartbeatDto`): `{ "licenseKey": "...", "deviceId": "...", "appVersion": "1.4.3" }` — `appVersion` optional.
- **Success — HTTP 200:** same shape as `/verify`. Updates `lastSeenAt` (and `appVersion` if
  given) **only if** the device is currently `ACTIVE`.
- If the device itself was deactivated (by an admin via §8, or via `/deactivate` below): still
  **HTTP 200**, not an error — `{ "valid": false, "deviceAuthorized": false, "reason": "Device has been deactivated, please reactivate", "...": "..." }`
  — so the client can read the body and lock its own UI gracefully instead of crashing on an
  unexpected error status.
- **Error — HTTP 404:** invalid key, or this device never activated on it.

### `POST /vendor-license/deactivate`
- **Purpose:** free a device slot (uninstall, "log out this device," etc).
- **Request body** (`DeactivateDeviceDto`): `{ "licenseKey": "...", "deviceId": "..." }`.
- **Success — HTTP 200:** `{ "success": true, "data": { "deactivated": true } }`
- **Error — HTTP 404:** invalid key, or device never activated on it.

### `POST /vendor-license/trial`
- **Request body** (`RequestTrialDto`):

  | Field | Required | Type |
  |---|---|---|
  | `companyName` | yes | non-empty string |
  | `email` | yes | valid email |
  | `contactName` | no | string |
  | `phone` | no | string |
  | `deviceId` | no | string — strongly recommended; enables the anti-abuse dedup below |

  ```json
  { "companyName": "Acme Co", "email": "acme@example.com", "deviceId": "install-fingerprint-hash" }
  ```
- **Success — HTTP 201:**
  ```json
  { "success": true, "data": { "licenseKey": "BZVX-...", "status": "ACTIVE", "expiresAt": "2026-09-03T04:53:46.300Z", "remainingDays": 14, "maxDevices": 1, "reused": false } }
  ```
- **Anti-abuse (verified):** requesting again with the **same email** returns the existing trial
  (`reused: true`, same `licenseKey`) instead of creating a new one. Requesting again with the
  **same `deviceId`** but a **different, brand-new email** *also* returns the original trial
  (`reused: true`) — this specifically closes the "uninstall, reinstall under a new email, get
  another trial on the same machine" loophole, and was confirmed working end-to-end.
- **Error — HTTP 400:** `{ "message": "No trial package is configured yet, please contact the vendor" }`
  — thrown if no package with `type: TRIAL` and `isActive: true` exists yet. Create one via
  `POST /vendor-admin/packages` (§4) before this endpoint can succeed.
- **Note:** this endpoint only returns the license key — it does **not** register a device. The
  client software must separately call `/vendor-license/activate` with the same `deviceId` to
  actually register itself, exactly like any other license.

### `POST /vendor-license/downloads`
- **Purpose:** fire from your download page / installer — **not** from the running application.
- **Request body** (`TrackDownloadDto`), every field optional:
  ```json
  { "email": "downloader@example.com", "companyName": "optional", "version": "1.4.2", "platform": "windows", "source": "website" }
  ```
  If `email` matches an existing customer, the download is linked to that customer id internally
  (not returned in the response, but visible via the admin dashboard's downloads data).
- **Success — HTTP 201:** `{ "success": true, "data": { "tracked": true } }`

---

## 12. Error responses

Every error from every endpoint in this API (admin and client) is shaped by the same global
exception filter:
```json
{ "success": false, "message": "<human-readable reason>" }
```
or, only for request-body **validation** failures (missing required field, wrong type, unknown
extra field, failed enum/email/etc. check):
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": { "email": ["email must be an email"], "password": ["password must be longer than or equal to 6 characters"] }
}
```
`errors` is a map of field name → array of human-readable constraint failure messages.

| HTTP code | Meaning here | Example endpoints / triggers |
|---|---|---|
| 200 | Success (routes with `@HttpCode(OK)`: `/verify`, `/heartbeat`, `/deactivate`, and every admin `GET`/`PATCH`) | |
| 201 | Success (default for `POST` routes that don't override it: login, issue license, all license/subscription action endpoints, activate, trial, downloads, create package/customer) | |
| 400 | Validation failure, or an explicit business-rule check (see the "Errors" list under each endpoint above) | e.g. "Provide either customerId or newCustomer", "No trial package is configured yet" |
| 401 | Missing/malformed/expired admin token → `"Unauthorized"`; valid token but admin deactivated → `"Admin account is no longer active"` | any `/vendor-admin/*` route except login |
| 404 | Entity not found | bad `:id`, bad license key, device never activated |
| 409 | Current state conflicts with the request | license suspended/revoked/expired, device limit reached, duplicate customer email (`POST`/`PATCH /vendor-admin/customers`, and `newCustomer` inside `POST /vendor-admin/licenses` — verified with a real duplicate request, see §5/§6) |
| 429 | Rate limit exceeded — `{ "message": "ThrottlerException: Too Many Requests" }` | see §13 |
| 500 | Unhandled server error → generic `{ "message": "Internal server error" }` (no detail leaked) | not expected in normal use; report if you see one |

There is **no 403 Forbidden** currently returned anywhere in this API — every authorization
failure (missing/bad admin token) surfaces as **401**, not 403. Don't build dashboard logic that
waits for a 403.

---

## 13. Rate limiting

Configured via `@nestjs/throttler`, registered **only** inside the vendor-licensing module — it
has no effect on any other route in the wider application. Exact configured values, copied from
the controller decorators:

| Endpoint | Limit |
|---|---|
| `POST /vendor-admin/auth/login` | 10 requests / 5 minutes / IP |
| `POST /vendor-license/activate` | 15 requests / minute / IP |
| `POST /vendor-license/trial` | 5 requests / 10 minutes / IP |
| Every other route in `VendorLicenseClientController` (`/verify`, `/heartbeat`, `/deactivate`, `/downloads`) | 60 requests / minute / IP (module default) |
| Every `/vendor-admin/*` route **other than** login | **not throttled** |

Verified directly: 5 rapid trial requests from the same IP succeeded (`201`), the 6th got `429`.
On `429`, the body is exactly `{ "success": false, "message": "ThrottlerException: Too Many Requests" }`
— no `Retry-After` guidance is currently surfaced in the JSON body (it may be present as a
response header depending on `@nestjs/throttler`'s defaults, but was not specifically verified —
don't rely on a documented header value that hasn't been confirmed).

---

## 14. Pagination, search, filtering — index

**Only the endpoints listed below paginate.** Every other `GET` list-style endpoint returns its
full result set in one response — do not assume pagination exists elsewhere.

| Endpoint | Paginated? | Query params |
|---|---|---|
| `GET /vendor-admin/customers` | Yes | `search`, `page` (default 1), `pageSize` (default 20) |
| `GET /vendor-admin/licenses` | Yes | `status`, `type`, `packageId`, `customerId`, `search`, `expiringWithinDays`, `page`, `pageSize` |
| `GET /vendor-admin/subscriptions` | Yes | `status`, `billingCycle`, `packageId`, `customerId`, `search`, `expiringWithinDays`, `page`, `pageSize` |
| `GET /vendor-admin/devices` | Yes | `search`, `status`, `onlineStatus`, `licenseId`, `customerId`, `packageId`, `page`, `pageSize` |
| `GET /vendor-admin/packages` | No — returns all | none |
| `GET /vendor-admin/dashboard/companies` | No — returns all | none |
| `GET /vendor-admin/dashboard/activity` | No — `limit` only, no page/offset | `limit` (default 50) |
| `GET /vendor-admin/dashboard/packages`, `.../downloads`, `.../summary` | N/A (not list endpoints) | none |
| `GET /vendor-admin/licenses/:id/devices` | No — returns all activations for that one license | none |

**Exact paginated response envelope** (identical shape on all four paginated endpoints above —
this is produced by a shared response interceptor, not per-endpoint code):
```json
{
  "success": true,
  "data": [ /* array of items for this page */ ],
  "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 }
}
```
Note that `meta` is a **sibling of `data`**, not nested inside it — the array of items is
`response.data` directly, and pagination info is `response.meta`. There is no `sortBy`/`sortOrder`
query parameter on any endpoint — every list has one fixed sort order, noted in that endpoint's
own section above (e.g. licenses/subscriptions/customers all sort by `createdAt` descending;
packages sort by `sortOrder` then `createdAt` ascending; devices — both the global and per-license
endpoints — sort by `lastSeenAt` descending). No endpoint has a documented or enforced
maximum `pageSize` — passing an enormous value is not currently rejected.

There is no global full-text search across every entity type — `search` is a per-endpoint,
per-field parameter as documented in each section above.

---

## 15. Date/time format

Every timestamp field in every response is an ISO-8601 string in UTC, e.g.:
```
2026-08-20T05:54:21.633Z
```
(the trailing `Z` marks it as UTC). **Convert to the viewer's local timezone for display in the
dashboard UI** — the API never does this conversion itself.

`remainingDays` (present in the client `/activate`/`/verify`/`/heartbeat` responses, the trial
response, and the dashboard companies list) is computed as:
```
Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
```
i.e. calendar-agnostic whole days remaining until expiry, rounded up; `null` whenever `expiresAt`
is `null` (a perpetual `ONE_TIME` license, or a license/trial with no expiry set).

---

## 16. Security notes for the dashboard developer

- **Never** embed a vendor-admin credential (email/password, or a long-lived token) in frontend
  source code or a public repository.
- Store the `accessToken` the way you'd store any bearer token for a browser app (e.g. in memory
  plus a secure, httpOnly-if-possible mechanism for persistence across reloads) — treat it as a
  secret with real access to control every customer's license.
- **Never** put a vendor-admin token inside the customer-facing installed software — that
  software should only ever hold its own license key, which is a completely different, far more
  limited credential (it can only act on itself via `/vendor-license/*`, never reach
  `/vendor-admin/*`).
- A customer's license key is **not** an admin credential and must never be treated as one, even
  though both are "secrets" — they authenticate to entirely separate, non-overlapping route sets
  (verified in §2).
- Handle **401** globally: clear any stored token and redirect to the login screen.
- Handle **429** gracefully: surface a "please wait and retry" message rather than a raw error —
  this will only realistically happen on the login screen (10/5min) under this API's current
  limits, since no other admin route is throttled.
- Do not log the `accessToken` or any request/response body containing a password to your own
  dashboard's browser console or crash-reporting tool in production.
- Do not surface raw `500` response bodies to end users (they never contain sensitive detail by
  design, but they're not meant to be user-facing copy either) — show a generic "something went
  wrong" message and let your own error tracking capture the real detail separately.

---

## 17. Admin Dashboard screen → API mapping

| Screen | Primary calls |
|---|---|
| **Login** | `POST /vendor-admin/auth/login` → store `data.accessToken`. On app load, `GET /vendor-admin/auth/me` to check if the stored token is still valid. |
| **Main Dashboard** | `GET /vendor-admin/dashboard/summary` (all the top counters) + `GET /vendor-admin/dashboard/activity?limit=20` (recent activity widget) |
| **Customers / Companies list** | `GET /vendor-admin/customers?search=&page=&pageSize=` — see §5/§6 for why there's one list, not two |
| **Customer / Company detail** | `GET /vendor-admin/customers/:id` for contact info + all their licenses (nested); for the richer per-license device/online counts shown on `dashboard/companies`, cross-reference `GET /vendor-admin/dashboard/companies` by customer id, or drill into `GET /vendor-admin/licenses/:id` per license |
| **Packages list/editor** | `GET /vendor-admin/packages`, `POST /vendor-admin/packages`, `PATCH /vendor-admin/packages/:id`; usage stats from `GET /vendor-admin/dashboard/packages` |
| **Licenses list** | `GET /vendor-admin/licenses?status=&type=&search=&page=&pageSize=` |
| **Issue License / New License wizard** | `POST /vendor-admin/licenses` (with `customerId` or `newCustomer`) |
| **License Details** | `GET /vendor-admin/licenses/:id` (includes customer, package, subscription, activations, last-20 events); actions: `PATCH`, `.../extend`, `.../suspend`, `.../reactivate`, `.../revoke`, `.../convert-trial`. Its device list uses `GET /vendor-admin/licenses/:id/devices`, **not** the global endpoint below. |
| **Devices Screen** (all devices, cross-customer/cross-license) | `GET /vendor-admin/devices?search=&status=&onlineStatus=&licenseId=&customerId=&packageId=&page=&pageSize=` (§8); revoke via `POST /vendor-admin/licenses/:id/devices/:deviceId/revoke` (needs the device's `license.id` from the list response) |
| **Trials** | Filter the licenses list by `type=TRIAL`; dashboard counts from `summary.trials`; convert via `POST /vendor-admin/licenses/:id/convert-trial` |
| **Subscriptions** | `GET /vendor-admin/subscriptions?status=&search=&page=&pageSize=`, detail via `GET .../:id`, actions `.../renew`, `.../suspend`, `.../activate`, `.../cancel` |
| **Downloads** | `GET /vendor-admin/dashboard/downloads` |
| **Activity Log** | `GET /vendor-admin/dashboard/activity?limit=` |

---

## 18. Complete workflow examples

### 18a. General license/device-limit workflow
```
POST /vendor-admin/auth/login                                  → save accessToken
POST /vendor-admin/packages          {code, name, type: ONE_TIME, maxDevices: 3, ...}
POST /vendor-admin/licenses          {newCustomer: {...}, packageId}   → save license.id, licenseKey
GET  /vendor-admin/licenses/:id                                  → view full detail
GET  /vendor-admin/licenses/:id/devices                          → (empty until the client activates)

  --- meanwhile, the customer's software calls the CLIENT API directly ---
  POST /vendor-license/activate  {licenseKey, deviceId: "device-1"}   → 201
  POST /vendor-license/activate  {licenseKey, deviceId: "device-2"}   → 201
  POST /vendor-license/activate  {licenseKey, deviceId: "device-3"}   → 201
  POST /vendor-license/activate  {licenseKey, deviceId: "device-4"}   → 409 device limit reached

PATCH /vendor-admin/licenses/:id     {maxDevices: 5}              → limit raised
  POST /vendor-license/activate  {licenseKey, deviceId: "device-4"}   → now 201

GET  /vendor-admin/dashboard/summary                              → devices.totalActive now reflects 4
POST /vendor-admin/licenses/:id/suspend    {reason: "..."}
POST /vendor-admin/licenses/:id/reactivate
POST /vendor-admin/licenses/:id/extend     {days: 30}
POST /vendor-admin/licenses/:id/devices/device-2/revoke
POST /vendor-admin/licenses/:id/revoke     {reason: "..."}        → final, irreversible
```

### 18b. SaaS subscription workflow
```
POST /vendor-admin/auth/login
POST /vendor-admin/packages   {code: "SAAS-MONTHLY", type: SUBSCRIPTION, billingCycle: MONTHLY, maxDevices: 3, durationDays: 30}
POST /vendor-admin/licenses   {newCustomer: {...}, packageId}
  → response.data.subscription is already populated — created automatically, no separate call needed
  → save license.id (for license-scoped calls) AND response.data.subscription.id (for subscription calls)

  --- customer's software ---
  POST /vendor-license/activate   {licenseKey, deviceId}           → 201, licenseType: "SUBSCRIPTION"
  POST /vendor-license/heartbeat  {licenseKey, deviceId}           → periodically, every few minutes

POST /vendor-admin/subscriptions/:id/renew     {}                  → customer paid for another month
POST /vendor-admin/subscriptions/:id/suspend   {reason: "payment failed"}
  --- client's next call reflects it immediately ---
  POST /vendor-license/verify  {licenseKey, deviceId}   → { valid: false, licenseStatus: "SUSPENDED", reason: "License is suspended" }

POST /vendor-admin/subscriptions/:id/activate  {}                  → back to ACTIVE
POST /vendor-admin/subscriptions/:id/cancel    {reason: "customer request"}
  --- license stays ACTIVE until currentPeriodEnd; then the hourly job auto-expires both ---
```

### 18c. One-time license workflow
```
POST /vendor-admin/auth/login
POST /vendor-admin/packages   {code: "BIZ-LIFETIME", type: ONE_TIME, maxDevices: 3, price: 499}
POST /vendor-admin/licenses   {newCustomer: {...}, packageId}   → expiresAt: null (perpetual)

  --- customer's software ---
  POST /vendor-license/activate  {licenseKey, deviceId: "d1"}   → 201 (1/3)
  POST /vendor-license/activate  {licenseKey, deviceId: "d2"}   → 201 (2/3)
  POST /vendor-license/activate  {licenseKey, deviceId: "d3"}   → 201 (3/3)
  POST /vendor-license/activate  {licenseKey, deviceId: "d4"}   → 409 device limit reached

PATCH /vendor-admin/licenses/:id   {maxDevices: 5}
  POST /vendor-license/activate  {licenseKey, deviceId: "d4"}   → 201 (4/5)

POST /vendor-admin/licenses/:id/devices/d2/revoke     → admin frees a slot directly
POST /vendor-admin/licenses/:id/revoke  {reason: "..."}   → all devices deactivated, permanent
```

---

## 19. Missing APIs

### Resolved since the previous pass
- ~~Global device list~~ — **done.** `GET /vendor-admin/devices` now exists (§8).
- ~~Admin device reactivation~~ — **investigated, not needed.** Verified that a revoked device
  already safely regains access via the client software's own `POST /vendor-license/activate`
  call; no admin endpoint was added. Full behavior, including the "this is not a permanent ban"
  nuance, documented in §8.
- ~~Duplicate customer email surfaces as HTTP 500~~ — **fixed.** Now returns a clean
  `409 Conflict` with `{ "message": "A customer with this email already exists" }`, verified with
  a real duplicate request. See §5, §6, §12.

### Still open
1. **Explicitly confirmed NOT missing** (per your earlier point 6): there is no separate "Company"
   CRUD API, and none is needed — `VendorCustomer` fully represents the company, and
   `GET /vendor-admin/dashboard/companies` gives the company-focused rollup view. See §5.
2. **Not flagged as missing, just a scale note:** `GET /vendor-admin/dashboard/companies` and the
   `GET /vendor-admin/packages` list both return their entire result set unpaginated. Fine at the
   current data volume; would need pagination added if the customer/package count grows large.
3. **Noticed in passing, not fixed (out of scope for this pass):** package creation
   (`POST /vendor-admin/packages`) has the exact same class of bug the customer-email fix above
   addressed — creating a package with a `code` that already exists will currently also surface as
   a raw **HTTP 500** instead of a clean 409, since it hits the same kind of unhandled Prisma
   unique-constraint error. Flagging it now that the pattern is known; ask for it explicitly if you
   want it fixed the same way.

---

## 20. Postman collection

`VENDOR_LICENSING_API.postman_collection.json`, in the repo root alongside this file, contains
**every** endpoint documented above — 39 unique routes exercised across 47 requests (some routes,
like package/license creation, are exercised more than once with different bodies to show
different real use cases), none invented, none omitted — cross-checked against this document
route-by-route. Collection variables:
`baseUrl`, `vendorAdminToken`, `packageId`, `oneTimePackageId`, `saasPackageId`, `trialPackageId`,
`customerId`, `licenseId`, `licenseKey`, `trialId`, `trialLicenseKey`, `subscriptionId`,
`deviceId`. Run **"1. Admin Auth → Login"** first (it auto-saves `vendorAdminToken` via a test
script), then anything else — most requests auto-chain the ids the next step needs, so the whole
collection is runnable top-to-bottom as one coherent flow, folders 1→10 in order. Folder 4 also
demonstrates the duplicate-email fix (a second "Create Customer" call with the same email, right
after the first succeeds, expecting `409`); folder 9 demonstrates the global devices endpoint plus
the verified device-reactivation-via-client-activate behavior.

---

*This document is the source of truth for building the Admin Dashboard. If you find any
discrepancy between this file and the live API's actual behavior, that is a bug in this
documentation (or a backend regression) — please report it rather than silently coding around it.*
