import { Box } from "lucide-react";

export function ThreeDWorldButton() {
  return (
    <a
      href="https://localhost:8081/"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl hover:ring-2 hover:ring-purple-400 hover:ring-offset-2 hover:ring-offset-background"
    >
      <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <Box className="relative z-10 size-4 transition-transform duration-500 group-hover:rotate-180" />
      <span className="relative z-10 transition-all duration-300 group-hover:tracking-wider">
        3D World
      </span>
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </a>
  );
}
