// routes/dataRoutes.cjs
// This file handles all read-only API endpoints for fetching report data.
// with debugging

// routes/dataRoutes.cjs
// This file handles all read-only API endpoints for fetching report data.

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

// --- Route for 're.pocpermonth' data ---
router.get('/pocdata', async (req, res) => {
    // Now accepts 'cocode' as a filter
    const { project, phasecode, year, cutoffDate, cocode } = req.query;
    const effectiveCutoffDate = cutoffDate || getDefaultCutoffDate();
    const cutoffDateObj = new Date(effectiveCutoffDate);
    const cutoffYear = cutoffDateObj.getFullYear();
    const cutoffMonth = cutoffDateObj.getMonth() + 1;

    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();

        // Restore SQL with JOIN to get project/phase descriptions
        let baseSql = `
            SELECT
                p.ID, p.cocode, p.project, p.phasecode, p.year, p.month, p.value,
                p.timestampC, p.userC, p.timestampM, p.userM,
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

        const [rows] = await connection.execute(sqlQuery, params);

        // DEBUG: Log the results
        console.log('DEBUG - Query returned', rows.length, 'rows');
        if (rows.length > 0) {
            console.log('DEBUG - First row cocode:', rows[0].cocode);
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

// --- Route for 're.pocpermonth' dropdown options ---
router.get('/pocdata/options', async (req, res) => {
    const { cocode } = req.query; // Now accepts 'cocode'
    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'Database not connected.' });

    let connection;
    try {
        connection = await pool.getConnection();
        // Filter options based on the selected company
        const whereClause = cocode ? 'WHERE cocode = ?' : '';
        const params = cocode ? [cocode] : [];

        const [projectRows] = await connection.execute(`SELECT DISTINCT project FROM re.pocpermonth ${whereClause} ORDER BY project`, params);
        const [phasecodeRows] = await connection.execute(`SELECT DISTINCT phasecode FROM re.pocpermonth ${whereClause} ORDER BY phasecode`, params);
        const [yearRows] = await connection.execute(`SELECT DISTINCT year FROM re.pocpermonth ${whereClause} ORDER BY year DESC`, params);

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

// --- Route for 're.pcompdate' data ---
router.get('/pcompdata', async (req, res) => {
    const { project, phasecode, year, type, cutoffDate, cocode } = req.query; // Now accepts 'cocode'
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

        // Add params for the outer query's WHERE clause
        // The outer query needs the same parameters as the subquery for filtering
        const outerWhereClauses = ['DATE(p.completion_date) <= ?'];
        if (cocode) {
            outerWhereClauses.push('p.cocode = ?');
        }
        if (project) {
            outerWhereClauses.push('p.project = ?');
        }
        if (phasecode) {
            outerWhereClauses.push('p.phasecode = ?');
        }
        if (type) {
            outerWhereClauses.push('p.type = ?');
        }
        if (year) {
            outerWhereClauses.push('YEAR(p.completion_date) = ?');
        }

        // The current implementation of the parameters for the subquery makes it difficult
        // to directly reuse `params` for the outer query without duplication.
        // For clarity and to avoid issues, we'll explicitly add them if the outer WHERE clause was separate.
        // However, with the INNER JOIN to the subquery that already filters,
        // adding an outer WHERE clause might be redundant for the primary filtering,
        // but can be used for additional constraints if needed.
        // For this specific request (latest created_at per group), the subquery handles the filtering.
        // We will just ensure the ordering for consistent results in case of ties in `created_at`.
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
    const { cocode } = req.query; // Now accepts 'cocode'
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

module.exports = router;