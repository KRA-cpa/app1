// routes/logRoutes.cjs
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const logger = require('../config/logger.cjs');

const router = express.Router();

// Google OAuth2 configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const AUTHORIZED_EMAIL = process.env.AUTHORIZED_LOG_ADMIN_EMAIL || 'kenneth.advento@example.com';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Helper function to generate timestamp in YYYYMMDDHMMSS format (UTC+8)
const generateTimestamp = () => {
    const now = new Date();
    
    // Convert to UTC+8 timezone (Philippines)
    const utc8Offset = 8 * 60; // UTC+8 in minutes
    const localTime = now.getTime();
    const localOffset = now.getTimezoneOffset() * 60000; // Convert to milliseconds
    const utc = localTime + localOffset;
    const utc8Time = utc + (utc8Offset * 60000);
    const utc8Date = new Date(utc8Time);
    
    const year = utc8Date.getFullYear();
    const month = String(utc8Date.getMonth() + 1).padStart(2, '0');
    const day = String(utc8Date.getDate()).padStart(2, '0');
    const hours = String(utc8Date.getHours()).padStart(2, '0');
    const minutes = String(utc8Date.getMinutes()).padStart(2, '0');
    const seconds = String(utc8Date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

// Middleware to verify Google token and check authorization
const verifyGoogleAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                error: 'No authentication token provided',
                message: 'Google authentication required'
            });
        }

        // Verify the Google token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const userEmail = payload.email;
        const userName = payload.name;

        // Check if the user is authorized
        if (userEmail !== AUTHORIZED_EMAIL) {
            logger.warn(`Unauthorized log access attempt from: ${userEmail}`, { 
                email: userEmail, 
                name: userName,
                action: 'log_access_denied'
            });
            return res.status(403).json({ 
                error: 'Access denied',
                message: `You are not authorized to manage logs`
                // `Only ${AUTHORIZED_EMAIL} is authorized to manage logs`
            });
        }

        // Log successful authentication
        logger.info(`Authorized log access by: ${userEmail}`, { 
            email: userEmail, 
            name: userName,
            action: 'log_access_granted'
        });

        // Add user info to request for use in handlers
        req.user = {
            email: userEmail,
            name: userName
        };

        next();
    } catch (error) {
        logger.error('Google authentication verification failed:', error);
        return res.status(401).json({ 
            error: 'Invalid authentication token',
            message: 'Google authentication verification failed'
        });
    }
};

// Route to get log file information (updated to include timestamped backups)
router.get('/info', verifyGoogleAuth, async (req, res) => {
    try {
        const logDirectory = path.join(__dirname, '..', 'logs');
        const currentLogFiles = ['combined.log', 'error.log'];
        const logInfo = [];

        // Get current log files
        for (const fileName of currentLogFiles) {
            const filePath = path.join(logDirectory, fileName);
            try {
                const stats = await fs.stat(filePath);
                const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
                
                logInfo.push({
                    file: fileName,
                    size: `${sizeInMB} MB`,
                    sizeBytes: stats.size,
                    lastModified: stats.mtime.toISOString(),
                    exists: true,
                    type: 'current'
                });
            } catch (err) {
                logInfo.push({
                    file: fileName,
                    size: '0 MB',
                    sizeBytes: 0,
                    lastModified: null,
                    exists: false,
                    type: 'current'
                });
            }
        }

        // Get all backup files (with timestamps)
        try {
            const files = await fs.readdir(logDirectory);
            const backupFiles = files.filter(file => 
                file.match(/\.(combined|error)\.log\.\d{14}\.bak$/) || 
                file.endsWith('.bak')
            );

            for (const fileName of backupFiles) {
                const filePath = path.join(logDirectory, fileName);
                try {
                    const stats = await fs.stat(filePath);
                    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
                    
                    logInfo.push({
                        file: fileName,
                        size: `${sizeInMB} MB`,
                        sizeBytes: stats.size,
                        lastModified: stats.mtime.toISOString(),
                        exists: true,
                        type: 'backup'
                    });
                } catch (err) {
                    // Skip files that can't be read
                }
            }
        } catch (err) {
            // Directory read error, continue with current files only
        }

        logger.info(`Log info requested by: ${req.user.email}`, { 
            user: req.user,
            logInfo,
            action: 'log_info_requested'
        });

        res.json({
            success: true,
            requestedBy: req.user,
            timestamp: new Date().toISOString(),
            logs: logInfo.sort((a, b) => {
                // Sort: current files first, then backups by date (newest first)
                if (a.type === 'current' && b.type === 'backup') return -1;
                if (a.type === 'backup' && b.type === 'current') return 1;
                return new Date(b.lastModified) - new Date(a.lastModified);
            })
        });
    } catch (error) {
        logger.error('Error getting log info:', error);
        res.status(500).json({ 
            error: 'Failed to get log information',
            message: error.message 
        });
    }
});

// Route to clear all log files (updated with timestamped backups)
router.post('/clear', verifyGoogleAuth, async (req, res) => {
    try {
        const logDirectory = path.join(__dirname, '..', 'logs');
        const logFiles = ['combined.log', 'error.log'];
        const clearResults = [];
        const timestamp = generateTimestamp(); // Generate once for consistent naming

        for (const fileName of logFiles) {
            const filePath = path.join(logDirectory, fileName);
            // NEW: Create timestamped backup filename
            const bakFileName = `${fileName}.${timestamp}.bak`;
            const bakPath = path.join(logDirectory, bakFileName);
            
            try {
                // Check if file exists
                await fs.access(filePath);
                
                // Get file size before clearing
                const stats = await fs.stat(filePath);
                const originalSize = stats.size;
                
                // Create timestamped .bak file
                await fs.copyFile(filePath, bakPath);
                
                // Clear the original file (but keep it existing)
                await fs.writeFile(filePath, '');
                
                clearResults.push({
                    file: fileName,
                    cleared: true,
                    originalSize: originalSize,
                    bakFileCreated: bakFileName, // Updated to show timestamped name
                    timestamp: timestamp,
                    error: null
                });

                logger.info(`Log file cleared: ${fileName}`, {
                    file: fileName,
                    originalSize,
                    bakFile: bakFileName, // Updated to show timestamped name
                    timestamp: timestamp,
                    clearedBy: req.user.email
                });
                
            } catch (err) {
                if (err.code === 'ENOENT') {
                    // File doesn't exist, create empty file
                    await fs.writeFile(filePath, '');
                    clearResults.push({
                        file: fileName,
                        cleared: true,
                        originalSize: 0,
                        bakFileCreated: null,
                        timestamp: timestamp,
                        error: 'File did not exist, created new empty file'
                    });
                } else {
                    clearResults.push({
                        file: fileName,
                        cleared: false,
                        originalSize: 0,
                        bakFileCreated: null,
                        timestamp: timestamp,
                        error: err.message
                    });
                }
            }
        }

        // Log the clearing action
        logger.info('='.repeat(80));
        logger.info('LOG SYSTEM REFRESHED', {
            action: 'logs_cleared',
            clearedBy: req.user,
            timestamp: new Date().toISOString(),
            backupTimestamp: timestamp, // Added backup timestamp info
            results: clearResults
        });
        logger.info('='.repeat(80));

        res.json({
            success: true,
            message: `Log files cleared successfully. Previous logs saved with timestamp ${timestamp}. Fresh logging session started.`,
            clearedBy: req.user,
            timestamp: new Date().toISOString(),
            backupTimestamp: timestamp, // Added backup timestamp info
            results: clearResults
        });

    } catch (error) {
        logger.error('Error clearing log files:', error);
        res.status(500).json({ 
            error: 'Failed to clear log files',
            message: error.message 
        });
    }
});

// Route to download log files (updated to handle timestamped backups)
router.get('/download/:filename', verifyGoogleAuth, async (req, res) => {
    try {
        const { filename } = req.params;
        
        // Updated to allow timestamped backup files
        const isCurrentFile = ['combined.log', 'error.log'].includes(filename);
        const isTimestampedBackup = filename.match(/^(combined|error)\.log\.\d{14}\.bak$/);
        const isLegacyBackup = ['combined.log.bak', 'error.log.bak'].includes(filename);
        
        if (!isCurrentFile && !isTimestampedBackup && !isLegacyBackup) {
            return res.status(400).json({ 
                error: 'Invalid file requested',
                message: 'File must be a current log file or a backup file',
                examples: ['combined.log', 'error.log', 'combined.log.20250628143045.bak', 'error.log.20250628143045.bak']
            });
        }

        const logDirectory = path.join(__dirname, '..', 'logs');
        const filePath = path.join(logDirectory, filename);

        // Check if file exists
        await fs.access(filePath);
        
        // Set headers for file download
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Stream the file
        const fileContent = await fs.readFile(filePath, 'utf8');
        
        logger.info(`Log file downloaded: ${filename}`, {
            file: filename,
            downloadedBy: req.user.email,
            fileType: isCurrentFile ? 'current' : 'backup',
            action: 'log_download'
        });
        
        res.send(fileContent);
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ 
                error: 'Log file not found',
                file: req.params.filename 
            });
        } else {
            logger.error('Error downloading log file:', error);
            res.status(500).json({ 
                error: 'Failed to download log file',
                message: error.message 
            });
        }
    }
});

// Route to list backup files (updated for timestamped backups)
router.get('/backups', verifyGoogleAuth, async (req, res) => {
    try {
        const logDirectory = path.join(__dirname, '..', 'logs');
        const files = await fs.readdir(logDirectory);
        
        // Updated to handle both timestamped and legacy backup files
        const backupFiles = files
            .filter(file => 
                file.match(/\.(combined|error)\.log\.\d{14}\.bak$/) || // Timestamped backups
                file.endsWith('.bak') // Legacy backups
            )
            .map(async (file) => {
                const filePath = path.join(logDirectory, file);
                const stats = await fs.stat(filePath);
                
                // Extract timestamp from filename if it's a timestamped backup
                const timestampMatch = file.match(/\.(\d{14})\.bak$/);
                const extractedTimestamp = timestampMatch ? timestampMatch[1] : null;
                
                return {
                    filename: file,
                    size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
                    sizeBytes: stats.size,
                    created: stats.birthtime.toISOString(),
                    modified: stats.mtime.toISOString(),
                    type: extractedTimestamp ? 'timestamped' : 'legacy',
                    extractedTimestamp: extractedTimestamp,
                    formattedTimestamp: extractedTimestamp ? 
                        `${extractedTimestamp.substring(0,4)}-${extractedTimestamp.substring(4,6)}-${extractedTimestamp.substring(6,8)} ${extractedTimestamp.substring(8,10)}:${extractedTimestamp.substring(10,12)}:${extractedTimestamp.substring(12,14)}` 
                        : null
                };
            });

        const backupInfo = await Promise.all(backupFiles);
        
        logger.info(`Backup files listed by: ${req.user.email}`, {
            user: req.user,
            backupCount: backupInfo.length,
            action: 'backup_list_requested'
        });

        res.json({
            success: true,
            requestedBy: req.user,
            backups: backupInfo.sort((a, b) => new Date(b.created) - new Date(a.created))
        });
        
    } catch (error) {
        logger.error('Error listing backup files:', error);
        res.status(500).json({ 
            error: 'Failed to list backup files',
            message: error.message 
        });
    }
});

module.exports = router;