import {
  createFileRoute,
  Outlet,
  Navigate,
  useLocation,
} from "@tanstack/react-router";

export const Route = createFileRoute("/homes")({
  component: HomesLayout,
});

function HomesLayout() {
  // If someone navigates to /homes directly, redirect to dashboard.
  // Use router pathname (relative to basepath), not window.location — the app
  // is served under import.meta.env.BASE_URL (e.g. /smarthome/home/).
  const { pathname } = useLocation();
  if (pathname === "/homes") {
    return <Navigate to="/" />;
  }

  return <Outlet />;
}
