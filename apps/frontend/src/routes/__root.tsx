import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ModeToggle } from "@/components/theme/mode-toggle";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { AuthService } from "@/services/AuthService";
import { useAuthStore } from "@/stores/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export const Route = createRootRoute({
  beforeLoad: async () => {
    const user = await AuthService.getInstance().whoami();

    if (user) {
      useAuthStore.getState().setUser(user);
    } else {
      useAuthStore.getState().logout();
    }

    return { user };
  },
  component: RootLayout,
});

const authRoutes = ["/login", "/register"];

function RootLayout() {
  const location = useLocation();
  const isAuthPage = authRoutes.includes(location.pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="smarthome-theme">
        {isAuthPage ? (
          // Auth pages - no sidebar
          <Outlet />
        ) : (
          // Dashboard pages - with sidebar
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="h-svh flex flex-col">
              <header className="flex shrink-0 items-center justify-between border-b px-2 py-2">
                <SidebarTrigger className="size-12" />
                <ModeToggle />
              </header>
              <main className="flex-1 p-4">
                <Outlet />
              </main>
            </SidebarInset>
          </SidebarProvider>
        )}

        {/* Toast notifications */}
        <Toaster richColors position="top-right" />

        {/* Devtools */}
        <TanStackDevtools
          plugins={[
            {
              name: "TanStack Query",
              render: <ReactQueryDevtoolsPanel />,
              defaultOpen: true,
            },
            {
              name: "TanStack Router",
              render: <TanStackRouterDevtoolsPanel />,
              defaultOpen: false,
            },
          ]}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
