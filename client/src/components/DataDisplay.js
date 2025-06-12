// client/src/components/DataDisplay.js
import React, { useState, useEffect } from 'react';

function DataDisplay({ dbStatus, dbErrorMessage, checkDbConnection }) {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ projects: [], phasecodes: [], years: [] });
  const [selectedFilters, setSelectedFilters] = useState({ project: '', phasecode: '', year: '' });

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    
    const params = new URLSearchParams();
    if (selectedFilters.project) params.append('project', selectedFilters.project);
    if (selectedFilters.phasecode) params.append('phasecode', selectedFilters.phasecode);
    if (selectedFilters.year) params.append('year', selectedFilters.year);

    try {
      const response = await fetch(`http://localhost:3001/api/pocdata?${params.toString()}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to fetch data from server.');
      }
      const jsonData = await response.json();
      setData(jsonData);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err.message);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const fetchFilterOptions = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/pocdata/options');
      if (!response.ok) throw new Error('Could not load filter options');
      const jsonData = await response.json();
      setFilterOptions(jsonData);
    } catch (err) {
      console.error("Error fetching filter options:", err);
    }
  };

  useEffect(() => {
    if (dbStatus === 'connected') {
      fetchFilterOptions();
      fetchData();
    }
  }, [dbStatus]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setSelectedFilters(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    if (dbStatus === 'connected') {
      fetchData();
    }
  }, [selectedFilters, dbStatus]);
  
  const controlsDisabled = isLoading || dbStatus !== 'connected';

  return (
    <div>
      <h2>Data Report</h2>
      <div style={{ margin: '15px 0', padding: '10px', border: `1px solid ${dbStatus === 'connected' ? 'green' : (dbStatus === 'error' ? 'red' : '#ccc')}`, borderRadius: '4px' }}>
        <strong>Database Status:</strong>
        {dbStatus === 'checking' && <span style={{ marginLeft: '10px', color: '#888' }}> Checking...</span>}
        {dbStatus === 'connected' && <span style={{ marginLeft: '10px', color: 'green', fontWeight: 'bold' }}> Connected</span>}
        {dbStatus === 'error' && (
          <>
            <span style={{ marginLeft: '10px', color: 'red', fontWeight: 'bold' }}> Error</span>
            <p style={{ color: 'red', fontSize: '0.9em', margin: '5px 0 0 0' }}>{dbErrorMessage}</p>
            <button onClick={checkDbConnection} disabled={isLoading} style={{ marginLeft: '10px', fontSize: '0.8em' }}>Retry</button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select name="project" value={selectedFilters.project} onChange={handleFilterChange} disabled={controlsDisabled}>
          <option value="">All Projects</option>
          {filterOptions.projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select name="phasecode" value={selectedFilters.phasecode} onChange={handleFilterChange} disabled={controlsDisabled}>
          <option value="">All Phases</option>
          {filterOptions.phasecodes.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select name="year" value={selectedFilters.year} onChange={handleFilterChange} disabled={controlsDisabled}>
          <option value="">All Years</option>
          {filterOptions.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {isLoading && <p>Loading data...</p>}
      {error && <p style={{color: 'red'}}>Error loading data: {error}</p>}
      
      <table border="1" style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9em' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Project</th>
              <th>Phase</th>
              <th>Year</th>
              <th>Month</th>
              <th>Value</th>
              {/* --- NEW COLUMNS --- */}
              <th>Created By</th>
              <th>Created At</th>
              <th>Updated By</th>
              <th>Updated At</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.ID}>
                <td>{row.ID}</td>
                <td>{row.project}</td>
                <td>{row.phasecode}</td>
                <td>{row.year}</td>
                <td>{row.month}</td>
                <td>{row.value}</td>
                {/* --- NEW COLUMNS --- */}
                <td>{row.userC}</td>
                <td>{new Date(row.timestampC).toLocaleString()}</td>
                <td>{row.userM}</td>
                <td>{new Date(row.timestampM).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
      </table>
    </div>
  );
}

export default DataDisplay;