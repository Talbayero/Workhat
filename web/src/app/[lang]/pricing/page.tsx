import { getDictionary } from "@/lib/dictionaries";
import { NavBar, Footer } from "../page";
import { PricingClient } from "./pricing-client";

export default async function PricingPage({ params: { lang } }: { params: { lang: string } }) {
  const dict = await getDictionary(lang);
  
  return (
    <div className="min-h-screen">
      <NavBar dict={dict.nav} lang={lang} />
      <PricingClient dict={dict.pricing} />
      <Footer dict={dict.footer} lang={lang} />
    </div>
  );
}
