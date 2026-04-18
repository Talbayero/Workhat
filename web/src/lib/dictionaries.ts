import en from "@/dictionaries/en.json";
import es from "@/dictionaries/es.json";

export type Locale = "en" | "es";
export type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = {
  en,
  es,
};

export const getDictionary = async (locale: string): Promise<Dictionary> => {
  return dictionaries[locale as Locale] || dictionaries.en;
};
