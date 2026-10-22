import { FileText, GraduationCap, Landmark, MailCheck } from 'lucide-react';
import { ReactNode } from 'react';

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-canvas p-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-3">
      <div className="hidden flex-col justify-between rounded-[28px] bg-night p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">HigherStudy</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-[32px] font-semibold leading-[1.15] tracking-tight">Your Master’s, PhD and PostDoc search, organised in one place.</h2>
          <ul className="mt-10 space-y-5 text-[15px] text-brand-100">
            {[
              [<Landmark key="a" />, 'Discover universities by ranking, funding and entry criteria'],
              [<MailCheck key="b" />, 'Find professors by research area and track every cold email'],
              [<FileText key="c" />, 'Follow each application from first draft to decision'],
            ].map(([icon, text], i) => (
              <li key={i} className="flex items-start gap-3.5 [&>svg]:mt-0.5 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0 [&>svg]:text-brand-300">
                {icon}
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-brand-200/80">Pay with bKash or Nagad. Prices in BDT.</p>
      </div>
      <div className="flex items-center justify-center rounded-[28px] bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-600 text-white">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">HigherStudy</span>
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 text-[15px] text-ink-mute">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
