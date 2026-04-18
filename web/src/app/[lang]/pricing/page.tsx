import { type Locale, getDictionary } from "@/lib/dictionaries";
import { NavBar, Footer } from "../page";
import { PricingClient } from "./pricing-client";

type PageParams = Promise<{ lang: string }>;

function normalizeLocale(lang: string): Locale {
  return lang === "es" ? "es" : "en";
}

export default async function PricingPage({ params }: { params: PageParams }) {
  const { lang: rawLang } = await params;
  const lang = normalizeLocale(rawLang);
  const dict = await getDictionary(lang);
  
  return (
    <div className="min-h-screen">
      <NavBar dict={dict.nav} lang={lang} routePath="/pricing" />
      <PricingClient dict={dict.pricing} />
      <Footer dict={dict} lang={lang} />
    </div>
  );
}
