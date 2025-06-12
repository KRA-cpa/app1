// src/App.jsx

import React from 'React';
import csvUploader from './csvUploader'; // Import the uploader component
import './App.css'; // Import standard App CSS (optional, adjust if needed)

function App() {
  // The main App component renders the CsvUploader
  return (
    <div className="App">
      {/* You can add headers, footers, or other layout elements here if needed */}
      <csvUploader /> {/* Render the imported component */}
    </div>
  );
}

export default App;