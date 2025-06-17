// client/src/components/DataDisplay.js

import React, { useState, useEffect, useCallback } from 'react';
import { logToServer } from '../utils/logger.js';

const DataDisplay = ({ cutoffDate, cocode }) => {
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({ project: '', phasecode: '', year: '' });
  const [options, setOptions] = useState({ projects: [], phasecodes: [], years: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).format(date);
  };
  
 const formatDate = (dateString) => {
        if (!dateString) {
            return '';
        }
        const date = new Date(dateString);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    };

  const fetchOptions = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams();
      if (cocode) queryParams.append('cocode', cocode);
      
      const response = await fetch(`http://localhost:3001/api/pocdata/options?${queryParams.toString()}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setOptions(result);
      logToServer({ level: 'info', message: 'Successfully fetched filter options.' });
    } catch (e) {
      logToServer({ level: 'error', message: `Error fetching filter options: ${e.message}` });
    }
  }, [cocode]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const queryParams = new URLSearchParams();
      if (filters.project) queryParams.append('project', filters.project);
      if (filters.phasecode) queryParams.append('phasecode', filters.phasecode);
      if (filters.year) queryParams.append('year', filters.year);
      if (cutoffDate) queryParams.append('cutoffDate', cutoffDate);
      if (cocode) queryParams.append('cocode', cocode);

      const response = await fetch(`http://localhost:3001/api/pocdata?${queryParams.toString()}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setData(result);
      logToServer({ level: 'info', message: `Fetched ${result.length} rows for DataDisplay.` });
    } catch (e) {
      setError('Failed to fetch data.');
      logToServer({ level: 'error', message: `Error fetching data for DataDisplay: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }, [filters, cutoffDate, cocode]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset filters when company changes
  useEffect(() => {
    setFilters({ project: '', phasecode: '', year: '' });
  }, [cocode]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  // --- CORRECTED: Define style objects before the return statement ---
  const tableStyle = { borderCollapse: 'collapse', width: '100%' };
  const cellStyle = {
    border: '1px solid #ddd',
    padding: '8px',
    textAlign: 'left',
  };

  return (
    <div className="data-display">
      <h2>POC Per Month Report</h2>
      
      <div className="filters">
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
      
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>ID</th>
            <th style={cellStyle}>Company</th>
            <th style={cellStyle}>Project</th>
            <th style={cellStyle}>Phase</th>
            <th style={cellStyle}>Description</th>
            <th style={cellStyle}>Year</th>
            <th style={cellStyle}>Month</th>
            <th style={cellStyle}>Value</th>
            <th style={cellStyle}>Created By</th>
            <th style={cellStyle}>Created At</th>
            <th style={cellStyle}>Updated By</th>
            <th style={cellStyle}>Updated At</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.ID}>
              <td style={cellStyle}>{row.ID}</td>
              <td style={cellStyle}>{row.cocode}</td>
              <td style={cellStyle}>{row.project}</td>
              <td style={cellStyle}>{row.phasecode}</td>
              <td style={cellStyle}>{row.description || 'N/A'}</td>
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
};

export default DataDisplay;