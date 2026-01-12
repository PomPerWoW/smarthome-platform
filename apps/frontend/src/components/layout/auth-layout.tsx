import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { AuthRoomScene } from "@/components/auth/AuthRoomScene";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  footerText: string;
  footerLinkText: string;
  footerLinkTo: string;
}

export function AuthLayout({
  children,
  title,
  description,
  footerText,
  footerLinkText,
  footerLinkTo,
}: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left Panel - 3D Room Scene with Branding */}
      <div className="relative hidden bg-zinc-900 lg:block overflow-hidden">
        {/* Background gradient for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/80 via-zinc-900/40 to-zinc-950/80 z-10 pointer-events-none" />

        {/* 3D Room Scene */}
        <AuthRoomScene />

        {/* Branding overlay */}
        <div className="relative z-20 flex h-full flex-col justify-between p-10 pointer-events-none">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-medium text-white pointer-events-auto drop-shadow-lg"
          >
            <Home className="h-6 w-6" />
            SmartHome
          </Link>

          <blockquote className="space-y-2 drop-shadow-lg">
            <p className="text-lg text-zinc-100">
              "Control your home from anywhere. SmartHome makes managing your
              devices simple, efficient, and secure."
            </p>
            <footer className="text-sm text-zinc-300">SmartHome Team</footer>
          </blockquote>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex flex-col">
        <div className="flex justify-end gap-1 p-4 lg:p-6">
          <span className="text-sm text-muted-foreground">{footerText}</span>
          <Link
            to={footerLinkTo}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            {footerLinkText}
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 lg:px-8">
          <div className="mx-auto w-full max-w-sm space-y-6">
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            {children}

            <p className="text-center text-xs text-muted-foreground">
              By clicking continue, you agree to our{" "}
              <Link to="/terms" className="underline hover:text-foreground">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
