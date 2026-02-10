import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/automation")({
  component: AutomationPage,
});

function AutomationPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <h1 className="text-4xl font-bold mb-4">Automation</h1>
      <p className="text-muted-foreground mb-4">
        Automate your smart home devices. Coming soon.
      </p>
    </div>
  );
}
