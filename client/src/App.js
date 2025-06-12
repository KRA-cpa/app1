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
    setDbStatus('checking');
    setDbErrorMessage('');
    try {
      const response = await fetch('http://localhost:3001/api/db-status'); // Using full URL
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const result = await response.json();
      if (result.status === 'connected') {
        setDbStatus('connected');
      } else {
        setDbStatus('error');
        setDbErrorMessage(result.message || 'Backend reported DB not connected.');
      }
    } catch (error) {
      setDbStatus('error');
      setDbErrorMessage(error.message || 'Could not connect to server.');
    }
  };

  useEffect(() => {
    checkDbConnection();
  }, [activeTab]);

  const tabStyles = { /* ... same as before ... */ };
  const activeTabStyles = { /* ... same as before ... */ };

  return (
    <div className="App">
      <header className="App-header">
        <h1>MySQL Data Management via CSV</h1>
      </header>
      <main style={{ padding: '20px' }}>
        <div style={{ marginBottom: '-1px' }}>
          <button style={activeTab === 'uploader' ? activeTabStyles : tabStyles} onClick={() => setActiveTab('uploader')}>Uploader</button>
          <button style={activeTab === 'report' ? activeTabStyles : tabStyles} onClick={() => setActiveTab('report')}>Data Report</button>
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
       
        <p>Current Date/Time: {new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })} | {new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' })}</p>
      <p>All Rights Reserved (r) 2025 by Kenneth Advento</p>
      </footer>
    </div>
  );
}

export default App;