// Z:/.../app1/server/config/db.cjs
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const logger = require('./logger.cjs');

// --- Database Configuration for MySQL ---
const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
    // ssl: { ca: fs.readFileSync('/path/to/ca-cert.pem') } // Example SSL
};

// --- Global variable for MySQL Pool ---
let pool = null;

// --- Function to create MySQL Pool and test connection ---
async function connectToDatabase() {
    try {
        logger.info("Attempting to create MySQL connection pool...");
        pool = mysql.createPool(dbConfig);

        const connection = await pool.getConnection();
        logger.info("✅ MySQL connection test successful! Releasing test connection.");
        connection.release();

        logger.info("MySQL Pool ready.");
        return pool;
    } catch (err) {
        logger.error("❌ MySQL connection pool creation failed:", err.message);
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
             logger.error("Check MySQL username/password in .env file.");
        } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
             logger.error("Check MySQL host/port in .env file and ensure MySQL server is running.");
        } else if (err.code === 'ER_BAD_DB_ERROR') {
             logger.error(`Database '${process.env.DB_DATABASE}' not found. Check DB_DATABASE in .env file.`);
        }
        pool = null;
        return null;
    }
}

const getPool = () => pool;

module.exports = { connectToDatabase, getPool };