import { redirect } from "next/navigation";

/**
 * Root route — redirect to the default locale landing page.
 * Visitors who type "work-hat.com" land here; send them to /en.
 */
export default function RootPage() {
  redirect("/en");
}
