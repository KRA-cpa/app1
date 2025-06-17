// client/src/components/DataDisplay.js
import React, { useState, useEffect, useCallback } from 'react';
import { logToServer } from '../utils/logger.js';

function DataDisplay({ dbStatus, dbErrorMessage, checkDbConnection }) {

// This component receives the shared 'cutoffDate' as a prop from App.js
const DataDisplay = ({ cutoffDate }) => {
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({ project: '', phasecode: '', year: '' });
  const [options, setOptions] = useState({ projects: [], phasecodes: [], years: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // CORRECTED: Moved this helper function to the main component scope so it's accessible by the JSX.
  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    const pad = (num) => num.toString().padStart(2, '0');

    let hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours %= 12;
    hours = hours || 12; // the hour '0' should be '12'

    const formattedDate = `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
    const formattedTime = `${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${ampm}`;

    return `${formattedDate} ${formattedTime}`;
  };
  
  // This function fetches the options for the filter dropdowns.
  const fetchOptions = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/pocdata/options`);
      if (!response.ok) {
     throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setOptions(result);
      logToServer({ level: 'info', message: 'Successfully fetched filter options for DataDisplay.' });
      logToServer('info', 'Successfully fetched filter options for DataDisplay.', 'DataDisplay');
    } catch (e) {
      // CORRECT: Passing an object to logToServer
      logToServer({ level: 'error', message: `Error fetching filter options: ${e.message}` });
      logToServer('error', `Error fetching filter options: ${e.message}`, 'DataDisplay', { error: e });
    }
  }, []); // Empty dependency array means this function is created once.

  // CORRECTED: Moved the fetchData function to the correct scope.
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const queryParams = new URLSearchParams();
      if (filters.project) queryParams.append('project', filters.project);
      if (filters.phasecode) queryParams.append('phasecode', filters.phasecode);
      if (filters.year) queryParams.append('year', filters.year);

      // Add the cutoffDate prop to the API request
      if (cutoffDate) {
        queryParams.append('cutoffDate', cutoffDate);
      }

      const response = await fetch(`http://localhost:3001/api/pocdata?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setData(result);
      logToServer({ level: 'info', message: 'Successfully fetched ${result.length} rows for DataDisplay.' });
    } catch (e) {
      setError('Failed to fetch data. Please check the console for more details.');
      logToServer({ level: 'error', message: `Error fetching data for DataDisplay: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }, [filters, cutoffDate]); // This function will be re-created if filters or cutoffDate change.

  // CORRECTED: Consolidated into a single, clean useEffect hook.
  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]); // Fetches options only once on component mount.

  useEffect(() => {
    fetchData();
  }, [fetchData]); // Fetches data on mount and whenever filters or cutoffDate change.

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // CORRECTED: The JSX now only contains elements and variables defined within this component.
  return (
    <div className="data-display">
      <h2>POC Per Month Report</h2>
      
      <div className="filters" style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select name="project" value={filters.project} onChange={handleFilterChange} disabled={loading}>
          <option value="">All Projects</option>
          {options.projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select name="phasecode" value={filters.phasecode} onChange={handleFilterChange} disabled={loading}>
          <option value="">All Phases</option>
          {options.phasecodes.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select name="year" value={filters.year} onChange={handleFilterChange} disabled={loading}>
          <option value="">All Years</option>
          {options.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading && <p>Loading data...</p>}
      {error && <p style={{color: 'red'}}>Error: {error}</p>}
      
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
            <th>Phase</th>
            <th>Year</th>
            <th>Month</th>
            <th>Value</th>
            <th>Created By</th>
            <th>Created At</th>
            <th>Updated By</th>
            <th>Updated At</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.ID}>
              <td style={cellStyle}>{row.ID}</td>
              <td style={cellStyle}>{row.project}</td>
              <td style={cellStyle}>{row.phasecode}</td>
              <td style={cellStyle}>{row.year}</td>
              <td style={cellStyle}>{row.month}</td>
              <td style={cellStyle}>{row.value}</td>
              <td style={cellStyle}>{row.userC}</td>
              <td style={cellStyle}>{formatDateTime(row.timestampC)}</td>
              <td style={cellStyle}>{row.userM}</td>
              <td style={cellStyle}>{formatDateTime(row.timestampM)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataDisplay;