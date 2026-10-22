import { Bot, FileSignature, MailPlus, ScanSearch } from 'lucide-react';
import { Badge, Card, PageHeader } from '@/components/ui';

const TOOLS = [
  { icon: <MailPlus />, title: 'Cold-email drafter', body: 'Draft a first email to a professor from your profile and their recent publications.' },
  { icon: <FileSignature />, title: 'SOP reviewer', body: 'Get structured feedback on your statement of purpose against the program’s focus.' },
  { icon: <ScanSearch />, title: 'Research-fit finder', body: 'Rank professors by overlap between your research interests and their work.' },
];

/** Placeholder: AI tools are a planned stream (see docs/STREAMS.md, Stream F). */
export default function AiToolsPage() {
  return (
    <div>
      <PageHeader title="AI tools" subtitle="Planned tools to speed up outreach and applications." />
      <div className="grid gap-5 md:grid-cols-3">
        {TOOLS.map((t) => (
          <Card key={t.title} className="p-6">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{t.icon}</span>
            <p className="mt-4 font-semibold">{t.title}</p>
            <p className="mt-1 text-sm text-ink-mute">{t.body}</p>
            <Badge tone="gray" className="mt-4"><Bot className="mr-1 h-3 w-3" /> Coming soon</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
