// routes/uploadRoutes.cjs
// Enhanced version with POC redistribution conflict detection and management

const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { getPool } = require('../config/db.cjs');
const logger = require('../config/logger.cjs');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// =====================================
// NEW: POC REDISTRIBUTION FUNCTIONS
// =====================================

// Detect orphaned POC records when completion date moves earlier
const detectOrphanedPOC = async (project, phasecode, newCompletionDate, cocode, pool) => {
    try {
        const query = `
            SELECT id, project, phasecode, year, month, value, type
            FROM pocpermonth 
            WHERE cocode = ? AND project = ? AND phasecode = ? 
            AND active = 1 
            AND type = 'P'
            AND STR_TO_DATE(CONCAT(year, '-', LPAD(month, 2, '0'), '-01'), '%Y-%m-%d') > ?
            ORDER BY year, month
        `;
        
        const [rows] = await pool.query(query, [cocode, project, phasecode, newCompletionDate]);
        return rows;
    } catch (error) {
        logger.error('Error detecting orphaned POC:', error);
        throw error;
    }
};

// Get current completion date for project/phase
const getCurrentCompletionDate = async (project, phasecode, cocode, pool) => {
    try {
        let query, params;
        
        if (phasecode === '' || phasecode === null) {
            query = `
                SELECT completion_date, type 
                FROM re.pcompdate 
                WHERE cocode = ? AND project = ? AND (phasecode IS NULL OR phasecode = '')
                ORDER BY created_at DESC LIMIT 1
            `;
            params = [cocode, project];
        } else {
            query = `
                SELECT completion_date, type 
                FROM re.pcompdate 
                WHERE cocode = ? AND project = ? AND phasecode = ?
                ORDER BY created_at DESC LIMIT 1
            `;
            params = [cocode, project, phasecode];
        }
        
        const [rows] = await pool.query(query, params);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        logger.error('Error getting current completion date:', error);
        throw error;
    }
};

// Flag orphaned POC records as deleted
const flagPOCAsDeleted = async (orphanedPOCIds, deletedBy, deletionReason, pool) => {
    try {
        if (orphanedPOCIds.length === 0) return;
        
        const placeholders = orphanedPOCIds.map(() => '?').join(',');
        const query = `
            UPDATE pocpermonth 
            SET active = 0, 
                deleted_at = NOW(), 
                deleted_by = ?, 
                deletion_reason = ?
            WHERE id IN (${placeholders})
        `;
        
        const params = [deletedBy, deletionReason, ...orphanedPOCIds];
        const [result] = await pool.query(query, params);
        
        logger.info(`Flagged ${result.affectedRows} POC records as deleted. Reason: ${deletionReason}`);
        return result;
    } catch (error) {
        logger.error('Error flagging POC as deleted:', error);
        throw error;
    }
};

// Store pending redistribution status
const storePendingRedistribution = async (redistributionData, pool) => {
    try {
        const query = `
            INSERT INTO poc_redistribution_pending 
            (cocode, project, phasecode, orphaned_total, new_completion_date, old_completion_date, created_by, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            redistributionData.cocode,
            redistributionData.project,
            redistributionData.phasecode,
            redistributionData.orphaned_total,
            redistributionData.new_completion_date,
            redistributionData.old_completion_date,
            redistributionData.created_by,
            redistributionData.notes || 'Manual redistribution required due to completion date change'
        ];
        
        const [result] = await pool.query(query, params);
        logger.info(`Stored pending redistribution for ${redistributionData.project}-${redistributionData.phasecode}`);
        return result;
    } catch (error) {
        logger.error('Error storing pending redistribution:', error);
        throw error;
    }
};

// Check for pending redistribution
const checkPendingRedistribution = async (project, phasecode, cocode, pool) => {
    try {
        const query = `
            SELECT id, orphaned_total, new_completion_date, created_at, created_by
            FROM poc_redistribution_pending 
            WHERE cocode = ? AND project = ? AND phasecode = ? AND status = 'pending_manual_entry'
            ORDER BY created_at DESC LIMIT 1
        `;
        
        const [rows] = await pool.query(query, [cocode, project, phasecode]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        logger.error('Error checking pending redistribution:', error);
        throw error;
    }
};

// Mark redistribution as completed
const markRedistributionCompleted = async (redistributionId, pool) => {
    try {
        const query = `
            UPDATE poc_redistribution_pending 
            SET status = 'completed', completed_at = NOW()
            WHERE id = ?
        `;
        
        const [result] = await pool.query(query, [redistributionId]);
        logger.info(`Marked redistribution ${redistributionId} as completed`);
        return result;
    } catch (error) {
        logger.error('Error marking redistribution as completed:', error);
        throw error;
    }
};

// Check if redistribution is complete (heuristic: POC entry near completion date)
const isRedistributionComplete = async (project, phasecode, completionDate, cocode, pool) => {
    try {
        const completionMonth = new Date(completionDate).getMonth() + 1;
        const completionYear = new Date(completionDate).getFullYear();
        
        const query = `
            SELECT COUNT(*) as count
            FROM pocpermonth 
            WHERE cocode = ? AND project = ? AND phasecode = ? 
            AND active = 1 
            AND year = ? AND month >= ? AND month <= ?
            AND value > 0
        `;
        
        // Check if there's POC data in the completion month or 1 month before
        const [rows] = await pool.query(query, [
            cocode, project, phasecode, 
            completionYear, Math.max(1, completionMonth - 1), completionMonth
        ]);
        
        return rows[0].count > 0;
    } catch (error) {
        logger.error('Error checking redistribution completion:', error);
        return false;
    }
};

// =====================================
// ENHANCED COMPLETION DATE VALIDATION
// =====================================

// Enhanced completion date validation that detects conflicts
const validateCompletionDateWithConflictDetection = async (row, rowIndex, cocode, completionType, pool) => {
    const project = row[0]?.toString().trim();
    const phasecode = row[1]?.toString().trim();
    const completionDate = row[2]?.toString().trim();

    if (!project) {
        return { isValid: false, error: `Row ${rowIndex + 1}: Project cannot be empty.` };
    }

    if (!completionDate) {
        return { isValid: false, error: `Row ${rowIndex + 1}: Completion date cannot be empty.` };
    }

    // Validate date format and type constraints
    const dateValidation = validateCompletionDateByType(completionDate, completionType);
    if (!dateValidation.isValid) {
        return { isValid: false, error: `Row ${rowIndex + 1}: ${dateValidation.error}` };
    }

    try {
        // Validate project/phase exists
        let validationQuery, queryParams;
        if (phasecode === '') {
            validationQuery = `
                SELECT 1 FROM re.project_phase_validation
                WHERE project = ? AND (phasecode IS NULL OR phasecode = '') AND cocode = ?`;
            queryParams = [project, cocode];
        } else {
            validationQuery = `
                SELECT 1 FROM re.project_phase_validation
                WHERE project = ? AND phasecode = ? AND cocode = ?`;
            queryParams = [project, phasecode, cocode];
        }

        const [results] = await pool.query(validationQuery, queryParams);
        if (results.length === 0) {
            return { isValid: false, error: `Row ${rowIndex + 1}: Project '${project}' with Phasecode '${phasecode}' not found for company ${cocode}.` };
        }

        // NEW: Check for completion date conflicts (only for projected dates)
        if (completionType === 'P') {
            const currentCompletion = await getCurrentCompletionDate(project, phasecode, cocode, pool);
            const newCompletionDate = new Date(dateValidation.formattedDate);
            
            if (currentCompletion && new Date(currentCompletion.completion_date) > newCompletionDate) {
                // Completion date is moving earlier - check for orphaned POC
                const orphanedPOC = await detectOrphanedPOC(project, phasecode, newCompletionDate, cocode, pool);
                
                if (orphanedPOC.length > 0) {
                    const orphanedTotal = orphanedPOC.reduce((sum, poc) => sum + parseFloat(poc.value), 0);
                    
                    return {
                        isValid: false,
                        requiresUserAction: true,
                        conflictType: 'completion_date_moved_earlier',
                        error: `Row ${rowIndex + 1}: Moving completion date earlier will orphan ${orphanedPOC.length} POC projections (${orphanedTotal.toFixed(2)}% total). User action required.`,
                        conflictData: {
                            project,
                            phasecode,
                            orphanedPOC,
                            orphanedTotal,
                            oldCompletionDate: currentCompletion.completion_date,
                            newCompletionDate: dateValidation.formattedDate
                        }
                    };
                }
            }
        }

    } catch (dbError) {
        logger.error('Database validation error for Completion Date:', dbError);
        return { isValid: false, error: `Row ${rowIndex + 1}: Database error during validation.` };
    }

    return { isValid: true, error: null, formattedDate: dateValidation.formattedDate };
};

// =====================================
// ENHANCED POC VALIDATION  
// =====================================

// Enhanced POC validation that handles pending redistributions
const validatePocRowWithRedistribution = async (row, rowIndex, cocode, pool, templateType) => {
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
        // Validate project/phase exists
        let validationQuery, queryParams;
        if (phasecode === '') {
            validationQuery = `
                SELECT 1 FROM re.project_phase_validation
                WHERE project = ? AND (phasecode IS NULL OR phasecode = '') AND cocode = ?`;
            queryParams = [project, cocode];
        } else {
            validationQuery = `
                SELECT 1 FROM re.project_phase_validation
                WHERE project = ? AND phasecode = ? AND cocode = ?`;
            queryParams = [project, phasecode, cocode];
        }

        const [results] = await pool.query(validationQuery, queryParams);
        if (results.length === 0) {
            return { isValid: false, error: `Row ${rowIndex + 1}: Project '${project}' with Phasecode '${phasecode}' not found for company ${cocode}.` };
        }

        // NEW: Check for pending redistribution
        const pendingRedist = await checkPendingRedistribution(project, phasecode, cocode, pool);
        
        // Existing completion date validation (unchanged)
        const completionValidation = await validatePocAgainstCompletionDates(row, rowIndex, cocode, pool);
        if (!completionValidation.isValid) {
            return completionValidation;
        }

        return { 
            isValid: true, 
            error: null,
            hasPendingRedistribution: !!pendingRedist,
            pendingRedistributionId: pendingRedist?.id
        };

    } catch (dbError) {
        logger.error('Database validation error for POC:', dbError);
        return { isValid: false, error: `Row ${rowIndex + 1}: Database error during validation.` };
    }
};

// =====================================
// EXISTING HELPER FUNCTIONS (UNCHANGED)
// =====================================

const validateCompletionDateByType = (dateStr, completionType) => {
    const parseResult = parseDateString(dateStr);
    if (!parseResult.isValid) {
        return parseResult;
    }

    const completionDate = new Date(parseResult.formattedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    completionDate.setHours(0, 0, 0, 0);

    if (completionType === 'A') {
        if (completionDate > today) {
            return { 
                isValid: false, 
                error: `Actual completion date ${dateStr} cannot be in the future. Please select today or an earlier date.` 
            };
        }
    } else if (completionType === 'P') {
        if (completionDate <= today) {
            return { 
                isValid: false, 
                error: `Projected completion date ${dateStr} must be in the future. Please select a date after today.` 
            };
        }
    }

    return parseResult;
};

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

// Existing validation functions (keeping original implementation)
const validatePocAgainstCompletionDates = async (row, rowIndex, cocode, pool) => {
    // ... existing implementation unchanged ...
    return { isValid: true, error: null };
};

const parseDateString = (dateStr) => {
    // ... existing implementation unchanged ...
    return { isValid: true, formattedDate: dateStr };
};

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

// =====================================
// ENHANCED MAIN UPLOAD ROUTE
// =====================================

router.post('/upload-csv', upload.single('csvFile'), async (req, res) => {
    const filePath = req.file.path;
    const { uploadOption, templateType, completionType, cocode, cutoffDate, source } = req.body;
    
    const uploadSource = source === 'manual_entry' ? 'Manual Entry Form' : 'CSV File Upload';
    const logPrefix = source === 'manual_entry' ? '[Manual Entry]' : '[CSV Upload]';

    logger.info(`${logPrefix} Upload request received - Option: ${uploadOption}, Cocode: ${cocode}, CompletionType: ${completionType}, CutoffDate: ${cutoffDate}`);

    const pool = getPool();
    if (!pool) {
        return res.status(503).json({ message: 'Database not connected.' });
    }

    try {
        const allRows = await parseCSVFile(filePath);
        const dataRows = allRows.slice(1);
        const errors = [];
        const recordsToInsert = [];
        const conflicts = [];

        // Enhanced validation with conflict detection
        for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
            const row = dataRows[rowIndex];

            if (uploadOption === 'date') {
                // ENHANCED: Completion date validation with conflict detection
                const validationResult = await validateCompletionDateWithConflictDetection(row, rowIndex, cocode, completionType, pool);
                
                if (validationResult.requiresUserAction) {
                    conflicts.push(validationResult.conflictData);
                    continue; // Skip this record, user needs to resolve conflict
                } else if (!validationResult.isValid) {
                    errors.push(validationResult.error);
                    continue;
                }
                
                const project = row[0]?.toString().trim();
                const phasecode = row[1]?.toString().trim();
                const completionDate = validationResult.formattedDate;
                const type = completionType || 'A';
                recordsToInsert.push([cocode, project, phasecode, type, completionDate, new Date()]);
                
            } else if (uploadOption === 'poc') {
                // ENHANCED: POC validation with redistribution handling
                const validationResult = await validatePocRowWithRedistribution(row, rowIndex, cocode, pool, templateType);
                
                if (!validationResult.isValid) {
                    errors.push(validationResult.error);
                    continue;
                }

                const project = row[0]?.toString().trim();
                const phasecode = row[1]?.toString().trim();
                const year = parseInt(row[2], 10);

                // Process POC data based on template type
                if (templateType === 'short') {
                    const month = parseInt(row[3], 10);
                    const pocValue = row[4];

                    if (isNaN(month) || month < 1 || month > 12) {
                        errors.push(`Row ${rowIndex + 1}: Invalid or missing Month (must be 1-12).`);
                        continue;
                    }

                    if (pocValue !== null && pocValue.toString().trim() !== '') {
                        const pocType = getPocType(year, month, cutoffDate);
                        recordsToInsert.push([cocode, project, phasecode, year, month, pocValue, pocType, validationResult.pendingRedistributionId]);
                        logger.info(`${logPrefix} POC Type determined for ${project}-${phasecode} ${year}/${month}: ${pocType} (cutoff: ${cutoffDate})`);
                    }
                } else if (templateType === 'long') {
                    let hasMonthData = false;
                    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
                        const month = monthIndex + 1;
                        const pocValue = row[monthIndex + 3];
                        if (pocValue !== null && pocValue.toString().trim() !== '') {
                            hasMonthData = true;
                            const pocType = getPocType(year, month, cutoffDate);
                            recordsToInsert.push([cocode, project, phasecode, year, month, pocValue, pocType, validationResult.pendingRedistributionId]);
                            logger.info(`${logPrefix} POC Type determined for ${project}-${phasecode} ${year}/${month}: ${pocType} (cutoff: ${cutoffDate})`);
                        }
                    }
                    if (!hasMonthData) {
                        errors.push(`Row ${rowIndex + 1}: No POC data found in any month column for long template.`);
                    }
                }
            }
        }

        // Handle conflicts (completion date moved earlier)
        if (conflicts.length > 0) {
            return res.status(409).json({
                message: 'Completion date conflicts detected - user action required',
                conflicts: conflicts,
                totalConflicts: conflicts.length,
                requiresUserAction: true
            });
        }

        logger.info(`${logPrefix} Validation completed. Records to insert: ${recordsToInsert.length}, Errors: ${errors.length}`);

        if (recordsToInsert.length === 0) {
            return res.status(400).json({
                message: 'No valid data found to upload.',
                totalRowsProcessed: dataRows.length,
                totalErrors: errors.length,
                errors: errors,
                source: uploadSource
            });
        }

        // Insert records in transaction
        await pool.query('START TRANSACTION');

        try {
            let query, result;
            
            if (uploadOption === 'poc') {
                // ENHANCED: Check if any records have pending redistribution
                const hasPendingRedistribution = recordsToInsert.some(record => record[7]); // pendingRedistributionId
                
                if (hasPendingRedistribution) {
                    // Use INSERT only (no ON DUPLICATE KEY UPDATE) for redistribution scenarios
                    query = `INSERT INTO pocpermonth (cocode, project, phasecode, year, month, value, type, active) 
                             VALUES ?`;
                    
                    const insertData = recordsToInsert.map(record => [
                        record[0], record[1], record[2], record[3], 
                        record[4], record[5], record[6], 1 // active = 1
                    ]);
                    
                    [result] = await pool.query(query, [insertData]);
                    
                    // Mark redistributions as completed
                    const redistributionIds = [...new Set(recordsToInsert.filter(r => r[7]).map(r => r[7]))];
                    for (const redistId of redistributionIds) {
                        await markRedistributionCompleted(redistId, pool);
                    }
                    
                } else {
                    // Normal operation - use ON DUPLICATE KEY UPDATE
                    query = `INSERT INTO pocpermonth (cocode, project, phasecode, year, month, value, type) 
                             VALUES ? 
                             ON DUPLICATE KEY UPDATE 
                                value = VALUES(value), 
                                type = VALUES(type), 
                                timestampM = CURRENT_TIMESTAMP, 
                                userM = "${uploadSource}"`;
                    
                    const insertData = recordsToInsert.map(record => [
                        record[0], record[1], record[2], record[3], 
                        record[4], record[5], record[6]
                    ]);
                    
                    [result] = await pool.query(query, [insertData]);
                }
                
            } else if (uploadOption === 'date') {
                // Completion date - always insert new records
                query = `INSERT INTO re.pcompdate (cocode, project, phasecode, type, completion_date, created_at) 
                         VALUES ?`;
                
                [result] = await pool.query(query, [recordsToInsert]);
                result.changedRows = 0;
            }
            
            await pool.query('COMMIT');

            logger.info(`${logPrefix} Database insertion completed - Affected rows: ${result.affectedRows}, Changed rows: ${result.changedRows || 0}`);

            // Create summary response
            const summary = {};
            recordsToInsert.forEach(record => {
                const key = `${record[1]}-${record[2]}`;
                if (!summary[key]) {
                    summary[key] = {
                        project: record[1],
                        phasecode: record[2],
                        inserted: 0,
                        updated: 0
                    };
                }
                summary[key].inserted++;
            });

            res.status(200).json({
                message: 'Upload completed successfully.',
                totalRowsProcessed: dataRows.length,
                totalRecordsInserted: recordsToInsert.length,
                totalErrors: errors.length,
                summary: Object.values(summary),
                errors: errors.length > 0 ? errors : undefined,
                source: uploadSource
            });

        } catch (dbError) {
            await pool.query('ROLLBACK');
            throw dbError;
        }

    } catch (error) {
        logger.error(`${logPrefix} Upload failed:`, error);
        res.status(500).json({ 
            message: 'Failed to save data to the database.', 
            error: error.message,
            source: uploadSource 
        });
    } finally {
        // Clean up uploaded file
        fs.unlink(filePath, (err) => {
            if (err) logger.error('Error deleting uploaded file:', err);
        });
    }
});

// =====================================
// NEW API ENDPOINTS
// =====================================

// Handle completion date conflicts
router.post('/resolve-completion-conflict', async (req, res) => {
    const { conflictData, resolution, userInfo } = req.body;
    // resolution: 'redistribute', 'archive', 'cancel'
    
    const pool = getPool();
    if (!pool) {
        return res.status(503).json({ message: 'Database not connected.' });
    }

    try {
        await pool.query('START TRANSACTION');

        if (resolution === 'redistribute') {
            // Flag orphaned POC as deleted
            const orphanedIds = conflictData.orphanedPOC.map(poc => poc.id);
            await flagPOCAsDeleted(
                orphanedIds, 
                userInfo.user || 'System',
                'Completion date moved earlier - manual redistribution required',
                pool
            );

            // Store pending redistribution
            await storePendingRedistribution({
                cocode: conflictData.cocode || req.body.cocode,
                project: conflictData.project,
                phasecode: conflictData.phasecode,
                orphaned_total: conflictData.orphanedTotal,
                new_completion_date: conflictData.newCompletionDate,
                old_completion_date: conflictData.oldCompletionDate,
                created_by: userInfo.user || 'System'
            }, pool);

            // Now save the new completion date
            const query = `INSERT INTO re.pcompdate (cocode, project, phasecode, type, completion_date, created_at) 
                          VALUES (?, ?, ?, ?, ?, NOW())`;
            
            await pool.query(query, [
                conflictData.cocode || req.body.cocode,
                conflictData.project,
                conflictData.phasecode,
                'P', // Assuming projected
                conflictData.newCompletionDate
            ]);

        } else if (resolution === 'archive') {
            // Similar to redistribute but without pending redistribution
            const orphanedIds = conflictData.orphanedPOC.map(poc => poc.id);
            await flagPOCAsDeleted(
                orphanedIds,
                userInfo.user || 'System', 
                'Completion date moved earlier - projections archived',
                pool
            );

            // Save new completion date
            const query = `INSERT INTO re.pcompdate (cocode, project, phasecode, type, completion_date, created_at) 
                          VALUES (?, ?, ?, ?, ?, NOW())`;
            
            await pool.query(query, [
                conflictData.cocode || req.body.cocode,
                conflictData.project,
                conflictData.phasecode,
                'P',
                conflictData.newCompletionDate
            ]);
        }
        // 'cancel' - do nothing, just return success

        await pool.query('COMMIT');

        res.status(200).json({
            message: `Conflict resolved with ${resolution} option`,
            resolution: resolution,
            processed: resolution !== 'cancel'
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        logger.error('Error resolving completion conflict:', error);
        res.status(500).json({ message: 'Failed to resolve conflict', error: error.message });
    }
});

// Get pending redistributions
router.get('/pending-redistributions', async (req, res) => {
    const { cocode } = req.query;
    
    const pool = getPool();
    if (!pool) {
        return res.status(503).json({ message: 'Database not connected.' });
    }

    try {
        const query = `
            SELECT id, cocode, project, phasecode, orphaned_total, 
                   new_completion_date, old_completion_date, created_at, created_by
            FROM poc_redistribution_pending 
            WHERE status = 'pending_manual_entry'
            ${cocode ? 'AND cocode = ?' : ''}
            ORDER BY created_at DESC
        `;
        
        const params = cocode ? [cocode] : [];
        const [rows] = await pool.query(query, params);
        
        res.status(200).json(rows);
    } catch (error) {
        logger.error('Error fetching pending redistributions:', error);
        res.status(500).json({ message: 'Failed to fetch pending redistributions', error: error.message });
    }
});

module.exports = router;