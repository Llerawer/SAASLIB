import { LoadingScreen } from "@/components/ui/loading-screen";

/**
 * Group-level route loader. Fires when navigating to any route inside the
 * (app) segment that triggers a server-side data wait. Individual routes
 * (e.g. /srs) may still override with their own loading.tsx for tailored
 * copy.
 */
export default function Loading() {
  return <LoadingScreen />;
}
