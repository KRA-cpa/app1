// routes/dataRoutes.cjs
// This file handles all read-only API endpoints for fetching report data.

const express = require('express');
const { getPool } = require('../config/db.cjs');
const logger = require('../config/logger.cjs');

const router = express.Router();

// --- Helper Function: Default Cutoff Date ---
// Provides a consistent default date (last day of the previous month) if no cutoff is specified in the request.
const getDefaultCutoffDate = () => {
    const today = new Date();
    // Setting the day of the month to 0 automatically rolls the date back to the last day of the previous month.
    const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return lastDayOfLastMonth.toISOString().split('T')[0]; // Returns in 'YYYY-MM-DD' format.
};


// --- Route 1: Report for 're.pocpermonth' table ---
// Fetches monthly Percentage of Completion data.
router.get('/pocdata', async (req, res) => {
  // --- Filters ---
  // Uses 'project', 'phasecode', and 'year' for specific filtering.
  // Implements the persistent 'cutoffDate' filter.
  const { project, phasecode, year, cutoffDate } = req.query;
  const effectiveCutoffDate = cutoffDate || getDefaultCutoffDate();

  // --- CHANGE: Cutoff Date Logic for Separate Year/Month Columns ---
  // The cutoff date is parsed to get its year and month components.
  const cutoffDateObj = new Date(effectiveCutoffDate);
  const cutoffYear = cutoffDateObj.getFullYear();
  const cutoffMonth = cutoffDateObj.getMonth() + 1; // getMonth() is 0-indexed, so add 1.

  logger.info('Received request for /api/pocdata with filters:', req.query);
  logger.info(`Applying cutoff for pocpermonth: year < ${cutoffYear} OR (year = ${cutoffYear} AND month <= ${cutoffMonth})`);

  const pool = getPool();
  if (!pool) {
      return res.status(503).json({ message: 'Database not connected.' });
  }

  let connection;
  try {
      connection = await pool.getConnection();

      let baseSql = 'SELECT ID, project, phasecode, year, month, value, timestampC, userC, timestampM, userM FROM re.pocpermonth';
      
      // --- CHANGE: The WHERE clause for the cutoff is now a compound statement. ---
      // This correctly filters records on or before the cutoff month and year.
      const whereClauses = ['(year < ? OR (year = ? AND month <= ?))']; 
      const params = [cutoffYear, cutoffYear, cutoffMonth];

      // Append other optional filters
      if (project) {
          whereClauses.push('project = ?');
          params.push(project);
      }
      if (phasecode) {
          whereClauses.push('phasecode = ?');
          params.push(phasecode);
      }
      if (year) {
          whereClauses.push('year = ?');
          params.push(parseInt(year, 10));
      }

      let sqlQuery = baseSql + ' WHERE ' + whereClauses.join(' AND ');
      sqlQuery += ' ORDER BY project, phasecode, year DESC, month';
      
      logger.info('Executing SQL:', sqlQuery);
      logger.info('With Params:', params);

      const [rows] = await connection.execute(sqlQuery, params);
      logger.info(`Fetched ${rows.length} rows from pocpermonth.`);
      res.status(200).json(rows);

  } catch (error) {
      logger.error('Error fetching data from pocpermonth:', error);
      res.status(500).json({ message: 'Failed to fetch data from database.', error: error.message });
  } finally {
      if (connection) {
          connection.release();
      }
  }
});

// --- Route 2: Options for UI Filters ---
// Fetches distinct values to populate dropdown menus in the frontend.
// This route is intentionally not affected by the data filters like cutoffDate.
router.get('/pocdata/options', async (req, res) => {
    logger.info('Received request for /api/pocdata/options');
    const pool = getPool();
    if (!pool) { return res.status(503).json({ message: 'Database not connected.' }); }
    
    let connection;
    try {
        connection = await pool.getConnection();
        const [projectRows] = await connection.execute('SELECT DISTINCT project FROM re.pocpermonth ORDER BY project');
        const [phasecodeRows] = await connection.execute('SELECT DISTINCT phasecode FROM re.pocpermonth ORDER BY phasecode');
        const [yearRows] = await connection.execute('SELECT DISTINCT year FROM re.pocpermonth ORDER BY year DESC');

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


// --- Route 3: Report for 're.pcompdate' table ---
// Fetches project completion dates (Actual vs. Projected).
router.get('/pcompdata', async (req, res) => {
    // --- Filters ---
    // Uses 'project', 'phasecode', 'year'.
    // --- NEW: Adds a filter for 'type' (Actual 'A' or Projected 'P'). ---
    // Implements the persistent 'cutoffDate' filter.
    const { project, phasecode, year, type, cutoffDate } = req.query;
    const effectiveCutoffDate = cutoffDate || getDefaultCutoffDate();

    logger.info('Received request for /api/pcompdata with filters:', req.query);

    const pool = getPool();
    if (!pool) {
        return res.status(503).json({ message: 'Database not connected.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();

        // The SELECT statement uses the actual column names from the provided table structure.
        let baseSql = 'SELECT id, project, phasecode, type, completion_date, notes, created_at FROM re.pcompdate';
        
        // --- CHANGE: Cutoff date is applied to the 'completion_date' column. ---
        const whereClauses = ['DATE(completion_date) <= ?'];
        const params = [effectiveCutoffDate];

        if (project) {
            whereClauses.push('project = ?');
            params.push(project);
        }
        if (phasecode) {
            whereClauses.push('phasecode = ?');
            params.push(phasecode);
        }
        // --- NEW: Handles the 'type' filter. ---
        if (type) { 
            whereClauses.push('type = ?');
            params.push(type);
        }
        // --- CHANGE: The 'year' filter now checks the YEAR() part of the 'completion_date' column. ---
        if (year) { 
            whereClauses.push('YEAR(completion_date) = ?');
            params.push(parseInt(year, 10));
        }

        let sqlQuery = baseSql + ' WHERE ' + whereClauses.join(' AND ');
        sqlQuery += ' ORDER BY project, phasecode, completion_date DESC';

        logger.info('Executing SQL:', sqlQuery);
        logger.info('With Params:', params);

        const [rows] = await connection.execute(sqlQuery, params);
        logger.info(`Fetched ${rows.length} rows from pcompdate.`);
        res.status(200).json(rows);

    } catch (error) {
        logger.error('Error fetching data from pcompdate:', error);
        res.status(500).json({ message: 'Failed to fetch data from database.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});


module.exports = router;