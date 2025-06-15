// routes/dataRoutes.cjs
const express = require('express');
const { getPool } = require('../config/db.cjs');
const logger = require('../config/logger.cjs');

const router = express.Router();

// --- Route 1: Fetch data from 'pocpermonth' table ---
router.get('/pocdata', async (req, res) => {
  const { project, phasecode, year } = req.query;
  logger.info('Received request for /api/pocdata with filters:', req.query);
  
  const pool = getPool();
  if (!pool) {
      return res.status(503).json({ message: 'Database not connected.' });
  }

  let connection;
  try {
      connection = await pool.getConnection();

      let baseSql = 'SELECT ID, project, phasecode, year, month, value, timestampC, userC, timestampM, userM FROM re.pocpermonth'; // [cite: 52]
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
          whereClauses.push('year = ?'); // [cite: 54]
          params.push(parseInt(year, 10));
      }

      let sqlQuery = baseSql;
      if (whereClauses.length > 0) {
          sqlQuery += ' WHERE ' + whereClauses.join(' AND '); // [cite: 56]
      }
      sqlQuery += ' ORDER BY project, phasecode, year DESC, month'; // [cite: 57]
      
      logger.info('Executing SQL:', sqlQuery); // [cite: 58]
      const [rows] = await connection.execute(sqlQuery, params);
      logger.info(`Fetched ${rows.length} rows from pocpermonth.`); // [cite: 59]
      res.status(200).json(rows);

  } catch (error) {
      logger.error('Error fetching data from pocpermonth:', error); // [cite: 60]
      res.status(500).json({ message: 'Failed to fetch data from database.', error: error.message }); // [cite: 61]
  } finally {
      if (connection) {
          logger.info('Releasing database connection for /api/pocdata'); // [cite: 62]
          connection.release();
      }
  }
});

// --- Route 2: Get distinct filter options for 'pocpermonth' table ---
router.get('/pocdata/options', async (req, res) => {
  logger.info('Received request for /api/pocdata/options');
  
  const pool = getPool();
  if (!pool) {
      return res.status(503).json({ message: 'Database not connected.' });
  }
  
  let connection;
  try {
      connection = await pool.getConnection();
      const [projectRows] = await connection.execute('SELECT DISTINCT project FROM re.pocpermonth ORDER BY project'); // [cite: 63]
      const [phasecodeRows] = await connection.execute('SELECT DISTINCT phasecode FROM re.pocpermonth ORDER BY phasecode'); // [cite: 63]
      const [yearRows] = await connection.execute('SELECT DISTINCT year FROM re.pocpermonth ORDER BY year DESC'); // [cite: 63]

      const projects = projectRows.map(row => row.project); // [cite: 64]
      const phasecodes = phasecodeRows.map(row => row.phasecode); // [cite: 64]
      const years = yearRows.map(row => row.year); // [cite: 64]

      res.status(200).json({ projects, phasecodes, years }); // [cite: 65]
  } catch (error) {
      logger.error('Error fetching filter options:', error); // [cite: 66]
      res.status(500).json({ message: 'Failed to fetch filter options.', error: error.message }); // [cite: 67]
  } finally {
      if (connection) {
          connection.release(); // [cite: 68]
      }
  }
});

// --- Placeholder for new report views for other tables ---
/*
router.get('/other-report', async (req, res) => {
    logger.info("Received request for the 'other' report");
    const pool = getPool();
    let connection;
    try {
        connection = await pool.getConnection();
        // 1. Build your new SQL query for a different table.
        // 2. Use different query parameters if needed: const { param1, param2 } = req.query;
        // 3. Execute the query and fetch data.
        const [rows] = await connection.execute('SELECT * FROM another_table WHERE ...');
        res.status(200).json(rows);
    } catch (error) {
        logger.error('Error fetching data for the other report:', error);
        res.status(500).json({ message: 'Failed to fetch report data.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});
*/

module.exports = router;