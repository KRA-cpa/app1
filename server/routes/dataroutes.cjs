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
      sqlQuery += ' ORDER BY p.project, p.phasecode, p.year DESC, p.month';
      
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
        // FINALIZED SQL: Joins to get description, uses aliases for clarity.
        let baseSql = `
            SELECT 
                p.id, p.cocode, p.project, p.phasecode, p.type, 
                p.completion_date, p.notes, p.created_at,
                v.description 
            FROM 
                re.pcompdate p
            LEFT JOIN 
                re.project_phase_validation v ON p.project = v.project AND p.phasecode = v.phasecode AND p.cocode = v.cocode
        `;
        
        const whereClauses = ['DATE(p.completion_date) <= ?'];
        const params = [effectiveCutoffDate];

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
        if (type) {
            whereClauses.push('p.type = ?');
            params.push(type);
        }
        if (year) {
            whereClauses.push('YEAR(p.completion_date) = ?');
            params.push(parseInt(year, 10));
        }

        let sqlQuery = baseSql + ' WHERE ' + whereClauses.join(' AND ');
        sqlQuery += ' ORDER BY p.project, p.phasecode, p.completion_date DESC';

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