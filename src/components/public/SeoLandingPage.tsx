import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Globe2,
  MapPin,
  Mic,
  Users,
  Wallet,
} from 'lucide-react';
import {
  type SeoLandingPageContent,
  type SeoLandingPageDefinition,
  type SeoLandingPageSharedContent,
  type SeoLandingPageSlug,
} from '@/lib/seo-landing-pages';

const ICONS = {
  fileText: FileText,
  mic: Mic,
  wallet: Wallet,
  users: Users,
  globe: Globe2,
  mapPin: MapPin,
} as const;

export default function SeoLandingPage({
  definition,
  shared,
  page,
  relatedPageTitles,
}: {
  definition: SeoLandingPageDefinition;
  shared: SeoLandingPageSharedContent;
  page: SeoLandingPageContent;
  relatedPageTitles: Record<SeoLandingPageSlug, string>;
}) {
  const HeroIcon = ICONS[definition.icon];

  return (
    <div className="bg-slate-950 text-white">
      <section className="relative overflow-hidden">
        <div className={`absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-br ${definition.accentClassName} opacity-95`} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.24),transparent_36%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,420px)] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-800 uppercase tracking-[0.18em] text-cyan-50">
                <HeroIcon size={14} />
                <span>{page.hero.eyebrow}</span>
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-800 tracking-tight text-white sm:text-5xl lg:text-6xl">
                {page.hero.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-100 sm:text-lg">
                {page.hero.subtitle}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/sign-up-login?mode=signup"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-800 text-slate-950 shadow-[0_18px_44px_rgba(15,23,42,0.24)] transition-transform hover:-translate-y-0.5 motion-reduce:transform-none"
                >
                  {shared.primaryCta}
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href={`/${definition.slug}#how-it-works`}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-800 text-white transition-colors hover:bg-white/15"
                >
                  {shared.secondaryCta}
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-700 text-slate-100">
                {[shared.reviewNote, shared.allowanceNote].map((item) => (
                  <span key={item} className="rounded-full border border-white/20 bg-slate-950/20 px-3 py-1.5">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/15 bg-slate-950/35 p-5 shadow-[0_30px_90px_rgba(2,12,32,0.24)] backdrop-blur">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/95 p-5 text-slate-950">
                <div className="flex items-center justify-between gap-4">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${definition.accentClassName} text-white`}>
                    <HeroIcon size={24} />
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-800 uppercase tracking-[0.16em] text-emerald-700">
                    Smart Pocket
                  </span>
                </div>
                <div className="mt-6 space-y-3">
                  {page.benefits.map((benefit) => (
                    <div key={benefit.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-cyan-600" />
                        <div>
                          <p className="text-sm font-800 text-slate-950">{benefit.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{benefit.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-14 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-800 uppercase tracking-[0.18em] text-cyan-700">{shared.benefitsTitle}</p>
            <h2 className="mt-3 text-3xl font-800 tracking-tight sm:text-4xl">{shared.benefitsIntro}</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {page.benefits.map((benefit) => (
              <article key={benefit.title} className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${definition.accentClassName} text-white`}>
                  <CheckCircle2 size={19} />
                </div>
                <h3 className="mt-5 text-lg font-800 tracking-tight text-slate-950">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-slate-100 px-4 py-14 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-800 uppercase tracking-[0.18em] text-cyan-700">{shared.howItWorksTitle}</p>
            <h2 className="mt-3 text-3xl font-800 tracking-tight sm:text-4xl">{shared.howItWorksIntro}</h2>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {page.howItWorks.map((step, index) => (
              <article key={step.title} className="rounded-[1.75rem] border border-slate-200 bg-white p-5">
                <div className="inline-flex rounded-full bg-cyan-50 px-3 py-1 text-xs font-800 uppercase tracking-[0.16em] text-cyan-700">
                  {(index + 1).toString().padStart(2, '0')}
                </div>
                <h3 className="mt-4 text-lg font-800 tracking-tight text-slate-950">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-14 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-800 uppercase tracking-[0.18em] text-cyan-700">{shared.useCasesTitle}</p>
            <h2 className="mt-3 text-3xl font-800 tracking-tight sm:text-4xl">{shared.useCasesIntro}</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {page.useCases.map((useCase) => (
              <article key={useCase.title} className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-lg font-800 tracking-tight text-slate-950">{useCase.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{useCase.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-100 px-4 py-14 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="max-w-2xl">
            <p className="text-sm font-800 uppercase tracking-[0.18em] text-cyan-700">{shared.faqTitle}</p>
            <h2 className="mt-3 text-3xl font-800 tracking-tight sm:text-4xl">{shared.faqIntro}</h2>
          </div>
          <div className="mt-8 space-y-3">
            {page.faqs.map((faq) => (
              <details key={faq.question} className="group rounded-[1.5rem] border border-slate-200 bg-white p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-700 text-slate-950">
                  <span>{faq.question}</span>
                  <span className="text-cyan-700 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#041229] shadow-[0_30px_100px_rgba(2,12,32,0.3)]">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-center lg:px-10">
            <div>
              <p className="text-sm font-800 uppercase tracking-[0.18em] text-cyan-300">{shared.relatedTitle}</p>
              <h2 className="mt-3 text-3xl font-800 tracking-tight text-white sm:text-4xl">{shared.relatedIntro}</h2>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/" className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-700 text-white transition-colors hover:bg-white/15">
                  {shared.homepageLinkLabel}
                </Link>
                <Link href="/faqs" className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-700 text-white transition-colors hover:bg-white/15">
                  {shared.faqLinkLabel}
                </Link>
                <Link href="/contact" className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-700 text-white transition-colors hover:bg-white/15">
                  {shared.contactLinkLabel}
                </Link>
              </div>
            </div>
            <div className="space-y-3">
              {definition.relatedSlugs.map((relatedSlug) => (
                <Link
                  key={relatedSlug}
                  href={`/${relatedSlug}`}
                  className="flex items-center justify-between gap-4 rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4 text-sm font-700 text-white transition-colors hover:bg-white/10"
                >
                  <span>{relatedPageTitles[relatedSlug]}</span>
                  <ArrowRight size={16} className="shrink-0 text-cyan-300" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
