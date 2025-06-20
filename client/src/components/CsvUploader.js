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
  const uploadButtonDisabled = !selectedFile || controlsDisabled || !cocode;

  return (
    <div className="csv-uploader-container">
      <h2>Upload CSV File</h2>

      {!cocode && (
        <div className="warning-box">
          <strong>🛑 Upload Requires Specific Company:</strong>
          <p>
            Please select a specific company to upload data. You cannot upload to "All Companies".
          </p>
        </div>
      )}

      <div className="upload-options-group">
        <strong className="option-title">Select Upload Type</strong>
        <div className="radio-group">
          <label className={`radio-label ${controlsDisabled ? 'disabled-option' : ''}`}>
            <input
              type="radio"
              name="uploadOption"
              value="date"
              checked={uploadOption === 'date'}
              onChange={() => setUploadOption('date')}
              disabled={controlsDisabled} /* Changed from disabled={true} */
            />
            Upload Completion Date
          </label>
          <label className={`radio-label ${controlsDisabled ? 'disabled-option' : ''}`}>
            <input
              type="radio"
              name="uploadOption"
              value="poc"
              checked={uploadOption === 'poc'}
              onChange={() => setUploadOption('poc')}
              disabled={controlsDisabled}
            />
            Upload POC Data
          </label>
        </div>

        {uploadOption === 'poc' && (
          <div className="template-selection-group">
            <strong className="option-title"><i>Select Template Type</i></strong>
            <div className="radio-group">
              <label className={`radio-label ${controlsDisabled ? 'disabled-option' : ''}`}>
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
              <label className={`radio-label ${controlsDisabled ? 'disabled-option' : ''}`}>
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
          </div>
        )}
      </div>

      <div className="file-input-area">
        <label htmlFor="csvFileInput" className="custom-file-upload">
          {selectedFile ? 'Change File' : 'Choose CSV File'}
        </label>
        <input
          id="csvFileInput"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={controlsDisabled}
          style={{ display: 'none' }} /* Hide the default input */
        />
        {selectedFile && <p className="selected-file-name">Selected: {selectedFile.name}</p>}
      </div>

      <button
        onClick={handleUpload}
        disabled={uploadButtonDisabled}
        className="upload-button"
      >
        {isLoading ? 'Uploading...' : 'Upload to Server'}
      </button>

      {message && (
        <p className={`feedback-message ${message.startsWith('Upload failed') || message.startsWith('Cannot upload') ? 'error-message' : 'success-message'}`}>
          {message}
        </p>
      )}
      {uploadTotals && (
        <div className="upload-results-summary">
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
              <table className="upload-summary-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Phase Code</th>
                    <th>Inserted</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadSummary.map((item, index) => (
                    <tr key={`${item.project}-${item.phasecode}-${index}`}>
                      <td>{item.project}</td>
                      <td>{item.phasecode}</td>
                      <td className="text-right">{item.inserted}</td>
                      <td className="text-right">{item.updated}</td>
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