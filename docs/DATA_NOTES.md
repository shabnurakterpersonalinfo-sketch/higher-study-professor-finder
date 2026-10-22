# Seed data notes

The seed reads `apps/api/prisma/seed-data/*.csv`, which come from the HigherStudy spreadsheet.
`npx prisma db seed` validates every file before writing anything, upserts by the CSV `id`
(re-running applies edits instead of duplicating), and prints a data-quality report.

## What the spreadsheet export lost

Every cell that held a URL was replaced with `[suspicious link removed]`, and that placeholder
**also swallowed the commas around it**, so neighbouring columns merged and rows came out too
short. The CSVs in `seed-data/` are realigned to their headers with the lost cells left
**empty** — nothing was guessed. To restore them, fill the cells in and re-run the seed.

| File | Lost columns | Rows | Clue left in the export |
|---|---|---|---|
| `programs.csv` | `catalog_link`, `deadline_date` | all 6 | Deadline **day** survived, month did not: GMU 1, Drexel 15, JHU 15, Stevens 15, Temple 1, UTRGV 1 |
| `professors.csv` | `profile_link`, `google_scholar_link`, `lab_website`, `h_index`, `citation_count`, `accepting_students` | all 8 | — |
| `professor_outreach.csv` | `attached_cv_url`, `attached_proposal_url` | all 3 | — |
| `users.csv` | `password_hash` | all 3 | Values were placeholders (`$2b$12$e8Y...hash1`), not real hashes |

Until filled in: deadlines show **"Not published yet"**, professor metrics show as not listed
(and their filters are hidden), and `accepting_students` uses the schema default `true`.

## How values are interpreted

| Source value | Stored as | Why |
|---|---|---|
| `id` slugs (`univ_mit`, `prog_gmu_phd`) | Kept verbatim as primary keys | Every DTO now accepts slug **or** UUID ids (`@IsId()`); new rows created in the app get UUIDs |
| `Prof. Jonathan Smith` | `Jonathan Smith` | The UI adds the honorific; avoids "Prof. Prof." |
| `Machine Learning;Deep Learning` | `text[]` | `;`-separated lists, de-duplicated |
| `Cybersecurity` vs `Cyber Security` | matched as equal | Tag matching ignores case, spaces and punctuation (`normTag` / SQL `hs_norm_tag`) |
| `Fully Funded` | `FULLY_FUNDED` | Normalised enum-like value (CHECK constraint) |
| `N/A`, empty | `NULL` | |
| `2025-10-23 02:31:00` | `2025-10-22T20:31:00Z` | Zoneless timestamps are read as **Asia/Dhaka** (`SEED_TZ`, default `+06:00`) |
| `2026-05-15` (date only) | UTC midnight | Visa dates |
| outreach `reminder_sent_time` | `nextReminderAt` (only for `MAILED` threads) | It's always sent + 7 days — even on threads answered before that date — so it's the *scheduled* follow-up, not a reminder that was sent |
| outreach timestamps | `OutreachEvent` rows | `INITIAL_SENT` and `REPLY_RECEIVED` events are rebuilt from the CSV on every run; `interview_status = Scheduled` has no date, so no event is created |
| placeholder password hashes | bcrypt of `SEED_PASSWORD` | Defaults to `Password123!` in development; **the seed refuses to run in production without `SEED_PASSWORD`** |

### Derived columns

`src/common/derive.ts` turns the published text into filterable columns. The seed and every
admin write use the same functions, so they can't drift. Each parser returns `NULL` when the
text doesn't say — it never guesses.

| Text | Derived | Dataset result |
|---|---|---|
| `location` "Cambridge, MA" | `state`, `country` | 16 US universities across 11 states |
| `cs_rank` "#2 in Computer Science (tie)" | `csRankPosition` 2, `csRankTied` true | all 16 parsed |
| `application_fee` "$80" | `applicationFeeUsd` 80 | 6/6 |
| `gre_requirement` | `greRequired` | 6/6 "Official GRE Required" → true |
| `ielts_requirement` | `ieltsMinOverall` | Only GMU publishes a number (7.0); the rest say "Official IELTS Required" → NULL |
| `financial_aid_policy` | `fundingLevel` | GUARANTEED: GMU, JHU, Stevens · AVAILABLE: Drexel, Temple · CONDITIONAL: UTRGV |
| `limitations_notes` mentions WES / credential evaluation | `Program.wesRequired` | Drexel, JHU, UTRGV |

## Inconsistencies the seed reports (kept as-is)

1. **Ahmed's plan.** `users.csv` says `STARTER`, but `txn_002` is a reconciled **PRO** purchase.
   The seed keeps `STARTER`.
2. **Visa reminder hidden by that plan.** Visa tracking is a Pro feature, so with the CSV plan
   Ahmed can't see his own `visa_001` until upgraded. Fixing #1 fixes this.
3. **Expired plans.** Both of Ahmed's payments would have lapsed under 12-month validity
   (`txn_002` on 2026-10-15). `planExpiresAt` is left empty for imported users so the nightly
   expiry job doesn't downgrade them; set it deliberately if you want expiry enforced.
4. **`txn_002` has no reconciliation record.** It's imported as `MANUALLY_RECONCILED` without a
   `TransactionAudit` row (the source doesn't say who reconciled it or when).
5. **Coverage.** Stanford, CMU, Berkeley, UIUC and Georgia Tech have no programs or professors
   yet; MIT, Kentucky, UTEP, South Florida and Louisville have faculty but no programs.
   Match scores say "No program details yet" rather than inventing them.

Run with `SEED_STRICT=1` to make any of these warnings fail the seed (useful in CI once the
data is cleaned up).
