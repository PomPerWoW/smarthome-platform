import { ThemeProvider } from "@/components/theme/theme-provider"
import { ModeToggle } from "@/components/theme/mode-toggle"
import { Button } from "@/components/ui/button"

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="smarthomear-theme">
      <div className="flex min-h-svh flex-col items-center justify-center gap-4">
        <div className="absolute top-4 right-4">
          <ModeToggle />
        </div>
        <h1 className="text-4xl font-bold">SmartHomeAR</h1>
        <p className="text-muted-foreground">Welcome to SmartHomeAR Dashboard</p>
        <Button>Get Started</Button>
      </div>
    </ThemeProvider>
  )
}

export default App