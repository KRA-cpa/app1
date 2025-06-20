// routes/uploadRoutes.cjs - FIXED VERSION
// Properly handles async operations in CSV processing and Manual entry


const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { getPool } = require('../config/db.cjs');
const logger = require('../config/logger.cjs');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Helper function to validate and convert MM/DD/YYYY to YYYY-MM-DD
const parseAndValidateDate = (dateStr) => {
    const mmddyyyyRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = dateStr.match(mmddyyyyRegex);

    if (!match) {
        return { isValid: false, error: 'Invalid date format. Expected MM/DD/YYYY format.' };
    }

    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (month < 1 || month > 12) {
        return { isValid: false, error: `Invalid month (${month}). Must be 1-12.` };
    }

    if (day < 1 || day > 31) {
        return { isValid: false, error: `Invalid day (${day}). Must be 1-31.` };
    }

    const date = new Date(year, month - 1, day);

    if (date.getFullYear() !== year || date.getMonth() !== (month - 1) || date.getDate() !== day) {
        return { isValid: false, error: `Invalid date: ${dateStr}. Please check the date is valid.` };
    }

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    if (day !== lastDayOfMonth) {
        return { isValid: false, error: `Date ${dateStr} is not a month-end date. Expected last day of ${month}/${year} which is ${month}/${lastDayOfMonth}/${year}.` };
    }

    const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return { isValid: true, formattedDate };
};

// Helper function to determine if POC should be Actual (A) or Projected (P)
const getPocType = (year, month, cutoffDate) => {
    if (!cutoffDate) return 'A';

    const cutoffDateObj = new Date(cutoffDate);
    const cutoffYear = cutoffDateObj.getFullYear();
    const cutoffMonth = cutoffDateObj.getMonth() + 1;

    if (year < cutoffYear) {
        return 'A';
    } else if (year === cutoffYear && month <= cutoffMonth) {
        return 'A';
    } else {
        return 'P';
    }
};

// Helper function to read and parse CSV completely before processing
const parseCSVFile = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        const stream = fs.createReadStream(filePath);
        
        stream
            .pipe(csv({ headers: false }))
            .on('data', (row) => {
                results.push(row);
            })
            .on('end', () => {
                resolve(results);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
};

// Validation function for POC data
const validatePocRow = async (row, rowIndex, cocode, pool) => {
    const project = row[0]?.toString().trim();
    const phasecode = row[1]?.toString().trim();
    const year = parseInt(row[2], 10);

    if (!project) {
        return { isValid: false, error: `Row ${rowIndex + 1}: Project cannot be empty.` };
    }
    if (isNaN(year) || year < 2011) {
        return { isValid: false, error: `Row ${rowIndex + 1}: Invalid or missing Year (must be 2011 or later).` };
    }

    try {
        let validationQuery;
        let queryParams;

        if (phasecode === '') {
            validationQuery = `
                SELECT 1 FROM \`project_phase_validation\`
                WHERE project = ?
                AND (phasecode IS NULL OR phasecode = '')
                AND cocode = ?`;
            queryParams = [project, cocode];
        } else {
            validationQuery = `
                SELECT 1 FROM \`project_phase_validation\`
                WHERE project = ? AND phasecode = ? AND cocode = ?`;
            queryParams = [project, phasecode, cocode];
        }

        const [results] = await pool.query(validationQuery, queryParams);

        if (results.length === 0) {
            return { isValid: false, error: `Row ${rowIndex + 1}: Project '${project}' with Phasecode '${phasecode}' not found for company ${cocode}.` };
        }
    } catch (dbError) {
        logger.error('Database validation error for POC:', dbError);
        return { isValid: false, error: `Row ${rowIndex + 1}: Database error during validation.` };
    }

    return { isValid: true, error: null };
};

// Validation function for Completion Date data
const validateCompletionRow = async (row, rowIndex, cocode, pool) => {
    const project = row[0]?.toString().trim();
    const phasecode = row[1]?.toString().trim();
    const completionDate = row[2]?.toString().trim();

    if (!project) {
        return { isValid: false, error: `Row ${rowIndex + 1}: Project cannot be empty.` };
    }

    if (!completionDate) {
        return { isValid: false, error: `Row ${rowIndex + 1}: Completion date cannot be empty.` };
    }

    const dateValidation = parseAndValidateDate(completionDate);
    if (!dateValidation.isValid) {
        return { isValid: false, error: `Row ${rowIndex + 1}: ${dateValidation.error}` };
    }

    try {
        let validationQuery;
        let queryParams;

        if (phasecode === '') {
            validationQuery = `
                SELECT 1 FROM \`project_phase_validation\`
                WHERE project = ?
                AND (phasecode IS NULL OR phasecode = '')
                AND cocode = ?`;
            queryParams = [project, cocode];
        } else {
            validationQuery = `
                SELECT 1 FROM \`project_phase_validation\`
                WHERE project = ? AND phasecode = ? AND cocode = ?`;
            queryParams = [project, phasecode, cocode];
        }

        const [results] = await pool.query(validationQuery, queryParams);

        if (results.length === 0) {
            return { isValid: false, error: `Row ${rowIndex + 1}: Project '${project}' with Phasecode '${phasecode}' not found for company ${cocode}.` };
        }
    } catch (dbError) {
        logger.error('Database validation error for Completion Date:', dbError);
        return { isValid: false, error: `Row ${rowIndex + 1}: Database error during validation.` };
    }

    return { isValid: true, error: null, formattedDate: dateValidation.formattedDate };
};

// Main upload route
router.post('/upload-csv', upload.single('csvFile'), async (req, res) => {
    const filePath = req.file.path;
    
    // ✅ FIXED: Properly extract source parameter and set up tracking
    const { uploadOption, templateType, completionType, cocode, cutoffDate, source } = req.body;
    
    // ✅ FIXED: Source tracking variables properly placed inside route handler
    const uploadSource = source === 'manual_entry' ? 'Manual Entry Form' : 'CSV File Upload';
    const logPrefix = source === 'manual_entry' ? '[MANUAL]' : '[CSV]';

    // ✅ FIXED: Enhanced logging with source information
    logger.info(`${logPrefix} Upload request received - Option: ${uploadOption}, Cocode: ${cocode}, CompletionType: ${completionType}, CutoffDate: ${cutoffDate}, Source: ${uploadSource}`);

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    if (!cocode) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'Company code (cocode) is required for upload.' });
    }

    if (uploadOption === 'poc' && !cutoffDate) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'Cut-off date is required for POC uploads to determine Actual vs Projected classification.' });
    }

    const pool = getPool();
    if (!pool) {
        fs.unlinkSync(filePath);
        return res.status(503).json({ message: 'Database not connected. Please try again later.' });
    }

    try {
        // Step 1: Parse the entire CSV file first
        logger.info(`${logPrefix} Starting CSV parsing...`);
        const csvRows = await parseCSVFile(filePath);
        
        // Remove the file immediately after reading
        fs.unlinkSync(filePath);
        
        // Step 2: Skip header row and process data rows
        const dataRows = csvRows.slice(1); // Skip header row
        logger.info(`${logPrefix} CSV parsed successfully. Processing ${dataRows.length} data rows...`);

        // Step 3: Process all rows sequentially with proper async handling
        const recordsToInsert = [];
        const errors = [];

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const rowIndex = i + 1; // +1 because we skipped header, so row 1 is first data row

            let validationResult;

            if (uploadOption === 'poc') {
                validationResult = await validatePocRow(row, rowIndex, cocode, pool);
            } else if (uploadOption === 'date') {
                validationResult = await validateCompletionRow(row, rowIndex, cocode, pool);
            } else {
                errors.push(`Row ${rowIndex + 1}: Unknown upload option: ${uploadOption}`);
                continue;
            }

            if (!validationResult.isValid) {
                errors.push(validationResult.error);
                continue;
            }

            const project = row[0]?.toString().trim();
            const phasecode = row[1]?.toString().trim();

            if (uploadOption === 'poc') {
                const year = parseInt(row[2], 10);

                if (templateType === 'short') {
                    const month = parseInt(row[3], 10);
                    const pocValue = row[4];

                    if (isNaN(month) || month < 1 || month > 12) {
                        errors.push(`Row ${rowIndex + 1}: Invalid or missing Month (must be 1-12).`);
                        continue;
                    }

                    if (pocValue !== null && pocValue.toString().trim() !== '') {
                        const pocType = getPocType(year, month, cutoffDate);
                        recordsToInsert.push([cocode, project, phasecode, year, month, pocValue, pocType]);
                        logger.info(`${logPrefix} POC Type determined for ${project}-${phasecode} ${year}/${month}: ${pocType} (cutoff: ${cutoffDate})`);
                    } else {
                        errors.push(`Row ${rowIndex + 1}: No POC value found for month ${month}.`);
                    }
                } else if (templateType === 'long') {
                    let hasMonthData = false;
                    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
                        const month = monthIndex + 1;
                        const pocValue = row[monthIndex + 3];
                        if (pocValue !== null && pocValue.toString().trim() !== '') {
                            hasMonthData = true;
                            const pocType = getPocType(year, month, cutoffDate);
                            recordsToInsert.push([cocode, project, phasecode, year, month, pocValue, pocType]);
                            logger.info(`${logPrefix} POC Type determined for ${project}-${phasecode} ${year}/${month}: ${pocType} (cutoff: ${cutoffDate})`);
                        }
                    }
                    if (!hasMonthData) {
                        errors.push(`Row ${rowIndex + 1}: No POC data found in any month column for long template.`);
                    }
                }
            } else if (uploadOption === 'date') {
                const completionDate = validationResult.formattedDate;
                const type = completionType || 'A';
                recordsToInsert.push([cocode, project, phasecode, type, completionDate, new Date()]);
            }
        }

        logger.info(`${logPrefix} Validation completed. Records to insert: ${recordsToInsert.length}, Errors: ${errors.length}`);

        if (recordsToInsert.length === 0) {
            return res.status(400).json({
                message: 'No valid data found to upload.',
                totalRowsProcessed: dataRows.length,
                totalErrors: errors.length,
                errors: errors,
                source: uploadSource // ✅ FIXED: Include source in response
            });
        }

        // Step 4: Insert records in a transaction for data consistency
        await pool.query('START TRANSACTION');

        try {
            let query;
            if (uploadOption === 'poc') {
                query = `INSERT INTO \`pocpermonth\` (cocode, project, phasecode, year, month, value, type) 
                         VALUES ? 
                         ON DUPLICATE KEY UPDATE 
                            value = VALUES(value), 
                            type = VALUES(type), 
                            timestampM = CURRENT_TIMESTAMP, 
                            userM = "${uploadSource}"`;  // ✅ FIXED: Track source in userM field
            } else if (uploadOption === 'date') {
                query = `INSERT INTO pcompdate (cocode, project, phasecode, type, completion_date, created_at) 
                         VALUES ? 
                         ON DUPLICATE KEY UPDATE 
                            completion_date = VALUES(completion_date), 
                            type = VALUES(type)`;
            }

            const [result] = await pool.query(query, [recordsToInsert]);
            await pool.query('COMMIT');

            logger.info(`${logPrefix} Database insertion completed - Affected rows: ${result.affectedRows}, Changed rows: ${result.changedRows || 0}`);

            // Create summary by project/phase for response
            const summary = {};
            recordsToInsert.forEach(record => {
                const key = `${record[1]}-${record[2]}`;
                if (!summary[key]) {
                    summary[key] = {
                        project: record[1],
                        phasecode: record[2],
                        inserted: 0,
                        updated: 0,
                        actualCount: 0,
                        projectedCount: 0,
                        completionType: uploadOption === 'date' ? (completionType || 'A') : null
                    };
                }
                summary[key].inserted++;

                if (uploadOption === 'poc' && record[6]) {
                    if (record[6] === 'A') {
                        summary[key].actualCount++;
                    } else if (record[6] === 'P') {
                        summary[key].projectedCount++;
                    }
                }

                if (uploadOption === 'date') {
                    summary[key].completionType = record[3];
                }
            });

            // ✅ FIXED: Enhanced response message with source information
            let responseMessage = `${uploadSource} processed successfully. ${uploadOption === 'poc' ? 'POC data' : 'Completion dates'} uploaded for company ${cocode}.`;
            if (uploadOption === 'poc') {
                const totalActual = Object.values(summary).reduce((sum, item) => sum + item.actualCount, 0);
                const totalProjected = Object.values(summary).reduce((sum, item) => sum + item.projectedCount, 0);
                responseMessage += ` Classification: ${totalActual} Actual, ${totalProjected} Projected (based on cut-off date ${cutoffDate}).`;
            } else if (uploadOption === 'date') {
                const totalRecords = recordsToInsert.length;
                const typeText = completionType === 'A' ? 'Actual' : 'Projected';
                responseMessage += ` All ${totalRecords} completion dates marked as ${typeText}.`;
            }

            res.status(200).json({
                message: responseMessage,
                totalRowsProcessed: dataRows.length,
                totalInserted: result.affectedRows - (result.changedRows || 0),
                totalUpdated: result.changedRows || 0,
                totalErrors: errors.length,
                summary: Object.values(summary),
                cutoffDate: cutoffDate,
                completionType: completionType,
                source: uploadSource, // ✅ FIXED: Include source in response
                errors: errors
            });

        } catch (dbError) {
            await pool.query('ROLLBACK');
            throw dbError;
        }

    } catch (error) {
        // Ensure file is cleaned up even if there's an error
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        logger.error(`${logPrefix} Upload processing error:`, error);
        res.status(500).json({
            message: 'Error processing upload.',
            error: error.message,
            source: uploadSource // ✅ FIXED: Include source in error response
        });
    }
});

module.exports = router;