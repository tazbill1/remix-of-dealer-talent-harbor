import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old address: opens the matching tab on the Settings page. */
export const Route = createFileRoute("/_authenticated/status-rules")({
  beforeLoad: () => { throw redirect({ to: "/settings", search: { tab: "rules" }, replace: true }); },
});
