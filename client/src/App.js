// client/src/App.js
import React from 'react';
import CsvUploader from './components/CsvUploader'; // Import the component
import DataDisplay from './components/DataDisplay'; 
import './App.css'; // Default styles

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>MySQL Data Management via CSV</h1>
        <p>Using React Frontend</p>
      </header>
      <main style={{ padding: '20px' }}>
        {/* Render the CSV Uploader component */}
        <CsvUploader />
        {/* Add a separator */}
        <hr style={{ margin: '40px 0', border: 0, borderTop: '1px solid #eee' }} />
        {/* Data Display Section --- Render the new component --- */}
        <DataDisplay />
      </main>
      <footer style={{ marginTop: '30px', fontSize: '0.8em', color: '#555', textAlign: 'center' }}>
         <p>Client App Footer - Current Time in Dasmariñas: {new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' })}</p>
         <p>Date: {new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}</p> {/* Added date */}
      </footer>
    </div>
  );
}

export default App;