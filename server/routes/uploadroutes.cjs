// routes/uploadRoutes.cjs
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { getPool } = require('../config/db.cjs');
const logger = require('../config/logger.cjs');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// --- Route 1: For 'pocpermonth' table ---
router.post('/upload-csv', upload.single('csvFile'), async (req, res) => {
    const filePath = req.file.path;
    const { uploadOption, templateType } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    const pool = getPool();
    if (!pool) {
        return res.status(503).json({ message: 'Database not connected. Please try again later.' });
    }

    const validateRow = async (row, rowIndex) => {
        const project = row[0]; // [cite: 23]
        const phasecode = row[1]; // [cite: 23]
        const year = parseInt(row[2], 10);

        if (!project || !phasecode) {
            return { isValid: false, error: `Row ${rowIndex + 1}: Project and Phasecode cannot be empty.` };
        }
        if (isNaN(year) || year < 2011) {
            return { isValid: false, error: `Row ${rowIndex + 1}: Invalid or missing Year (must be 2011 or later).` }; // [cite: 24]
        }

        try {
            const [results] = await pool.query(
                'SELECT 1 FROM `re.project_phase_validation` WHERE project = ? AND phasecode = ?', // [cite: 25]
                [project, phasecode]
            );
            if (results.length === 0) {
                 return { isValid: false, error: `Row ${rowIndex + 1}: Project/Phasecode combination not found.` }; // [cite: 27]
            }
        } catch (dbError) {
            logger.error('Database validation error:', dbError); // [cite: 28]
            return { isValid: false, error: `Row ${rowIndex + 1}: Database error during validation.` }; // [cite: 29]
        }
        
        return { isValid: true, error: null }; // [cite: 30]
    };

    const results = [];
    const errors = [];
    const recordsToInsert = [];
    let rowCounter = 0; // [cite: 31]
    const fileStream = fs.createReadStream(filePath);

    fileStream
        .pipe(csv({ headers: false }))
        .on('data', async (row) => {
            fileStream.pause();
            
            if (rowCounter === 0) { // [cite: 32]
                rowCounter++;
                fileStream.resume();
                return;
            }

            const rowIndex = rowCounter++;
            const validationResult = await validateRow(row, rowIndex);

            if (!validationResult.isValid) { // [cite: 33]
                errors.push(validationResult.error);
                fileStream.resume();
                return;
            }

            const project = row[0]; // [cite: 34]
            const phasecode = row[1]; // [cite: 34]
            const year = parseInt(row[2], 10);
            
            if (uploadOption === 'poc' && templateType === 'short') {
                const pocValue = row[3]; // [cite: 35]
                if (pocValue !== null && pocValue.trim() !== '') {
                    recordsToInsert.push([project, phasecode, year, 1, pocValue]); // [cite: 36]
                } else {
                    errors.push(`Row ${rowIndex + 1}: No POC value found in short template.`); // [cite: 37]
                }
            } else if (uploadOption === 'poc' && templateType === 'long') {
                let hasMonthData = false; // [cite: 38]
                for (let i = 0; i < 12; i++) {
                    const month = i + 1; // [cite: 39]
                    const pocValue = row[i + 3];
                    if (pocValue !== null && pocValue.trim() !== '') {
                        hasMonthData = true; // [cite: 40]
                        recordsToInsert.push([project, phasecode, year, month, pocValue]);
                    }
                }
                if (!hasMonthData) {
                    errors.push(`Row ${rowIndex + 1}: No POC data found in any month column for long template.`); // [cite: 41]
                }
            }
            fileStream.resume(); // [cite: 42]
        })
        .on('end', async () => {
            fs.unlinkSync(filePath);
            const processedRowCount = rowCounter > 0 ? rowCounter - 1 : 0;

            if (recordsToInsert.length === 0) {
                return res.status(400).json({
                    message: `Upload finished. No valid data found to process. ${errors.length > 0 ? 'See errors below.' : ''}`, // [cite: 43]
                    totalRowsProcessed: processedRowCount,
                    totalInserted: 0,
                    totalUpdated: 0,
                    totalErrors: errors.length, // [cite: 44]
                    errors: errors 
                });
            }

            const query = 'INSERT INTO pocpermonth (project, phasecode, year, month, value) VALUES ? ON DUPLICATE KEY UPDATE value = VALUES(value)'; // [cite: 45]

            try {
                const [result] = await pool.query(query, [recordsToInsert]);
                res.status(200).json({
                    message: 'CSV processed successfully.',
                    totalRowsProcessed: processedRowCount, // [cite: 46]
                    totalInserted: result.affectedRows - result.warningStatus,
                    totalUpdated: result.warningStatus,
                    totalErrors: errors.length,
                    errors: errors // [cite: 47]
                });
            } catch (dbError) {
                logger.error('Bulk insert failed:', dbError); // [cite: 49]
                res.status(500).json({ message: 'Failed to save data to the database.', error: dbError.message }); // [cite: 50]
            }
        })
        .on('error', (error) => {
            fs.unlinkSync(filePath);
            logger.error('CSV parsing error:', error);
            res.status(500).json({ message: 'Error parsing CSV file.' });
        });
});

// --- Placeholder for a new upload function for a different table ---
/*
router.post('/upload-new-data', upload.single('dataFile'), async (req, res) => {
    logger.info("Received request to upload new data type");
    // 1. Add validation logic specific to the new table's columns.
    // 2. Process the file (e.g., CSV, JSON).
    // 3. Construct the SQL INSERT/UPDATE query for the new target table.
    // 4. Execute the query using the connection pool.
    // 5. Return a response to the client.
    res.status(501).json({ message: 'This endpoint is not yet implemented.' });
});
*/

module.exports = router;