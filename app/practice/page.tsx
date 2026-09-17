import { redirect } from "next/navigation";

// The original single-round trainer lived here. It's been retired in favor of
// the two-round V3-V5 engine at /practice/v3 (Two Over One, No Trump, Weak Two,
// splinters, Reverse Drury, and more). This redirect keeps the old /practice
// link working. The old page's source is preserved at
// _pre-v5-backup/practice-page.tsx.bak if it's ever wanted again.
export default function PracticePage() {
  redirect("/practice/v3");
}
