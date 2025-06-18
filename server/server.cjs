// server/server.cjs - Updated with managelogs route
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectToDatabase, getPool } = require('./config/db.cjs');
const logger = require('./config/logger.cjs');
const uploadRoutes = require('./routes/uploadRoutes.cjs');
const dataRoutes = require('./routes/dataRoutes.cjs');
const logRoutes = require('./routes/logRoutes.cjs');

const app = express();
const port = process.env.API_PORT || 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Serve static files for managelogs ---
app.use('/public', express.static(path.join(__dirname, 'public')));

// --- API Routes ---
app.use('/api', uploadRoutes);
app.use('/api', dataRoutes);
app.use('/api/logs', logRoutes);

// --- Special route for managelogs ---
app.get('/managelogs', (req, res) => {
    const managelogsPath = path.join(__dirname, 'public', 'managelogs.html');
    
    // Check if file exists, if not create a default one
    const fs = require('fs');
    if (!fs.existsSync(managelogsPath)) {
        // Create the directory if it doesn't exist
        const publicDir = path.join(__dirname, 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        
        // Create a basic managelogs.html file
        const defaultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Server Log Management</title>
    <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
    <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
        <h1>🚧 Log Management Setup Required</h1>
        <p>The managelogs.html file needs to be created.</p>
        <p>Please copy the HTML content from the log_management_html artifact to:</p>
        <code style="background: #f0f0f0; padding: 10px; display: block; margin: 20px 0;">
            server/public/managelogs.html
        </code>
        <p>Then refresh this page.</p>
        <hr style="margin: 30px 0;">
        <h3>Quick Setup:</h3>
        <ol style="text-align: left; max-width: 600px; margin: 0 auto;">
            <li>Create <code>server/public/</code> directory</li>
            <li>Copy the full HTML content to <code>server/public/managelogs.html</code></li>
            <li>Update Google Client ID in the HTML file</li>
            <li>Refresh this page</li>
        </ol>
    </div>
</body>
</html>`;
        
        fs.writeFileSync(managelogsPath, defaultHtml);
        logger.info('Created default managelogs.html file');
    }
    
    res.sendFile(managelogsPath);
});

// --- General Routes ---
app.get('/api/db-status', async (req, res) => {
    logger.info('Received request for /api/db-status');
    const pool = getPool();
    if (pool) {
        try {
            const connection = await pool.getConnection();
            connection.release();
            logger.info('DB status check successful.');
            res.json({ status: 'connected', message: 'Database connection verified.' });
        } catch (error) {
            logger.error('DB status check returned false (connection failed).');
            res.status(503).json({ status: 'error', message: 'Database connection failed.' });
        }
    } else {
        logger.error('DB status check failed: No pool available.');
        res.status(503).json({ status: 'error', message: 'Database connection is not established.' });
    }
});

app.post('/api/log', (req, res) => {
  const { level = 'info', message = '', component = 'frontend', ...meta } = req.body;
  const logData = { component, ...meta };
  const validLevel = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'].includes(level) ? level : 'info';
  logger.log(validLevel, `[Frontend] ${message}`, logData);
  res.sendStatus(204);
});

// --- Generic Error Handling Middleware ---
app.use((err, req, res, next) => {
  logger.error('Unhandled Error:', err);
  res.status(500).send('Something broke!');
});

// --- Start Server ---
async function startServer() {
    await connectToDatabase();
    const pool = getPool();
    if (pool) {
        app.listen(port, () => {
            logger.info(`🚀 Server listening on http://localhost:${port}`);
            logger.info(`📊 Main React app: http://localhost:3000`);
            logger.info(`🗂️ Log management: http://localhost:${port}/managelogs`);
            logger.info(`📁 Make sure to create server/public/managelogs.html with the log management HTML content`);
        });
    } else {
        logger.error('❌ Server could not start because database connection failed.');
        process.exit(1);
    }
}

startServer();