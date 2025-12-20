import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">SmartHome Platform</h1>
      <p className="text-muted-foreground">
        Welcome to SmartHome Platform Dashboard
      </p>
      <Button>Get Started</Button>
    </div>
  );
}
