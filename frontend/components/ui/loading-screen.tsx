"use client";

import CubeLoader from "@/components/ui/cube-loader";

export type LoadingScreenProps = {
  /** Top label, defaults to "Cargando". */
  title?: string;
  /** Sub-label below, defaults to "Un momento, por favor." */
  subtitle?: string;
};

/**
 * Full-page loading screen used while a route's primary data resolves on
 * mount or refresh. Centers a CubeLoader inside the app shell so the user
 * gets the same visual every time something is genuinely "loading the page"
 * instead of a per-page skeleton zoo.
 *
 * Use for top-level page loads. For section-level loaders (a list inside a
 * page that's already rendered), prefer a contextual skeleton instead.
 */
export function LoadingScreen({
  title = "Cargando",
  subtitle = "Un momento, por favor.",
}: LoadingScreenProps = {}) {
  return (
    <div className="min-h-[calc(100vh-57px)] flex items-center justify-center px-4">
      <CubeLoader title={title} subtitle={subtitle} />
    </div>
  );
}

export default LoadingScreen;
