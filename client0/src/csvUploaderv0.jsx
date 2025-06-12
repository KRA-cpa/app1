// src/CsvUploader.jsx

import React, { useState, useEffect } from 'react'; // Import useEffect
import './CsvUploader.css'; // Optional: for styling

function CsvUploader() {
  console.log("--- CsvUploader Component Rendered ---"); // <-- ADD THIS LINE
 // --- State variables ---
 const [selectedFile, setSelectedFile] = useState(null);
 // ... other state variables (uploadStatus, isUploading, dbStatus) ...
 const [dbStatus, setDbStatus] = useState({
      isLoading: true,
      isConnected: null,
      error: null,
 });


 // --- useEffect hook (with previous logging) ---
 useEffect(() => {
     const checkDbStatus = async () => {
         // ... all the fetch logic with console.logs inside ...
         console.log("--- DB Status Check Start ---");
         // ... fetch ...
         console.log("--- DB Status Check End ---");
     };
     checkDbStatus();
 }, []); // <-- Ensure dependency array is empty []

 // --- Event Handlers (handleFileChange, handleSubmit) ---
 // ... function code ...

 // --- Return JSX ---
 return (
     <div className="csv-uploader">
         {/* ... JSX code including the status indicator div ... */}
         <div className="status-indicator"> ... </div>
         {/* ... rest of JSX ... */}
     </div>
 );
}

export default CsvUploader;


  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // ==============================================
  // NEW: State for Database Status
  // ==============================================
  const [dbStatus, setDbStatus] = useState({ // Use an object for more detail
    isLoading: true, // Start in loading state
    isConnected: null, // null | true | false
    error: null, // Store potential fetch errors
  });

  // ==============================================
  // NEW: useEffect to Fetch DB Status on Mount
  // ==============================================
  useEffect(() => {
    const checkDbStatus = async () => {
      // API endpoint URL on your backend
      const statusApiUrl = 'http://localhost:3001/api/status'; // Make sure port matches server
      try {
        const response = await fetch(statusApiUrl);
        const data = await response.json();

        if (response.ok) {
          setDbStatus({ isLoading: false, isConnected: data.dbConnected, error: null });
        } else {
          // Handle cases where the API returns an error status (like 503)
           setDbStatus({ isLoading: false, isConnected: false, error: data.message || `Server responded with ${response.status}` });
        }
      } catch (error) {
        console.error('Error fetching DB status:', error);
        // Handle network errors (e.g., backend server is down)
        setDbStatus({ isLoading: false, isConnected: false, error: 'Could not connect to the status API. Is the server running?' });
      }
    };

    checkDbStatus(); // Call the function

    // Empty dependency array [] means this effect runs only once when the component mounts
  }, []);


  // --- (handleFileChange and handleSubmit functions remain the same as before) ---
   const handleFileChange = (event) => {
      // ... same code ...
        const file = event.target.files[0];
        if (file && file.type === 'text/csv') {
          setSelectedFile(file);
          setUploadStatus(''); // Clear status when a new file is selected
        } else {
          setSelectedFile(null);
          setUploadStatus('Please select a valid .csv file.');
        }
   };

   const handleSubmit = async (event) => {
      // ... same code ...
       event.preventDefault();
        if (!selectedFile) {
          setUploadStatus('Please select a file first.');
          return;
        }
        setIsUploading(true);
        setUploadStatus('Uploading...');
        const formData = new FormData();
        formData.append('csvFile', selectedFile);
        const apiUrl = 'http://localhost:3001/api/upload'; // Ensure this is correct

        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData,
          });
          const result = await response.json();
          if (response.ok) {
            setUploadStatus(`Upload successful! ${result.message || ''}`);
            setSelectedFile(null);
            document.getElementById('csvFileInput').value = null;
          } else {
            setUploadStatus(`Upload failed: ${result.message || response.statusText}`);
          }
        } catch (error) {
          console.error('Error uploading file:', error);
          setUploadStatus(`An error occurred during upload: ${error.message}`);
        } finally {
          setIsUploading(false);
        }
   };


  return (
    <div className="csv-uploader">
      <h1>Upload CSV to Database</h1>

      {/* ============================================== */}
      {/* NEW: Database Status Display                   */}
      {/* ============================================== */}
      <div className="status-indicator">
        Status: {' '}
        {dbStatus.isLoading ? (
          <span className="db-status-loading">Checking...</span>
        ) : dbStatus.isConnected ? (
          <span className="db-status-ok">Database Connected</span>
        ) : (
          <span className="db-status-error" title={dbStatus.error || 'Connection failed'}>
             Database Disconnected {dbStatus.error ? `(${dbStatus.error})` : ''}
          </span>
        )}
      </div>
      {/* ============================================== */}

      <form onSubmit={handleSubmit}>
        <label htmlFor="csvFileInput">Choose a CSV file:</label>
        <input
          type="file"
          id="csvFileInput"
          accept=".csv"
          onChange={handleFileChange}
          required
          disabled={dbStatus.isLoading || !dbStatus.isConnected} // Optionally disable if DB down
        />
        {selectedFile && <p>Selected file: {selectedFile.name}</p>}

        <button
            type="submit"
            disabled={!selectedFile || isUploading || dbStatus.isLoading || !dbStatus.isConnected}
            >
            {isUploading ? 'Uploading...' : 'Upload to Server'}
        </button>
      </form>

      {/* Display upload status messages */}
      {uploadStatus && (
        <div className={`status ${uploadStatus.includes('failed') || uploadStatus.includes('error') || uploadStatus.includes('Please') ? 'error' : 'success'}`}>
          {uploadStatus}
        </div>
      )}
    </div>
  );
}

export default CsvUploader;