// kra-cpa/app1/app1-test1/client/src/App.js

import React, { useState, useEffect, useCallback } from 'react'; // --- NEW: Added useEffect and useCallback
import CsvUploader from './components/CsvUploader';
import DataDisplay from './components/DataDisplay';
import PcompDataDisplay from './components/PcompDataDisplay';
import './App.css';

const getDefaultCutoff = () => {
  const today = new Date();
  const firstDayOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfLastMonth = new Date(firstDayOfThisMonth.getTime() - 1);
  return lastDayOfLastMonth.toISOString().split('T')[0];
};

function App() {
  const [mainView, setMainView] = useState('upload'); 
  const [reportView, setReportView] = useState('poc'); 
  const [cutoffDate, setCutoffDate] = useState(getDefaultCutoff());
  const [refreshKey, setRefreshKey] = useState(0);
// --- NEW: State for hovered tab, necessary for getTabStyles ---
  const [hoveredTab, setHoveredTab] = useState(null);

  // --- NEW: State variables to hold the database connection status ---
  const [dbStatus, setDbStatus] = useState('checking'); // Can be 'checking', 'connected', or 'error'
  const [dbErrorMessage, setDbErrorMessage] = useState('');
  const [isCheckingDb, setIsCheckingDb] = useState(false);

  // --- NEW: Function to check the database connection from the backend ---
  const checkDbConnection = useCallback(async () => {
 
   

    setIsCheckingDb(true);
    setDbStatus('checking');
    try {
      const response = await fetch('http://localhost:3001/api/db-status');
      const data = await response.json();
      if (response.ok && data.status === 'connected') {
        setDbStatus('connected');
        setDbErrorMessage('');
      } else {
        // Use the message from the backend, or a default one
        throw new Error(data.message || 'Failed to connect to the database.');
      }
    } catch (error) {
      setDbStatus('error');
      setDbErrorMessage(error.message);
    } finally {
      setIsCheckingDb(false);
    }
  }, []); // useCallback ensures this function doesn't get recreated on every render

  // --- NEW: useEffect to run the database check when the component first loads ---
  useEffect(() => {
    checkDbConnection();
  }, [checkDbConnection]);


  const handleUploadSuccess = () => {
    setRefreshKey(prevKey => prevKey + 1);
    setMainView('report');
  };

  // --- Style definitions moved from handleUploadSuccess and corrected ---
  // This style object is defined but not currently used in the JSX.
  const tabContainerStyles = {
    display: 'flex',
    borderBottom: '2px solid #ddd',
    marginBottom: '20px',
  };

  // Assuming 'activeTab' refers to 'mainView' for the main navigation tabs.
  // 'hoveredTab' state is added to manage hover effects if these styles are applied.
  const getTabStyles = (tabName) => ({
    padding: '12px 20px',
    cursor: 'pointer',
    marginRight: '8px',
    border: 'none',
    background: 'none',
    fontSize: '16px',
    fontWeight: mainView === tabName ? '600' : '500', // Was activeTab
    color: mainView === tabName ? '#007bff' : '#555',   // Was activeTab
    borderBottom: mainView === tabName ? '2px solid #007bff' : '2px solid transparent', // Was activeTab
    transition: 'all 0.3s ease',
    outline: 'none',
    ...(hoveredTab === tabName && mainView !== tabName && { color: '#0056b3', borderBottom: '2px solid #aaccff' }), // Was activeTab
  });

  // This style object is defined but not currently used in the JSX.
  const mainStyles = {
    padding: '20px',
    margin: '0 auto',
    transition: 'max-width 0.5s ease-in-out',
    maxWidth: mainView === 'report' ? '90%' : '900px' // Was activeTab
  };


  return (
    <div className="App">
      <header className="App-header">
        <h1>MEG Subs POC Data Management</h1>
      </header>
      <main>
        <nav className="main-nav">
          <button
            onClick={() => setMainView('upload')}
            disabled={mainView === 'upload'}
            // Example of how getTabStyles and hoveredTab state could be used:
             style={getTabStyles('upload')}
             onMouseEnter={() => setHoveredTab('upload')}
             onMouseLeave={() => setHoveredTab(null)}
          >
            Upload Data
          </button>
          <button
            onClick={() => setMainView('report')}
            disabled={mainView === 'report'}
            style={getTabStyles('report')}
            onMouseEnter={() => setHoveredTab('report')}
            onMouseLeave={() => setHoveredTab(null)}
          >
            Data Report
          </button>
        </nav>

        <div className="view-container">
          {mainView === 'upload' ? (
            <CsvUploader onUploadSuccess={handleUploadSuccess} />
          ) : (
            <div className="report-section">

              {/* --- NEW: JSX to display the database status --- */}
              <div className="status-bar" style={{ margin: '15px 0', padding: '10px', border: `1px solid ${dbStatus === 'connected' ? 'green' : (dbStatus === 'error' ? 'red' : '#ccc')}`, borderRadius: '4px' }}>
                <strong>Database Status:</strong>
                {dbStatus === 'checking' && <span style={{ marginLeft: '10px', color: '#888' }}> Checking...</span>}
                {dbStatus === 'connected' && <span style={{ marginLeft: '10px', color: 'green', fontWeight: 'bold' }}> Connected</span>}
                {dbStatus === 'error' && (
                  <>
                    <span style={{ marginLeft: '10px', color: 'red', fontWeight: 'bold' }}> Error</span>
                    <p style={{ color: 'red', fontSize: '0.9em', margin: '5px 0 0 10px' }}>{dbErrorMessage}</p>
                    <button onClick={checkDbConnection} disabled={isCheckingDb} style={{ marginLeft: '10px', fontSize: '0.8em' }}>
                      Retry Connection
                    </button>
                  </>
                )}
              </div>

              <div className="view-controls">
                <div className="control-group">
                  <label htmlFor="cutoff-date">Cutoff Date: </label>
                  <input
                    type="date"
                    id="cutoff-date"
                    value={cutoffDate}
                    onChange={(e) => setCutoffDate(e.target.value)}
                  />
                </div>
                <div className="control-group">
                  <button onClick={() => setReportView('poc')} disabled={reportView === 'poc'}
                    style={getTabStyles('poc')}
                    onMouseEnter={() => setHoveredTab('poc')}
                    onMouseLeave={() => setHoveredTab(null)}
                    >
                    POC Per Month Report
                  </button>
                  <button onClick={() => setReportView('pcomp')} disabled={reportView === 'pcomp'}
                    style={getTabStyles('pcomp')}
                    onMouseEnter={() => setHoveredTab('pcomp')}
                    onMouseLeave={() => setHoveredTab(null)}
                   >
                    Completion Date Report
                  </button>
                </div>
              </div>
              
              {/* Only render reports if the DB connection is successful */}
              {dbStatus === 'connected' && (
                <>
                  {reportView === 'poc' ? (
                    <DataDisplay key={`poc-${refreshKey}`} cutoffDate={cutoffDate} />
                  ) : (
                    <PcompDataDisplay key={`pcomp-${refreshKey}`} cutoffDate={cutoffDate} />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
      <footer style={{ marginTop: '30px', fontSize: '0.8em', color: '#555', textAlign: 'center' }}>
        <p>Current Date/Time: {new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })} | {new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' })}</p>
        <p>All Rights Reserved (r) 2025 by Kenneth Advento</p>
      </footer>

    </div>
  );
}

export default App;