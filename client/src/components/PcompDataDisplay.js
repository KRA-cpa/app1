
// client/src/components/PcompDataDisplay.js
// debugging

import React, { useState, useEffect } from 'react';
import { logToServer } from '../utils/logger';

const PcompDataDisplay = ({ cutoffDate, cocode }) => {
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({ project: '', phasecode: '', year: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fontSize, setFontSize] = useState('medium'); // New state for font size

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
      if (cocode) queryParams.append('cocode', cocode); // Only add if not empty (not "All Companies")
      
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
  }, [filters, cutoffDate, cocode]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleFontSizeChange = (e) => {
    setFontSize(e.target.value);
  };

  // Font size styles
  const getFontSize = () => {
    switch(fontSize) {
      case 'small': return '12px';
      case 'medium': return '14px';
      case 'large': return '16px';
      default: return '14px';
    }
  };
  
  // Enhanced table styles with improved spacing and readability
  const tableContainerStyle = {
    marginTop: '20px',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  };

  const tableStyle = { 
    borderCollapse: 'collapse', 
    width: '100%',
    fontSize: getFontSize(),
    backgroundColor: '#fff'
  };

  const headerStyle = {
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    padding: '12px 8px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#495057',
    position: 'sticky',
    top: 0,
    zIndex: 10
  };

  const cellStyle = {
    border: '1px solid #dee2e6',
    padding: '10px 8px',
    textAlign: 'left',
    verticalAlign: 'top',
    lineHeight: '1.4'
  };

  const evenRowStyle = {
    backgroundColor: '#f8f9fa'
  };

  const filterContainerStyle = {
    display: 'flex',
    gap: '15px',
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #dee2e6'
  };

  const selectStyle = {
    padding: '8px 12px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '14px',
    backgroundColor: 'white',
    cursor: 'pointer',
    minWidth: '120px'
  };

  const summaryStyle = {
    padding: '15px',
    backgroundColor: '#e8f4fd',
    border: '1px solid #007bff',
    borderRadius: '6px',
    marginBottom: '20px'
  };

  return (
    <div className="data-display" style={{ padding: '0 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#343a40' }}>Completion Date Report</h2>
        
        {/* Font Size Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label htmlFor="fontSize" style={{ fontSize: '14px', fontWeight: '500' }}>Font Size:</label>
          <select 
            id="fontSize"
            value={fontSize} 
            onChange={handleFontSizeChange}
            style={{ ...selectStyle, minWidth: '80px' }}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>
      </div>

      {/* Enhanced Filter Section */}
      <div style={filterContainerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', minWidth: '60px' }}>Project:</label>
          <input 
            name="project" 
            value={filters.project} 
            onChange={handleFilterChange} 
            placeholder="Filter by Project"
            style={{ ...selectStyle, minWidth: '150px' }}
          />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', minWidth: '50px' }}>Phase:</label>
          <input 
            name="phasecode" 
            value={filters.phasecode} 
            onChange={handleFilterChange} 
            placeholder="Filter by Phasecode"
            style={{ ...selectStyle, minWidth: '150px' }}
          />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', minWidth: '40px' }}>Year:</label>
          <input 
            name="year" 
            value={filters.year} 
            onChange={handleFilterChange} 
            placeholder="Filter by Year"
            style={{ ...selectStyle, minWidth: '100px' }}
          />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', minWidth: '40px' }}>Type:</label>
          <select 
            name="type" 
            value={filters.type} 
            onChange={handleFilterChange}
            style={selectStyle}
          >
            <option value="">All Types</option>
            <option value="A">Actual</option>
            <option value="P">Projected</option>
          </select>
        </div>
      </div>

      {/* Data Summary */}
      {data.length > 0 && (
        <div style={summaryStyle}>
          <strong>📊 Summary:</strong> Showing {data.length} record{data.length !== 1 ? 's' : ''} 
          {cocode ? ` for ${cocode}` : ' for all companies'}
          {filters.project && ` | Project: ${filters.project}`}
          {filters.phasecode && ` | Phase: ${filters.phasecode}`}
          {filters.year && ` | Year: ${filters.year}`}
          {filters.type && ` | Type: ${filters.type === 'A' ? 'Actual' : 'Projected'}`}
        </div>
      )}

      {loading && <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>🔄 Loading data...</div>}
      {error && <div style={{ padding: '20px', textAlign: 'center', color: '#dc3545', backgroundColor: '#f8d7da', borderRadius: '4px' }}>❌ Error: {error}</div>}
      
      {!loading && !error && data.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6c757d', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          📭 No data found matching the current filters.
        </div>
      )}

      {/* Enhanced Table */}
      {data.length > 0 && (
        <div style={tableContainerStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerStyle}>ID</th>
                <th style={headerStyle}>Company</th>
                <th style={headerStyle}>Project</th>
                <th style={headerStyle}>Phase</th>
                <th style={headerStyle}>Project/Phase Name</th>
                <th style={headerStyle}>Competion Type</th>
                <th style={headerStyle}>Completion Date</th>
                {/* Notes Column Commented out
                 <th style={headerStyle}>Notes</th> */}
                <th style={headerStyle}>Created At</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={row.id} style={index % 2 === 0 ? {} : evenRowStyle}>
                  <td style={cellStyle}>{row.id}</td>
                  <td style={{...cellStyle, fontWeight: '500', color: '#007bff'}}>{row.cocode}</td>
                  <td style={{...cellStyle, fontWeight: '500'}}>{row.project}</td>
                  <td style={cellStyle}>{row.phasecode}</td>
                  <td style={{...cellStyle, fontStyle: row.description === 'N/A' ? 'italic' : 'normal', color: row.description === 'N/A' ? '#6c757d' : 'inherit'}}>
                    {row.description || 'N/A'}
                  </td>
                  <td style={cellStyle}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '500',
                      backgroundColor: row.type === 'A' ? '#d4edda' : '#fff3cd',
                      color: row.type === 'A' ? '#155724' : '#856404',
                      border: `1px solid ${row.type === 'A' ? '#c3e6cb' : '#ffeaa7'}`
                    }}>
                      {row.type === 'A' ? 'Actual' : 'Projected'}
                    </span>
                  </td>
                  <td style={{...cellStyle, fontWeight: '500'}}>{formatDate(row.completion_date)}</td>
                  {/*  Notes Column Commented out
                   <td style={{...cellStyle, maxWidth: '200px', wordWrap: 'break-word'}}>{row.notes}</td> */}
                  <td style={{...cellStyle, fontSize: getFontSize() === '16px' ? '14px' : getFontSize(), color: '#6c757d'}}>
                    {formatDateTime(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PcompDataDisplay;