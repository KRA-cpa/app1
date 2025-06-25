// client/src/App.js
import React, { useState, useEffect } from 'react';
import CsvUploader from './components/CsvUploader';
import DataDisplay from './components/DataDisplay';
import { logToServer } from './utils/logger';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('uploader');
  const [hoveredTab, setHoveredTab] = useState(null);
  const [dbStatus, setDbStatus] = useState('checking');
  const [dbErrorMessage, setDbErrorMessage] = useState('');

  const checkDbConnection = async () => {
    setDbStatus('checking');
    setDbErrorMessage('');
    try {
      const response = await fetch('http://localhost:3001/api/db-status');
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
      logToServer('error', `Failed to check DB status: ${error.message}`);
    }
  };

  useEffect(() => {
    checkDbConnection();
  }, [activeTab]);

  const tabContainerStyles = {
    display: 'flex',
    borderBottom: '2px solid #ddd',
    marginBottom: '20px',
  };

  const getTabStyles = (tabName) => ({
    padding: '12px 20px',
    cursor: 'pointer',
    marginRight: '8px',
    border: 'none',
    background: 'none',
    fontSize: '16px',
    fontWeight: activeTab === tabName ? '600' : '500',
    color: activeTab === tabName ? '#007bff' : '#555',
    borderBottom: activeTab === tabName ? '2px solid #007bff' : '2px solid transparent',
    transition: 'all 0.3s ease',
    outline: 'none',
    ...(hoveredTab === tabName && activeTab !== tabName && { color: '#0056b3', borderBottom: '2px solid #aaccff' }),
  });

  // --- NEW: Dynamic styles for the main content area ---
  const mainStyles = {
    padding: '20px',
    margin: '0 auto',
    transition: 'max-width 0.5s ease-in-out',
    // Conditionally set max-width based on the active tab
    maxWidth: activeTab === 'report' ? '90%' : '900px'
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>MySQL Data Management via CSV</h1>
      </header>
      {/* --- Apply the dynamic styles to the main element --- */}
      <main style={mainStyles}>
        <div style={tabContainerStyles}>
          <button
            style={getTabStyles('uploader')}
            onClick={() => setActiveTab('uploader')}
            onMouseEnter={() => setHoveredTab('uploader')}
            onMouseLeave={() => setHoveredTab(null)}
          >
            Uploader
          </button>
          <button
            style={getTabStyles('report')}
            onClick={() => setActiveTab('report')}
            onMouseEnter={() => setHoveredTab('report')}
            onMouseLeave={() => setHoveredTab(null)}
          >
            Data Report
          </button>
        </div>

        <div style={{ padding: '20px', borderRadius: '5px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
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