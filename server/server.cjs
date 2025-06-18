// server/server.cjs - Add this route to your existing server
const express = require('express');
const path = require('path');
const cors = require('cors');
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

// --- API Routes ---
app.use('/api', uploadRoutes);
app.use('/api', dataRoutes);
app.use('/api/logs', logRoutes);

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

// --- Serve static files from React build (in production) ---
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Special route for log management
  app.get('/managelogs', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
  
  // All other routes serve the main React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// --- Development: Proxy React dev server ---
if (process.env.NODE_ENV !== 'production') {
  // In development, the React dev server handles routing
  // Just ensure CORS allows requests from localhost:3000
  
  app.get('/managelogs', (req, res) => {
    res.redirect('http://localhost:3000/managelogs');
  });
}

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
            logger.info(`📊 Main app: http://localhost:3000`);
            logger.info(`🗂️ Log management: http://localhost:3000/managelogs`);
        });
    } else {
        logger.error('❌ Server could not start because database connection failed.');
        process.exit(1);
    }
}

startServer();