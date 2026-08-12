import { redirect } from "next/navigation";
import { getOwnerAccount } from "@/lib/owner";
import { FirstRun } from "@/components/onboarding/FirstRun";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const account = await getOwnerAccount();
  if (!account) redirect("/login");
  return <FirstRun />;
}
