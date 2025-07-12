// =====================================================
// Updated Backend Query Functions - Support Active Indicator
// File: server/utils/pocDataUtils.cjs
// =====================================================

const { getPool } = require('../config/db.cjs');
const logger = require('../config/logger.cjs');

/**
 * Utility functions for POC data management with active indicator support
 */
class PocDataUtils {
    
    /**
     * Check if there are 100% POC records after a given completion date
     * @param {string} cocode - Company code
     * @param {string} project - Project name
     * @param {string} phasecode - Phase code (can be empty string)
     * @param {Date} completionDate - Completion date to check against
     * @returns {Promise<Array>} Array of conflicting POC records
     */
    static async findConflictingPocRecords(cocode, project, phasecode, completionDate) {
        const pool = getPool();
        if (!pool) throw new Error('Database not connected');

        const completionYear = completionDate.getFullYear();
        const completionMonth = completionDate.getMonth() + 1;

        let query;
        let params;

        if (phasecode === '' || phasecode === null) {
            query = `
                SELECT ID, cocode, project, phasecode, year, month, value, type
                FROM pocpermonth 
                WHERE cocode = ? 
                AND project = ? 
                AND (phasecode IS NULL OR phasecode = '')
                AND active = 1
                AND value = 100
                AND (
                    year > ? 
                    OR (year = ? AND month > ?)
                )
                ORDER BY year, month
            `;
            params = [cocode, project, completionYear, completionYear, completionMonth];
        } else {
            query = `
                SELECT ID, cocode, project, phasecode, year, month, value, type
                FROM pocpermonth 
                WHERE cocode = ? 
                AND project = ? 
                AND phasecode = ?
                AND active = 1
                AND value = 100
                AND (
                    year > ? 
                    OR (year = ? AND month > ?)
                )
                ORDER BY year, month
            `;
            params = [cocode, project, phasecode, completionYear, completionYear, completionMonth];
        }

        const [rows] = await pool.execute(query, params);
        return rows;
    }

    /**
     * Mark POC records as deleted when they conflict with updated completion dates
     * @param {string} cocode - Company code
     * @param {string} project - Project name
     * @param {string} phasecode - Phase code (can be empty string)
     * @param {Date} completionDate - New completion date
     * @param {string} deletedBy - Who is marking the records as deleted
     * @returns {Promise<number>} Number of records marked as deleted
     */
    static async markConflictingPocAsDeleted(cocode, project, phasecode, completionDate, deletedBy) {
        const pool = getPool();
        if (!pool) throw new Error('Database not connected');

        const completionYear = completionDate.getFullYear();
        const completionMonth = completionDate.getMonth() + 1;
        const deletionReason = `POC data beyond updated completion date for ${project}-${phasecode || '(Empty Phase)'}`;

        await pool.query('START TRANSACTION');

        try {
            let updateQuery;
            let params;

            if (phasecode === '' || phasecode === null) {
                updateQuery = `
                    UPDATE pocpermonth 
                    SET 
                        active = 0,
                        deleted_at = CURRENT_TIMESTAMP,
                        deleted_by = ?,
                        deletion_reason = ?
                    WHERE cocode = ? 
                    AND project = ? 
                    AND (phasecode IS NULL OR phasecode = '')
                    AND active = 1
                    AND (
                        year > ? 
                        OR (year = ? AND month > ?)
                    )
                `;
                params = [deletedBy, deletionReason, cocode, project, completionYear, completionYear, completionMonth];
            } else {
                updateQuery = `
                    UPDATE pocpermonth 
                    SET 
                        active = 0,
                        deleted_at = CURRENT_TIMESTAMP,
                        deleted_by = ?,
                        deletion_reason = ?
                    WHERE cocode = ? 
                    AND project = ? 
                    AND phasecode = ?
                    AND active = 1
                    AND (
                        year > ? 
                        OR (year = ? AND month > ?)
                    )
                `;
                params = [deletedBy, deletionReason, cocode, project, phasecode, completionYear, completionYear, completionMonth];
            }

            const [result] = await pool.execute(updateQuery, params);
            await pool.query('COMMIT');

            logger.info(`Marked ${result.affectedRows} POC records as deleted for ${project}-${phasecode} beyond ${completionDate.toISOString().split('T')[0]}`);
            
            return result.affectedRows;

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    }

    /**
     * Get project/phase description for UI display
     * @param {string} cocode - Company code
     * @param {string} project - Project name
     * @param {string} phasecode - Phase code
     * @returns {Promise<string>} Description or default text
     */
    static async getProjectPhaseDescription(cocode, project, phasecode) {
        const pool = getPool();
        if (!pool) return `${project}-${phasecode || '(Empty Phase)'}`;

        try {
            let query;
            let params;

            if (phasecode === '' || phasecode === null) {
                query = `
                    SELECT description 
                    FROM project_phase_validation 
                    WHERE cocode = ? AND project = ? AND (phasecode IS NULL OR phasecode = '')
                    LIMIT 1
                `;
                params = [cocode, project];
            } else {
                query = `
                    SELECT description 
                    FROM project_phase_validation 
                    WHERE cocode = ? AND project = ? AND phasecode = ?
                    LIMIT 1
                `;
                params = [cocode, project, phasecode];
            }

            const [rows] = await pool.execute(query, params);
            
            if (rows.length > 0 && rows[0].description) {
                return `${project}-${phasecode || '(Empty Phase)'}: ${rows[0].description}`;
            } else {
                return `${project}-${phasecode || '(Empty Phase)'}`;
            }

        } catch (error) {
            logger.error('Error fetching project/phase description:', error);
            return `${project}-${phasecode || '(Empty Phase)'}`;
        }
    }

    /**
     * Check if completion date upload will cause POC conflicts
     * @param {Array} completionRecords - Array of completion records to be uploaded
     * @returns {Promise<Array>} Array of conflict information
     */
    static async checkCompletionDateConflicts(completionRecords) {
        const conflicts = [];

        for (const record of completionRecords) {
            const { cocode, project, phasecode, completionDate, completionType } = record;
            
            try {
                const conflictingRecords = await this.findConflictingPocRecords(
                    cocode, 
                    project, 
                    phasecode, 
                    new Date(completionDate)
                );

                if (conflictingRecords.length > 0) {
                    const description = await this.getProjectPhaseDescription(cocode, project, phasecode);
                    
                    conflicts.push({
                        cocode,
                        project,
                        phasecode,
                        completionDate,
                        completionType,
                        description,
                        conflictingRecords: conflictingRecords.map(r => ({
                            year: r.year,
                            month: r.month,
                            value: r.value,
                            type: r.type
                        }))
                    });
                }
            } catch (error) {
                logger.error(`Error checking conflicts for ${project}-${phasecode}:`, error);
            }
        }

        return conflicts;
    }
}

module.exports = PocDataUtils;