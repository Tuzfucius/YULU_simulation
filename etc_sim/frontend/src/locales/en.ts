/**
 * English translations
 */

import type { Translation } from './zh';

export const en: Translation = {
    common: {
        start: 'Start',
        stop: 'Stop',
        pause: 'Pause',
        resume: 'Resume',
        reset: 'Reset',
        export: 'Export',
        import: 'Import',
        language: 'Language',
        theme: 'Theme',
        light: 'Light',
        dark: 'Dark',
        enable: 'Enable',
        preview: 'Preview',
        add: 'Add',
        loading: 'Loading...',
        refresh: 'Refresh',
        retrying: 'Retrying...',
        favorites: 'Favorites',
        all: 'All',
        download: 'Download',
        removeFavorite: 'Remove Favorite',
        addFavorite: 'Add Favorite',
    },
    app: {
        title: 'ETC Traffic',
        subtitle: 'ETC Traffic Simulation',
        themeToggle: {
            toLight: 'Switch to Light Mode',
            toDark: 'Switch to Dark Mode',
        },
        simulationStats: 'Simulation Stats',
        analysisCharts: 'Analysis Charts',
        systemLogs: 'System Logs',
        footer: 'ETC Traffic Sim',
    },
    simulation: {
        title: 'ETC Traffic Simulation',
        status: 'Status',
        running: 'Running',
        paused: 'Paused',
        stopped: 'Stopped',
        time: 'Sim Time',
        vehicles: 'Vehicles',
        total: 'Total',
        active: 'Active',
        completed: 'Completed',
        waitingForCompletion: 'Results available after simulation',
    },
    config: {
        title: 'Configuration',
        roadLength: 'Road Length (km)',
        numLanes: 'Lanes',
        targetVehicles: 'Target Vehicles',
        reset: 'Reset to Default',
        exportConfig: 'Export Config',
        importConfig: 'Import Config',
        resetDefaults: 'Reset Defaults',

        // Vehicle Ratios
        carRatio: 'Car Ratio',
        truckRatio: 'Truck Ratio',
        busRatio: 'Bus Ratio',

        // Driver Styles
        driverStyles: 'Driver Styles',
        aggressive: 'Aggressive',
        conservative: 'Conservative',
        normal: 'Normal',

        // Anomalies
        anomalies: 'Anomalies',
        anomalyRate: 'Anomaly Prob',
        startTime: 'Start Time',
        safeRunTime: 'Safe Run Time',
        anomalyTypeRatios: 'Anomaly Type Ratios (Sum ~1.0)',
        type1Ratio: 'Type 1 (Stop) Ratio',
        type2Ratio: 'Type 2 (Slow) Ratio',
        type3Ratio: 'Type 3 (Fluct) Ratio',
        type1Duration: 'Type 1 Clearance Time',

        // Traffic Logic
        trafficLogic: 'Traffic Logic',
        laneChangeDelay: 'Lane Change Delay',
        impactThreshold: 'Impact Threshold',
        impactDist: 'Impact Dist',

        // Road Network
        roadNetwork: {
            title: 'Road Network',
            templates: 'Templates',
            simpleMainline: 'Simple Mainline',
            onRamp: 'On-Ramp',
            offRamp: 'Off-Ramp',
            rampTraffic: 'Ramp Traffic',
            vehiclesEntering: 'Vehicles Entering',
            rampPosition: 'Ramp Position',
            exitProbability: 'Exit Probability',
            merge: 'Merge',
            diverge: 'Diverge',
        },

        // Environment
        environment: {
            title: 'Environment',
            weatherConditions: 'Weather Conditions',
            weatherTypes: {
                clear: 'Clear',
                rain: 'Rain',
                snow: 'Snow',
                fog: 'Fog',
                heavy_rain: 'Heavy Rain',
            },
            speed: 'Speed',
            headway: 'Headway',
            roadGradient: 'Road Gradient',
            startKm: 'Start km',
            endKm: 'End km',
            gradePercent: 'Grade %',
        },

        // ETC Monitor
        etc: {
            title: 'ETC Monitor',
            tabs: {
                stats: 'Statistics',
                code: 'Code Editor',
            },
            stats: {
                totalTransactions: 'Total Transactions',
                alerts: 'Alerts',
                noiseStats: 'Noise Injection Stats',
                missedRead: 'Missed Read',
                duplicateRead: 'Duplicate Read',
                delayedUpload: 'Delayed Upload',
                clockDrift: 'Clock Drift',
                recentAlerts: 'Recent Alerts',
                gateTraffic: 'Gate Traffic',
            }
        }
    },
    charts: {
        title: 'Simulation Analysis',
        subtitle: 'Comprehensive visualization of simulation results',
        vehicleType: 'Vehicle Type Distribution',
        driverStyle: 'Driver Style Distribution',
        laneChange: 'Lane Change Analysis',
        laneChangeByStyle: 'Lane Changes by Driver Style',
        avgSpeed: 'Avg Speed (km/h)',
        progress: 'Simulation Progress',
        speedHeatmap: 'Speed Heatmap (Time-Space)',
        trajectory: 'Vehicle Trajectories (Sampled)',
        speedProfile: 'Traffic Speed Profile',
        summary: 'Summary Statistics',
        totalVehicles: 'Total Vehicles',
        totalLaneChanges: 'Total Lane Changes',
        anomalyEvents: 'Anomaly Events',
        forcedLaneChanges: 'Forced Lane Changes',
        completed: 'Completed',
        active: 'Active',
        totalTime: 'Total Time',
        noData: 'No data available',
        available: 'Charts Available',
        favorites: 'Favorites',
        all: 'All',
        download: 'Download',
        refresh: 'Refresh',
        generating: 'Generating...',
        waiting: 'Waiting for generation...',
        simulating: 'Simulating...',
        willGenerate: 'Charts will be generated automatically after simulation finishes.',
        generationTimeout: 'Charts generation timed out. Please check backend logs.',
        waitingNetwork: 'Waiting for network or charts generation...',
        pleaseWait: 'Please wait for image generation...',
        notGenerated: 'Not Generated',
        noCharts: 'No charts available. Run simulation to generate.',
    },
    logs: {
        title: 'Console Logs',
        clear: 'Clear',
    },
};
