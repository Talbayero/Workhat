import { NavBar, Footer } from "../page";
import { type Locale, getDictionary } from "@/lib/dictionaries";

type PageParams = Promise<{ lang: string }>;

function normalizeLocale(lang: string): Locale {
  return lang === "es" ? "es" : "en";
}

export default async function ComparePage({ params }: { params: PageParams }) {
  const { lang: rawLang } = await params;
  const lang = normalizeLocale(rawLang);
  const dict = await getDictionary(lang);

  const features = [
    {
      id: "generation",
      label: dict.compare.table.features.generation,
      competitors: false,
      workhat: dict.compare.table.workhat.generation,
    },
    {
      id: "context",
      label: dict.compare.table.features.context,
      competitors: false,
      workhat: dict.compare.table.workhat.context,
    },
    {
      id: "edit",
      label: dict.compare.table.features.edit,
      competitors: false,
      workhat: dict.compare.table.workhat.edit,
    },
    {
      id: "improvement",
      label: dict.compare.table.features.improvement,
      competitors: false,
      workhat: dict.compare.table.workhat.improvement,
    },
    {
      id: "knowledge",
      label: dict.compare.table.features.knowledge,
      competitors: false,
      workhat: dict.compare.table.workhat.knowledge,
    },
    {
      id: "pricing",
      label: dict.compare.table.features.pricing,
      competitors: "$19+/mo",
      workhat: dict.compare.table.workhat.pricing,
    },
  ];

  const cols = ["Work Hat", "Intercom", "Zendesk", "Front"];

  return (
    <div className="min-h-screen">
      <NavBar dict={dict.nav} lang={lang} routePath="/compare" />
      <div className="relative isolate px-6 pt-24 pb-20 flex flex-col justify-center min-h-[calc(100vh-160px)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(144,50,61,0.20) 0%, transparent 60%)",
          }}
        />
        
        <div className="mx-auto max-w-5xl w-full">
          <div className="mb-14 max-w-3xl text-center mx-auto">
            <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">{dict.compare.eyebrow}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              {dict.compare.title}
            </h1>
            <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
              {dict.compare.descHeader} <strong>{dict.compare.descBold}</strong>{dict.compare.descFooter}
            </p>

            <div className="mt-10 grid gap-6 sm:grid-cols-3 text-left">
              {dict.compare.points.map((pt) => (
                <div key={pt.title} className="grain-panel border border-[var(--line)] rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-[var(--moss)]">{pt.title}</h3>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{pt.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grain-panel overflow-hidden rounded-[24px] border border-[var(--line)]">
            <div className="grid grid-cols-4 border-b border-[var(--line)] bg-[rgba(10,9,8,0.4)]">
              {cols.map((col, idx) => (
                <div
                  key={col}
                  className={`px-6 py-4 text-xs font-semibold ${
                    idx === 0 
                      ? "text-[var(--moss)] bg-[rgba(144,50,61,0.05)] border-r border-[var(--line)]" 
                      : "text-[var(--muted)]"
                  }`}
                >
                  {col} {idx === 0 && <span className="opacity-60 ml-1">({dict.compare.table.you})</span>}
                </div>
              ))}
            </div>

            <div className="divide-y divide-[var(--line)]">
              {features.map((feature) => (
                <div key={feature.id} className="grid grid-cols-4 group hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <div className="px-6 py-4 flex flex-col justify-center border-r border-[var(--line)] bg-[rgba(144,50,61,0.02)]">
                    <span className="text-xs font-medium text-[var(--foreground)]">{feature.label}</span>
                    <span className="text-[10px] text-[var(--moss)] mt-1 font-mono tracking-tight">{feature.workhat}</span>
                  </div>
                  {[2, 3, 4].map((colIdx) => (
                    <div key={colIdx} className="px-6 py-4 flex items-center">
                      <span className="text-xs text-[var(--muted)]">
                        {feature.competitors ? feature.competitors : "Basic text gen"}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-[10px] text-[var(--muted)]">
            {dict.compare.table.disclaimer}
          </p>
        </div>
      </div>
      <Footer dict={dict} lang={lang} />
    </div>
  );
}
