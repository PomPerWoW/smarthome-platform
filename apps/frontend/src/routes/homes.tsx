import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/homes")({
  component: HomesLayout,
});

function HomesLayout() {
  // If someone navigates to /homes directly, redirect to dashboard
  // The Outlet renders child routes like /homes/:homeId


  // Check if we're at exactly /homes with no child route
  if (window.location.pathname === "/homes") {
    return <Navigate to="/" />;
  }

  return <Outlet />;
}
