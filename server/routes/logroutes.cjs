// routes/logRoutes.cjs
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const logger = require('../config/logger.cjs');

const router = express.Router();

// Google OAuth2 configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const AUTHORIZED_EMAIL = process.env.AUTHORIZED_LOG_ADMIN_EMAIL || 'kenneth.advento@example.com'; // Hardcoded authorized email

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

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
                message: `Only ${AUTHORIZED_EMAIL} is authorized to manage logs`
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

// Route to get log file information
router.get('/info', verifyGoogleAuth, async (req, res) => {
    try {
        const logDirectory = path.join(__dirname, '..', 'logs');
        const logFiles = ['combined.log', 'error.log', 'combined.log.bak', 'error.log.bak'];
        const logInfo = [];

        for (const fileName of logFiles) {
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
                    type: fileName.endsWith('.bak') ? 'backup' : 'current'
                });
            } catch (err) {
                logInfo.push({
                    file: fileName,
                    size: '0 MB',
                    sizeBytes: 0,
                    lastModified: null,
                    exists: false,
                    type: fileName.endsWith('.bak') ? 'backup' : 'current'
                });
            }
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
            logs: logInfo
        });
    } catch (error) {
        logger.error('Error getting log info:', error);
        res.status(500).json({ 
            error: 'Failed to get log information',
            message: error.message 
        });
    }
});

// Route to clear all log files
router.post('/clear', verifyGoogleAuth, async (req, res) => {
    try {
        const logDirectory = path.join(__dirname, '..', 'logs');
        const logFiles = ['combined.log', 'error.log'];
        const clearResults = [];

        for (const fileName of logFiles) {
            const filePath = path.join(logDirectory, fileName);
            const bakPath = path.join(logDirectory, `${fileName}.bak`);
            
            try {
                // Check if file exists
                await fs.access(filePath);
                
                // Get file size before clearing
                const stats = await fs.stat(filePath);
                const originalSize = stats.size;
                
                // Create .bak file (overwrite existing .bak if it exists)
                await fs.copyFile(filePath, bakPath);
                
                // Clear the original file (but keep it existing)
                await fs.writeFile(filePath, '');
                
                clearResults.push({
                    file: fileName,
                    cleared: true,
                    originalSize: originalSize,
                    bakFileCreated: `${fileName}.bak`,
                    error: null
                });

                logger.info(`Log file cleared: ${fileName}`, {
                    file: fileName,
                    originalSize,
                    bakFile: `${fileName}.bak`,
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
                        error: 'File did not exist, created new empty file'
                    });
                } else {
                    clearResults.push({
                        file: fileName,
                        cleared: false,
                        originalSize: 0,
                        bakFileCreated: null,
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
            results: clearResults
        });
        logger.info('='.repeat(80));

        res.json({
            success: true,
            message: 'Log files cleared successfully. Previous logs saved as .bak files. Fresh logging session started.',
            clearedBy: req.user,
            timestamp: new Date().toISOString(),
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

// Route to download log files (for backup purposes)
router.get('/download/:filename', verifyGoogleAuth, async (req, res) => {
    try {
        const { filename } = req.params;
        const allowedFiles = ['combined.log', 'error.log', 'combined.log.bak', 'error.log.bak'];
        
        if (!allowedFiles.includes(filename)) {
            return res.status(400).json({ 
                error: 'Invalid file requested',
                allowedFiles 
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

// Route to list backup files
router.get('/backups', verifyGoogleAuth, async (req, res) => {
    try {
        const logDirectory = path.join(__dirname, '..', 'logs');
        const files = await fs.readdir(logDirectory);
        
        const backupFiles = files
            .filter(file => file.endsWith('.bak'))
            .map(async (file) => {
                const filePath = path.join(logDirectory, file);
                const stats = await fs.stat(filePath);
                return {
                    filename: file,
                    size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
                    created: stats.birthtime.toISOString(),
                    modified: stats.mtime.toISOString()
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