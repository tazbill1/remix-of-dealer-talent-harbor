import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { RouteSpinner } from "@/components/route-spinner";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Show a spinner (not a blank page) while a route loads, including the dashboard.
    defaultPendingComponent: RouteSpinner,
    defaultPendingMs: 200,
  });

  return router;
};
