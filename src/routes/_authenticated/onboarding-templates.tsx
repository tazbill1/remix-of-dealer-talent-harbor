import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old address: opens the matching tab on the Settings page. */
export const Route = createFileRoute("/_authenticated/onboarding-templates")({
  beforeLoad: () => { throw redirect({ to: "/settings", search: { tab: "onboarding" }, replace: true }); },
});
