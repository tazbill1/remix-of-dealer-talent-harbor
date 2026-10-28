import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old address: opens the matching tab on the Settings page. */
export const Route = createFileRoute("/_authenticated/templates")({
  beforeLoad: () => { throw redirect({ to: "/settings", search: { tab: "templates" }, replace: true }); },
});
