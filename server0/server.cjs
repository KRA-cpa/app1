// server.cjs

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
// --- CHANGE 1: Require mysql2/promise ---
const mysql = require('mysql2/promise'); // Use promise wrapper
const { Readable } = require('stream');
const cors = require('cors');

const app = express();
const port = process.env.API_PORT || 3001;

app.use(cors());

// --- CHANGE 2: Database Configuration for MySQL ---
const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true, // Recommended pool setting
    connectionLimit: 10,      // Recommended pool setting
    queueLimit: 0           // Recommended pool setting
    // Add SSL options here if your MySQL requires SSL connection
    // ssl: { ca: fs.readFileSync('/path/to/ca-cert.pem') } // Example
};

// --- CHANGE 3: Global variable for MySQL Pool ---
let pool = null;

// --- CHANGE 4: Function to create MySQL Pool and test connection ---
async function connectToDatabase() {
    try {
        console.log("Attempting to create MySQL connection pool...");
        pool = mysql.createPool(dbConfig); // Create the pool

        // Optional: Test connection by getting and releasing one connection
        const connection = await pool.getConnection();
        console.log("✅ MySQL connection test successful! Releasing test connection.");
        connection.release(); // IMPORTANT: Release the connection back to the pool

        console.log("MySQL Pool ready.");
        return pool; // Return the pool itself
    } catch (err) {
        console.error("❌ MySQL connection pool creation failed:", err.message);
        // Log details based on MySQL error codes if needed
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
             console.error("Check MySQL username/password in .env file.");
        } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
             console.error("Check MySQL host/port in .env file and ensure MySQL server is running.");
        } else if (err.code === 'ER_BAD_DB_ERROR') {
             console.error(`Database '${process.env.DB_DATABASE}' not found. Check DB_DATABASE in .env file.`);
        }
        pool = null;
        return null;
    }
}

// --- Multer Configuration (Remains the same) ---
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => { /* ... same ... */ }
});


// --- CHANGE 5: API Endpoint - Get connection from pool, release in finally ---
app.post('/api/upload', upload.single('csvFile'), async (req, res) => {
    if (!pool) {
        console.error("Upload rejected: MySQL connection pool not available.");
        return res.status(503).json({ message: "Service unavailable: Cannot connect to database." });
    }

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    const currentUser = 'SystemUpload'; // TODO: Get actual username
    let rowCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const processingPromises = []; // To track async operations

    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);

    console.log('Starting CSV processing for MySQL upload...');

    // No overall try/catch needed for pool connection here (already established)
    // But need one for the stream processing overall potentially

    const streamProcessor = new Promise((resolve, reject) => {
        bufferStream
            .pipe(csv({ /* options if needed */ }))
            .on('data', (row) => {
                rowCount++;
                // Create a promise for each row processing and add to array
                const promise = processRow(pool, row, rowCount, currentUser)
                    .then(() => successCount++)
                    .catch(err => {
                        errorCount++;
                        errors.push(`Row ${rowCount + 1}: ${err.message}`); // Use row number for user feedback
                        console.error(`Error processing row ${rowCount + 1}:`, err.message);
                    });
                processingPromises.push(promise);
            })
            .on('end', async () => {
                try {
                    // Wait for all row processing promises to settle
                    await Promise.allSettled(processingPromises);
                    console.log(`CSV Stream Finished. Waiting results... Total Data Rows: ${rowCount}, Potential Success: ${successCount}, Errors: ${errorCount}`);
                    resolve(); // Resolve once all processing is done
                } catch (waitError){
                     console.error("Error waiting for row processing:", waitError);
                     reject(waitError); // Should not happen with allSettled, but belt-and-suspenders
                }
            })
            .on('error', (err) => {
                console.error('Error parsing CSV stream:', err);
                reject(err);
            });
    });

    try {
        await streamProcessor; // Wait for the stream and all row processing

        // Send response based on final counts
        if (errorCount > 0) {
            res.status(400).json({
                message: `Processing finished with ${errorCount} errors out of ${rowCount} data rows.`,
                successCount: successCount, errorCount: errorCount, errors: errors.slice(0, 50)
            });
        } else {
            res.status(200).json({
                message: `Successfully processed ${successCount} data rows.`,
                successCount: successCount, errorCount: errorCount
            });
        }
    } catch (processError) {
        console.error("Error during CSV stream processing:", processError);
        res.status(500).json({ message: "Internal server error during file processing.", error: processError.message });
    }
    // NOTE: Individual connections are acquired/released within processRow or use pool directly
});


// --- CHANGE 6: Rewritten Row Processing Function for MySQL ---
async function processRow(pool, row, rowIndex, currentUser) {
    // --- Data Extraction & Validation (Same as before, check types for MySQL) ---
    const project = row.project?.trim();
    const phasecode = row.phasecode?.trim();
    const yearStr = row.year?.trim();
    const monthStr = row.month?.trim();
    const valueStr = row.value?.trim();

    if (!project) throw new Error(`Missing 'project' value.`);
    if (!phasecode) throw new Error(`Missing 'phasecode' value.`);
    const year = parseInt(yearStr, 10);
    if (isNaN(year)) throw new Error(`Invalid 'year': Must be a whole number.`);
    const month = parseInt(monthStr, 10);
    if (isNaN(month)) throw new Error(`Invalid 'month': Must be a whole number.`);
    if (month < 1 || month > 12) throw new Error(`Invalid 'month': Must be between 1 and 12. Found: ${month}`);
    const value = parseFloat(valueStr);
    if (isNaN(value)) throw new Error(`Invalid 'value': Must be a number.`);
    if (value < 0.00 || value > 100.00) throw new Error(`Invalid 'value': Must be between 0.00 and 100.00. Found: ${value.toFixed(2)}`);

    // --- Database Operation (MySQL INSERT ... ON DUPLICATE KEY UPDATE) ---

    // IMPORTANT: Assumes your MySQL table `POCpermonth` (adjust name if needed)
    // has a UNIQUE KEY or PRIMARY KEY constraint on (project, phasecode, year, month)
    const upsertQuery = `
        INSERT INTO POCpermonth (project, phasecode, year, month, value, timestampC, userC, timestampM, userM)
        VALUES (?, ?, ?, ?, ?, NOW(), ?, NOW(), ?)
        ON DUPLICATE KEY UPDATE
            value = VALUES(value),       -- Use VALUES() to refer to the value that WOULD have been inserted
            timestampM = NOW(),
            userM = VALUES(userM);       -- Use VALUES() for userM as well
    `;

    // Parameters must be in the EXACT order of the question marks (?)
    const params = [
        project,      // for project
        phasecode,    // for phasecode
        year,         // for year
        month,        // for month
        value,        // for value
        currentUser,  // for userC
        currentUser   // for userM (used in both INSERT and UPDATE parts)
    ];

    let connection = null; // Define connection variable outside try
    try {
        // Get a connection from the pool for this specific operation
        connection = await pool.getConnection();
        // Execute the query with parameters
        const [results] = await connection.execute(upsertQuery, params);
        // console.log(`Row ${rowIndex}: AffectedRows: ${results.affectedRows}, InsertId: ${results.insertId}`); // Optional logging
    } catch (dbError) {
        // Log database errors specifically
        console.error(`Database error on row ${rowIndex}:`, dbError.message);
        // Re-throw the error so the main handler catches it and increments errorCount
        throw new Error(`Database error: ${dbError.message}`);
    } finally {
        // !! CRITICAL: Always release the connection back to the pool !!
        if (connection) {
            connection.release();
        }
    }
}


// --- Error Handling Middleware (Remains the same) ---
app.use((err, req, res, next) => { /* ... same ... */ });


app.get('/api/db-status', async (req, res) => {
    console.log('Received request for /api/db-status'); // Add a log to see if it's hit
  
    try {
      // --- Placeholder: Call your actual DB checking logic here ---
      // You need a function (maybe imported from another file)
      // that actually tries to connect to or ping your MySQL database
      // and returns true/false or throws an error.
      // Let's pretend you have a function called `checkActualDbConnection`
      // Replace this with your real logic!
  
      // Example: const isConnected = await checkActualDbConnection();
      const isConnected = true; // <<<< REPLACE THIS with your actual check result
  
      // ----------------------------------------------------------
  
      if (isConnected) {
        console.log('DB status check successful.');
        res.json({ status: 'connected', message: 'Database connection verified.' });
      } else {
        console.error('DB status check returned false (connection failed).');
        // Send a server error status code (e.g., 503 Service Unavailable)
        res.status(503).json({ status: 'error', message: 'Database connection failed.' });
      }
    } catch (error) {
      // Catch errors from your DB checking logic
      console.error('Error occurred during DB status check:', error);
      // Send a server error status code (e.g., 500 Internal Server Error)
      res.status(500).json({ status: 'error', message: 'Server error during DB check.' });
    }
  });
  
  // --- End of route definition ---


// --- Start Server Function (Remains the same, calls new connectToDatabase) ---
async function startServer() {
    await connectToDatabase(); // Will now create MySQL pool
    app.listen(port, () => { /* ... same ... */ });
}

startServer();