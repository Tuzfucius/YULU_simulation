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
    },
    simulation: {
        title: 'ETC Traffic Simulation',
        status: 'Status',
        running: 'Running',
        paused: 'Paused',
        stopped: 'Stopped',
        time: 'Simulation Time',
        vehicles: 'Vehicles',
        total: 'Total',
        active: 'Active',
        completed: 'Completed',
    },
    reset: 'Reset to Default',

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

    // Traffic Logic
    trafficLogic: 'Traffic Logic',
    laneChangeDelay: 'Lane Change Delay',
    impactThreshold: 'Impact Threshold',
    impactDist: 'Impact Distance',
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
    },
    logs: {
        title: 'Console Logs',
        clear: 'Clear',
    },
};
