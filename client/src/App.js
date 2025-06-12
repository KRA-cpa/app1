// client/src/App.js
import React, { useState } from 'react'; // Import useState
import CsvUploader from './components/CsvUploader';
import DataDisplay from './components/DataDisplay';
import './App.css';

function App() {
  // NEW: State to manage which tab is active. 'uploader' is the default.
  const [activeTab, setActiveTab] = useState('uploader');

  // Basic styling for tabs
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
        <p>Using React Frontend</p>
      </header>
      <main style={{ padding: '20px' }}>
        {/* --- NEW: Tab Navigation --- */}
        <div style={{ marginBottom: '-1px' }}>
          <button
            style={activeTab === 'uploader' ? activeTabStyles : tabStyles}
            onClick={() => setActiveTab('uploader')}
          >
            Uploader
          </button>
          <button
            style={activeTab === 'report' ? activeTabStyles : tabStyles}
            onClick={() => setActiveTab('report')}
          >
            Data Report
          </button>
        </div>

        {/* --- NEW: Conditionally render components based on active tab --- */}
        <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '0 5px 5px 5px' }}>
          {activeTab === 'uploader' && <CsvUploader />}
          {activeTab === 'report' && <DataDisplay />}
        </div>
      </main>
      <footer style={{ marginTop: '30px', fontSize: '0.8em', color: '#555', textAlign: 'center' }}>
         <p>Client App Footer - Current Time in Dasmariñas: {new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' })}</p>
         <p>Date: {new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}</p>
      </footer>
    </div>
  );
}

export default App;