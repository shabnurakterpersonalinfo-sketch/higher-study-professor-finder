/**
 * Guided tours. A step points at an element with `data-tour="<target>"`; steps
 * whose element isn't on screen (empty states, mobile) are skipped, and a step
 * without a target shows as a centred card.
 *
 * - Screen tours (`id` = route key) run the first time a student opens that screen.
 * - Feature tours (`feature:<id>`) run when they open a highlighted "New" menu item.
 *   Feature ids come from apps/api/src/common/features.ts.
 */
export interface TourStep {
  target?: string;
  title: string;
  body: string;
}
export interface Tour {
  id: string;
  steps: TourStep[];
}

const t = (id: string, steps: TourStep[]): Tour => ({ id, steps });

export const TOURS: Record<string, Tour> = {
  dashboard: t('dashboard', [
    { title: 'Welcome to HigherStudy', body: 'A quick look around in five short tips. You can replay any tour later from the ? button at the top.' },
    { target: 'nav', title: 'Everything lives here', body: 'Find universities and professors, track your emails and applications, and keep your visa dates in one place.' },
    { target: 'dashboard-kpis', title: 'Your progress at a glance', body: 'Saved universities, emails sent, replies and applications update as you work.' },
    { target: 'dashboard-reminders', title: 'Follow-ups we remind you about', body: 'If a professor hasn’t replied in 7 days, the thread shows up here so you can nudge them.' },
    { target: 'topbar-search', title: 'Search from anywhere', body: 'Type a professor’s name or a research area like “computer vision” and press Enter.' },
    { target: 'account-menu', title: 'Your account', body: 'Profile, plans and billing, settings and log out are all in this menu.' },
  ]),
  universities: t('universities', [
    { target: 'uni-filters', title: 'Narrow it down', body: 'Filter by state, rank, funding, fees and whether WES evaluation is needed.' },
    { target: 'uni-sort', title: 'Sorted by your match', body: 'Match compares each university with your profile — research interests, funding preference and degree.' },
    { target: 'uni-card', title: 'Open a university', body: 'See its programs, deadlines, requirements and the professors working there. Bookmark it to find it later in Saved Items.' },
  ]),
  professors: t('professors', [
    { target: 'prof-search', title: 'Find the right supervisor', body: 'Search by name or research area. Spelling and spacing don’t need to be exact.' },
    { target: 'prof-filters', title: 'Who’s taking students', body: 'Filter by rank, openings and whether they’re accepting students this cycle.' },
    { target: 'prof-card', title: 'Start an outreach thread', body: 'Open a profile to see research areas and links, then track your email to them in one click.' },
  ]),
  'email-tracker': t('email-tracker', [
    { target: 'outreach-add', title: 'Track every email you send', body: 'Add a professor and the date you emailed. We’ll remind you to follow up after 7 days.' },
    { target: 'outreach-tabs', title: 'Filter by status', body: 'Waiting, positive replies, interviews, follow-ups due — see where each conversation stands.' },
    { target: 'outreach-list', title: 'Open a thread', body: 'Log replies and follow-ups to keep a full timeline for each professor.' },
  ]),
  applications: t('applications', [
    { target: 'apps-add', title: 'Add an application', body: 'Pick a program and we set up its document checklist and deadline for you.' },
    { target: 'apps-board', title: 'Move it along', body: 'Drag cards between columns as you prepare, submit and hear back.' },
    { target: 'apps-usage', title: 'Your plan limit', body: 'This shows how many applications your plan includes and how many you’re tracking.' },
  ]),
  visa: t('visa', [
    { target: 'visa-add', title: 'Add your visa dates', body: 'Appointment, bank solvency deadline and passport expiry — add the ones you know.' },
    { target: 'visa-list', title: 'Countdowns and reminders', body: 'We remind you 14, 7 and 1 day before each date, in the app and by email.' },
  ]),
  saved: t('saved', [{ target: 'saved-tabs', title: 'Everything you bookmarked', body: 'Universities, professors and programs you saved, in one place.' }]),
  profile: t('profile', [
    { target: 'profile-tabs', title: 'Your profile, in sections', body: 'The more you add — scores, research, experience — the better your matches get.' },
    { target: 'profile-save', title: 'Save as you go', body: 'Changes apply to your match scores straight away.' },
  ]),
  settings: t('settings', [{ target: 'settings-tips', title: 'Tips whenever you need them', body: 'Turn the screen tours back on here, or use the ? button at the top of any screen.' }]),
  'purchase-plan': t('purchase-plan', [
    { target: 'plan-current', title: 'Your plan today', body: 'What you’re on, how much of it you’re using, and when it ends.' },
    { target: 'plan-cards', title: 'Upgrade when you need more', body: 'Plans are a one-time payment for 12 months — no automatic renewal.' },
    { target: 'plan-compare', title: 'Compare in detail', body: 'Every feature, side by side, so you know exactly what changes.' },
  ]),

  // ---- feature releases (see features.ts in the API)
  'feature:visa-reminders': t('feature:visa-reminders', [
    { title: 'Visa reminders are unlocked', body: 'Your plan now includes visa tracking. Here’s how it works.' },
    { target: 'visa-add', title: 'Add your first date', body: 'Start with your visa appointment or bank solvency deadline.' },
    { target: 'visa-list', title: 'We’ll keep count', body: 'Reminders arrive 14, 7 and 1 day before — in the app and by email.' },
  ]),
  'feature:unlimited-applications': t('feature:unlimited-applications', [
    { target: 'apps-usage', title: 'No more application limit', body: 'Your plan lets you track as many programs as you like.' },
    { target: 'apps-add', title: 'Add the rest of your shortlist', body: 'Each one gets its own checklist and deadline alert.' },
  ]),
  'feature:outreach-export': t('feature:outreach-export', [
    { target: 'outreach-export', title: 'New: export your tracker', body: 'Download every thread — dates, replies and follow-ups — as a CSV you can open in Excel or Sheets.' },
  ]),
  'feature:plan-compare': t('feature:plan-compare', [
    { target: 'plan-current', title: 'New: see your usage', body: 'Your plan card shows what you’re using today.' },
    { target: 'plan-compare', title: 'Compare plans side by side', body: 'Every feature in one table, so you know what an upgrade changes before you pay.' },
  ]),
};

/** Route → screen tour id. Detail pages (/universities/:id) don't auto-run. */
export function tourForPath(path: string): string | null {
  const key = path.replace(/^\//, '').split('/');
  if (key.length !== 1) return null;
  return TOURS[key[0]] ? key[0] : null;
}
