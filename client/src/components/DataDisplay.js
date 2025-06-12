// client/src/components/DataDisplay.js
import React, { useState, useEffect, useMemo } from 'react';
import { logToServer } from '../utils/logger'; // Make sure path is correct

function DataDisplay() {
  const [pocData, setPocData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ projects: [], phasecodes: [], years: [] });
  const [isOptionsLoading, setIsOptionsLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedPhasecode, setSelectedPhasecode] = useState('');
  const [selectedYear, setSelectedYear] = useState('');

  // --- Fetch Filter Options ---
  useEffect(() => {
    const fetchOptions = async () => {
      // Log start
      logToServer('info', 'Fetching filter options', 'DataDisplay');
      setIsOptionsLoading(true);
      try {
        const response = await fetch('/api/pocdata/options');
        if (!response.ok) throw new Error('Failed to fetch filter options');
        const options = await response.json();
        // Log received options (summary)
        logToServer('info', 'Received filter options', 'DataDisplay', {
            projectsCount: options.projects?.length ?? 0,
            phasecodesCount: options.phasecodes?.length ?? 0,
            yearsCount: options.years?.length ?? 0
        });
        setFilterOptions(options);
      } catch (e) {
        // Keep console error for dev visibility
        console.error("[DataDisplay Options] Failed to fetch filter options:", e);
        // Log error persistently
        logToServer('error', `Failed to fetch filter options: ${e.message}`, 'DataDisplay', { error: e });
      } finally {
        setIsOptionsLoading(false);
      }
    };
    fetchOptions();
  }, []); // Runs once on mount

  // --- Fetch Data based on selected filters ---
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedProject) params.append('project', selectedProject);
      if (selectedPhasecode) params.append('phasecode', selectedPhasecode);
      if (selectedYear) params.append('year', selectedYear);
      const queryString = params.toString();
      const apiUrl = queryString ? `/api/pocdata?${queryString}` : '/api/pocdata';

      // Log the fetch attempt and URL
      logToServer('info', 'Fetching data', 'DataDisplay', { url: apiUrl });

      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // Log the count of data received
        logToServer('info', 'Data received from backend', 'DataDisplay', { count: data.length, url: apiUrl });
        setPocData(data);
      } catch (e) {
        // Keep console error for dev visibility
        console.error("[DataDisplay Fetch] Failed to fetch data:", e);
         // Log error persistently
        logToServer('error', `Failed to fetch data: ${e.message}`, 'DataDisplay', { error: e, url: apiUrl });
        setError(`Failed to load data: ${e.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

  }, [selectedProject, selectedPhasecode, selectedYear]); // Re-run when filters change

  // Helper to format date/time (same as before)
  const formatDateTime = (dateTimeString) => {
     if (!dateTimeString) return '';
     const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Manila' };
     try {
       return new Intl.DateTimeFormat('en-US', options).format(new Date(dateTimeString));
     } catch (e) { return 'Invalid Date'; }
   };

  // Log state just before rendering (keep as console.log for local dev debugging)
  // This log is very noisy for persistent logging
  console.log('[DataDisplay Render] Rendering with state:', {
      isLoading,
      isOptionsLoading,
      error,
      selectedProject,
      selectedPhasecode,
      selectedYear,
      filterOptionsLoaded: !!(filterOptions.projects?.length || filterOptions.phasecodes?.length || filterOptions.years?.length), // Check if options seem loaded
      pocDataLength: pocData.length
  });

  return (
    <div style={{ marginTop: '30px' }}>
      <h2>Existing PoC Data</h2>

      {/* --- Filter Section --- */}
      <div style={{ marginBottom: '15px', padding: '10px', background: '#f9f9f9', border: '1px solid #eee', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
        <strong>Filters:</strong>
        {isOptionsLoading ? (
            <span>Loading filter options...</span>
        ) : (
          <>
            {/* Project Filter */}
            <select value={selectedProject} onChange={(e) => { const value = e.target.value; logToServer('info', `Filter changed - Project: ${value || 'All'}`, 'DataDisplay'); setSelectedProject(value); }} title="Filter by Project">
              <option value="">-- All Projects --</option>
              {filterOptions.projects.map(proj => <option key={proj} value={proj}>{proj}</option>)}
            </select>

            {/* Phase Code Filter */}
            <select value={selectedPhasecode} onChange={(e) => { const value = e.target.value; logToServer('info', `Filter changed - Phasecode: ${value || 'All'}`, 'DataDisplay'); setSelectedPhasecode(value); }} title="Filter by Phase Code">
              <option value="">-- All Phase Codes --</option>
              {filterOptions.phasecodes.map(pc => <option key={pc} value={pc}>{pc}</option>)}
            </select>

            {/* Year Filter */}
            <select value={selectedYear} onChange={(e) => { const value = e.target.value; logToServer('info', `Filter changed - Year: ${value || 'All'}`, 'DataDisplay'); setSelectedYear(value); }} title="Filter by Year">
              <option value="">-- All Years --</option>
              {filterOptions.years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </>
        )}
      </div>
      {/* --- End Filter Section --- */}

      {/* Display error message if fetch failed */}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* Display loading indicator */}
      {isLoading && <p>Loading data...</p>}

      {/* Data Table (Scrollable) */}
      {!isLoading && !error && (
        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ccc' }}>
          <table border="1" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#eee' }}>
              <tr>
                <th>ID</th><th>Project</th><th>Phase Code</th><th>Year</th><th>Month</th>
                <th>Value</th><th>Created</th><th>User C</th><th>Modified</th><th>User M</th>
              </tr>
            </thead>
            <tbody>
              {pocData.length === 0 ? (
                <tr><td colSpan="10" style={{ textAlign: 'center', padding: '10px' }}>No matching data found.</td></tr>
              ) : (
                pocData.map((row) => {
                  // Keep individual row log commented out unless needed for specific debugging
                  // console.log('>>>>>> Rendering row:', row);
                  return (
                    <tr key={row.ID}>
                      <td>{row.ID}</td><td>{row.project}</td><td>{row.phasecode}</td><td>{row.year}</td><td>{row.month}</td>
                      <td>{row.value != null ? parseFloat(row.value).toFixed(2) : 'N/A'}</td>
                      <td>{formatDateTime(row.timestampC)}</td><td>{row.userC}</td>
                      <td>{formatDateTime(row.timestampM)}</td><td>{row.userM}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default DataDisplay;