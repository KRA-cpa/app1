// server.cjs

require('dotenv').config();
const express = require('express');
const path = require('path'); // Often needed for file paths
const winston = require('winston'); // Require winston
const multer = require('multer');
const csv = require('csv-parser');
// --- CHANGE 1: Require mysql2/promise ---
const mysql = require('mysql2/promise'); // Use promise wrapper
const fs = require('fs');
const { Readable } = require('stream');
const cors = require('cors');
const db = require('./db');       // Make sure this path is correct for your project
const logger = require('./logger'); // Make sure this path is correct for your project

const port = process.env.API_PORT || 3001;


// --- Configure Winston Logger ---
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(({ level, message, timestamp, stack }) => {
        return `${timestamp} ${level}: ${stack || message}`;
      })
  ),
  transports: [
    // --- Transport 1: Logging to Files ---
    new winston.transports.File({ filename: path.join(logDirectory, 'error.log'), level: 'error' }), // Errors go here
    new winston.transports.File({ filename: path.join(logDirectory, 'combined.log') }) // All info/warn/error go here
  ],
});

// --- Transport 2: Logging to Console (Conditional) ---
// If not in production, add the Console transport
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({ // <<< This adds console output
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple() // Simple format for console
    )
  }));
}
// --- End Winston Configuration ---

// --- How to Use It ---
// Now, whenever you want to log something to BOTH file and console (in dev):
logger.info("This message goes to console AND combined.log");
logger.warn("This warning goes to console AND combined.log");
logger.error("This error goes to console, combined.log, AND error.log");

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
        logger.info("Attempting to create MySQL connection pool...");
        pool = mysql.createPool(dbConfig); // Create the pool

        // Optional: Test connection by getting and releasing one connection
        const connection = await pool.getConnection();
        logger.info("✅ MySQL connection test successful! Releasing test connection.");
        connection.release(); // IMPORTANT: Release the connection back to the pool

        logger.info("MySQL Pool ready.");
        return pool; // Return the pool itself
    } catch (err) {
        logger.error("❌ MySQL connection pool creation failed:", err.message);
        // Log details based on MySQL error codes if needed
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

// --- Multer Setup (for handling file uploads) ---
// Configure multer to store uploaded files temporarily (e.g., in an 'uploads/' folder)

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'uploads/' });


// --- REPLACE your existing '/api/upload-csv' route with THIS ---
app.post('/api/upload-csv', upload.single('csvFile'), async (req, res) => {
    const filePath = req.file.path;
    const { uploadOption, templateType } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    // --- Reusable validation function ---
    const validateRow = async (row, rowIndex) => {
        const project = row[0];
        const phasecode = row[1];
        const year = parseInt(row[2], 10);

        if (!project || !phasecode) {
            return { isValid: false, error: `Row ${rowIndex + 1}: Project and Phasecode cannot be empty.` };
        }
        if (isNaN(year) || year < 2011) {
            return { isValid: false, error: `Row ${rowIndex + 1}: Invalid or missing Year (must be 2011 or later).` };
        }

        try {
            const [results] = await db.promise().query(
                'SELECT 1 FROM `re.project_phase_validation` WHERE project = ? AND phasecode = ?',
                [project, phasecode]
            );
            if (results.length === 0) {
                 return { isValid: false, error: `Row ${rowIndex + 1}: Project/Phasecode combination not found.` };
            }
        } catch (dbError) {
            logger.error('Database validation error:', dbError);
            return { isValid: false, error: `Row ${rowIndex + 1}: Database error during validation.` };
        }
        
        return { isValid: true, error: null };
    };

    const results = [];
    const errors = [];
    const recordsToInsert = [];
    let rowCounter = 0;

    const fileStream = fs.createReadStream(filePath);

    // Process the CSV
    fileStream
        .pipe(csv({ headers: false }))
        .on('data', async (row) => {
            fileStream.pause(); // Pause stream to wait for async validation
            
            // --- FIX: Skip the header row (the first row) ---
            if (rowCounter === 0) {
                rowCounter++;
                fileStream.resume();
                return;
            }

            const rowIndex = rowCounter++;
            const validationResult = await validateRow(row, rowIndex);

            if (!validationResult.isValid) {
                errors.push(validationResult.error);
                fileStream.resume();
                return;
            }

            const project = row[0];
            const phasecode = row[1];
            const year = parseInt(row[2], 10);
            
            if (uploadOption === 'poc' && templateType === 'short') {
                const pocValue = row[3]; // Column D
                if (pocValue !== null && pocValue.trim() !== '') {
                    // For short template, assume month is 1, or adjust as needed
                    recordsToInsert.push([project, phasecode, year, 1, pocValue]); 
                } else {
                    errors.push(`Row ${rowIndex + 1}: No POC value found in short template.`);
                }
            } else if (uploadOption === 'poc' && templateType === 'long') {
                let hasMonthData = false;
                for (let i = 0; i < 12; i++) {
                    const month = i + 1;
                    const pocValue = row[i + 3]; // Columns D-O are indices 3-14
                    if (pocValue !== null && pocValue.trim() !== '') {
                        hasMonthData = true;
                        recordsToInsert.push([project, phasecode, year, month, pocValue]);
                    }
                }
                if (!hasMonthData) {
                    errors.push(`Row ${rowIndex + 1}: No POC data found in any month column for long template.`);
                }
            }
            fileStream.resume();
        })
        .on('end', async () => {
            fs.unlinkSync(filePath); // Clean up uploaded file

            const processedRowCount = rowCounter > 0 ? rowCounter -1 : 0;

            if (recordsToInsert.length === 0) {
                return res.status(400).json({
                    message: `Upload finished. No valid data found to process. ${errors.length > 0 ? 'See errors below.' : ''}`,
                    totalRowsProcessed: processedRowCount,
                    totalInserted: 0,
                    totalUpdated: 0,
                    totalErrors: errors.length,
                    summary: [],
                    errors: errors 
                });
            }

            const query = 'INSERT INTO pocpermonth (project, phasecode, year, month, value) VALUES ? ON DUPLICATE KEY UPDATE value = VALUES(value)';

            try {
                const [result] = await db.promise().query(query, [recordsToInsert]);
                res.status(200).json({
                    message: 'CSV processed successfully.',
                    totalRowsProcessed: processedRowCount,
                    totalInserted: result.affectedRows - result.warningStatus,
                    totalUpdated: result.warningStatus,
                    totalErrors: errors.length,
                    summary: [], // This can be enhanced later if needed
                    errors: errors
                });
            } catch (dbError) {
                logger.error('Bulk insert failed:', dbError);
                res.status(500).json({ message: 'Failed to save data to the database.', error: dbError.message });
            }
        })
        .on('error', (error) => {
            fs.unlinkSync(filePath);
            logger.error('CSV parsing error:', error);
            res.status(500).json({ message: 'Error parsing CSV file.' });
        });
});
// api/upload-csv ends here //



// Data Display
// --- MODIFY your existing GET /api/pocdata route in server.cjs ---


app.get('/api/pocdata', async (req, res) => {
  // Extract query parameters
  const { project, phasecode, year } = req.query; // e.g., /api/pocdata?project=A&year=2024
  logger.info('Received request for /api/pocdata with filters:', req.query);

  let connection;
  try {
      connection = await pool.getConnection(); // Use your 'pool' variable

      // --- Build SQL Query Dynamically ---
      let baseSql = 'SELECT ID, project, phasecode, year, month, value, timestampC, userC, timestampM, userM FROM re.pocpermonth';
      const whereClauses = [];
      const params = [];

      if (project) {
          whereClauses.push('project = ?');
          params.push(project);
      }
      if (phasecode) {
          whereClauses.push('phasecode = ?');
          params.push(phasecode);
      }
      if (year) {
          // Assuming single year for now. Range needs different logic.
          whereClauses.push('year = ?');
          params.push(parseInt(year, 10)); // Ensure year is treated as a number
      }

      let sqlQuery = baseSql;
      if (whereClauses.length > 0) {
          sqlQuery += ' WHERE ' + whereClauses.join(' AND ');
      }
      sqlQuery += ' ORDER BY project, phasecode, year DESC, month'; // Added DESC for year
      // --- End Query Building ---

      logger.info('Executing SQL:', sqlQuery);
      logger.info('With Params:', params);

      const [rows] = await connection.execute(sqlQuery, params); // Execute with dynamic query and params

      logger.info(`Fetched ${rows.length} rows from pocpermonth.`);
      res.status(200).json(rows);

  } catch (error) {
      logger.error('Error fetching data from pocpermonth:', error);
      res.status(500).json({ message: 'Failed to fetch data from database.', error: error.message });
  } finally {
      if (connection) {
          logger.info('Releasing database connection for /api/pocdata');
          connection.release();
      }
  }
}); // <<<< Route handler ENDS here >>>>

// --- End of GET route definition ---

// Data display option start
// --- Add this NEW route definition in server.cjs ---

app.get('/api/pocdata/options', async (req, res) => {
  logger.info('Received request for /api/pocdata/options');
  let connection;
  try {
      connection = await pool.getConnection(); // Use your connection pool variable 'pool'

      // Fetch distinct values in parallel
      const [projectRows] = await connection.execute('SELECT DISTINCT project FROM re.pocpermonth ORDER BY project');
      const [phasecodeRows] = await connection.execute('SELECT DISTINCT phasecode FROM re.pocpermonth ORDER BY phasecode');
      const [yearRows] = await connection.execute('SELECT DISTINCT year FROM re.pocpermonth ORDER BY year DESC'); // Order years descending

      // Extract values into simple arrays
      const projects = projectRows.map(row => row.project);
      const phasecodes = phasecodeRows.map(row => row.phasecode);
      const years = yearRows.map(row => row.year);

      res.status(200).json({ projects, phasecodes, years });

  } catch (error) {
      logger.error('Error fetching filter options:', error);
      res.status(500).json({ message: 'Failed to fetch filter options.', error: error.message });
  } finally {
      if (connection) {
          connection.release();
      }
  }
});

// Data display option end

// --- Error Handling Middleware (Remains the same) ---
app.use((err, req, res, next) => { /* ... same ... */ });


app.get('/api/db-status', async (req, res) => {
    logger.info('Received request for /api/db-status'); // Add a log to see if it's hit
  
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
        logger.info('DB status check successful.');
        res.json({ status: 'connected', message: 'Database connection verified.' });
      } else {
        logger.error('DB status check returned false (connection failed).');
        // Send a server error status code (e.g., 503 Service Unavailable)
        res.status(503).json({ status: 'error', message: 'Database connection failed.' });
      }
    } catch (error) {
      // Catch errors from your DB checking logic
      logger.error('Error occurred during DB status check:', error);
      // Send a server error status code (e.g., 500 Internal Server Error)
      res.status(500).json({ status: 'error', message: 'Server error during DB check.' });
    }
  });
  
  // --- End of route definition ---

  // --- Add this NEW route in server.cjs ---
// Make sure app.use(express.json()) middleware is applied earlier
app.post('/api/log', (req, res) => {
  const { level = 'info', message = '', component = 'frontend', ...meta } = req.body;
  const logData = { component, ...meta }; // Include component name and any extra details

  // Use the backend logger to record the frontend log
  // Ensure level is valid for winston or map it
  const validLevel = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'].includes(level) ? level : 'info';
  logger.log(validLevel, `[Frontend] ${message}`, logData);

  res.sendStatus(204); // Send "No Content" success response
});

// --- Start Server Function (Remains the same, calls new connectToDatabase) ---
async function startServer() {
    await connectToDatabase(); // Will now create MySQL pool
    app.listen(port, () => { /* ... same ... */ });
}

startServer();