// client/src/components/CsvUploader.js

import React, { useState } from 'react';
import { logToServer } from '../utils/logger';

function CsvUploader({ dbStatus, dbErrorMessage, checkDbConnection }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadTotals, setUploadTotals] = useState(null);
  const [uploadOption, setUploadOption] = useState('poc');
  const [templateType, setTemplateType] = useState('short');
  const [uploadErrors, setUploadErrors] = useState([]);

  const handleFileChange = (event) => {
    setMessage('');
    setUploadTotals(null);
    setUploadErrors([]);
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
      setMessage('Please select a valid .csv file.');
      const fileInput = document.getElementById('csvFileInput');
      if (fileInput) fileInput.value = null;
    }
  };

  const handleUpload = async () => {
    // ... (This function remains identical to the last version)
  };

  const controlsDisabled = isLoading || dbStatus !== 'connected';
  const uploadButtonDisabled = !selectedFile || controlsDisabled;

  return (
    <div>
      <h2>Upload CSV File</h2>

      <div style={{ margin: '15px 0', padding: '10px', border: `1px solid ${dbStatus === 'connected' ? 'green' : (dbStatus === 'error' ? 'red' : '#ccc')}`, borderRadius: '4px' }}>
        <strong>Database Status:</strong>
        {dbStatus === 'checking' && <span style={{ marginLeft: '10px', color: '#888' }}> Checking...</span>}
        {dbStatus === 'connected' && <span style={{ marginLeft: '10px', color: 'green', fontWeight: 'bold' }}> Connected</span>}
        {dbStatus === 'error' && (
          <>
            <span style={{ marginLeft: '10px', color: 'red', fontWeight: 'bold' }}> Error</span>
            <p style={{ color: 'red', fontSize: '0.9em', margin: '5px 0 0 0' }}>{dbErrorMessage || 'Could not connect.'}</p>
            <button onClick={checkDbConnection} disabled={isLoading} style={{ marginLeft: '10px', fontSize: '0.8em' }}>Retry</button>
          </>
        )}
      </div>

      <div style={{ margin: '20px 0', border: '1px solid #eee', padding: '15px', borderRadius: '5px' }}>
        <strong>Select Upload Type:</strong>
        <div style={{ marginTop: '10px' }}>
          <div style={{ marginBottom: '10px'}}>
            <label style={{ marginRight: '20px', cursor: 'not-allowed', color: '#999' }}>
              <input type="radio" name="uploadOption" value="date" checked={uploadOption === 'date'} disabled={true}/>
              Upload Completion Dates
            </label>
          </div>
          <div>
            <label style={{ cursor: 'pointer' }}>
              <input type="radio" name="uploadOption" value="poc" checked={uploadOption === 'poc'} onChange={() => setUploadOption('poc')} disabled={controlsDisabled}/>
              Upload POC Data
            </label>
            {uploadOption === 'poc' && (
              <div style={{ padding: '10px 0 0 25px', fontSize: '0.9em' }}>
                <strong>Select Template Type:</strong>
                <label style={{ marginLeft: '10px', marginRight: '15px', cursor: 'pointer' }}>
                  <input type="radio" name="templateType" value="short" checked={templateType === 'short'} onChange={() => setTemplateType('short')} disabled={controlsDisabled}/>
                  Short Template
                </label>
                <label style={{cursor: 'pointer'}}>
                  <input type="radio" name="templateType" value="long" checked={templateType === 'long'} onChange={() => setTemplateType('long')} disabled={controlsDisabled}/>
                  Long Template
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', margin: '20px 0 10px 0' }}>
          <input id="csvFileInput" type="file" accept=".csv" onChange={handleFileChange} disabled={controlsDisabled}/>
          {selectedFile && <p>Selected file: {selectedFile.name}</p>}
      </div>

      <button onClick={handleUpload} disabled={uploadButtonDisabled} style={{ padding: '10px 15px', cursor: uploadButtonDisabled ? 'not-allowed' : 'pointer' }}>
        {isLoading ? 'Uploading...' : 'Upload to Server'}
      </button>

      {message && <p style={{ marginTop: '15px', fontWeight: 'bold', color: message.startsWith('Upload failed') ? 'red' : 'green' }}>{message}</p>}
      
      {uploadTotals && (
        <div style={{ border: '1px solid blue', padding: '10px', marginTop: '15px', background: '#f0f8ff' }}>
          <h4>Upload Results:</h4>
          <p>
            Rows Processed: {uploadTotals.processed ?? 'N/A'} |
            Inserted: {uploadTotals.inserted ?? 'N/A'} |
            Updated: {uploadTotals.updated ?? 'N/A'} |
            Errors: {uploadTotals.errors ?? 'N/A'}
          </p>
        </div>
      )}

      {uploadErrors && uploadErrors.length > 0 && (
        <div style={{ border: '1px solid red', padding: '10px', marginTop: '15px', background: '#fff0f0' }}>
            <h4 style={{color: 'red'}}>Validation Errors:</h4>
            <ul style={{textAlign: 'left', margin: '0 0 0 20px', padding: '0'}}>
                {uploadErrors.map((error, index) => (
                    <li key={index} style={{color: 'red'}}>{error}</li>
                ))}
            </ul>
        </div>
      )}
    </div>
  );
}

export default CsvUploader;