import { Button } from "@/components/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  if (user) {
    return null;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">SmartHome Platform</h1>
      <p className="text-muted-foreground">
        Welcome to SmartHome Platform Dashboard
      </p>
      <Button onClick={() => navigate({ to: "/login" })}>Get Started</Button>
    </div>
  );
}