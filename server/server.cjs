// server.cjs
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectToDatabase, getPool } = require('./config/db.cjs');
const logger = require('./config/logger.cjs');
const uploadRoutes = require('./routes/uploadRoutes.cjs');
const dataRoutes = require('./routes/dataRoutes.cjs');

const app = express();
const port = process.env.API_PORT || 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- API Routes ---
app.use('/api', uploadRoutes); // All routes from uploadRoutes will be prefixed with /api
app.use('/api', dataRoutes);   // All routes from dataRoutes will be prefixed with /api

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
        });
    } else {
        logger.error('❌ Server could not start because database connection failed.');
        process.exit(1); // Exit the process with an error code
    }
}

startServer();