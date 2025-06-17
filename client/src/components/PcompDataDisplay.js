import React, { useState, useEffect } from 'react';
import { logToServer } from '../utils/logger';

const PcompDataDisplay = ({ cutoffDate }) => {
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({ project: '', phasecode: '', year: '', type: '' });
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

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const queryParams = new URLSearchParams();
      if (filters.project) queryParams.append('project', filters.project);
      if (filters.phasecode) queryParams.append('phasecode', filters.phasecode);
      if (filters.year) queryParams.append('year', filters.year);
      if (filters.type) queryParams.append('type', filters.type);
      if (cutoffDate) queryParams.append('cutoffDate', cutoffDate);
      
      const url = `http://localhost:3001/api/pcompdata?${queryParams.toString()}`;

      // --- DEBUGGING: Log the URL to the browser's developer console ---
      console.log("Fetching data from URL:", url);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setData(result);
      logToServer({ level: 'info', message: `Fetched ${result.length} rows for PcompDataDisplay.` });
    } catch (e) {
      setError('Failed to fetch completion date data.');
      logToServer({ level: 'error', message: `Error fetching data for PcompDataDisplay: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filters, cutoffDate]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  const tableStyle = { borderCollapse: 'collapse', width: '100%' };
  const cellStyle = {
    border: '1px solid #ddd',
    padding: '8px',
    textAlign: 'left',
  };

  return (
    <div className="data-display">
      <h2>Completion Date Report</h2>
      
      <div className="filters">
        <input name="project" value={filters.project} onChange={handleFilterChange} placeholder="Filter by Project" />
        <input name="phasecode" value={filters.phasecode} onChange={handleFilterChange} placeholder="Filter by Phasecode" />
        <input name="year" value={filters.year} onChange={handleFilterChange} placeholder="Filter by Year" />
        <select name="type" value={filters.type} onChange={handleFilterChange}>
          <option value="">All Types</option>
          <option value="A">Actual</option>
          <option value="P">Projected</option>
        </select>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>ID</th>
            <th style={cellStyle}>Project</th>
            <th style={cellStyle}>Phasecode</th>
            <th style={cellStyle}>Type</th>
            <th style={cellStyle}>Completion Date</th>
            <th style={cellStyle}>Notes</th>
            <th style={cellStyle}>Created At</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>{row.id}</td>
              <td style={cellStyle}>{row.project}</td>
              <td style={cellStyle}>{row.phasecode}</td>
              <td style={cellStyle}>{row.type === 'A' ? 'Actual' : 'Projected'}</td>
              <td style={cellStyle}>{formatDate(row.completion_date)}</td>
              <td style={cellStyle}>{row.notes}</td>
              <td style={cellStyle}>{formatDateTime(row.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PcompDataDisplay;