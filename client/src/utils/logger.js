// src/utils/logger.js
export const logToServer = async (level, message, component, meta = {}) => {
    try {
        // Don't log server logs during development if they become too noisy
        if (process.env.NODE_ENV === 'development') {
            console[level] ? console[level](`[${component || 'FE'}] ${message}`, meta) : console.log(`[${component || 'FE'}] ${message}`, meta);
            // return; // Optionally disable sending to server in dev
        }

        await fetch('/api/log', { // Use the backend logging endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                level,
                message,
                component, // Name of the component logging
                ...meta,   // Any additional context
                timestamp: new Date().toISOString(), // Add frontend timestamp
                url: window.location.href // Add current URL
            }),
        });
    } catch (error) {
        console.error('Failed to send log to server:', error);
    }
};