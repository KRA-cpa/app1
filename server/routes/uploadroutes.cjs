// routes/uploadRoutes.cjs
// Completion Date upload activated + project is flowing through
// Actual/Projected added

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
    // Handle MM/DD/YYYY format (from Excel)
    const mmddyyyyRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = dateStr.match(mmddyyyyRegex);
    
    if (!match) {
        return { isValid: false, error: 'Invalid date format. Use MM/DD/YYYY.' };
    }
    
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    
    // Basic validation
    if (month < 1 || month > 12) {
        return { isValid: false, error: 'Invalid month (must be 1-12).' };
    }
    
    if (day < 1 || day > 31) {
        return { isValid: false, error: 'Invalid day.' };
    }
    
    // Create date object to validate and check if it's month-end
    const date = new Date(year, month - 1, day);
    
    // Check if the date is valid
    if (date.getFullYear() !== year || date.getMonth() !== (month - 1) || date.getDate() !== day) {
        return { isValid: false, error: 'Invalid date.' };
    }
    
    // Check if it's a month-end date
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    if (day !== lastDayOfMonth) {
        return { isValid: false, error: 'Completion date must be a month-end date.' };
    }
    
    // Convert to YYYY-MM-DD format for database storage
    const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    
    return { isValid: true, formattedDate };
};

// Helper function to determine if POC should be Actual (A) or Projected (P) based on cut-off date
const getPocType = (year, month, cutoffDate) => {
    if (!cutoffDate) return 'A'; // Default to Actual if no cutoff date
    
    const cutoffDateObj = new Date(cutoffDate);
    const cutoffYear = cutoffDateObj.getFullYear();
    const cutoffMonth = cutoffDateObj.getMonth() + 1; // getMonth() returns 0-11
    
    // Compare year and month with cutoff
    if (year < cutoffYear) {
        return 'A'; // Actual - year is before cutoff year
    } else if (year === cutoffYear && month <= cutoffMonth) {
        return 'A'; // Actual - same year but month is equal or before cutoff month
    } else {
        return 'P'; // Projected - year/month is after cutoff
    }
};

// --- Combined Route for both 'pocpermonth' and 'pcompdate' tables ---
router.post('/upload-csv', upload.single('csvFile'), async (req, res) => {
    const filePath = req.file.path;
    const { uploadOption, templateType, completionType, cocode, cutoffDate } = req.body;

    // Debug logging to ensure all parameters are received
    logger.info(`Upload request received - Option: ${uploadOption}, Cocode: ${cocode}, CompletionType: ${completionType}, CutoffDate: ${cutoffDate}`);

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

    // Validation function for POC data
    const validatePocRow = async (row, rowIndex) => {
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
            const [results] = await pool.query(
                'SELECT 1 FROM `re.project_phase_validation` WHERE project = ? AND phasecode = ? AND cocode = ?',
                [project, phasecode, cocode]
            );
            if (results.length === 0) {
                 return { isValid: false, error: `Row ${rowIndex + 1}: Project/Phasecode combination not found for company ${cocode}.` };
            }
        } catch (dbError) {
            logger.error('Database validation error:', dbError);
            return { isValid: false, error: `Row ${rowIndex + 1}: Database error during validation.` };
        }
        
        return { isValid: true, error: null };
    };

    // Validation function for Completion Date data
    const validateCompletionRow = async (row, rowIndex) => {
        const project = row[0];
        const phasecode = row[1];
        const completionDate = row[2];

        if (!project || !phasecode) {
            return { isValid: false, error: `Row ${rowIndex + 1}: Project and Phasecode cannot be empty.` };
        }

        if (!completionDate) {
            return { isValid: false, error: `Row ${rowIndex + 1}: Completion date cannot be empty.` };
        }

        const dateValidation = parseAndValidateDate(completionDate.toString().trim());
        if (!dateValidation.isValid) {
            return { isValid: false, error: `Row ${rowIndex + 1}: ${dateValidation.error}` };
        }

        try {
            const [results] = await pool.query(
                'SELECT 1 FROM `re.project_phase_validation` WHERE project = ? AND phasecode = ? AND cocode = ?',
                [project, phasecode, cocode]
            );
            if (results.length === 0) {
                 return { isValid: false, error: `Row ${rowIndex + 1}: Project/Phasecode combination not found for company ${cocode}.` };
            }
        } catch (dbError) {
            logger.error('Database validation error:', dbError);
            return { isValid: false, error: `Row ${rowIndex + 1}: Database error during validation.` };
        }
        
        return { isValid: true, error: null, formattedDate: dateValidation.formattedDate };
    };

    const results = [];
    const errors = [];
    const recordsToInsert = [];
    let rowCounter = 0;
    const fileStream = fs.createReadStream(filePath);

    fileStream
        .pipe(csv({ headers: false }))
        .on('data', async (row) => {
            fileStream.pause();
            
            if (rowCounter === 0) { // Skip header row
                rowCounter++;
                fileStream.resume();
                return;
            }

            const rowIndex = rowCounter++;
            let validationResult;

            if (uploadOption === 'poc') {
                validationResult = await validatePocRow(row, rowIndex);
            } else if (uploadOption === 'date') {
                validationResult = await validateCompletionRow(row, rowIndex);
            } else {
                errors.push(`Row ${rowIndex + 1}: Unknown upload option: ${uploadOption}`);
                fileStream.resume();
                return;
            }

            if (!validationResult.isValid) {
                errors.push(validationResult.error);
                fileStream.resume();
                return;
            }

            const project = row[0];
            const phasecode = row[1];

            if (uploadOption === 'poc') {
                const year = parseInt(row[2], 10);
                
                if (templateType === 'short') {
                    const pocValue = row[3];
                    if (pocValue !== null && pocValue.trim() !== '') {
                        // Determine POC type based on cut-off date (month 1 for short template)
                        const pocType = getPocType(year, 1, cutoffDate);
                        recordsToInsert.push([cocode, project, phasecode, year, 1, pocValue, pocType]);
                        
                        // Debug logging for POC type determination
                        logger.info(`POC Type determined for ${project}-${phasecode} ${year}/1: ${pocType} (cutoff: ${cutoffDate})`);
                    } else {
                        errors.push(`Row ${rowIndex + 1}: No POC value found in short template.`);
                    }
                } else if (templateType === 'long') {
                    let hasMonthData = false;
                    for (let i = 0; i < 12; i++) {
                        const month = i + 1;
                        const pocValue = row[i + 3];
                        if (pocValue !== null && pocValue.trim() !== '') {
                            hasMonthData = true;
                            // Determine POC type based on cut-off date for each month
                            const pocType = getPocType(year, month, cutoffDate);
                            recordsToInsert.push([cocode, project, phasecode, year, month, pocValue, pocType]);
                            
                            // Debug logging for POC type determination
                            logger.info(`POC Type determined for ${project}-${phasecode} ${year}/${month}: ${pocType} (cutoff: ${cutoffDate})`);
                        }
                    }
                    if (!hasMonthData) {
                        errors.push(`Row ${rowIndex + 1}: No POC data found in any month column for long template.`);
                    }
                }
            } else if (uploadOption === 'date') {
                const completionDate = validationResult.formattedDate; // Use the formatted date from validation
                const type = completionType || 'A'; // Default to Actual
                recordsToInsert.push([cocode, project, phasecode, type, completionDate]);
            }

            fileStream.resume();
        })
        .on('end', async () => {
            fs.unlinkSync(filePath);
            const processedRowCount = rowCounter > 0 ? rowCounter - 1 : 0;

            if (recordsToInsert.length === 0) {
                return res.status(400).json({
                    message: `Upload finished. No valid data found to process. ${errors.length > 0 ? 'See errors below.' : ''}`,
                    totalRowsProcessed: processedRowCount,
                    totalInserted: 0,
                    totalUpdated: 0,
                    totalErrors: errors.length,
                    errors: errors 
                });
            }

            let query;
            if (uploadOption === 'poc') {
                // Updated query to include POC type
                query = 'INSERT INTO `re.pocpermonth` (cocode, project, phasecode, year, month, value, type) VALUES ? ON DUPLICATE KEY UPDATE value = VALUES(value), type = VALUES(type), timestampM = CURRENT_TIMESTAMP, userM = "CSV_UPLOAD"';
            } else if (uploadOption === 'date') {
                query = 'INSERT INTO `re.pcompdate` (cocode, project, phasecode, type, completion_date) VALUES ? ON DUPLICATE KEY UPDATE completion_date = VALUES(completion_date), created_at = CURRENT_TIMESTAMP';
            }

            try {
                const [result] = await pool.query(query, [recordsToInsert]);
                
                // Debug logging for database insertion
                logger.info(`Database insertion completed - Affected rows: ${result.affectedRows}, Changed rows: ${result.changedRows || 0}`);
                
                // Create summary by project/phase for response with POC type breakdown
                const summary = {};
                recordsToInsert.forEach(record => {
                    const key = `${record[1]}-${record[2]}`; // project-phasecode
                    if (!summary[key]) {
                        summary[key] = { 
                            project: record[1], 
                            phasecode: record[2], 
                            inserted: 0, 
                            updated: 0,
                            actualCount: 0,
                            projectedCount: 0
                        };
                    }
                    summary[key].inserted++; // This is a simplification
                    
                    // Count Actual vs Projected for POC uploads
                    if (uploadOption === 'poc' && record[6]) { // POC type is at index 6
                        if (record[6] === 'A') {
                            summary[key].actualCount++;
                        } else if (record[6] === 'P') {
                            summary[key].projectedCount++;
                        }
                    }
                });

                // Prepare response message based on upload type
                let responseMessage = `CSV processed successfully. ${uploadOption === 'poc' ? 'POC data' : 'Completion dates'} uploaded for company ${cocode}.`;
                if (uploadOption === 'poc') {
                    const totalActual = Object.values(summary).reduce((sum, item) => sum + item.actualCount, 0);
                    const totalProjected = Object.values(summary).reduce((sum, item) => sum + item.projectedCount, 0);
                    responseMessage += ` Classification: ${totalActual} Actual, ${totalProjected} Projected (based on cut-off date ${cutoffDate}).`;
                }

                res.status(200).json({
                    message: responseMessage,
                    totalRowsProcessed: processedRowCount,
                    totalInserted: result.affectedRows - (result.changedRows || 0),
                    totalUpdated: result.changedRows || 0,
                    totalErrors: errors.length,
                    summary: Object.values(summary),
                    cutoffDate: cutoffDate, // Include cutoff date in response
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

module.exports = router;