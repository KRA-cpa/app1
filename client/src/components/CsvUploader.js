// client/src/components/CsvUploader.js


import React, { useState, useEffect } from 'react';
import { logToServer } from '../utils/logger';

function CsvUploader({ onUploadSuccess, cocode, dbStatus, dbErrorMessage, checkDbConnection, isCheckingDb }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [uploadTotals, setUploadTotals] = useState(null);
  const [uploadOption, setUploadOption] = useState('poc');
  const [templateType, setTemplateType] = useState('short'); // 'short' or 'long'

  // Remove the local checkDbConnection function since it's now passed as a prop
  // Remove the useEffect for checking DB connection since it's handled by parent

  const handleFileChange = (event) => {
    setMessage('');
    setUploadSummary(null);
    setUploadTotals(null);
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      setSelectedFile(file);
      logToServer('info', `CSV file selected: ${file.name}`, 'CsvUploader', { fileName: file.name, fileSize: file.size });
    } else {
      setSelectedFile(null);
      setMessage('Please select a valid .csv file.');
      if (file) {
        logToServer('warn', `Invalid file type selected: ${file.name}`, 'CsvUploader', { fileName: file.name, fileType: file.type });
      }
      const fileInput = document.getElementById('csvFileInput');
      if (fileInput) fileInput.value = null;
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage('Please select a file first.');
      return;
    }
    if (dbStatus !== 'connected') {
      setMessage('Cannot upload: Database is not connected.');
      return;
    }
    if (!cocode) {
      setMessage('Cannot upload: No company selected.');
      return;
    }

    setIsLoading(true);
    setMessage('Uploading...');
    logToServer('info', `Starting CSV upload: ${selectedFile.name}`, 'CsvUploader', { uploadOption, templateType, cocode });
    setUploadSummary(null);
    setUploadTotals(null);
    
    const formData = new FormData();
    formData.append('csvFile', selectedFile);
    formData.append('uploadOption', uploadOption);
    formData.append('cocode', cocode); // Use the cocode prop
    
    if (uploadOption === 'poc') {
      formData.append('templateType', templateType);
    }

    try {
      const response = await fetch('/api/upload-csv', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(result.message || 'File uploaded successfully!');
        setUploadSummary(result.summary || []);
        setUploadTotals({
          inserted: result.totalInserted,
          updated: result.totalUpdated,
          errors: result.totalErrors,
          processed: result.totalRowsProcessed
        });
        logToServer('info', `CSV upload successful: ${selectedFile.name}`, 'CsvUploader', { response: result });
        setSelectedFile(null);
        const fileInput = document.getElementById('csvFileInput');
        if (fileInput) fileInput.value = null;
        
        // Call the onUploadSuccess callback if provided
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      } else {
        setMessage(`Upload failed: ${result.message || response.statusText}`);
        setUploadSummary(null);
        setUploadTotals(null);
        logToServer('error', `CSV upload failed (backend error): ${result.message || response.statusText}`, 'CsvUploader', { response: result, fileName: selectedFile?.name });
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessage(`Upload failed: ${error.message}. Check network or server availability.`);
      setUploadSummary(null);
      setUploadTotals(null);
      logToServer('error', `CSV upload failed (network/fetch error): ${error.message}`, 'CsvUploader', { error, fileName: selectedFile?.name });
    } finally {
      setIsLoading(false);
    }
  };

  const controlsDisabled = isLoading || dbStatus !== 'connected';
  const uploadButtonDisabled = !selectedFile || controlsDisabled || !cocode; // Require specific company for upload

  return (
    <div>
      <h2>Upload CSV File</h2>

      {/* Show warning if "All Companies" is selected */}
      {!cocode && (
        <div style={{ margin: '15px 0', padding: '10px', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px' }}>
          <strong>🛑 Upload Requires Specific Company:</strong>
          <p style={{ margin: '5px 0 0 0', color: '#856404' }}>
            Please select a specific company to upload data. You cannot upload to "All Companies".
          </p>
        </div>
      )}

      {/* Remove the duplicate company display since it's now shown in the header */}

      {/* Remove the database status display since it's now shown in the header */}

      {/* Upload Options */}
      <div style={{ margin: '20px 0', border: '1px solid #eee', padding: '15px', borderRadius: '5px' }}>
        <strong>Select Upload Type:</strong>
        <div style={{ marginTop: '10px' }}>
          <label style={{ marginRight: '20px', cursor: 'not-allowed', color: '#999' }}>
            <input
              type="radio"
              name="uploadOption"
              value="date"
              checked={uploadOption === 'date'}
              onChange={() => setUploadOption('date')}
              disabled={true}
            />
            Upload (not Update) Completion Date
          </label>
          <label style={{ cursor: 'pointer' }}>
            <input
              type="radio"
              name="uploadOption"
              value="poc"
              checked={uploadOption === 'poc'}
              onChange={() => setUploadOption('poc')}
              disabled={controlsDisabled}
            />
            Upload (not Update) POC Data

            {/* Conditional Template Selection */}
            {uploadOption === 'poc' && (
              <div style={{ padding: '10px 0 0 25px', fontSize: '0.9em' }}>
                <strong>Select Template Type:</strong>
                <label style={{ marginLeft: '10px', marginRight: '15px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="templateType"
                    value="short"
                    checked={templateType === 'short'}
                    onChange={() => setTemplateType('short')}
                    disabled={controlsDisabled}
                  />
                  Short Template
                </label>
                <label style={{cursor: 'pointer'}}>
                  <input
                    type="radio"
                    name="templateType"
                    value="long"
                    checked={templateType === 'long'}
                    onChange={() => setTemplateType('long')}
                    disabled={controlsDisabled}
                  />
                  Long Template
                </label>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* MODIFIED: File Input and selected file text are centered */}
      <div style={{ textAlign: 'center', margin: '20px 0 10px 0' }}>
          <input
            id="csvFileInput"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={controlsDisabled}
          />
          {selectedFile && <p>Selected file: {selectedFile.name}</p>}
      </div>

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={uploadButtonDisabled}
        style={{ padding: '10px 15px', cursor: uploadButtonDisabled ? 'not-allowed' : 'pointer' }}
      >
        {isLoading ? 'Uploading...' : 'Upload to Server'}
      </button>

      {/* Warning if no company selected - Removed duplicate warning */}
      {/* This warning is now handled by the styled warning box above */}

      {/* Feedback Message Area & Upload Results */}
      {message && <p style={{ marginTop: '15px', fontWeight: 'bold', color: message.startsWith('Upload failed') || message.startsWith('Cannot upload') ? 'red' : 'green' }}>{message}</p>}
      {uploadTotals && (
        <div style={{ border: '1px solid blue', padding: '10px', marginTop: '15px', background: '#f0f8ff' }}>
          <h4>Upload Results:</h4>
          <p>
            Rows Processed: {uploadTotals.processed ?? 'N/A'} |
            Inserted: {uploadTotals.inserted ?? 'N/A'} |
            Updated: {uploadTotals.updated ?? 'N/A'} |
            Errors: {uploadTotals.errors ?? 'N/A'}
          </p>
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
    </div>
  );
}

export default CsvUploader;