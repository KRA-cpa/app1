// routes/dataRoutes.cjs
// Enhanced version with POC redistribution detection and active/deleted record handling
// This file handles all read-only API endpoints for fetching report data.
// Includes all existing functionality plus new redistribution features

const express = require('express');
const { getPool } = require('../config/db.cjs');
const logger = require('../config/logger.cjs');

const router = express.Router();

// Helper function to calculate the default cutoff date (last day of the previous month)
const getDefaultCutoffDate = () => {
    const today = new Date();
    const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return lastDayOfLastMonth.toISOString().split('T')[0];
};

// =====================================
// POC REDISTRIBUTION HELPER FUNCTIONS
// =====================================

// Check for pending redistribution for a specific project/phase
const checkPendingRedistribution = async (project, phasecode, cocode, connection) => {
    try {
        const query = `
            SELECT id, orphaned_total, new_completion_date, old_completion_date, 
                   created_at, created_by, notes
            FROM poc_redistribution_pending 
            WHERE cocode = ? AND project = ? AND phasecode = ? 
            AND status = 'pending_manual_entry'
            ORDER BY created_at DESC LIMIT 1
        `;
        
        const [rows] = await connection.execute(query, [cocode, project, phasecode]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        logger.error('Error checking pending redistribution:', error);
        throw error;
    }
};

// Get all pending redistributions for a company
const getAllPendingRedistributions = async (cocode, connection) => {
    try {
        const query = `
            SELECT project, phasecode, orphaned_total, new_completion_date, 
                   old_completion_date, created_at, created_by
            FROM poc_redistribution_pending 
            WHERE cocode = ? AND status = 'pending_manual_entry'
            ORDER BY created_at DESC
        `;
        
        const [rows] = await connection.execute(query, [cocode]);
        return rows;
    } catch (error) {
        logger.error('Error getting all pending redistributions:', error);
        throw error;
    }
};

// Generate report data with redistribution status awareness
const generatePOCReportData = async (project, phasecode, cocode, cutoffDate, connection, includeDeleted = false) => {
    try {
        // Check for pending redistribution first
        const pendingRedist = await checkPendingRedistribution(project, phasecode, cocode, connection);
        
        if (pendingRedist) {
            return {
                type: 'redistribution_pending',
                project,
                phasecode,
                message: `POC data incomplete - ${pendingRedist.orphaned_total}% requires manual redistribution`,
                details: {
                    orphaned_total: pendingRedist.orphaned_total,
                    new_completion_date: pendingRedist.new_completion_date,
                    old_completion_date: pendingRedist.old_completion_date,
                    created_at: pendingRedist.created_at,
                    created_by: pendingRedist.created_by
                },
                action_required: 'Manually enter POC data up to new completion date',
                pending_redistribution_id: pendingRedist.id
            };
        }
        
        // Normal data retrieval - get active records only (unless includeDeleted is true)
        const cutoffDateObj = new Date(cutoffDate);
        const cutoffYear = cutoffDateObj.getFullYear();
        const cutoffMonth = cutoffDateObj.getMonth() + 1;

        let baseSql = `
            SELECT
                p.ID, p.cocode, p.project, p.phasecode, p.year, p.month, p.value, p.type,
                p.timestampC, p.userC, p.timestampM, p.userM,
                p.active, p.deleted_at, p.deleted_by, p.deletion_reason,
                COALESCE(v.description, 'N/A') as description
            FROM
                re.pocpermonth p
            LEFT JOIN
                re.project_phase_validation v ON p.project = v.project
                AND p.phasecode = v.phasecode
                AND p.cocode = v.cocode
        `;

        const whereClauses = ['(p.year < ? OR (p.year = ? AND p.month <= ?))'];
        const params = [cutoffYear, cutoffYear, cutoffMonth];

        // Add active filter unless specifically requesting deleted records
        if (!includeDeleted) {
            whereClauses.push('p.active = 1');
        }

        // Add filters
        if (cocode) {
            whereClauses.push('p.cocode = ?');
            params.push(cocode);
        }
        if (project) {
            whereClauses.push('p.project = ?');
            params.push(project);
        }
        if (phasecode) {
            whereClauses.push('p.phasecode = ?');
            params.push(phasecode);
        }

        let sqlQuery = baseSql + ' WHERE ' + whereClauses.join(' AND ');
        sqlQuery += ' ORDER BY p.project, p.phasecode, p.year ASC, p.month ASC';

        const [rows] = await connection.execute(sqlQuery, params);

        return {
            type: 'normal',
            data: rows,
            totalRecords: rows.length,
            hasDeletedRecords: includeDeleted ? rows.some(r => r.active === 0) : false
        };
        
    } catch (error) {
        logger.error('Error generating POC report data:', error);
        throw error;
    }
};

// =====================================
// ENHANCED ROUTES
// =====================================

// --- Enhanced route for 're.pocpermonth' data with redistribution detection ---
router.get('/pocdata', async (req, res) => {
    const { project, phasecode, year, cutoffDate, cocode, includeDeleted } = req.query;
    const effectiveCutoffDate = cutoffDate || getDefaultCutoffDate();
    const includeDeletedRecords = includeDeleted === 'true';

    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();

        // Enhanced report generation with redistribution detection for single project/phase
        if (project && phasecode) {
            const reportData = await generatePOCReportData(
                project, phasecode, cocode, effectiveCutoffDate, connection, includeDeletedRecords
            );
            
            if (reportData.type === 'redistribution_pending') {
                return res.status(200).json({
                    ...reportData,
                    requiresUserAction: true
                });
            }
            
            return res.status(200).json(reportData.data);
        }

        // Multiple projects/phases - use enhanced query with active filter
        const cutoffDateObj = new Date(effectiveCutoffDate);
        const cutoffYear = cutoffDateObj.getFullYear();
        const cutoffMonth = cutoffDateObj.getMonth() + 1;

        // Enhanced SQL with active/deleted columns
        let baseSql = `
            SELECT
                p.ID, p.cocode, p.project, p.phasecode, p.year, p.month, p.value, p.type,
                p.timestampC, p.userC, p.timestampM, p.userM,
                p.active, p.deleted_at, p.deleted_by, p.deletion_reason,
                COALESCE(v.description, 'N/A') as description
            FROM
                re.pocpermonth p
            LEFT JOIN
                re.project_phase_validation v ON p.project = v.project
                AND p.phasecode = v.phasecode
                AND p.cocode = v.cocode
        `;

        const whereClauses = ['(p.year < ? OR (p.year = ? AND p.month <= ?))'];
        const params = [cutoffYear, cutoffYear, cutoffMonth];

        // Add active filter unless specifically requesting deleted records
        if (!includeDeletedRecords) {
            whereClauses.push('p.active = 1');
        }

        // Add company code filter if provided
        if (cocode) {
            whereClauses.push('p.cocode = ?');
            params.push(cocode);
        }
        if (project) {
            whereClauses.push('p.project = ?');
            params.push(project);
        }
        if (phasecode) {
            whereClauses.push('p.phasecode = ?');
            params.push(phasecode);
        }
        if (year) {
            whereClauses.push('p.year = ?');
            params.push(parseInt(year, 10));
        }

        let sqlQuery = baseSql + ' WHERE ' + whereClauses.join(' AND ');
        sqlQuery += ' ORDER BY p.project, p.phasecode, p.year ASC, p.month ASC';

        // DEBUG: Log the final query and parameters
        console.log('DEBUG - Final SQL Query:', sqlQuery);
        console.log('DEBUG - Query Parameters:', params);
        console.log('DEBUG - Received cocode:', cocode);
        console.log('DEBUG - Include Deleted:', includeDeletedRecords);

        const [rows] = await connection.execute(sqlQuery, params);

        // DEBUG: Log the results
        console.log('DEBUG - Query returned', rows.length, 'rows');
        if (rows.length > 0) {
            console.log('DEBUG - First row cocode:', rows[0].cocode);
            console.log('DEBUG - Active records:', rows.filter(r => r.active === 1).length);
            console.log('DEBUG - Deleted records:', rows.filter(r => r.active === 0).length);
            console.log('DEBUG - All unique cocodes:', [...new Set(rows.map(r => r.cocode))]);
        }

        res.status(200).json(rows);
    } catch (error) {
        logger.error('Error fetching data from pocpermonth:', error);
        res.status(500).json({ message: 'Failed to fetch data.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- Enhanced route for 're.pocpermonth' dropdown options (active records only) ---
router.get('/pocdata/options', async (req, res) => {
    const { cocode } = req.query;
    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();
        // Filter options based on active records only
        const whereClause = cocode ? 'WHERE cocode = ? AND active = 1' : 'WHERE active = 1';
        const params = cocode ? [cocode] : [];

        const [projectRows] = await connection.execute(
            `SELECT DISTINCT project FROM re.pocpermonth ${whereClause} ORDER BY project`, 
            params
        );
        const [phasecodeRows] = await connection.execute(
            `SELECT DISTINCT phasecode FROM re.pocpermonth ${whereClause} ORDER BY phasecode`, 
            params
        );
        const [yearRows] = await connection.execute(
            `SELECT DISTINCT year FROM re.pocpermonth ${whereClause} ORDER BY year DESC`, 
            params
        );

        res.status(200).json({
            projects: projectRows.map(r => r.project),
            phasecodes: phasecodeRows.map(r => r.phasecode),
            years: yearRows.map(r => r.year)
        });
    } catch (error) {
        logger.error('Error fetching pocdata options:', error);
        res.status(500).json({ message: 'Failed to fetch options.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// =====================================
// EXISTING ROUTES - ENHANCED
// =====================================

// --- Route for 're.pcompdate' data ---
router.get('/pcompdata', async (req, res) => {
    const { project, phasecode, year, type, cutoffDate, cocode } = req.query;
    const effectiveCutoffDate = cutoffDate || getDefaultCutoffDate();

    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();

        // Modified SQL to get the record with the latest created_at for each unique combination
        let sqlQuery = `
            SELECT
                p.id, p.cocode, p.project, p.phasecode, p.type,
                p.completion_date, p.notes, p.created_at,
                v.description
            FROM
                re.pcompdate p
            LEFT JOIN
                re.project_phase_validation v
                ON p.project = v.project
                AND p.phasecode = v.phasecode
                AND p.cocode = v.cocode
            INNER JOIN (
                SELECT
                    cocode, project, phasecode, type, MAX(created_at) as max_created_at
                FROM
                    re.pcompdate
                WHERE
                    DATE(completion_date) <= ?
                    ${cocode ? 'AND cocode = ?' : ''}
                    ${project ? 'AND project = ?' : ''}
                    ${phasecode ? 'AND phasecode = ?' : ''}
                    ${type ? 'AND type = ?' : ''}
                    ${year ? 'AND YEAR(completion_date) = ?' : ''}
                GROUP BY
                    cocode, project, phasecode, type
            ) AS latest_records
            ON p.cocode = latest_records.cocode
            AND p.project = latest_records.project
            AND p.phasecode = latest_records.phasecode
            AND p.type = latest_records.type
            AND p.created_at = latest_records.max_created_at
        `;

        const params = [effectiveCutoffDate];

        if (cocode) {
            params.push(cocode);
        }
        if (project) {
            params.push(project);
        }
        if (phasecode) {
            params.push(phasecode);
        }
        if (type) {
            params.push(type);
        }
        if (year) {
            params.push(parseInt(year, 10));
        }

        sqlQuery += ' ORDER BY p.project, p.phasecode, p.type, p.created_at DESC';

        // DEBUG: Log the final query and parameters for pcompdate
        console.log('DEBUG PCOMPDATE - Final SQL Query:', sqlQuery);
        console.log('DEBUG PCOMPDATE - Query Parameters:', params);
        console.log('DEBUG PCOMPDATE - Received cocode:', cocode);
        console.log('DEBUG PCOMPDATE - Received cutoffDate:', effectiveCutoffDate);

        const [rows] = await connection.execute(sqlQuery, params);

        // DEBUG: Log the results for pcompdate
        console.log('DEBUG PCOMPDATE - Query returned', rows.length, 'rows');
        if (rows.length > 0) {
            console.log('DEBUG PCOMPDATE - First row cocode:', rows[0].cocode);
            console.log('DEBUG PCOMPDATE - All unique cocodes:', [...new Set(rows.map(r => r.cocode))]);
            console.log('DEBUG PCOMPDATE - Example Row (latest created_at per group):', rows[0]);
        }

        res.status(200).json(rows);
    } catch (error) {
        logger.error('Error fetching data from pcompdate:', error);
        res.status(500).json({ message: 'Failed to fetch data.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- Route for 're.pcompdate' dropdown options ---
router.get('/pcompdata/options', async (req, res) => {
    const { cocode } = req.query;
    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();
        // Filter options based on the selected company
        const whereClause = cocode ? 'WHERE cocode = ?' : '';
        const params = cocode ? [cocode] : [];

        const [projectRows] = await connection.execute(`SELECT DISTINCT project FROM re.pcompdate ${whereClause} ORDER BY project`, params);
        const [phasecodeRows] = await connection.execute(`SELECT DISTINCT phasecode FROM re.pcompdate ${whereClause} ORDER BY phasecode`, params);
        const [yearRows] = await connection.execute(`SELECT DISTINCT YEAR(completion_date) as year FROM re.pcompdate ${whereClause} ORDER BY year DESC`, params);

        res.status(200).json({
            projects: projectRows.map(r => r.project),
            phasecodes: phasecodeRows.map(r => r.phasecode),
            years: yearRows.map(r => r.year)
        });
    } catch (error) {
        logger.error('Error fetching pcompdata options:', error);
        res.status(500).json({ message: 'Failed to fetch options.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- Route for project/phase validation options (reuses existing validation table) ---
router.get('/validation-options', async (req, res) => {
    const { cocode } = req.query;
    
    if (!cocode) {
        return res.status(400).json({ 
            message: 'Company code (cocode) is required for validation options.' 
        });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();

        // Get distinct projects for the company from the same validation table used by CsvUploader
        const [projectRows] = await connection.execute(
            'SELECT DISTINCT project FROM re.project_phase_validation WHERE cocode = ? ORDER BY project',
            [cocode]
        );

        // Get all project/phase combinations for the company (same validation as CsvUploader)
        const [phaseRows] = await connection.execute(
            'SELECT project, phasecode FROM re.project_phase_validation WHERE cocode = ? ORDER BY project, phasecode',
            [cocode]
        );

        const projects = projectRows.map(row => ({ project: row.project }));
        const phases = phaseRows.map(row => ({ 
            project: row.project, 
            phasecode: row.phasecode || '' // Handle null phasecodes same as CsvUploader
        }));

        logger.info(`Manual entry validation options fetched for company ${cocode}: ${projects.length} projects, ${phases.length} phase combinations`);

        res.status(200).json({
            projects: projects,
            phases: phases
        });
    } catch (error) {
        logger.error('Error fetching validation options for manual entry:', error);
        res.status(500).json({ 
            message: 'Failed to fetch validation options.', 
            error: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// --- NEW: Route to get completion dates for POC validation ---
router.get('/completion-dates', async (req, res) => {
    const { cocode, project, phasecode } = req.query;
    
    if (!cocode) {
        return res.status(400).json({ 
            message: 'Company code (cocode) is required.' 
        });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();

        // Get the latest completion date for each type (Actual and Projected) for the given project/phase
        let sqlQuery = `
            SELECT 
                cocode, project, phasecode, type, completion_date, created_at
            FROM 
                re.pcompdate p1
            WHERE 
                p1.cocode = ? 
                AND p1.created_at = (
                    SELECT MAX(p2.created_at) 
                    FROM re.pcompdate p2 
                    WHERE p2.cocode = p1.cocode 
                    AND p2.project = p1.project 
                    AND p2.phasecode = p1.phasecode 
                    AND p2.type = p1.type
                )
        `;
        
        const params = [cocode];

        // Add project filter if specified
        if (project) {
            sqlQuery += ' AND p1.project = ?';
            params.push(project);
        }

        // Add phase filter if specified  
        if (phasecode !== undefined) {
            if (phasecode === '') {
                sqlQuery += ' AND (p1.phasecode IS NULL OR p1.phasecode = "")';
            } else {
                sqlQuery += ' AND p1.phasecode = ?';
                params.push(phasecode);
            }
        }

        sqlQuery += ' ORDER BY p1.project, p1.phasecode, p1.type';

        console.log('DEBUG COMPLETION-DATES - Final SQL Query:', sqlQuery);
        console.log('DEBUG COMPLETION-DATES - Query Parameters:', params);

        const [rows] = await connection.execute(sqlQuery, params);

        console.log('DEBUG COMPLETION-DATES - Query returned', rows.length, 'rows');

        // Transform results into a more usable format
        const completionDates = {};
        rows.forEach(row => {
            const key = `${row.project}-${row.phasecode || ''}`;
            if (!completionDates[key]) {
                completionDates[key] = {};
            }
            completionDates[key][row.type] = {
                date: row.completion_date,
                created_at: row.created_at
            };
        });

        res.status(200).json({
            success: true,
            completionDates: completionDates,
            rawData: rows // Include raw data for debugging
        });

    } catch (error) {
        logger.error('Error fetching completion dates:', error);
        res.status(500).json({ 
            message: 'Failed to fetch completion dates.', 
            error: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =====================================
// NEW REDISTRIBUTION-SPECIFIC ROUTES
// =====================================

// --- Route to get pending redistributions for a company ---
router.get('/pending-redistributions', async (req, res) => {
    const { cocode } = req.query;
    
    if (!cocode) {
        return res.status(400).json({ 
            message: 'Company code (cocode) is required.' 
        });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();
        
        const pendingRedistributions = await getAllPendingRedistributions(cocode, connection);
        
        res.status(200).json({
            totalPending: pendingRedistributions.length,
            redistributions: pendingRedistributions
        });
    } catch (error) {
        logger.error('Error fetching pending redistributions:', error);
        res.status(500).json({ message: 'Failed to fetch pending redistributions.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- Route to get redistribution status for specific project/phase ---
router.get('/redistribution-status', async (req, res) => {
    const { project, phasecode, cocode } = req.query;
    
    if (!project || !phasecode || !cocode) {
        return res.status(400).json({ 
            message: 'Project, phasecode, and cocode are required.' 
        });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();
        
        const pendingRedist = await checkPendingRedistribution(project, phasecode, cocode, connection);
        
        if (pendingRedist) {
            res.status(200).json({
                hasPendingRedistribution: true,
                redistributionDetails: pendingRedist
            });
        } else {
            res.status(200).json({
                hasPendingRedistribution: false
            });
        }
    } catch (error) {
        logger.error('Error checking redistribution status:', error);
        res.status(500).json({ message: 'Failed to check redistribution status.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- Route to get deleted POC records (for historical view) ---
router.get('/pocdata/deleted', async (req, res) => {
    const { project, phasecode, cocode, cutoffDate } = req.query;
    const effectiveCutoffDate = cutoffDate || getDefaultCutoffDate();
    
    if (!cocode) {
        return res.status(400).json({ 
            message: 'Company code (cocode) is required.' 
        });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();
        
        const cutoffDateObj = new Date(effectiveCutoffDate);
        const cutoffYear = cutoffDateObj.getFullYear();
        const cutoffMonth = cutoffDateObj.getMonth() + 1;

        let baseSql = `
            SELECT
                p.ID, p.cocode, p.project, p.phasecode, p.year, p.month, p.value, p.type,
                p.timestampC, p.userC, p.timestampM, p.userM,
                p.active, p.deleted_at, p.deleted_by, p.deletion_reason,
                COALESCE(v.description, 'N/A') as description
            FROM
                re.pocpermonth p
            LEFT JOIN
                re.project_phase_validation v ON p.project = v.project
                AND p.phasecode = v.phasecode
                AND p.cocode = v.cocode
        `;

        const whereClauses = [
            '(p.year < ? OR (p.year = ? AND p.month <= ?))',
            'p.active = 0',  // Only deleted records
            'p.cocode = ?'
        ];
        const params = [cutoffYear, cutoffYear, cutoffMonth, cocode];

        if (project) {
            whereClauses.push('p.project = ?');
            params.push(project);
        }
        if (phasecode) {
            whereClauses.push('p.phasecode = ?');
            params.push(phasecode);
        }

        let sqlQuery = baseSql + ' WHERE ' + whereClauses.join(' AND ');
        sqlQuery += ' ORDER BY p.deleted_at DESC, p.project, p.phasecode, p.year ASC, p.month ASC';

        const [rows] = await connection.execute(sqlQuery, params);

        res.status(200).json({
            totalDeletedRecords: rows.length,
            deletedRecords: rows
        });
    } catch (error) {
        logger.error('Error fetching deleted POC data:', error);
        res.status(500).json({ message: 'Failed to fetch deleted POC data.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;