import { createFileRoute } from "@tanstack/react-router";
import AvatarDemo from "@/components/avatar-assistant";

export const Route = createFileRoute("/avatar-demo")({
  component: AvatarDemo,
});