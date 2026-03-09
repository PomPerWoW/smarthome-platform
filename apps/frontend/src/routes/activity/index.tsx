import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { DeviceService } from '@/services/DeviceService'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Activity, Lightbulb, Tv, Fan, Snowflake, Zap, ArrowRight } from 'lucide-react'
import { DeviceType } from '@/types/device.types'

export const Route = createFileRoute('/activity/')({
  component: ActivityOverviewPage,
})

const deviceIcons = {
  [DeviceType.Lightbulb]: Lightbulb,
  [DeviceType.Television]: Tv,
  [DeviceType.Fan]: Fan,
  [DeviceType.AirConditioner]: Snowflake,
}

function ActivityOverviewPage() {
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => DeviceService.getInstance().getAllDevices(),
  })

  // Global Mock Stats (Extrapolated for overview)
  const totalActive = Math.floor(devices.length * 0.6) // Mock 60% active
  const totalEnergy = (devices.length * 1.8).toFixed(1) // Mock 1.8 kWh per device overall

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500">

      {/* Header */}
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
          System Activity
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Overview of your smart home energy and usage patterns.
        </p>
      </div>

      {/* High-level Highlight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20 shadow-sm backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-primary">Connected Devices</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{isLoading ? '-' : devices.length}</div>
            <p className="text-xs text-muted-foreground mt-1 text-primary/80">
              {totalActive} currently active
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/50 shadow-sm backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Est. Total Energy</CardTitle>
            <Zap className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{isLoading ? '-' : totalEnergy} <span className="text-lg font-normal text-muted-foreground">kWh</span></div>
            <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1 font-medium bg-emerald-500/10 w-fit px-2 py-0.5 rounded-full">
              Optimal Efficiency
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Devices List Menu */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight border-b border-border/50 pb-2">Device Activity Profiles</h2>

        {isLoading ? (
          <div className="text-muted-foreground animate-pulse py-8">Loading devices...</div>
        ) : devices.length === 0 ? (
          <div className="bg-card/30 border border-border/50 border-dashed rounded-xl p-8 text-center text-muted-foreground">
            No devices found in the system.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pt-2">
            {devices.map((device) => {
              const Icon = deviceIcons[device.type as DeviceType] || Lightbulb;
              return (
                <Link
                  key={device.id}
                  to="/activity/$deviceId"
                  params={{ deviceId: device.id }}
                  className="group block outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
                >
                  <Card className="bg-card/40 hover:bg-card/80 border-border/50 hover:border-primary/40 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer flex flex-col h-full overflow-hidden relative">
                    {/* Background subtle glow on hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                      <div className="p-2.5 bg-primary/10 rounded-xl group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300 transform">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <CardTitle className="text-lg truncate group-hover:text-primary transition-colors">
                          {device.name}
                        </CardTitle>
                        <CardDescription className="uppercase text-xs tracking-wider opacity-70">
                          {device.type}
                        </CardDescription>
                      </div>
                    </CardHeader>

                    <CardContent className="mt-auto pt-4 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 bg-secondary/50 px-2.5 py-1 rounded-full border border-border/50 group-hover:border-primary/20 transition-colors">
                        View details
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
