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
import { ThreeDWorldButton } from "@/components/three-d-world-button";
import { RobotAssistant } from "@/components/RobotAssistant";
import { WebSocketService } from "@/services/WebSocketService";
import { useEffect } from "react";

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
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-muted-foreground mb-4">Page not found</p>
      <a href="/" className="text-primary hover:underline">
        Go back to Dashboard
      </a>
    </div>
  );
}

const authRoutes = ["/login", "/register"];

function RootLayout() {
  const location = useLocation();
  const isAuthPage = authRoutes.includes(location.pathname);
  const { isAuthenticated } = useAuthStore();

  // WebSocket Connection for Real-time Updates
  useEffect(() => {
    if (isAuthenticated) {
      const ws = WebSocketService.getInstance();
      ws.connect();

      const unsubscribe = ws.subscribe((data) => {
        if (data.type === "device_update") {
          console.log("Device update received, refreshing data...");
          queryClient.invalidateQueries({ queryKey: ["home-devices"] });
        }
      });

      return () => {
        unsubscribe();
        ws.disconnect();
      };
    }
  }, [isAuthenticated]);

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
            <SidebarInset className="relative flex h-svh flex-col overflow-hidden bg-background">
              <div className="pointer-events-none absolute -top-24 -right-24 h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl filter" />
              <div className="pointer-events-none absolute top-1/2 -left-24 h-[400px] w-[400px] rounded-full bg-primary/5 blur-3xl filter" />
              <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-primary/5 blur-3xl filter" />
              <div className="pointer-events-none absolute -bottom-10 right-10 h-[250px] w-[250px] rounded-full bg-primary/5 blur-3xl filter" />
              <header className="relative z-10 flex shrink-0 items-center justify-between border-b px-2 py-2">
                <SidebarTrigger className="size-12" />
                <ThreeDWorldButton />
                <ModeToggle />
              </header>
              <main className="relative z-10 flex-1 p-4">
                <Outlet />
              </main>
              <RobotAssistant />
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
              defaultOpen: true,
            },
          ]}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
