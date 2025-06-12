// client/src/App.js

import React, { useState, useEffect } from 'react';
import CsvUploader from './components/CsvUploader';
import DataDisplay from './components/DataDisplay';
import { logToServer } from './utils/logger';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('uploader');
  const [dbStatus, setDbStatus] = useState('checking');
  const [dbErrorMessage, setDbErrorMessage] = useState('');

  const checkDbConnection = async () => {
    logToServer('info', 'Checking DB connection status from App.js', { tab: activeTab });
    setDbStatus('checking');
    setDbErrorMessage('');

    try {
      const response = await fetch('/api/db-status', {
        method: 'GET',
        cache: 'no-store',
      });
      
      if (!response.ok) {
        let errorMsg = `Backend responded with status ${response.status}`;
        try {
          const errorResult = await response.json();
          errorMsg = errorResult.message || errorMsg;
        } catch (parseError) {}
        throw new Error(errorMsg);
      }

      const result = await response.json();
      if (result.status === 'connected') {
        setDbStatus('connected');
      } else {
        const errorMsg = result.message || 'Backend reported DB not connected.';
        setDbErrorMessage(errorMsg);
        setDbStatus('error');
      }
    } catch (error) {
      logToServer('error', `Setting DB status to error (fetch/logic failed): ${error.message}`);
      setDbStatus('error');
      setDbErrorMessage(error.message || 'Could not verify server connection status.');
    }
  };

  useEffect(() => {
    checkDbConnection();
  }, [activeTab]);

  const tabStyles = {
    padding: '10px 15px',
    cursor: 'pointer',
    border: '1px solid #ccc',
    borderBottom: 'none',
    marginRight: '5px',
    background: '#f1f1f1',
    borderRadius: '5px 5px 0 0'
  };

  const activeTabStyles = {
    ...tabStyles,
    background: 'white',
    borderBottom: '1px solid white',
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>MySQL Data Management via CSV</h1>
      </header>
      <main style={{ padding: '20px' }}>
        <div style={{ marginBottom: '-1px' }}>
          <button style={activeTab === 'uploader' ? activeTabStyles : tabStyles} onClick={() => setActiveTab('uploader')}>
            Uploader
          </button>
          <button style={activeTab === 'report' ? activeTabStyles : tabStyles} onClick={() => setActiveTab('report')}>
            Data Report
          </button>
        </div>

        <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '0 5px 5px 5px' }}>
          {activeTab === 'uploader' && 
            <CsvUploader 
              dbStatus={dbStatus}
              dbErrorMessage={dbErrorMessage}
              checkDbConnection={checkDbConnection}
            />
          }
          {activeTab === 'report' && 
            <DataDisplay 
              dbStatus={dbStatus}
              dbErrorMessage={dbErrorMessage}
              checkDbConnection={checkDbConnection}
            />
          }
        </div>
      </main>
      <footer style={{ marginTop: '30px', fontSize: '0.8em', color: '#555', textAlign: 'center' }}>
         <p>Current Date/Time: {new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })} | {new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' })}
       </p>
      </footer>
    </div>
  );
}

export default App;