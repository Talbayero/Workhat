import en from "@/dictionaries/en.json";
import es from "@/dictionaries/es.json";

const dictionaries: Record<string, any> = {
  en,
  es,
};

export const getDictionary = async (locale: string) => {
  return dictionaries[locale] || dictionaries["en"];
};
