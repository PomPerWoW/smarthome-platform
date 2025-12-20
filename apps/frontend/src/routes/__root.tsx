import { createRootRoute, Outlet } from "@tanstack/react-router";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ModeToggle } from "@/components/theme/mode-toggle";
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
  component: RootLayout,
});

function AuthCheck() {
  const { setUser, setLoading, logout } = useAuthStore();

  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["auth", "whoami"],
    queryFn: () => AuthService.getInstance().whoami(),
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (isLoading) return;

    if (user) {
      setUser(user);
    } else {
      logout();
    }
  }, [user, isLoading, isError, setUser, logout]);

  useEffect(() => {
    setLoading(isLoading);
  }, [isLoading, setLoading]);

  return null;
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="smarthome-theme">
        <AuthCheck />

        {/* Header */}
        <header className="fixed top-0 right-0 z-50 p-4">
          <ModeToggle />
        </header>

        {/* Main content */}
        <main className="min-h-svh">
          <Outlet />
        </main>

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
