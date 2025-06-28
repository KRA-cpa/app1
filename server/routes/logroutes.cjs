// routes/logRoutes.cjs - FIXED VERSION with enhanced security
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const logger = require('../config/logger.cjs');

const router = express.Router();

// Google OAuth2 configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const AUTHORIZED_EMAIL = process.env.AUTHORIZED_LOG_ADMIN_EMAIL;

// ✅ SECURITY FIX: Validate that required environment variables are set
if (!GOOGLE_CLIENT_ID) {
    logger.error('CRITICAL: GOOGLE_CLIENT_ID environment variable is not set');
    throw new Error('GOOGLE_CLIENT_ID environment variable is required');
}

if (!AUTHORIZED_EMAIL) {
    logger.error('CRITICAL: AUTHORIZED_LOG_ADMIN_EMAIL environment variable is not set');
    throw new Error('AUTHORIZED_LOG_ADMIN_EMAIL environment variable is required');
}

// ✅ SECURITY FIX: Normalize the authorized email (lowercase, trim)
const NORMALIZED_AUTHORIZED_EMAIL = AUTHORIZED_EMAIL.toLowerCase().trim();

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

// ✅ ENHANCED: More robust authentication middleware with better security
const verifyGoogleAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('Log access attempt without proper authorization header', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                action: 'missing_auth_header'
            });
            return res.status(401).json({ 
                error: 'No authentication token provided',
                message: 'Google authentication required'
            });
        }

        const token = authHeader.replace('Bearer ', '');
        
        if (!token || token.trim() === '') {
            logger.warn('Log access attempt with empty token', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                action: 'empty_token'
            });
            return res.status(401).json({ 
                error: 'Invalid authentication token',
                message: 'Authentication token is empty'
            });
        }

        // ✅ ENHANCED: More robust Google token verification
        let ticket;
        try {
            ticket = await client.verifyIdToken({
                idToken: token,
                audience: GOOGLE_CLIENT_ID,
            });
        } catch (tokenError) {
            logger.warn('Invalid Google token provided', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                error: tokenError.message,
                action: 'invalid_token'
            });
            return res.status(401).json({ 
                error: 'Invalid authentication token',
                message: 'Google token verification failed'
            });
        }

        const payload = ticket.getPayload();
        
        // ✅ SECURITY FIX: Validate payload structure
        if (!payload || !payload.email || !payload.name) {
            logger.warn('Invalid token payload structure', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                hasEmail: !!payload?.email,
                hasName: !!payload?.name,
                action: 'invalid_payload'
            });
            return res.status(401).json({ 
                error: 'Invalid token payload',
                message: 'Token does not contain required user information'
            });
        }

        const userEmail = payload.email.toLowerCase().trim(); // ✅ SECURITY FIX: Normalize email
        const userName = payload.name;
        const userSub = payload.sub; // Google's unique user ID

        // ✅ ENHANCED: More detailed logging for security audit
        logger.info('Authentication attempt details', {
            userEmail: userEmail,
            userName: userName,
            userSub: userSub,
            authorizedEmail: NORMALIZED_AUTHORIZED_EMAIL,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString(),
            action: 'auth_attempt'
        });

        // ✅ SECURITY FIX: Case-insensitive email comparison with additional validation
        if (userEmail !== NORMALIZED_AUTHORIZED_EMAIL) {
            logger.warn(`SECURITY ALERT: Unauthorized log access attempt`, { 
                attemptedEmail: userEmail,
                userName: userName,
                userSub: userSub,
                authorizedEmail: NORMALIZED_AUTHORIZED_EMAIL,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString(),
                action: 'access_denied_unauthorized_email'
            });
            
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'You are not authorized to manage server logs'
            });
        }

        // ✅ ENHANCED: Additional security checks
        
        // Check if email is verified in Google
        if (payload.email_verified !== true) {
            logger.warn(`SECURITY ALERT: Unverified email attempted access`, {
                email: userEmail,
                userName: userName,
                emailVerified: payload.email_verified,
                ip: req.ip,
                action: 'access_denied_unverified_email'
            });
            
            return res.status(403).json({ 
                error: 'Email not verified',
                message: 'Your Google account email must be verified to access this service'
            });
        }

        // Check token expiration more strictly
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            logger.warn('Expired token used for log access', {
                email: userEmail,
                expiredAt: payload.exp,
                currentTime: now,
                ip: req.ip,
                action: 'access_denied_expired_token'
            });
            
            return res.status(401).json({ 
                error: 'Token expired',
                message: 'Please sign in again'
            });
        }

        // ✅ SUCCESS: Log successful authentication with all details
        logger.info(`✅ AUTHORIZED LOG ACCESS GRANTED`, { 
            email: userEmail, 
            name: userName,
            userSub: userSub,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString(),
            action: 'access_granted_success'
        });

        // Add comprehensive user info to request
        req.user = {
            email: userEmail,
            name: userName,
            sub: userSub,
            emailVerified: payload.email_verified,
            ip: req.ip
        };

        next();
        
    } catch (error) {
        logger.error('CRITICAL: Google authentication verification system error', {
            error: error.message,
            stack: error.stack,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            action: 'auth_system_error'
        });
        
        return res.status(500).json({ 
            error: 'Authentication system error',
            message: 'Please try again later or contact administrator'
        });
    }
};

// ✅ NEW: Security status endpoint (for debugging - remove in production)
router.get('/auth-status', (req, res) => {
    // This endpoint helps debug authentication issues
    // Remove this in production for security
    res.json({
        googleClientIdConfigured: !!GOOGLE_CLIENT_ID,
        authorizedEmailConfigured: !!AUTHORIZED_EMAIL,
        normalizedAuthorizedEmail: NORMALIZED_AUTHORIZED_EMAIL,
        serverTime: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

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

        logger.info(`Log info requested successfully`, { 
            user: req.user,
            logCount: logInfo.length,
            action: 'log_info_success'
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
                    clearedBy: req.user
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
            logger.warn('Invalid file download attempted', {
                filename,
                user: req.user,
                action: 'invalid_file_download_attempt'
            });
            
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
        
        logger.info(`Log file downloaded successfully`, {
            file: filename,
            user: req.user,
            fileType: isCurrentFile ? 'current' : 'backup',
            action: 'log_download_success'
        });
        
        res.send(fileContent);
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.warn('Log file download failed - file not found', {
                filename: req.params.filename,
                user: req.user,
                action: 'file_not_found'
            });
            
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
        
        logger.info(`Backup files listed successfully`, {
            user: req.user,
            backupCount: backupInfo.length,
            action: 'backup_list_success'
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