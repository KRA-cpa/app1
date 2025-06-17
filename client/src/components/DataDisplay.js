// client/src/components/DataDisplay.js
// debugging

import React, { useState, useEffect, useCallback } from 'react';
import { logToServer } from '../utils/logger.js';

const DataDisplay = ({ cutoffDate, cocode, dbStatus }) => {
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({ project: '', phasecode: '', year: '' });
  const [options, setOptions] = useState({ projects: [], phasecodes: [], years: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fontSize, setFontSize] = useState('medium'); // New state for font size

  // Debug logging
  console.log('DataDisplay - Props received:', { cutoffDate, cocode, dbStatus });

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
      if (cocode) queryParams.append('cocode', cocode); // Only add if not empty (not "All Companies")
      
      const optionsUrl = `http://localhost:3001/api/pocdata/options?${queryParams.toString()}`;
      console.log('DataDisplay - Fetching options from:', optionsUrl);
      
      const response = await fetch(optionsUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      
      console.log('DataDisplay - Options received:', result);
      setOptions(result);
      logToServer({ level: 'info', message: 'Successfully fetched filter options.' });
    } catch (e) {
      console.error('DataDisplay - Error fetching options:', e);
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
      if (cocode) queryParams.append('cocode', cocode); // Only add if not empty (not "All Companies")

      const dataUrl = `http://localhost:3001/api/pocdata?${queryParams.toString()}`;
      console.log('DataDisplay - Fetching data from:', dataUrl);

      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      
      console.log('DataDisplay - Data received:', { 
        count: result.length, 
        sample: result[0],
        sampleCocode: result[0]?.cocode,
        allCocodes: [...new Set(result.map(r => r.cocode))], // Show unique cocodes in data
        allRecords: result.map(r => ({ ID: r.ID, cocode: r.cocode, project: r.project })) // Show all records briefly
      });
      setData(result);
      logToServer({ level: 'info', message: `Fetched ${result.length} rows for DataDisplay.` });
    } catch (e) {
      console.error('DataDisplay - Error fetching data:', e);
      setError('Failed to fetch data.');
      logToServer({ level: 'error', message: `Error fetching data for DataDisplay: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }, [filters, cutoffDate, cocode]);

  useEffect(() => {
    console.log('DataDisplay - fetchOptions useEffect triggered, cocode:', cocode);
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    console.log('DataDisplay - fetchData useEffect triggered');
    fetchData();
  }, [fetchData]);

  // Reset filters when company changes
  useEffect(() => {
    console.log('DataDisplay - Company changed, resetting filters. New cocode:', cocode || 'All Companies');
    setFilters({ project: '', phasecode: '', year: '' });
  }, [cocode]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    console.log('DataDisplay - Filter changed:', name, value);
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
        <h2 style={{ margin: 0, color: '#343a40' }}>POC Per Month Report</h2>
        
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

      {/* Debug Info - Commented out for production, uncomment for debugging */}
      {/* 
      <div style={{ backgroundColor: '#f0f0f0', padding: '10px', marginBottom: '10px', fontSize: '12px' }}>
        <strong>Debug Info:</strong> cocode={cocode || 'All Companies'}, data count={data.length}, 
        options: projects={options.projects?.length}, phases={options.phasecodes?.length}, years={options.years?.length}
      </div>
      */}

      {/* Enhanced Filter Section */}
      <div style={filterContainerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', minWidth: '60px' }}>Project:</label>
          <select 
            name="project" 
            value={filters.project} 
            onChange={handleFilterChange} 
            disabled={loading}
            style={selectStyle}
          >
            <option value="">All Projects</option>
            {options.projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', minWidth: '50px' }}>Phase:</label>
          <select 
            name="phasecode" 
            value={filters.phasecode} 
            onChange={handleFilterChange} 
            disabled={loading}
            style={selectStyle}
          >
            <option value="">All Phases</option>
            {options.phasecodes.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', minWidth: '40px' }}>Year:</label>
          <select 
            name="year" 
            value={filters.year} 
            onChange={handleFilterChange} 
            disabled={loading}
            style={selectStyle}
          >
            <option value="">All Years</option>
            {options.years.map(y => <option key={y} value={y}>{y}</option>)}
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
                <th style={headerStyle}>Description</th>
                <th style={headerStyle}>Year</th>
                <th style={headerStyle}>Month</th>
                <th style={headerStyle}>Value</th>
                <th style={headerStyle}>Created By</th>
                <th style={headerStyle}>Created At</th>
                <th style={headerStyle}>Updated By</th>
                <th style={headerStyle}>Updated At</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={row.ID} style={index % 2 === 0 ? {} : evenRowStyle}>
                  <td style={cellStyle}>{row.ID}</td>
                  <td style={{...cellStyle, fontWeight: '500', color: '#007bff'}}>{row.cocode}</td>
                  <td style={{...cellStyle, fontWeight: '500'}}>{row.project}</td>
                  <td style={cellStyle}>{row.phasecode}</td>
                  <td style={{...cellStyle, fontStyle: row.description === 'N/A' ? 'italic' : 'normal', color: row.description === 'N/A' ? '#6c757d' : 'inherit'}}>
                    {row.description || 'N/A'}
                  </td>
                  <td style={cellStyle}>{row.year}</td>
                  <td style={cellStyle}>{row.month}</td>
                  <td style={{...cellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: '500'}}>
                    {typeof row.value === 'number' ? row.value.toFixed(2) : row.value}
                  </td>
                  <td style={cellStyle}>{row.userC}</td>
                  <td style={{...cellStyle, fontSize: getFontSize() === '16px' ? '14px' : getFontSize(), color: '#6c757d'}}>
                    {formatDateTime(row.timestampC)}
                  </td>
                  <td style={cellStyle}>{row.userM}</td>
                  <td style={{...cellStyle, fontSize: getFontSize() === '16px' ? '14px' : getFontSize(), color: '#6c757d'}}>
                    {formatDateTime(row.timestampM)}
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

export default DataDisplay;