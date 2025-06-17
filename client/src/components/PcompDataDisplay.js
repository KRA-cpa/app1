// kra-cpa/app1/app1-test1/client/src/components/PcompDataDisplay.js

import React, { useState, useEffect } from 'react';
import { logToServer } from '../utils/logger.js';

// This new component is dedicated to the re.pcompdate table.
// It receives the shared 'cutoffDate' as a prop.
const PcompDataDisplay = ({ cutoffDate }) => {
  const [data, setData] = useState([]);
  // --- NEW: Filters specific to this view ---
  const [filters, setFilters] = useState({ project: '', phasecode: '', year: '', type: '' });
  // Options for filters can be fetched if needed, or hardcoded for 'type'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const queryParams = new URLSearchParams();
      if (filters.project) queryParams.append('project', filters.project);
      if (filters.phasecode) queryParams.append('phasecode', filters.phasecode);
      if (filters.year) queryParams.append('year', filters.year);
      if (filters.type) queryParams.append('type', filters.type); // Add type filter

      // Add the shared cutoffDate to the API request
      if (cutoffDate) {
        queryParams.append('cutoffDate', cutoffDate);
      }
      
      // --- NEW: Fetch from the /api/pcompdata endpoint ---
      const response = await fetch(`http://localhost:3001/api/pcompdata?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setData(result);
      logToServer.info(`Successfully fetched ${result.length} rows for PcompDataDisplay.`);
    } catch (e) {
      setError('Failed to fetch completion date data.');
      logToServer.error('Error fetching data for PcompDataDisplay:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Re-fetch data if any filter or the cutoffDate changes.
  }, [filters, cutoffDate]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="data-display">
      <h2>Completion Date Report</h2>
      
      <div className="filters">
        <input name="project" value={filters.project} onChange={handleFilterChange} placeholder="Filter by Project" />
        <input name="phasecode" value={filters.phasecode} onChange={handleFilterChange} placeholder="Filter by Phasecode" />
        <input name="year" value={filters.year} onChange={handleFilterChange} placeholder="Filter by Year" />
        {/* --- NEW: Filter for Type (Actual/Projected) --- */}
        <select name="type" value={filters.type} onChange={handleFilterChange}>
          <option value="">All Types</option>
          <option value="A">Actual</option>
          <option value="P">Projected</option>
        </select>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      
const cellStyle = {
  border: '1px solid #ddd', // A common light grey border
  padding: '8px',
  textAlign: 'left',
};

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Project</th>
            <th>Phasecode</th>
            <th>Type</th>
            <th>Completion Date</th>
            <th>Notes</th>
            <th>Created At</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>{row.id}</td>
              <td style={cellStyle}>{row.project}</td>
              <td style={cellStyle}>{row.phasecode}</td>
              <td style={cellStyle}>{row.type === 'A' ? 'Actual' : 'Projected'}</td>
              <td style={cellStyle}>{new Date(row.completion_date).toLocaleDateString()}</td>
              <td style={cellStyle}>{row.notes}</td>
              <td style={cellStyle}>{new Date(row.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PcompDataDisplay;