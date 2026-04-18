import Link from "next/link";
import { AnimatedPreview } from "@/components/marketing/animated-preview";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { getDictionary } from "@/lib/dictionaries";

export const NavBar = ({ dict, lang }: { dict: any; lang: string }) => {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(10,9,8,0.85)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href={`/${lang}`} className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--sky)] border border-transparent">
            <img src="/logo.png" alt="Work Hat" className="h-5 w-5 object-contain" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Work Hat</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link href={`/${lang}#how-it-works`} className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.howItWorks}</Link>
          <Link href="/demo/inbox" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.demo}</Link>
          <Link href={`/${lang}/compare`} className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.compare}</Link>
          <Link href={`/${lang}/pricing`} className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.pricing}</Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 border-r border-[var(--line)] pr-3 mr-1 sm:flex">
             <Link href={`/en${typeof window !== 'undefined' ? window.location.pathname.replace(/^\/(en|es)/, '') : ''}`} className={`text-xs font-medium transition-colors ${lang === 'en' ? 'text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-white'}`}>EN</Link>
             <Link href={`/es${typeof window !== 'undefined' ? window.location.pathname.replace(/^\/(en|es)/, '') : ''}`} className={`text-xs font-medium transition-colors ${lang === 'es' ? 'text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-white'}`}>ES</Link>
          </div>
          <Link href="/login" className="hidden text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)] sm:block">
            {dict.signIn}
          </Link>
          <Link
            href="/demo/inbox"
            className="hidden rounded-full border border-[var(--moss)] px-4 py-2 text-sm font-medium text-[var(--moss)] transition-colors hover:bg-[var(--moss)] hover:text-white sm:block"
          >
            {dict.tryDemo}
          </Link>
          <Link
            href="#waitlist"
            className="rounded-full bg-[var(--moss)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {dict.getEarlyAccess}
          </Link>
        </div>
      </div>
    </header>
  );
};

export const Footer = ({ dict, lang }: { dict: any; lang: string }) => {
  return (
    <footer className="border-t border-[var(--line)] px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 sm:flex-row">
        <div>
          <Link href={`/${lang}`} className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-[var(--sky)] border border-transparent">
              <img src="/logo.png" alt="Work Hat" className="h-3.5 w-3.5 object-contain" />
            </div>
            <span className="text-xs font-semibold text-[var(--foreground)]">Work Hat</span>
          </Link>
          <p className="mt-2 max-w-[200px] text-[11px] leading-5 text-[var(--muted)]">
            {dict.tagline}
          </p>
        </div>

        <div className="flex flex-wrap gap-12">
          <div>
            <p className="mb-3 text-[10px] font-medium tracking-widest text-[var(--muted)] uppercase">{dict.product}</p>
            <nav className="flex flex-col gap-2">
              <Link href={`/${lang}#how-it-works`} className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.nav.howItWorks}</Link>
              <Link href="/demo/inbox" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.nav.demo}</Link>
              <Link href={`/${lang}#features`} className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Features</Link>
              <Link href={`/${lang}/compare`} className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.nav.compare}</Link>
              <Link href={`/${lang}/pricing`} className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.nav.pricing}</Link>
            </nav>
          </div>
          <div>
            <p className="mb-3 text-[10px] font-medium tracking-widest text-[var(--muted)] uppercase">{dict.account}</p>
            <nav className="flex flex-col gap-2">
              <Link href="/login" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.nav.signIn}</Link>
              <Link href="#waitlist" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.nav.getEarlyAccess}</Link>
              <a href="mailto:teddyalbayero@work-hat.com?subject=Work Hat demo request" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.bookDemo}</a>
            </nav>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-5xl items-center justify-between border-t border-[var(--line)] pt-6 text-[10px] text-[var(--muted)]">
        <p>© {new Date().getFullYear()} Work Hat. {dict.rights}</p>
        <p>work-hat.com</p>
      </div>
    </footer>
  );
};

function Hero({ dict }: { dict: any }) {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 55% at 50% -10%, rgba(144,50,61,0.24) 0%, transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-4xl">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 max-w-[40px] bg-[var(--line-strong)]" />
          <p className="text-[10px] font-medium tracking-[0.18em] text-[var(--muted)] uppercase">
            {dict.eyebrow}
          </p>
          <div className="h-px flex-1 max-w-[40px] bg-[var(--line-strong)]" />
        </div>
        <h1 className="mt-5 text-5xl font-semibold leading-[1.06] tracking-[-0.02em] md:text-[64px]">
          {dict.headlinePart1}
          <br />
          <span className="text-[var(--moss)]">{dict.headlinePart2}</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-7 text-[var(--muted)]">
          {dict.subheadline}{" "}
          <span className="text-[var(--foreground)]">{dict.subheadlineHighlight}</span>
        </p>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {dict.points.map((point: string) => (
            <div key={point} className="flex items-center gap-2">
              <div className="h-1 w-1 shrink-0 rounded-full bg-[var(--moss)]" />
              <span className="text-sm text-[var(--muted)]">{point}</span>
            </div>
          ))}
        </div>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/demo/inbox"
            className="flex h-12 flex-1 items-center justify-center rounded-full bg-[var(--moss)] px-8 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] sm:flex-none shadow-[0_0_20px_rgba(144,50,61,0.25)]"
          >
            {dict.cta}
          </Link>
          <div className="flex-1 max-w-md">
            <WaitlistForm size="hero" placeholder={dict.placeholder} />
          </div>
        </div>

        <p className="mt-4 text-xs text-[var(--muted)]">
          {dict.trust}
        </p>
      </div>
    </section>
  );
}

function WalkthroughSection({ dict }: { dict: any }) {
  return (
    <section id="how-it-works" className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 max-w-2xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">{dict.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            {dict.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {dict.desc}
          </p>
        </div>
        <AnimatedPreview />
      </div>
    </section>
  );
}

function HowItWorks({ dict }: { dict: any }) {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-px overflow-hidden rounded-[24px] border border-[var(--line)] sm:grid-cols-3">
          {dict.map((step: any, i: number) => (
            <div
              key={step.num}
              className={`grain-panel px-6 py-7 ${i < dict.length - 1 ? "border-b border-[var(--line)] sm:border-b-0 sm:border-r" : ""}`}
            >
              <p className="font-mono text-2xl font-semibold text-[rgba(144,50,61,0.35)]">{step.num}</p>
              <h3 className="mt-4 text-sm font-semibold leading-5">{step.title}</h3>
              <p className="mt-2 text-xs leading-[1.7] text-[var(--muted)]">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features({ dict }: { dict: any }) {
  return (
    <section id="features" className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 max-w-xl">
          <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">{dict.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            {dict.title}
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dict.items.map((f: any, i: number) => (
            <div key={i} className="grain-panel rounded-[22px] border border-[var(--line)] px-5 py-5">
              <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-[8px] border border-[rgba(144,50,61,0.3)] bg-[rgba(144,50,61,0.08)]">
                <span className="font-mono text-[10px] font-bold text-[var(--moss)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-[1.7] text-[var(--muted)]">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WaitlistSection({ dict }: { dict: any }) {
  return (
    <section id="waitlist" className="relative px-6 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 55% 50% at 50% 100%, rgba(144,50,61,0.16) 0%, transparent 65%)",
        }}
      />
      <div className="relative mx-auto max-w-2xl text-center">
        <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">{dict.eyebrow}</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight">
          {dict.title}
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">
          {dict.desc}
        </p>

        <div className="mx-auto mt-8 max-w-md">
          <WaitlistForm size="section" />
        </div>

        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="h-px flex-1 max-w-[60px] bg-[var(--line)]" />
          <span className="text-xs text-[var(--muted)]">{dict.or}</span>
          <div className="h-px flex-1 max-w-[60px] bg-[var(--line)]" />
        </div>

        <a
          href="mailto:teddyalbayero@work-hat.com?subject=Work Hat demo request"
          className="mt-4 inline-block text-sm text-[var(--muted)] underline underline-offset-4 decoration-[var(--line-strong)] transition-colors hover:text-[var(--foreground)]"
        >
          {dict.talk}
        </a>
      </div>
    </section>
  );
}

export default async function LandingPage({ params: { lang } }: { params: { lang: string } }) {
  const dict = await getDictionary(lang);
  
  return (
    <div className="min-h-screen">
      <NavBar dict={dict.nav} lang={lang} />
      <main>
        <Hero dict={dict.home.hero} />
        <WalkthroughSection dict={dict.home.howItWorks} />
        <HowItWorks dict={dict.home.steps} />
        <Features dict={dict.home.features} />
        <WaitlistSection dict={dict.home.waitlist} />
      </main>
      <Footer dict={dict.footer} lang={lang} />
    </div>
  );
}
