// client/src/components/DataDisplay.js

import React, { useState, useEffect } from 'react';

function DataDisplay({ dbStatus, dbErrorMessage, checkDbConnection }) {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/poc-data'); 
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: 'An unknown error occurred.' }));
        throw new Error(errData.message || 'Failed to fetch data');
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

  useEffect(() => {
    if (dbStatus === 'connected') {
      fetchData();
    }
  }, [dbStatus]);

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
            <p style={{ color: 'red', fontSize: '0.9em', margin: '5px 0 0 0' }}>{dbErrorMessage || 'Could not connect.'}</p>
            <button onClick={checkDbConnection} disabled={isLoading} style={{ marginLeft: '10px', fontSize: '0.8em' }}>Retry</button>
          </>
        )}
      </div>

      <button onClick={fetchData} disabled={controlsDisabled} style={{ marginBottom: '20px' }}>
        Refresh Data
      </button>

      {isLoading && dbStatus === 'connected' && <p>Loading data...</p>}
      {error && <p style={{color: 'red'}}>Error loading data: {error}</p>}
      
      <table border="1" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
              <tr>
                  <th>ID</th>
                  <th>Project</th>
                  <th>Phase Code</th>
                  <th>Year</th>
                  <th>Month</th>
                  <th>Value</th>
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
                  </tr>
              ))}
          </tbody>
      </table>
    </div>
  );
}

export default DataDisplay;