import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ModeToggle } from "@/components/theme/mode-toggle";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="smarthomear-theme">
      {/* Header */}
      <header className="fixed top-0 right-0 z-50 p-4">
        <ModeToggle />
      </header>

      {/* Main content - child routes render here */}
      <main className="min-h-svh">
        <Outlet />
      </main>

      {/* Footer */}

      {/* Devtools - only in development */}
      <TanStackRouterDevtools position="bottom-right" />
    </ThemeProvider>
  );
}
