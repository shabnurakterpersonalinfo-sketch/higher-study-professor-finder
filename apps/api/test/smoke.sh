#!/usr/bin/env bash
# End-to-end smoke test against a running API seeded from prisma/seed-data/*.csv
# (fresh database, SEED_PASSWORD unset → Password123!). Start the API with TRUST_PROXY=1 and
# CORS_ORIGINS=http://localhost:3000: each request gets its own X-Forwarded-For so the per-IP
# login limits don't trip, and the cookie endpoints check the web origin.
#   API=http://localhost:4000/api/v1 REDIS_CLI="redis-cli" ./test/smoke.sh
set -uo pipefail
API=${API:-http://localhost:4000/api/v1}
REDIS_CLI=${REDIS_CLI:-redis-cli}
PW=${SEED_PASSWORD:-Password123!}
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1  -- $2"; }
expect() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $2 got $3 $(head -c 300 /tmp/hs_body)"; fi; }
eq()     { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected '$2' got '$3'"; fi; }
req() {
  local m=$1 p=$2 t=$3 d=${4:-}
  if [ -n "$d" ]; then curl -s -o /tmp/hs_body -w '%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $t" -H 'Content-Type: application/json' -d "$d"
  else curl -s -o /tmp/hs_body -w '%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $t"; fi
}
body() { cat /tmp/hs_body; }
j() { node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const o=JSON.parse(s);const v=eval('o'+process.argv[1]);console.log(typeof v==='object'?JSON.stringify(v):v)})" "$1"; }
get() { curl -s "$API$1" -H "Authorization: Bearer $2"; }
ip() { echo "198.51.100.$((RANDOM % 250 + 1))"; }
login() { curl -s "$API/auth/login" -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"${2:-$PW}\"}" | j .accessToken; }
# Cookie-jar login for the session tests: login_jar <jar> <email> [password] → access token
login_jar() { curl -s -c "$1" "$API/auth/login" -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' -d "{\"email\":\"$2\",\"password\":\"${3:-$PW}\"}" | j .accessToken; }
WEB_ORIGIN=${WEB_ORIGIN:-http://localhost:3000}
refresh() { curl -s -o /tmp/hs_body -w '%{http_code}' -b "$1" -c "$1" -X POST "$API/auth/refresh" -H "Origin: ${2:-$WEB_ORIGIN}"; }
cookie_of() { awk '$6=="hs_rt"{print $7}' "$1"; }

echo "Auth (seeded users from users.csv)"
GU=$(login ahmed.rahman@buet.ac.bd); AD=$(login admin.support@higherstudy.bd); SA=$(login ceo@higherstudy.bd)
[ ${#GU} -gt 20 ] && [ ${#AD} -gt 20 ] && [ ${#SA} -gt 20 ] && ok "all three CSV users can log in" || bad "logins" "missing token"
eq "student role/plan from CSV" "GU STARTER" "$(get /auth/me "$GU" | j '.role+" "+o.plan')"
s=$(req GET /dashboard ""); expect "no token → 401" 401 "$s"
eq "subscription usage from seeded data" "STARTER 3/20 false" "$(get /payments/subscription "$GU" | j '.plan+" "+o.usage.applications+"/"+o.usage.applicationsCap+" "+o.features.visaTracking')"

echo "Onboarding (setup gate, tours, feature highlights)"
eq "seeded student skips setup" "true " "$(get /onboarding "$GU" | j '.setup.done+" "+o.setup.missing.filter(k=>k==="cgpa").join()')"
eq "Starter sees the 2 new Free features, not Pro ones" "outreach-export:NEW,plan-compare:NEW" "$(get /onboarding "$GU" | j '.features.map(f=>f.id+":"+f.reason).join()')"
s=$(req POST /onboarding/features/outreach-export/seen "$GU"); expect "dismiss a highlight" 200 "$s"
req POST /onboarding/features/outreach-export/seen "$GU" >/dev/null
eq "dismissed once, stays dismissed" "plan-compare" "$(get /onboarding "$GU" | j '.features.map(f=>f.id).join()')"
s=$(req POST /onboarding/features/not-a-feature/seen "$GU"); expect "unknown feature → 400" 400 "$s"
s=$(req POST /onboarding/tours/dashboard/seen "$GU"); expect "finish a tour" 200 "$s"
s=$(req POST '/onboarding/tours/BAD%20ID/seen' "$GU"); expect "bad tour id → 400" 400 "$s"
eq "tour stored" dashboard "$(get /onboarding "$GU" | j '.toursSeen.join()')"
eq "staff get no highlights" "0 true" "$(get /onboarding "$AD" | j '.features.length+" "+o.setup.done')"
NEWMAIL="new.$(date +%s)@example.com"
NU=$(curl -s "$API/auth/register" -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' -d "{\"email\":\"$NEWMAIL\",\"password\":\"$PW\",\"fullName\":\"Nadia Islam\"}" | j .accessToken)
eq "new sign-up must finish setup" "false" "$(get /auth/me "$NU" | j .setupDone)"
s=$(req GET /dashboard "$NU"); expect "dashboard blocked before setup" 403 "$s"
eq "block code" PROFILE_SETUP_REQUIRED "$(body | j .code)"
s=$(req GET '/universities?pageSize=1' "$NU"); expect "search blocked before setup" 403 "$s"
s=$(req GET /profile "$NU"); expect "profile open before setup" 200 "$s"
s=$(req GET /universities/facets "$NU"); expect "facets open for setup suggestions" 200 "$s"
s=$(req GET /payments/plans "$NU"); expect "plans open before setup" 200 "$s"
eq "missing essentials listed" "phone,undergradInstitution,undergradMajor,cgpa,targetIntake,fundingPreference,preferredCountries,researchInterests" "$(get /onboarding "$NU" | j '.setup.missing.join()')"
SETUP='{"fullName":"Nadia Islam","phone":"+8801711000000","undergradInstitution":"BUET","undergradMajor":"CSE","cgpa":3.7,"cgpaScale":4,"targetDegree":"MS","targetIntake":"Fall","fundingPreference":"FULLY_FUNDED","preferredCountries":["United States"],"researchInterests":["Machine Learning"]}'
s=$(req POST /onboarding/setup "$NU" "$(echo "$SETUP" | sed 's/"Machine Learning"//')"); expect "needs a research interest" 400 "$s"
s=$(req POST /onboarding/setup "$NU" "${SETUP/\"cgpa\":3.7/\"cgpa\":4.5}"); expect "CGPA above scale → 400" 400 "$s"
s=$(req POST /onboarding/setup "$NU" "$SETUP"); expect "complete setup" 200 "$s"
eq "setup done, nothing missing" "true 0" "$(body | j '.setup.done+" "+o.setup.missing.length')"
s=$(req GET /dashboard "$NU"); expect "dashboard opens right after setup (role cache evicted)" 200 "$s"
eq "brand-new Free student gets no highlights (tours cover it)" 0 "$(get /onboarding "$NU" | j .features.length)"

echo "RBAC"
s=$(req GET /admin/users "$GU"); expect "GU blocked from /admin" 403 "$s"
s=$(req GET /superadmin/transactions "$AD"); expect "ADMIN blocked from /superadmin" 403 "$s"
s=$(req POST /programs "$GU" '{"universityId":"univ_cmu","programName":"X","degreeLevel":"PhD"}'); expect "GU cannot write programs" 403 "$s"

echo "Universities (16 rows, derived rank/state, explained match)"
$REDIS_CLI --scan --pattern 'hs:univ:*' | xargs -r $REDIS_CLI del >/dev/null
s=$(req GET '/universities?pageSize=20' "$GU"); expect "search" 200 "$s"
eq "all 16 universities" 16 "$(body | j .total)"
eq "default sort for a student is match" match "$(body | j .sort)"
eq "best match is Stevens (fit + guaranteed funding)" "univ_stevens 100" "$(body | j '.items[0].id+" "+o.items[0].match.score')"
eq "rank parsed from '#82 in Computer Science (tie)'" "82 true" "$(body | j '.items[0].csRankPosition+" "+o.items[0].csRankTied')"
ttl=$($REDIS_CLI ttl "$($REDIS_CLI --scan --pattern 'hs:univ:search:*' | head -1)"); [ "$ttl" -gt 86000 ] && ok "cached 24h ($ttl s)" || bad "univ TTL" "$ttl"
eq "funding filter: GUARANTEED → GMU, JHU, Stevens" "univ_gmu,univ_jhu,univ_stevens" "$(get '/universities?funding=GUARANTEED&sort=name' "$GU" | j '.items.map(u=>u.id).sort().join()')"
eq "no-WES filter drops Drexel/JHU/UTRGV" 13 "$(get '/universities?wes=false' "$GU" | j .total)"
eq "state filter PA → CMU, Drexel, Temple" "univ_cmu,univ_drexel,univ_temple" "$(get '/universities?states=PA&sort=name' "$GU" | j '.items.map(u=>u.id).join()')"
eq "rank ≤ 20 → 7 universities" 7 "$(get '/universities?maxRank=20' "$GU" | j .total)"
eq "research-area filter is spelling-insensitive" "univ_louisville,univ_usf" "$(get '/universities?researchArea=cybersecurity&sort=name' "$GU" | j '.items.map(u=>u.id).join()')"

echo "Professors (slug ids, normalised tags, fit sort)"
s=$(req POST /professors/search "$GU" '{"researchAreas":["cybersecurity"]}'); expect "tag search" 200 "$s"
eq "'cybersecurity' finds 'Cyber Security'" 2 "$(body | j .total)"
eq "honorific stripped from 'Prof. Jonathan Smith'" "Jonathan Smith" "$(get /professors/prof_mit_smith "$GU" | j .name)"
eq "full-text 'explainable' → Tian Han" "Tian Han" "$(curl -s -X POST "$API/professors/search" -H "Authorization: Bearer $GU" -H 'Content-Type: application/json' -d '{"q":"explainable"}' | j '.items[0].name')"
s=$(req POST /professors/search "$GU" '{}'); eq "default sort is fit" fit "$(body | j .sort)"
eq "top fit shares 2 interests" 2 "$(body | j '.items[0].matchedAreas.length')"
eq "outreach stats hidden below 3 threads" true "$(get /professors/prof_usf_ami "$GU" | j .outreachStats.insufficientData)"

echo "Outreach (CSV threads)"
s=$(req GET /outreach "$GU"); expect "list" 200 "$s"
eq "3 seeded threads" 3 "$(body | j .total)"
eq "outreach_002 is reminder-due (scheduled 2025-10-30)" true "$(get /outreach/outreach_002 "$GU" | j .reminderDue)"
eq "outreach_001 timeline = sent + reply" "INITIAL_SENT,REPLY_RECEIVED" "$(get /outreach/outreach_001 "$GU" | j '.events.map(e=>e.type).join()')"
eq "sent time read as Dhaka (02:31 +06 = 20:31Z)" "2025-10-22T20:31:00.000Z" "$(get /outreach/outreach_001 "$GU" | j .emailSentTime)"
eq "REMINDER_DUE view" outreach_002 "$(get '/outreach?view=REMINDER_DUE' "$GU" | j '.items.map(i=>i.id).join()')"
s=$(req POST /outreach "$GU" '{"professorId":"prof_temple_latecki","emailSentTime":"2026-10-01T09:00:00Z"}'); expect "slug professorId accepted" 201 "$s"
OID=$(body | j .id)
s=$(req POST /outreach "$GU" '{"professorId":"prof_temple_latecki"}'); expect "duplicate thread → 409" 409 "$s"
s=$(req POST "/outreach/$OID/events" "$GU" '{"type":"REPLY_RECEIVED"}'); expect "log reply" 201 "$s"
eq "status follows event" POSITIVE_REPLY "$(get "/outreach/$OID" "$GU" | j .replyStatus)"
s=$(req PATCH /outreach/outreach_002 "$GU" '{"fundingStatus":"Funding Available","interviewStatus":"Requested"}'); expect "update funding/interview" 200 "$s"
s=$(req GET /outreach/outreach_001 "$AD"); expect "admin has no student profile → 403" 403 "$s"

echo "Applications (program-driven checklist)"
s=$(req GET /applications "$GU"); expect "board" 200 "$s"
eq "3 seeded applications" 3 "$(body | j .total)"
eq "app_001 (GMU '2-3 LORs'): 7/7 required, LOR 3 optional" "7/7 false" "$(get /applications/app_001 "$GU" | j '.documentsComplete+"/"+o.documentsTotal+" "+o.checklist.find(c=>c.key==="lor3Submitted").required')"
eq "app_002 transcript label mentions WES" "Official transcript / WES evaluation" "$(get /applications/app_002 "$GU" | j '.checklist[0].label')"
s=$(req POST /applications "$GU" '{"programId":"prog_gmu_phd"}'); expect "second application to same program → 409" 409 "$s"
eq "error code" DUPLICATE_APPLICATION "$(body | j .code)"
s=$(req POST /applications "$GU" '{"programId":"prog_stevens_phd","status":"PREPARING"}'); expect "new application by slug programId" 201 "$s"
s=$(req PATCH /applications/app_001 "$GU" '{"status":"SUBMITTED"}'); expect "move card" 200 "$s"
[ "$(body | j .appliedAt)" != "null" ] && ok "appliedAt stamped" || bad "appliedAt" "null"

echo "Plans: CSV says STARTER, so the seeded visa reminder is gated"
s=$(req GET /visa-reminders "$GU"); expect "STARTER → visa 403" 403 "$s"
eq "error code" PLAN_UPGRADE_REQUIRED "$(body | j .code)"
s=$(req POST /payments/checkout "$GU" '{"plan":"PRO","gateway":"bKash"}'); expect "checkout PRO" 201 "$s"
PID=$(body | j .redirectUrl | sed -E 's/.*paymentID=([^&]+).*/\1/')
loc=$(curl -s -o /dev/null -w '%{redirect_url}' "$API/payments/callback/bKash?paymentID=$PID&status=success"); [[ "$loc" == *result=success* ]] && ok "callback success" || bad "callback" "$loc"
loc=$(curl -s -o /dev/null -w '%{redirect_url}' "$API/payments/callback/bKash?paymentID=$PID&status=success"); [[ "$loc" == *result=success* ]] && ok "callback idempotent" || bad "idempotent" "$loc"
eq "now PRO" PRO "$(get /auth/me "$GU" | j .plan)"
eq "visa_001 from CSV now visible" "visa_001 United States" "$(get /visa-reminders "$GU" | j '[0].id+" "+o[0].targetCountry')"
s=$(req PATCH /admin/users/usr_gu_001/upgrade "$AD" '{"plan":"STARTER","notes":"smoke: downgrade"}'); expect "admin downgrade (slug user id)" 200 "$s"
s=$(req GET /visa-reminders "$GU"); expect "downgrade effective immediately" 403 "$s"

echo "Manual reconciliation + audit"
FAILED=$(curl -s -X POST "$API/payments/checkout" -H "Authorization: Bearer $GU" -H 'Content-Type: application/json' -d '{"plan":"PREMIUM","gateway":"Nagad"}' | j .transactionId)
curl -s -o /dev/null "$API/payments/callback/Nagad?paymentID=mock_$FAILED&status=failure"
s=$(req POST /admin/transactions/manual-reconcile "$AD" "{\"transactionId\":\"$FAILED\",\"referenceId\":\"NG-TRX-991\",\"newStatus\":\"MANUALLY_RECONCILED\",\"applyPlan\":true,\"notes\":\"Gateway down; verified on merchant panel\"}"); expect "reconcile" 201 "$s"
eq "plan applied" PREMIUM "$(get /auth/me "$GU" | j .plan)"
s=$(req POST /admin/transactions/manual-reconcile "$AD" "{\"transactionId\":\"txn_002\",\"referenceId\":\"TRX9M281L002\",\"newStatus\":\"MANUALLY_RECONCILED\",\"applyPlan\":false,\"notes\":\"again again\"}"); expect "seeded txn_002 already reconciled → 409" 409 "$s"
eq "history filter includes txn_002" true "$(get '/superadmin/transactions?status=MANUALLY_RECONCILED' "$SA" | j '.items.some(t=>t.id==="txn_002")')"

echo "Directory writes derive columns + purge cache"
get '/universities' "$GU" >/dev/null
s=$(req POST /programs "$AD" '{"universityId":"univ_cmu","programName":"Computer Science, PhD","degreeLevel":"PhD","applicationFee":"$75","greRequirement":"GRE not required","ieltsRequirement":"7.5 overall","financialAidPolicy":"Fully funded for five years"}'); expect "admin creates program" 201 "$s"
eq "derived: fee/GRE/IELTS/funding" "75 false 7.5 GUARANTEED" "$(body | j '.applicationFeeUsd+" "+o.greRequired+" "+o.ieltsMinOverall+" "+o.fundingLevel')"
k=$($REDIS_CLI --scan --pattern 'hs:univ:*' | wc -l); [ "$k" -eq 0 ] && ok "hs:univ:* purged" || bad "purge" "$k keys"
eq "CMU now lists a program" 1 "$(get /universities/univ_cmu "$GU" | j .programs.length)"
s=$(req PATCH /universities/univ_cmu "$AD" '{"csRank":"#3 in Computer Science"}'); expect "admin edits rank text" 200 "$s"
eq "rank re-derived" "3 false" "$(body | j '.csRankPosition+" "+o.csRankTied')"
eq "audit trail records program + university edits" true "$(get '/superadmin/audit-logs?targetType=PROGRAM' "$SA" | j '.total>=1')"


echo "CSV import (admin + super admin)"
up() { # token entity file -> status, body in /tmp/hs_body
  curl -s -o /tmp/hs_body -w '%{http_code}' -X POST "$API/admin/imports/$2/preview" -H "Authorization: Bearer $1" -F "file=@$3;type=text/csv"
}
T=$(mktemp -d)
s=$(curl -s -o $T/tpl.csv -w '%{http_code}' "$API/admin/imports/templates/programs" -H "Authorization: Bearer $AD"); expect "template download" 200 "$s"
eq "template header" "id,university_id,program_name,degree_level" "$(head -1 $T/tpl.csv | cut -d, -f1-4)"
printf 'id,name,location,cs_rank,wes_required\nuniv_mit,Massachusetts Institute of Technology,"Cambridge, MA",#1 in Computer Science,true\n,Rice University,"Houston, TX",#28 in Computer Science (tie),false\n,No Location U,,,\n,rice university,"Houston, TX",,\nuniv_gmu,George Mason University,"Fairfax, VA",#63 in Computer Science (tie),false\n' > $T/unis.csv
s=$(up "$GU" universities $T/unis.csv); expect "GU cannot import" 403 "$s"
s=$(up "$AD" universities $T/unis.csv); expect "admin preview" 200 "$s"
eq "summary new/update/same/error" "1 1 1 2" "$(body | j '.summary.create+" "+o.summary.update+" "+o.summary.unchanged+" "+o.summary.error')"
eq "MIT diff shows wesRequired" "wesRequired" "$(body | j '.rows.find(r=>r.id==="univ_mit").changes.map(c=>c[0]).join()')"
eq "missing location reported" true "$(body | j '.rows.some(r=>r.errors.some(e=>e.includes("location is required")))')"
eq "case-insensitive duplicate caught" true "$(body | j '.rows.some(r=>r.errors.some(e=>e.startsWith("duplicate of line")))')"
IID=$(body | j .importId)
s=$(req POST "/admin/imports/$IID/commit" "$SA" '{}'); expect "other admin can't commit my preview" 403 "$s"
s=$(req POST "/admin/imports/$IID/commit" "$AD" '{}'); expect "errors block a full import" 400 "$s"
eq "error code" ROWS_HAVE_ERRORS "$(body | j .code)"
get '/universities' "$GU" >/dev/null
s=$(req POST "/admin/imports/$IID/commit" "$AD" '{"allowPartial":true}'); expect "partial import" 200 "$s"
eq "created/updated/skipped" "1 1 2" "$(body | j '.created+" "+o.updated+" "+o.skipped')"
s=$(req POST "/admin/imports/$IID/commit" "$AD" '{"allowPartial":true}'); expect "same preview can't be imported twice" 410 "$s"
k=$($REDIS_CLI --scan --pattern 'hs:univ:*' | wc -l); [ "$k" -eq 0 ] && ok "hs:univ:* purged after import" || bad "purge" "$k keys"
eq "Rice is searchable with derived rank/state" "28 TX" "$(get '/universities?q=Rice' "$GU" | j '.items[0].csRankPosition+" "+o.items[0].state')"
eq "MIT now flagged WES" true "$(get /universities/univ_mit "$GU" | j .wesRequired)"
printf 'university_id,program_name,degree_level,application_fee,financial_aid_policy,catalog_link\nRice University,"Computer Science, PhD",phd,$85,Fully funded for all admitted PhD students,https://example.edu/cs\nunknown_uni,X,PhD,,,\n' > $T/progs.csv
s=$(up "$SA" programs $T/progs.csv); expect "super admin preview programs (university by name)" 200 "$s"
eq "1 new + 1 unknown university" "1 1" "$(body | j '.summary.create+" "+o.summary.error')"
s=$(req POST "/admin/imports/$(body | j .importId)/commit" "$SA" '{"allowPartial":true}'); expect "commit programs" 200 "$s"
eq "derived fee + funding on imported program" "85 GUARANTEED" "$(get "/programs?universityId=$(get '/universities?q=Rice' "$GU" | j '.items[0].id')" "$GU" | j '[0].applicationFeeUsd+" "+o[0].fundingLevel')"
printf 'name,location\n"broken,row\n' > $T/bad.csv
s=$(up "$AD" universities $T/bad.csv); expect "unterminated quote → 400" 400 "$s"
printf 'name\nX\n' > $T/nocol.csv
s=$(up "$AD" universities $T/nocol.csv); expect "missing column → 400" 400 "$s"
eq "error code" MISSING_COLUMNS "$(body | j .code)"
eq "history has 2 committed imports" "2 COMMITTED" "$(get /admin/imports "$SA" | j '.total+" "+o.items[0].status')"
eq "audit trail records the import" true "$(get '/superadmin/audit-logs?action=CSV_IMPORT' "$SA" | j '.total>=2')"

echo "Subscription page data"
eq "plans endpoint: prices + gateways" "2000 bKash:true" "$(get /payments/plans "$GU" | j '.plans.find(p=>p.plan==="STARTER").priceBdt+" "+o.gateways[0].id+":"+o.gateways[0].available')"

echo "Sessions, refresh tokens and revocation"
T=$(mktemp -d)
J1=$T/j1; A1=$(login_jar $J1 "$NEWMAIL")
[ -n "$(cookie_of $J1)" ] && ok "login sets the refresh cookie" || bad "cookie" "missing"
curl -s -D $T/h -o /dev/null "$API/auth/login" -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' -d "{\"email\":\"$NEWMAIL\",\"password\":\"$PW\"}"
grep -qi 'set-cookie: hs_rt=.*HttpOnly' $T/h && grep -qi 'Path=/api/v1/auth' $T/h && grep -qi 'SameSite=Lax' $T/h && ok "cookie is HttpOnly, SameSite=Lax, scoped to /api/v1/auth" || bad "cookie flags" "$(grep -i set-cookie $T/h)"
eq "access token lasts 15 minutes" 900 "$(curl -s "$API/auth/login" -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' -d "{\"email\":\"$NEWMAIL\",\"password\":\"$PW\"}" | j .expiresIn)"
eq "access token carries a session id" true "$(node -e "const p=JSON.parse(Buffer.from('$A1'.split('.')[1],'base64url'));console.log(!!p.sid&&p.iss==='higherstudy')")"
C0=$(cookie_of $J1)
s=$(refresh $J1); expect "refresh with cookie" 200 "$s"
A2=$(body | j .accessToken); C1=$(cookie_of $J1)
[ "$C0" != "$C1" ] && ok "refresh rotates the cookie" || bad "rotation" "same cookie"
s=$(req GET /auth/me "$A2"); expect "new access token works" 200 "$s"
s=$(refresh $J1 https://evil.example); expect "refresh from another site refused" 403 "$s"
s=$(refresh $J1); expect "second refresh" 200 "$s"
A3=$(body | j .accessToken)
printf '#HttpOnly_localhost\tFALSE\t/api/v1/auth\tFALSE\t0\ths_rt\t%s\n' "$C0" > $T/stale
s=$(refresh $T/stale); expect "replaying an old refresh token is refused" 401 "$s"
s=$(req GET /auth/me "$A3"); expect "…and ends that whole session (theft detection)" 401 "$s"
eq "code" SESSION_ENDED "$(body | j .code)"
s=$(refresh $J1); expect "the legitimate cookie is dead too" 401 "$s"

J2=$T/j2; B1=$(login_jar $J2 "$NEWMAIL")
s=$(curl -s -o /tmp/hs_body -w '%{http_code}' -b $J2 -c $J2 -X POST "$API/auth/logout" -H "Origin: $WEB_ORIGIN"); expect "logout" 200 "$s"
s=$(req GET /auth/me "$B1"); expect "access token stops working right after logout" 401 "$s"
s=$(refresh $J2); expect "refresh after logout refused" 401 "$s"

J3=$T/j3; D1=$(login_jar $J3 "$NEWMAIL"); J4=$T/j4; E1=$(login_jar $J4 "$NEWMAIL")
eq "session list marks this device" "true" "$(get /auth/sessions "$D1" | j '.some(x=>x.current)&&o.length>=2')"
OTHER=$(get /auth/sessions "$D1" | j '.find(x=>!x.current).id')
s=$(req DELETE "/auth/sessions/$OTHER" "$GU"); expect "can't end someone else's session" 404 "$s"
s=$(req POST /auth/logout-all "$D1"); expect "log out everywhere" 200 "$s"
s=$(req GET /auth/me "$E1"); expect "other device signed out" 401 "$s"
s=$(req GET /auth/me "$D1"); expect "this device signed out too" 401 "$s"

J5=$T/j5; F1=$(login_jar $J5 "$NEWMAIL"); J6=$T/j6; G1=$(login_jar $J6 "$NEWMAIL")
s=$(req POST /auth/password "$F1" "{\"currentPassword\":\"wrong-password\",\"newPassword\":\"N3w-password-123\"}"); expect "change password needs the current one" 400 "$s"
s=$(req POST /auth/password "$F1" "{\"currentPassword\":\"$PW\",\"newPassword\":\"N3w-password-123\"}"); expect "change password" 200 "$s"
eq "other sessions signed out" 1 "$(body | j .otherSessionsSignedOut)"
s=$(req GET /auth/me "$G1"); expect "other device needs to log in again" 401 "$s"
s=$(req GET /auth/me "$F1"); expect "this device stays signed in" 200 "$s"
NP=$(login "$NEWMAIL" "N3w-password-123"); [ ${#NP} -gt 20 ] && ok "new password works" || bad "new password" "no token"

NONE=$(node -e "const b=s=>Buffer.from(JSON.stringify(s)).toString('base64url');const p=JSON.parse(Buffer.from('$F1'.split('.')[1],'base64url'));console.log(b({alg:'none',typ:'JWT'})+'.'+b(p)+'.')")
s=$(req GET /auth/me "$NONE"); expect "unsigned (alg=none) token refused" 401 "$s"

for i in 1 2 3 4 5; do curl -s -o /dev/null "$API/auth/login" -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' -d "{\"email\":\"$NEWMAIL\",\"password\":\"bad-guess-$i\"}"; done
s=$(curl -s -o /tmp/hs_body -w '%{http_code}' "$API/auth/login" -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' -d "{\"email\":\"$NEWMAIL\",\"password\":\"N3w-password-123\"}")
expect "5 wrong passwords lock the account, from any IP" 429 "$s"
eq "lock code" ACCOUNT_LOCKED "$(body | j .code)"
s=$(curl -s -o /tmp/hs_body -w '%{http_code}' "$API/auth/login" -H "X-Forwarded-For: $(ip)" -H 'Content-Type: application/json' -d '{"email":"nobody-here@example.com","password":"x"}'); expect "unknown email: same answer as a wrong password" 401 "$s"

NUID=$(get /auth/me "$F1" | j .id)
s=$(req PATCH "/admin/users/$NUID/status" "$AD" '{"isActive":false}'); expect "admin disables the account" 200 "$s"
s=$(req GET /auth/me "$F1"); expect "disabled account signed out immediately" 401 "$s"
s=$(refresh $J5); expect "and can't refresh" 401 "$s"
rm -rf $T

echo "Super admin role management"
s=$(req PATCH /superadmin/users/usr_gu_001/role "$SA" '{"role":"ADMIN"}'); expect "promote" 200 "$s"
s=$(req GET /admin/overview "$GU"); expect "promotion immediate" 200 "$s"
s=$(req PATCH /superadmin/users/usr_gu_001/role "$SA" '{"role":"GU"}'); expect "demote" 200 "$s"
s=$(req GET /admin/overview "$GU"); expect "demotion immediate" 403 "$s"
s=$(req PATCH /superadmin/users/usr_superadmin_001/role "$SA" '{"role":"GU"}'); expect "can't demote yourself" 400 "$s"

echo; echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
