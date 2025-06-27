// server/routes/salesRecognitionRoutes.cjs
// Backend routes for Sales Recognition CSV upload and manual entry

const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { getPool } = require('../config/db.cjs');
const logger = require('../config/logger.cjs');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Helper function to validate month-end dates considering leap years
const isMonthEndDate = (dateString) => {
    if (!dateString) return false;
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;
    
    // Get the next day
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);
    
    // If next day is the 1st, then current date is month-end
    return nextDay.getDate() === 1;
};

// Helper function to parse different date formats
const parseDate = (dateStr) => {
    if (!dateStr) return null;
    
    // Try MM/DD/YYYY format first
    const mmddyyyyRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const mmddMatch = dateStr.match(mmddyyyyRegex);
    
    if (mmddMatch) {
        const month = parseInt(mmddMatch[1], 10);
        const day = parseInt(mmddMatch[2], 10);
        const year = parseInt(mmddMatch[3], 10);
        
        // Validate date ranges
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        
        const date = new Date(year, month - 1, day);
        
        // Check if the date is valid (handles invalid dates like Feb 30)
        if (date.getFullYear() !== year || date.getMonth() !== (month - 1) || date.getDate() !== day) {
            return null;
        }
        
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    
    // Try YYYY-MM-DD format
    const yyyymmddRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
    const yyyymmddMatch = dateStr.match(yyyymmddRegex);
    
    if (yyyymmddMatch) {
        const year = parseInt(yyyymmddMatch[1], 10);
        const month = parseInt(yyyymmddMatch[2], 10);
        const day = parseInt(yyyymmddMatch[3], 10);
        
        // Validate date ranges
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        
        const date = new Date(year, month - 1, day);
        
        // Check if the date is valid
        if (date.getFullYear() !== year || date.getMonth() !== (month - 1) || date.getDate() !== day) {
            return null;
        }
        
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    
    return null;
};

// Comprehensive date validation
const validateSalesRecognitionDate = (dateString, cutoffDate, rowIndex = null) => {
    const prefix = rowIndex ? `Row ${rowIndex}: ` : '';
    
    if (!dateString) {
        return { isValid: false, error: `${prefix}Date is required` };
    }
    
    // Parse the date
    const parsedDate = parseDate(dateString.toString().trim());
    if (!parsedDate) {
        return { isValid: false, error: `${prefix}Invalid date format. Use MM/DD/YYYY or YYYY-MM-DD` };
    }
    
    // Check if it's month-end
    if (!isMonthEndDate(parsedDate)) {
        return { isValid: false, error: `${prefix}Date must be a month-end date (last day of the month)` };
    }
    
    // Check against cutoff date
    if (cutoffDate) {
        const date = new Date(parsedDate);
        const cutoffDateObj = new Date(cutoffDate);
        
        if (date > cutoffDateObj) {
            return { 
                isValid: false, 
                error: `${prefix}Date cannot be beyond cutoff date (${cutoffDate})` 
            };
        }
    }
    
    return { isValid: true, error: null, parsedDate };
};

// Parse CSV file helper
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

// CSV Upload Route
router.post('/upload-salesrecognition', upload.single('csvFile'), async (req, res) => {
    const filePath = req.file?.path;
    const { cutoffDate } = req.body;
    
    logger.info(`Sales Recognition CSV upload request received - CutoffDate: ${cutoffDate}`);
    
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    
    const pool = getPool();
    if (!pool) {
        fs.unlinkSync(filePath);
        return res.status(503).json({ message: 'Database not connected. Please try again later.' });
    }
    
    try {
        // Parse CSV file
        logger.info('Parsing Sales Recognition CSV file...');
        const csvRows = await parseCSVFile(filePath);
        
        // Remove the file after reading
        fs.unlinkSync(filePath);
        
        // Skip header row and process data
        const dataRows = csvRows.slice(1);
        logger.info(`Processing ${dataRows.length} Sales Recognition data rows...`);
        
        const recordsToProcess = [];
        const errors = [];
        
        // Validate all rows first
        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const rowIndex = i + 1; // Row number for user (excluding header)
            
            const accountNo = row[0]?.toString().trim();
            const dateValue = row[1]?.toString().trim();
            
            // Validate account number
            if (!accountNo) {
                errors.push(`Row ${rowIndex}: Account Number is required`);
                continue;
            }
            
            if (accountNo.length > 30) {
                errors.push(`Row ${rowIndex}: Account Number cannot exceed 30 characters`);
                continue;
            }
            
            // Validate date
            const dateValidation = validateSalesRecognitionDate(dateValue, cutoffDate, rowIndex);
            if (!dateValidation.isValid) {
                errors.push(dateValidation.error);
                continue;
            }
            
            recordsToProcess.push({
                accountNo: accountNo,
                date: dateValidation.parsedDate,
                rowIndex: rowIndex
            });
        }
        
        logger.info(`Validation completed. Records to process: ${recordsToProcess.length}, Errors: ${errors.length}`);
        
        if (recordsToProcess.length === 0) {
            return res.status(400).json({
                message: 'No valid data found to upload.',
                totalRowsProcessed: dataRows.length,
                totalInserted: 0,
                totalUpdated: 0,
                totalErrors: errors.length,
                errors: errors
            });
        }
        
        // Process records in database
        await pool.query('START TRANSACTION');
        
        try {
            const summary = [];
            let totalInserted = 0;
            let totalUpdated = 0;
            
            for (const record of recordsToProcess) {
                // Check if account already exists
                const [existingRows] = await pool.query(
                    'SELECT AccountNo FROM `SalesRecognition` WHERE AccountNo = ?',
                    [record.accountNo]
                );
                
                if (existingRows.length > 0) {
                    // Update existing record
                    await pool.query(
                        'UPDATE `SalesRecognition` SET `date` = ? WHERE AccountNo = ?',
                        [record.date, record.accountNo]
                    );
                    
                    summary.push({
                        accountNo: record.accountNo,
                        date: record.date,
                        action: 'Updated',
                        status: 'Success'
                    });
                    
                    totalUpdated++;
                } else {
                    // Insert new record
                    await pool.query(
                        'INSERT INTO `SalesRecognition` (AccountNo, `date`) VALUES (?, ?)',
                        [record.accountNo, record.date]
                    );
                    
                    summary.push({
                        accountNo: record.accountNo,
                        date: record.date,
                        action: 'Inserted',
                        status: 'Success'
                    });
                    
                    totalInserted++;
                }
            }
            
            await pool.query('COMMIT');
            
            logger.info(`Sales Recognition CSV upload completed - Inserted: ${totalInserted}, Updated: ${totalUpdated}`);
            
            res.status(200).json({
                message: `CSV upload successful! Processed ${recordsToProcess.length} records.`,
                totalRowsProcessed: dataRows.length,
                totalInserted: totalInserted,
                totalUpdated: totalUpdated,
                totalErrors: errors.length,
                summary: summary,
                errors: errors
            });
            
        } catch (dbError) {
            await pool.query('ROLLBACK');
            throw dbError;
        }
        
    } catch (error) {
        // Clean up file if it still exists
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        logger.error('Sales Recognition CSV upload error:', error);
        res.status(500).json({
            message: 'Error processing upload.',
            error: error.message
        });
    }
});

// Manual Entry Route
router.post('/manual-salesrecognition', async (req, res) => {
    const { entries, cutoffDate } = req.body;
    
    logger.info(`Sales Recognition manual entry request received - Entries: ${entries?.length}, CutoffDate: ${cutoffDate}`);
    
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ message: 'No entries provided.' });
    }
    
    const pool = getPool();
    if (!pool) {
        return res.status(503).json({ message: 'Database not connected. Please try again later.' });
    }
    
    try {
        const recordsToProcess = [];
        const errors = [];
        
        // Validate all entries
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const rowIndex = i + 1;
            
            const accountNo = entry.accountNo?.toString().trim();
            const dateValue = entry.date?.toString().trim();
            
            // Validate account number
            if (!accountNo) {
                errors.push(`Entry ${rowIndex}: Account Number is required`);
                continue;
            }
            
            if (accountNo.length > 30) {
                errors.push(`Entry ${rowIndex}: Account Number cannot exceed 30 characters`);
                continue;
            }
            
            // Validate date
            const dateValidation = validateSalesRecognitionDate(dateValue, cutoffDate, rowIndex);
            if (!dateValidation.isValid) {
                errors.push(dateValidation.error.replace(`Row ${rowIndex}:`, `Entry ${rowIndex}:`));
                continue;
            }
            
            recordsToProcess.push({
                accountNo: accountNo,
                date: dateValidation.parsedDate,
                entryIndex: rowIndex
            });
        }
        
        logger.info(`Manual entry validation completed. Records to process: ${recordsToProcess.length}, Errors: ${errors.length}`);
        
        if (recordsToProcess.length === 0) {
            return res.status(400).json({
                message: 'No valid entries to process.',
                totalRowsProcessed: entries.length,
                totalInserted: 0,
                totalUpdated: 0,
                totalErrors: errors.length,
                errors: errors
            });
        }
        
        // Process records in database
        await pool.query('START TRANSACTION');
        
        try {
            const summary = [];
            let totalInserted = 0;
            let totalUpdated = 0;
            
            for (const record of recordsToProcess) {
                // Check if account already exists
                const [existingRows] = await pool.query(
                    'SELECT AccountNo FROM `SalesRecognition` WHERE AccountNo = ?',
                    [record.accountNo]
                );
                
                if (existingRows.length > 0) {
                    // Update existing record
                    await pool.query(
                        'UPDATE `SalesRecognition` SET `date` = ? WHERE AccountNo = ?',
                        [record.date, record.accountNo]
                    );
                    
                    summary.push({
                        accountNo: record.accountNo,
                        date: record.date,
                        action: 'Updated',
                        status: 'Success'
                    });
                    
                    totalUpdated++;
                } else {
                    // Insert new record
                    await pool.query(
                        'INSERT INTO `SalesRecognition` (AccountNo, `date`) VALUES (?, ?)',
                        [record.accountNo, record.date]
                    );
                    
                    summary.push({
                        accountNo: record.accountNo,
                        date: record.date,
                        action: 'Inserted',
                        status: 'Success'
                    });
                    
                    totalInserted++;
                }
            }
            
            await pool.query('COMMIT');
            
            logger.info(`Sales Recognition manual entry completed - Inserted: ${totalInserted}, Updated: ${totalUpdated}`);
            
            res.status(200).json({
                message: `Manual entry successful! Processed ${recordsToProcess.length} entries.`,
                totalRowsProcessed: entries.length,
                totalInserted: totalInserted,
                totalUpdated: totalUpdated,
                totalErrors: errors.length,
                summary: summary,
                errors: errors
            });
            
        } catch (dbError) {
            await pool.query('ROLLBACK');
            throw dbError;
        }
        
    } catch (error) {
        logger.error('Sales Recognition manual entry error:', error);
        res.status(500).json({
            message: 'Error processing manual entries.',
            error: error.message
        });
    }
});

// Route to get Sales Recognition data (for potential reporting)
router.get('/salesrecognition-data', async (req, res) => {
    const { accountNo, dateFrom, dateTo, limit = 100 } = req.query;
    
    const pool = getPool();
    if (!pool) {
        return res.status(503).json({ message: 'Database not connected.' });
    }
    
    try {
        let query = 'SELECT AccountNo, `date` FROM `SalesRecognition`';
        const conditions = [];
        const params = [];
        
        if (accountNo) {
            conditions.push('AccountNo LIKE ?');
            params.push(`%${accountNo}%`);
        }
        
        if (dateFrom) {
            conditions.push('`date` >= ?');
            params.push(dateFrom);
        }
        
        if (dateTo) {
            conditions.push('`date` <= ?');
            params.push(dateTo);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY `date` DESC, AccountNo ASC';
        
        if (limit) {
            query += ' LIMIT ?';
            params.push(parseInt(limit, 10));
        }
        
        const [rows] = await pool.query(query, params);
        
        res.status(200).json({
            success: true,
            data: rows,
            count: rows.length
        });
        
    } catch (error) {
        logger.error('Error fetching Sales Recognition data:', error);
        res.status(500).json({
            message: 'Error fetching data.',
            error: error.message
        });
    }
});

module.exports = router;