import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { DeviceService } from '@/services/DeviceService'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Activity, Lightbulb, Tv, Fan, Snowflake, ArrowRight, DoorOpen, CalendarDays, Trophy } from 'lucide-react'
import { DeviceModel3D } from '@/components/devices/models/DeviceModel3D'
import { DeviceType } from '@/types/device.types'
import { useMemo, useState } from 'react'
import { ActivityRings, type ActivityRingData } from '@/components/dashboard/ActivityRings'

export const Route = createFileRoute('/activity/')({
  component: ActivityOverviewPage,
})

const deviceIcons = {
  [DeviceType.Lightbulb]: Lightbulb,
  [DeviceType.Television]: Tv,
  [DeviceType.Fan]: Fan,
  [DeviceType.AirConditioner]: Snowflake,
}

// Apple Watch–inspired ring color palette
const RING_PALETTE = [
  '#FA114F', // Red
  '#92E82A', // Green
  '#00D4FF', // Cyan
  '#5E5CE6', // Blue
  '#FF375F', // Pink
]

function ActivityOverviewPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => DeviceService.getInstance().getAllDevices(),
  })

  // Fetch device logs for ALL devices for the selected date
  const { data: allDeviceLogs, isLoading: isLoadingLogs } = useQuery({
    queryKey: ['allDeviceLogs', selectedDate, devices.map(d => d.id).join(',')],
    queryFn: async () => {
      const service = DeviceService.getInstance()
      // Fetch logs for each unique device type (API returns per-type)
      // We need to fetch for each device individually if they share a type,
      // but the API returns one log set per type. So we fetch per-type and
      // assign the same log to all devices of that type.
      const typeSet = new Set(devices.map(d => d.type))
      const logByType = new Map<string, any[]>()

      await Promise.all(
        Array.from(typeSet).map(async (type) => {
          try {
            const res = await service.getDeviceLog(type as DeviceType, selectedDate)
            logByType.set(type, res.data || [])
          } catch {
            logByType.set(type, [])
          }
        })
      )
      return logByType
    },
    enabled: devices.length > 0,
  })

  // Compute on-hours per device and pick top 5
  const ringsData: ActivityRingData[] = useMemo(() => {
    if (!allDeviceLogs || devices.length === 0) return []

    const deviceOnHours = devices.map((device) => {
      const logs = allDeviceLogs.get(device.type) || []
      // Count entries where onoff === true
      // Each log entry represents a 5-minute interval
      const onCount = logs.filter((l: any) => l.onoff === true).length
      const onHours = (onCount * 5) / 60 // Convert 5-min intervals to hours

      return {
        deviceName: device.name,
        deviceType: device.type,
        onHours,
      }
    })

    // Sort by onHours descending, take top 5
    const top5 = deviceOnHours
      .sort((a, b) => b.onHours - a.onHours)
      .slice(0, 5)
      .map((d, i) => ({
        ...d,
        color: RING_PALETTE[i % RING_PALETTE.length],
      }))

    return top5
  }, [allDeviceLogs, devices])

  // Group devices by room
  const devicesByRoom = useMemo(() => {
    const grouped = new Map<string, typeof devices>()
    for (const device of devices) {
      const room = device.roomName || 'Unassigned'
      if (!grouped.has(room)) grouped.set(room, [])
      grouped.get(room)!.push(device)
    }
    // Sort rooms alphabetically, but keep "Unassigned" at the end
    const sorted = Array.from(grouped.entries()).sort(([a], [b]) => {
      if (a === 'Unassigned') return 1
      if (b === 'Unassigned') return -1
      return a.localeCompare(b)
    })
    return sorted
  }, [devices])

  // Global Mock Stats (Extrapolated for overview)
  const totalActive = devices.filter(d => d.is_on).length
  // Find the most-used device (first in ringsData, which is sorted desc by onHours)
  const mostUsedDevice = useMemo(() => {
    if (!ringsData.length || !devices.length) return null
    const topEntry = ringsData[0]
    const device = devices.find(d => d.name === topEntry.deviceName)
    if (!device) return null
    const hours = Math.floor(topEntry.onHours)
    const mins = Math.round((topEntry.onHours - hours) * 60)
    const timeStr = hours > 0 && mins > 0 ? `${hours}h ${mins}m` : hours > 0 ? `${hours}h` : `${mins}m`
    return { device, onHours: topEntry.onHours, timeStr, color: topEntry.color }
  }, [ringsData, devices])

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500">

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            System Activity
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Overview of your smart home energy and usage patterns.
          </p>
        </div>
        {/* Date Picker */}
        <div className="flex items-center gap-2 bg-card px-3 py-2 rounded-xl border border-border/50 shadow-sm hover:border-primary/30 transition-colors">
          <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={today}
            className="bg-transparent text-sm font-semibold outline-none cursor-pointer text-foreground [color-scheme:dark]"
          />
        </div>
      </div>

      {/* High-level Highlight Cards + Activity Rings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: stat cards */}
        <div className="lg:col-span-1 flex flex-col gap-6">
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

          <Card className="bg-card/60 border-border/50 shadow-sm backdrop-blur-xl flex-1 flex flex-col overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Most Used Device</CardTitle>
              <Trophy className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              {isLoading || isLoadingLogs ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-sm text-muted-foreground animate-pulse">Loading...</span>
                </div>
              ) : mostUsedDevice ? (
                <>
                  <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-background/20">
                    <DeviceModel3D device={mostUsedDevice.device} />
                  </div>
                  <div className="mt-2 space-y-0.5">
                    <h4 className="font-semibold text-sm truncate">{mostUsedDevice.device.name}</h4>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{mostUsedDevice.device.type}</p>
                      <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full" style={{ backgroundColor: `${mostUsedDevice.color}20`, color: mostUsedDevice.color }}>
                        {mostUsedDevice.timeStr}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">No activity data</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Activity Rings */}
        <Card className="lg:col-span-2 bg-card/60 border-border/50 shadow-sm backdrop-blur-xl hover:shadow-lg transition-shadow duration-300 overflow-hidden flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-4 w-4 text-primary" />
              Top Active Devices
            </CardTitle>
            <CardDescription>
              On-hours for the top 5 most used devices on {selectedDate}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center flex-1 py-2">
            <ActivityRings data={ringsData} isLoading={isLoading || isLoadingLogs} />
          </CardContent>
        </Card>
      </div>

      {/* Devices Grouped by Room */}
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight border-b border-border/50 pb-2">Device Activity Profiles</h2>

        {isLoading ? (
          <div className="text-muted-foreground animate-pulse py-8">Loading devices...</div>
        ) : devices.length === 0 ? (
          <div className="bg-card/30 border border-border/50 border-dashed rounded-xl p-8 text-center text-muted-foreground">
            No devices found in the system.
          </div>
        ) : (
          <div className="space-y-8">
            {devicesByRoom.map(([roomName, roomDevices]) => (
              <div key={roomName} className="space-y-3">
                {/* Room Header */}
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-secondary/80">
                    <DoorOpen className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground/90">{roomName}</h3>
                  <span className="text-xs font-medium text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
                    {roomDevices.length} {roomDevices.length === 1 ? 'device' : 'devices'}
                  </span>
                </div>

                {/* Device Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {roomDevices.map((device) => {
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
                              <CardDescription className="uppercase text-xs tracking-wider opacity-70 flex items-center gap-2">
                                {device.type}
                                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${device.is_on ? 'bg-emerald-500/15 text-emerald-500' : 'bg-destructive/15 text-destructive'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${device.is_on ? 'bg-emerald-500' : 'bg-destructive'}`} />
                                  {device.is_on ? 'ON' : 'OFF'}
                                </span>
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
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
