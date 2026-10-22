# Payments

## Flow

1. Student picks a plan and gateway → `POST /payments/checkout` creates a `PENDING` transaction and
   asks the gateway for a checkout URL.
2. Browser goes to the gateway, pays, and is redirected to
   `GET /payments/callback/:gateway?paymentID=…&status=success|failure|cancel`.
3. On `success` the API calls the gateway's *execute* endpoint. Only a confirmed payment moves the
   transaction `PENDING → SUCCESS` and upgrades the plan (12 months). The transition is a
   conditional update, so a repeated callback is harmless.
4. If execute errors (gateway down), the transaction stays `PENDING` and the student sees a
   "we'll reconcile it" message.

## Manual reconciliation (gateway downtime, offline payments)

Admins use **Reconcile Payments**:

- *Reconcile* a `PENDING`/`FAILED` transaction after checking the TrxID on the merchant panel →
  `MANUALLY_RECONCILED` (optionally applying the plan) or `FAILED`.
- *Record offline payment* for cash/bank/direct transfers → creates a transaction already marked
  `MANUALLY_RECONCILED`.

Both write a `TransactionAudit` row (before/after status, reference, notes, admin) and an
`AdminActionLog` row. Already-settled transactions can't be reconciled again (409).

## Gateways

| Gateway | State |
|---|---|
| **Mock** (`PAYMENT_MODE=mock`) | Dev only. Redirects to `/purchase-plan/mock-checkout` where you click success/failure. The API refuses to boot with mock in `NODE_ENV=production`. |
| **bKash** | Tokenized Checkout implemented in `modules/payments/gateways.ts` (grant token → create → execute, with a status query if execute returns nothing). Set `PAYMENT_MODE=live` and the `BKASH_*` variables. **Check the request/response field names against your merchant API version and test in the bKash sandbox before going live.** |
| **Nagad** | Interface stub. Nagad needs RSA-encrypted payloads and signatures with keys from the merchant onboarding kit; implement `NagadGateway.create/execute` with those. |

To add Rocket or another gateway, implement `PaymentGateway` and register it in `PaymentsService`.
