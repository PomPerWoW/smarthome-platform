import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Activity, Lightbulb, ArrowLeft, Tv, Fan, Snowflake, BarChart3, PieChart, CalendarDays, Zap } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useQuery } from '@tanstack/react-query'
import { DeviceService } from '@/services/DeviceService'
import { DeviceType } from '@/types/device.types'
import * as d3 from 'd3'

export const Route = createFileRoute('/activity/$deviceId')({
    component: DeviceActivityPage,
})

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs))
}

const deviceIcons = {
    [DeviceType.Lightbulb]: Lightbulb,
    [DeviceType.Television]: Tv,
    [DeviceType.Fan]: Fan,
    [DeviceType.AirConditioner]: Snowflake,
    [DeviceType.SmartMeter]: Zap,
}

// --- Chart Components --- //

function LineChartPlot({ data, color, yMax, yTicks, valueKey }: { data: DeviceLog[], color: string, yMax: number, yTicks?: number[], valueKey: (d: DeviceLog) => number }) {
    const svgRef = useRef<SVGSVGElement | null>(null)
    const [hoverIndex, setHoverIndex] = useState<number | null>(null)

    if (!data.length) return null;

    // We calculate perfectly even integer ticks to guarantee equal spacing
    let ticks = yTicks;
    if (!ticks) {
        const step = Math.max(Math.ceil(yMax / 4), 1);
        ticks = [];
        let cur = 0;
        while (cur < yMax) {
            ticks.push(cur);
            cur += step;
        }
        ticks.push(cur);
        ticks.reverse();
    }

    const chartMax = Math.max(...ticks, 1);

    // D3 Scales mapped to a standard 100x100 viewBox
    const xScale = d3.scaleLinear().domain([0, data.length - 1]).range([0, 100])
    const yScale = d3.scaleLinear().domain([0, chartMax]).range([100, 0])

    const clampedValues = data.map(d => {
        const v = valueKey(d)
        return Math.max(0, Math.min(chartMax, v))
    })

    const lineGenerator = d3.line<DeviceLog>()
        .x((_, i) => xScale(i))
        .y((_, i) => yScale(clampedValues[i]))
        .curve(d3.curveMonotoneX)

    const pathData = lineGenerator(data) || ""
    const areaPath = `${pathData} L 100,100 L 0,100 Z`

    const activeIndex = hoverIndex ?? (clampedValues.length - 1)
    const hasActive = activeIndex >= 0 && activeIndex < clampedValues.length
    const activeValue = hasActive ? clampedValues[activeIndex] : null
    const activeX = hasActive ? xScale(activeIndex) : null
    const activeY = hasActive && activeValue !== null ? yScale(activeValue) : null

    const handleMouseMove: React.MouseEventHandler<SVGSVGElement> = (event) => {
        if (!svgRef.current || !data.length) return
        const rect = svgRef.current.getBoundingClientRect()
        const x = event.clientX - rect.left
        if (rect.width <= 0) return
        const xPercent = (x / rect.width) * 100
        const indexApprox = xScale.invert(xPercent)
        const idx = Math.min(data.length - 1, Math.max(0, Math.round(indexApprox)))
        setHoverIndex(idx)
    }

    const handleMouseLeave = () => {
        setHoverIndex(null)
    }

    return (
        <div className="relative w-full h-[200px] mt-4 z-10 pl-8">
            {/* Y Axis Labels */}
            <div className="absolute left-0 top-0 bottom-0 w-8 text-[10px] text-muted-foreground font-medium text-right pr-2 pointer-events-none">
                {ticks.map((t, i) => (
                    <span key={i} className="absolute right-2 -translate-y-1/2" style={{ top: `${yScale(t)}%` }}>
                        {t}
                    </span>
                ))}
            </div>

            <svg
                ref={svgRef}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="w-full h-full overflow-visible cursor-crosshair"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <defs>
                    <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.4" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                    </linearGradient>
                </defs>

                {/* Horizontal Grid Lines */}
                {ticks.map((t, i) => (
                    <line key={`h-${i}`} x1="0" y1={yScale(t)} x2="100" y2={yScale(t)} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-border" />
                ))}

                {/* Vertical Grid Lines */}
                <line x1="0" y1="0" x2="0" y2="100" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-border" />
                <line x1="25" y1="0" x2="25" y2="100" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-border" />
                <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-border" />
                <line x1="75" y1="0" x2="75" y2="100" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-border" />
                <line x1="100" y1="0" x2="100" y2="100" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-border" />

                {/* Area */}
                <path d={areaPath} fill={`url(#gradient-${color.replace('#', '')})`} className="transition-all duration-500" />

                {/* Line */}
                <path d={pathData} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" className="drop-shadow-md transition-all duration-500" />
            </svg>

            {/* Active Point Overlay (HTML guarantees perfect circles regardless of SVG stretch) */}
            <div className="absolute inset-y-0 right-0 left-8 pointer-events-none z-20">
                {hasActive && activeX !== null && activeY !== null && activeValue !== null && (
                    <>
                        {/* The perfectly round dot */}
                        <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                            style={{ left: `${activeX}%`, top: `${activeY}%` }}
                        >
                            <div className="absolute w-3 h-3 rounded-full opacity-40" style={{ backgroundColor: color }} />
                            <div className="absolute w-1.5 h-1.5 rounded-full bg-background" />
                            <div
                                className="absolute w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}cc` }}
                            />
                        </div>

                        {/* The tooltip, straight above */}
                        <div
                            className="absolute -translate-x-1/2 -translate-y-8 bg-popover/90 text-[10px] font-semibold px-2 py-1 rounded shadow-xl border border-border/80"
                            style={{ left: `${activeX}%`, top: `${activeY}%` }}
                        >
                            {Math.round(activeValue)}
                        </div>
                    </>
                )}
            </div>

            {/* X Axis Labels mock */}
            <div className="absolute -bottom-6 left-8 right-0 flex justify-between text-xs text-muted-foreground font-medium">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>23:55</span>
            </div>
        </div>
    )
}

function BarChartCustom({ values, labels, color, yMax, valueFormat = 'default' }: { values: number[], labels: string[], color: string, yMax: number, valueFormat?: 'duration' | 'default' }) {
    const formatDuration = (intervals: number) => {
        const totalMinutes = intervals * 5;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = Math.round(totalMinutes % 60);
        if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h`;
        return `${minutes}m`;
    }

    // Calculate perfectly even integer steps for Bar Chart
    let step = Math.max(Math.ceil(yMax / 4), 1);

    // If we're formatting a duration (val * 5 minutes), restrict the axis steps to exact 1-hour (12 intervals) bounds
    if (valueFormat === 'duration') {
        const hourSteps = Math.ceil((yMax / 12) / 4);
        step = Math.max(hourSteps, 1) * 12;
    }

    const ticks: number[] = [];
    let cur = 0;
    while (cur < yMax) {
        ticks.push(cur);
        cur += step;
    }
    ticks.push(cur);
    ticks.reverse();

    const chartMax = ticks[0];

    const formatY = (val: number) => {
        if (valueFormat === 'duration') {
            if (val === 0) return "0";

            // Format precise duration strings on Axis to strictly show hours since we enforced hourly steps
            return `${Math.round((val * 5) / 60)}h`;
        }
        return Math.round(val).toString()
    }

    const xScale = d3.scaleBand()
        .domain(labels)
        .range([0, 100])
        .padding(0.3)

    const yScale = d3.scaleLinear()
        .domain([0, chartMax])
        .range([100, 0])

    return (
        <div className="relative w-full h-[160px] mt-4 z-10 pl-10 pr-2">
            {/* SVG Canvas for D3 Scale Drawing */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                {/* Horizontal Grid Lines */}
                {ticks.map((t, i) => (
                    <line key={`grid-${i}`} x1="0" y1={yScale(t)} x2="100" y2={yScale(t)} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-border" />
                ))}

                {/* Bars mapped to scales */}
                {values.map((v, i) => {
                    const barHeight = Math.max(100 - yScale(v), 2) // minimum 2% height
                    return (
                        <rect
                            key={`bar-${i}`}
                            x={xScale(labels[i])}
                            y={yScale(v)}
                            width={xScale.bandwidth()}
                            height={barHeight}
                            fill={color}
                            rx="1"
                            className="transition-all duration-500 hover:brightness-125 origin-bottom"
                        />
                    )
                })}
            </svg>

            {/* Absolute HTML Overlays for Y-Axis Labels to keep crisp typography */}
            <div className="absolute left-0 top-0 bottom-0 w-8 text-[10px] text-muted-foreground font-medium text-right pr-2 pointer-events-none">
                {ticks.map((t, i) => (
                    <span key={`y-label-${i}`} className="absolute right-2 -translate-y-1/2" style={{ top: `${yScale(t)}%` }}>
                        {formatY(t)}
                    </span>
                ))}
            </div>

            {/* Absolute HTML Overlays for Slanted X-Axis Labels */}
            <div className="absolute left-10 right-2 -bottom-10 h-10 pointer-events-none">
                {labels.map((lbl, i) => {
                    const leftPct = xScale(lbl)! + (xScale.bandwidth() / 2)
                    return (
                        <div key={`x-label-${i}`} className="absolute top-2 flex items-center justify-center -translate-x-1/2" style={{ left: `${leftPct}%` }}>
                            <span className="text-[9px] sm:text-[10px] font-semibold text-muted-foreground whitespace-nowrap -rotate-45 origin-center">
                                {lbl}
                            </span>
                        </div>
                    )
                })}
            </div>

            {/* Tooltips using absolute positioning over each bar */}
            <div className="absolute inset-0 z-20 left-10 right-2 pointer-events-none">
                {values.map((v, i) => {
                    const leftPct = xScale(labels[i])!
                    const widthPct = xScale.bandwidth()
                    const topPct = yScale(v)
                    return (
                        <div key={`hover-${i}`} className="absolute group pointer-events-auto" style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: `${topPct}%`, bottom: 0 }}>
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover/90 backdrop-blur border border-border text-popover-foreground text-[10px] font-semibold px-2 py-1 rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                {valueFormat === 'duration' ? formatDuration(v) : v}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function PieChartCustom({ data, centerValue, centerLabel }: { data: { label: string, value: number, color?: string }[], centerValue?: string | number, centerLabel?: string }) {
    const total = data.reduce((sum, d) => sum + d.value, 0)
    if (total === 0) return <div className="h-full flex items-center justify-center text-muted-foreground text-sm font-medium">No Data</div>

    const palette = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#eab308', '#06b6d4']

    // D3 Setup for Pie Chart
    const width = 160
    const height = 160
    const radius = Math.min(width, height) / 2
    const innerRadius = radius * 0.6 // Creating the donut hole

    const pieGenerator = d3.pie<{ label: string, value: number, color?: string }>()
        .value(d => d.value)
        .sort(null) // Keep original data order

    const arcGenerator = d3.arc<d3.PieArcDatum<{ label: string, value: number, color?: string }>>()
        .innerRadius(innerRadius)
        .outerRadius(radius)
        .cornerRadius(4) // Rounded slice corners
        .padAngle(0.04) // Small gap between slices

    const arcs = pieGenerator(data)

    return (
        <div className="flex flex-col items-center justify-center h-full w-full gap-6">
            <div className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full drop-shadow-md overflow-visible">
                    <g transform={`translate(${width / 2}, ${height / 2})`}>
                        {arcs.map((arc, i) => {
                            const c = arc.data.color && arc.data.color.startsWith('#') ? arc.data.color : palette[i % palette.length]
                            return (
                                <path
                                    key={`arc-${i}`}
                                    d={arcGenerator(arc)!}
                                    fill={c}
                                    className="transition-all duration-500 hover:brightness-125 cursor-pointer origin-center hover:scale-105"
                                />
                            )
                        })}
                    </g>
                </svg>
                {/* Donut hole Content overlaid using absolute HTML to guarantee crisp text rendering */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold">{centerValue ?? total}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold text-center leading-tight mx-2">{centerLabel ?? "Total Logs"}</span>
                </div>
            </div>
            {/* Legend spanning bottom */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-[200px] mt-2">
                {data.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: d.color && d.color.startsWith('#') ? d.color : palette[i % palette.length] }} />
                        <span className="truncate max-w-[80px]">{d.label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

interface DeviceLog {
    onoff: boolean;
    brightness?: number;
    color?: string;
    temperature?: number;
    speed?: number;
    swing?: boolean;
    volume?: number | null;
    channel?: number | null;
    power?: number;
}

// --- Main Page --- //

function DeviceActivityPage() {
    const { deviceId } = Route.useParams()

    // Default to today's date in YYYY-MM-DD format
    const today = new Date().toISOString().slice(0, 10)
    const [selectedDate, setSelectedDate] = useState(today)

    const { data: devices = [], isLoading } = useQuery({
        queryKey: ['devices'],
        queryFn: () => DeviceService.getInstance().getAllDevices(),
    })

    const device = devices.find(d => d.id === deviceId)
    const type = device?.type || DeviceType.Lightbulb

    const Icon = device ? (deviceIcons[device.type as DeviceType] || Lightbulb) : Lightbulb

    // Fetch device logs from API based on selected date
    const { data: logResponse, isLoading: isLoadingLogs } = useQuery({
        queryKey: ['deviceLog', type, selectedDate],
        queryFn: () => DeviceService.getInstance().getDeviceLog(type as DeviceType, selectedDate),
        enabled: !!device,
    })

    // Parse the fetched log data
    const parsedData = useMemo(() => {
        const logs: DeviceLog[] = (logResponse?.data as unknown) as DeviceLog[]

        // Scene creator truncates to 288 records reversed.
        const recentLogs = logs.slice(0, 288).reverse()

        // 1. Line Chart Data
        let lineTitle = ""
        let lineColor = "#3b82f6"
        let lineYMax = 100
        let lineYTicks: number[] | undefined = undefined
        let valKey: (l: DeviceLog) => number = () => 0

        // 2. Bar Chart Data
        let barTitle = ""
        let barValues: number[] = []
        let barLabels: string[] = []
        let barColor = "#22c55e"
        let barMax = 1

        // 3. Pie Chart Data
        let pieTitle = ""
        let pieData: { label: string, value: number, color?: string }[] = []
        let pieCenterValue: string | number | undefined = undefined
        let pieCenterLabel: string | undefined = undefined

        if (type === DeviceType.Lightbulb) {
            lineTitle = "Brightness over time"
            lineColor = "#3b82f6"
            lineYMax = 100
            valKey = (l) => l.onoff && l.brightness ? l.brightness : 0

            barTitle = "Hours On / Off"
            barColor = "#22c55e"
            const onC = logs.filter(l => l.onoff).length
            const offC = logs.filter(l => !l.onoff).length
            barValues = [onC, offC]
            barLabels = ["On", "Off"]
            barMax = Math.max(onC, offC, 1)

            pieTitle = "Daily Color Usage"
            const cMap = new Map<string, number>()
            logs.forEach(l => {
                if (l.onoff && l.color) cMap.set(l.color, (cMap.get(l.color) || 0) + 1)
            })
            pieData = Array.from(cMap.entries()).map(([k, v]) => ({ label: k, value: v, color: k }))
            pieCenterValue = cMap.size.toString()
            pieCenterLabel = "Colors Used"
        }
        else if (type === DeviceType.AirConditioner) {
            lineTitle = "Temperature Setpoint (°C)"
            lineColor = "#06b6d4"
            lineYMax = 35
            valKey = (l) => l.onoff && l.temperature ? l.temperature : 0

            barTitle = "Hours On / Off"
            barColor = "#22c55e"
            const onC = logs.filter(l => l.onoff).length
            const offC = logs.filter(l => !l.onoff).length
            barValues = [onC, offC]
            barLabels = ["On", "Off"]
            barMax = Math.max(onC, offC, 1)

            pieTitle = "Feature not supported"
            pieData = []
        }
        else if (type === DeviceType.Fan) {
            lineTitle = "Operating Speed"
            lineColor = "#22c55e"
            lineYMax = 3
            lineYTicks = [3, 2, 1, 0]
            valKey = (l) => l.onoff && l.speed ? l.speed : 0

            barTitle = "Swing Mode Usage"
            barColor = "#a855f7"
            const swC = logs.filter(l => l.onoff && l.swing).length
            const fixC = logs.filter(l => l.onoff && !l.swing).length
            barValues = [swC, fixC]
            barLabels = ["Swing", "Fixed"]
            barMax = Math.max(swC, fixC, 1)

            pieTitle = "Feature not supported"
            pieData = []
        }
        else if (type === DeviceType.Television) {
            lineTitle = "Status (On/Off Timeline)"
            lineColor = "#a855f7"
            lineYMax = 1.2
            lineYTicks = [1, 0]
            valKey = (l) => l.onoff ? 1 : 0

            barTitle = "Top Channels"
            barColor = "#3b82f6"
            const chMap = new Map<number, number>()
            logs.forEach(l => {
                if (l.onoff && l.channel) chMap.set(l.channel, (chMap.get(l.channel) || 0) + 1)
            })
            const top5Channels = Array.from(chMap.entries())
                .sort((a, b) => b[1] - a[1]) // Sort by frequency descending
                .slice(0, 5)                 // Take top 5
                .sort((a, b) => a[0] - b[0]) // Sort by channel number ascending

            barValues = top5Channels.map(s => s[1])
            barLabels = top5Channels.map(s => `Ch ${s[0]}`)
            barMax = Math.max(...barValues, 1)

            pieTitle = "Volume Levels"
            const vRanges = [0, 0, 0, 0]
            logs.forEach(l => {
                if (l.onoff && l.volume !== null && l.volume !== undefined) {
                    if (l.volume <= 25) vRanges[0]++
                    else if (l.volume <= 50) vRanges[1]++
                    else if (l.volume <= 75) vRanges[2]++
                    else vRanges[3]++
                }
            })
            if (vRanges[0]) pieData.push({ label: '0-25', value: vRanges[0] })
            if (vRanges[1]) pieData.push({ label: '26-50', value: vRanges[1] })
            if (vRanges[2]) pieData.push({ label: '51-75', value: vRanges[2] })
            if (vRanges[3]) pieData.push({ label: '76-100', value: vRanges[3] })

            let maxVolCount = -1;
            let topVol = 0;
            const volMap = new Map<number, number>();
            logs.forEach(l => {
                if (l.onoff && l.volume !== null && l.volume !== undefined) {
                    volMap.set(l.volume, (volMap.get(l.volume) || 0) + 1);
                }
            })

            volMap.forEach((count, vol) => {
                if (count > maxVolCount) {
                    maxVolCount = count;
                    topVol = vol;
                }
            })

            if (maxVolCount > 0) {
                pieCenterValue = topVol.toString()
                pieCenterLabel = "Most Used"
            }
        }
        else if (type === DeviceType.SmartMeter) {
            lineTitle = "Power Usage (W)"
            lineColor = "#fbbf24"
            lineYMax = 2000
            valKey = (l) => l.onoff && l.power ? l.power : (l.onoff ? 150 : 0) // Fallback for mock/base data

            barTitle = "Energy Consumption (kWh)"
            barColor = "#fbbf24"
            // Use static mock values for energy consumption distribution
            barValues = [12, 18, 15, 10, 22, 14, 11]
            barLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            barMax = 25

            pieTitle = "Usage by Period"
            pieData = [
                { label: 'Morning', value: 30, color: '#fbbf24' },
                { label: 'Afternoon', value: 45, color: '#f59e0b' },
                { label: 'Evening', value: 25, color: '#d97706' },
            ]
            pieCenterValue = "85"
            pieCenterLabel = "Total kWh"
        }

        return {
            rawStatus: logs[0]?.onoff || false,
            recentLogs,
            lineChart: { title: lineTitle, color: lineColor, yMax: lineYMax, yTicks: lineYTicks, valKey },
            barChart: { title: barTitle, color: barColor, values: barValues, labels: barLabels, max: barMax },
            pieChart: { title: pieTitle, data: pieData, centerValue: pieCenterValue, centerLabel: pieCenterLabel }
        }
    }, [type, logResponse])

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading device data...</div>
    }

    if (!device) {
        return (
            <div className="p-8 flex flex-col items-center">
                <h2 className="text-2xl font-bold mb-4">Device Not Found</h2>
                <Link to="/activity" className="text-primary hover:underline">Back to Overview</Link>
            </div>
        )
    }

    const P = parsedData

    return (
        <div className="flex flex-col gap-6 p-6 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500">

            <div className="flex items-center gap-4 mb-2">
                <Link to="/activity" className="p-2 rounded-full hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight">{device.name}</h1>
                        <p className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">{device.type}</p>
                    </div>
                </div>
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
                <div className="ml-auto flex items-center gap-3 bg-card p-2 px-4 rounded-xl border border-border/50 shadow-sm transition-colors hover:border-primary/30">
                    <span className="font-semibold text-sm hidden sm:inline-block">{P.rawStatus ? 'Telemetry Active' : 'Offline'}</span>
                    <div className="relative flex h-3 w-3">
                        {P.rawStatus && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                        <div className={cn("relative inline-flex rounded-full h-3 w-3 shadow-sm", P.rawStatus ? "bg-emerald-500 shadow-emerald-500/50" : "bg-destructive shadow-destructive/50")} />
                    </div>
                </div>
            </div>

            {/* Layout for charts */}
            {isLoadingLogs ? (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                    <div className="flex flex-col items-center gap-3 animate-pulse">
                        <Activity className="h-8 w-8 text-primary animate-spin" />
                        <span className="text-sm font-medium">Loading activity data for {selectedDate}...</span>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-4">

                    {/* LINE CHART CONTAINER (Full Span on smaller, 2 spans on large) */}
                    <Card className="lg:col-span-2 xl:col-span-2 bg-card/60 backdrop-blur-xl border border-border/50 shadow-sm hover:shadow-lg transition-shadow duration-300">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Activity className="h-4 w-4 text-primary" />
                                {P.lineChart.title}
                            </CardTitle>
                            <CardDescription>Data for {selectedDate} (288 readings)</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[280px] pb-12 pt-2">
                            <LineChartPlot
                                data={P.recentLogs}
                                color={P.lineChart.color}
                                yMax={P.lineChart.yMax}
                                yTicks={P.lineChart.yTicks}
                                valueKey={P.lineChart.valKey}
                            />
                        </CardContent>
                    </Card>

                    {/* BAR CHART CONTAINER */}
                    <Card className={cn(
                        "lg:col-span-1 bg-card/60 backdrop-blur-xl border border-border/50 shadow-sm hover:shadow-lg transition-shadow duration-300",
                        P.pieChart.data.length > 0 ? "xl:col-span-1" : "xl:col-span-2"
                    )}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <BarChart3 className="h-4 w-4 text-primary" />
                                {P.barChart.title}
                            </CardTitle>
                            <CardDescription>Lifetime aggregates</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-end h-[240px]">
                            <BarChartCustom
                                values={P.barChart.values}
                                labels={P.barChart.labels}
                                color={P.barChart.color}
                                yMax={P.barChart.max}
                                valueFormat="duration"
                            />
                        </CardContent>
                    </Card>

                    {/* PIE CHART CONTAINER (Only render if data is available) */}
                    {P.pieChart.data.length > 0 && (
                        <Card className="lg:col-span-3 xl:col-span-1 bg-card/60 backdrop-blur-xl border border-border/50 shadow-sm hover:shadow-lg transition-shadow duration-300">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <PieChart className="h-4 w-4 text-primary" />
                                    {P.pieChart.title}
                                </CardTitle>
                                <CardDescription>Distribution breakdown</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center justify-center p-6 h-[240px]">
                                <PieChartCustom data={P.pieChart.data} centerValue={P.pieChart.centerValue} centerLabel={P.pieChart.centerLabel} />
                            </CardContent>
                        </Card>
                    )}

                </div>
            )}
        </div>
    )
}
