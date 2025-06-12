// client/src/components/CsvUploader.js
import React, { useState, useEffect } from 'react';
import { logToServer } from '../utils/logger'; // <<< Import the logger

function CsvUploader() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState('checking');
  const [dbErrorMessage, setDbErrorMessage] = useState('');

  // --- NEW State for upload results ---
  const [uploadSummary, setUploadSummary] = useState(null); // To store the array: [{ project, phasecode, inserted, updated }]
  const [uploadTotals, setUploadTotals] = useState(null);   // To store { inserted, updated, errors, processed }

  // Function to check DB status (assuming this works correctly now)
  const checkDbConnection = async () => {
    // Reset states when checking connection
    logToServer('info', 'Checking DB connection status', 'CsvUploader'); // Log start
    setDbStatus('checking');
    setDbErrorMessage('');
    setMessage('');
    setUploadSummary(null); // Clear previous results
    setUploadTotals(null);  // Clear previous results

    try {
      const response = await fetch('/api/db-status', {
          method: 'GET',
          // vvv Add these options vvv
          cache: 'no-store', // Tells fetch not to use caches
          headers: { // Optional extra headers, might help in some cases
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
              'Expires': '0',
          }
          // ^^^ Add these options ^^^
      });
      logToServer('info', `DB status fetch completed with status: ${response.status}`, 'CsvUploader');
  
      // --- REMOVE 304 handling if using no-cache ---
      // if (response.status === 304) { ... } // No longer needed
  
      if (!response.ok) { // Should now be 200 OK or an actual error status
          // ... existing error handling for non-200 status ...
           let errorMsg = `Backend responded with status ${response.status}`;
           try {
               const errorResult = await response.json();
               errorMsg = errorResult.message || errorMsg;
           } catch (parseError) { }
           throw new Error(errorMsg);
      }
  
      // Only parse JSON if response is OK (2xx)
      const result = await response.json();
      logToServer('info', 'DB status response parsed', 'CsvUploader', { result });
  
      if (result.status === 'connected') {
         logToServer('info', 'Setting DB status to connected', 'CsvUploader');
         setDbStatus('connected');
      } else {
          const errorMsg = result.message || 'Backend reported DB not connected.';
          setDbErrorMessage(errorMsg);
          logToServer('warn', `Setting DB status to error (backend report): ${errorMsg}`, 'CsvUploader');
          setDbStatus('error');
      }
  
  } catch (error) { // Catches fetch errors or errors thrown above
      logToServer('error', `Setting DB status to error (fetch/logic failed): ${error.message}`, 'CsvUploader');
      setDbStatus('error');
      setDbErrorMessage(error.message || 'Could not verify server connection status.');
  }
}

  useEffect(() => {
    checkDbConnection();
  }, []);

    // Handler for file input changes
    const handleFileChange = (event) => {
      setMessage('');
      setUploadSummary(null); // Clear results when file changes
      setUploadTotals(null);  // Clear results when file changes
      const file = event.target.files[0];
      if (file && file.type === 'text/csv') {
        setSelectedFile(file);
         logToServer('info', `CSV file selected: ${file.name}`, 'CsvUploader', { fileName: file.name, fileSize: file.size }); // Log file selection
      } else {
        setSelectedFile(null);
        setMessage('Please select a valid .csv file.');
         // ... handle invalid file ...
         if (file) { // Log only if a file was actually selected but was wrong type
          logToServer('warn', `Invalid file type selected: ${file.name}`, 'CsvUploader', { fileName: file.name, fileType: file.type });
         }
         // --- ADDED MISSING BRACE ---
         const fileInput = document.getElementById('csvFileInput');
         if (fileInput) fileInput.value = null; // Clear visual selection
      } // <<< Now this correctly closes the 'else' block
    }; // <<< And this correctly closes the 'handleFileChange' function
  

  // Handler for the upload button click
  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage('Please select a file first.');
      return;
    }
    if (dbStatus !== 'connected') {
        setMessage('Cannot upload: Database is not connected.');
        return;
        
    }

    setIsLoading(true);
    setMessage('Uploading...');
        // Log upload start
        logToServer('info', `Starting CSV upload: ${selectedFile.name}`, 'CsvUploader', { fileName: selectedFile.name });
    setUploadSummary(null); // Clear previous results
    setUploadTotals(null);  // Clear previous results
    const formData = new FormData();
    formData.append('csvFile', selectedFile); // Matches backend key

    try {
      const response = await fetch('/api/upload-csv', { // Your upload endpoint
        method: 'POST',
        body: formData,
      });

      // Try to parse JSON regardless of response.ok to get potential error messages
      const result = await response.json();

      if (response.ok) {
        // --- SUCCESS ---
        setMessage(result.message || 'File uploaded successfully!'); // Set main message
        // --- Store detailed results ---
        setUploadSummary(result.summary || []); // Store summary array (or empty if missing)
        setUploadTotals({ // Store totals object
            inserted: result.totalInserted,
            updated: result.totalUpdated,
            errors: result.totalErrors,
            processed: result.totalRowsProcessed
        });
 // Log success details
 logToServer('info', `CSV upload successful: ${selectedFile.name}`, 'CsvUploader', { response: result });

        // --- Clear file ---
        setSelectedFile(null);
        const fileInput = document.getElementById('csvFileInput');
        if (fileInput) fileInput.value = null;

      } else {
        // --- Handle known error response from backend ---
        setMessage(`Upload failed: ${result.message || response.statusText}`);
        setUploadSummary(null); // Clear results on failure
        setUploadTotals(null);
// Log backend-reported error
logToServer('error', `CSV upload failed (backend error): ${result.message || response.statusText}`, 'CsvUploader', { response: result, fileName: selectedFile?.name });
      }
    } catch (error) {
      // --- Handle fetch/network errors or non-JSON responses ---
      setIsLoading(false); // Ensure loading stops
      console.error('Upload error:', error);
      setMessage(`Upload failed: ${error.message}. Check network or server availability.`);
      setUploadSummary(null); // Clear results on failure
      setUploadTotals(null);
      // Log fetch/network error
      logToServer('error', `CSV upload failed (network/fetch error): ${error.message}`, 'CsvUploader', { error, fileName: selectedFile?.name });
    } finally {
        // --- Stop loading indicator ---
        setIsLoading(false); // Ensure loading stops in all cases
    }
  };

  // Determine if controls should be disabled
  const controlsDisabled = isLoading || dbStatus !== 'connected';

  return (
    <div style={{ border: '1px solid #ccc', padding: '20px', margin: '20px 0', borderRadius: '5px' }}>
      <h2>Upload CSV File to Update/Insert Data</h2>

      {/* Database Status Display */}
      <div style={{ margin: '15px 0', padding: '10px', border: `1px solid ${dbStatus === 'connected' ? 'green' : (dbStatus === 'error' ? 'red' : '#ccc')}`, borderRadius: '4px' }}>
        {/* ... DB status rendering code ... */}
         <strong>Database Status:</strong>
        {dbStatus === 'checking' && <span style={{ marginLeft: '10px', color: '#888' }}> Checking connection...</span>}
        {dbStatus === 'connected' && <span style={{ marginLeft: '10px', color: 'green', fontWeight: 'bold' }}> Connected</span>}
        {dbStatus === 'error' && (
          <>
            <span style={{ marginLeft: '10px', color: 'red', fontWeight: 'bold' }}> Error</span>
            <p style={{ color: 'red', fontSize: '0.9em', margin: '5px 0 0 0' }}>{dbErrorMessage || 'Could not connect to the database.'}</p>
            <button onClick={checkDbConnection} disabled={isLoading} style={{ marginLeft: '10px', fontSize: '0.8em' }}>Retry Check</button>
          </>
        )}
      </div>

      {/* File Input */}
      <input
        id="csvFileInput"
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        disabled={controlsDisabled}
        style={{ display: 'block', margin: '10px 0' }}
      />
      {selectedFile && <p>Selected file: {selectedFile.name}</p>}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!selectedFile || controlsDisabled}
        style={{ padding: '10px 15px', cursor: controlsDisabled ? 'not-allowed' : 'pointer' }}
      >
        {isLoading ? 'Uploading...' : 'Upload to Server'}
      </button>

      {/* Feedback Message Area */}
      {message && <p style={{ marginTop: '15px', fontWeight: 'bold', color: message.startsWith('Upload failed') || message.startsWith('Cannot upload') ? 'red' : 'green' }}>{message}</p>}

      {/* --- NEW: Display Upload Results --- */}
      {uploadTotals && ( // Only show this section if uploadTotals has data
        <div style={{ border: '1px solid blue', padding: '10px', marginTop: '15px', background: '#f0f8ff' }}>
          <h4>Upload Results:</h4>
          <p>
            Rows Processed: {uploadTotals.processed ?? 'N/A'} |
            Inserted: {uploadTotals.inserted ?? 'N/A'} |
            Updated: {uploadTotals.updated ?? 'N/A'} |
            Errors: {uploadTotals.errors ?? 'N/A'}
          </p>

          {/* Display per project/phase summary if available */}
          {uploadSummary && uploadSummary.length > 0 && (
            <>
              <h5>Details by Project/Phase:</h5>
              <table border="1" style={{ borderCollapse: 'collapse', width: 'auto' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '4px 8px' }}>Project</th>
                    <th style={{ padding: '4px 8px' }}>Phase Code</th>
                    <th style={{ padding: '4px 8px' }}>Inserted</th>
                    <th style={{ padding: '4px 8px' }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadSummary.map((item, index) => (
                    // Use index for key if composite key isn't unique enough (though it should be)
                    <tr key={`${item.project}-${item.phasecode}-${index}`}>
                      <td style={{ padding: '4px 8px' }}>{item.project}</td>
                      <td style={{ padding: '4px 8px' }}>{item.phasecode}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{item.inserted}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{item.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
      {/* --- End Upload Results --- */}

    </div>
  );
}


export default CsvUploader;