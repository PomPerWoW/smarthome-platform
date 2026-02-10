import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/energy")({
  component: EnergyPage,
});

function EnergyPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <h1 className="text-4xl font-bold mb-4">Energy Monitoring</h1>
      <p className="text-muted-foreground mb-4">
        Monitor your energy consumption. Coming soon.
      </p>
    </div>
  );
}
