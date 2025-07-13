// client/src/components/CsvUploader.js
// Complete CsvUploader Component with Conflict Handling

import React, { useState, useEffect } from 'react';
import { logToServer } from '../utils/logger';
import CompletionConflictDialog from './CompletionConflictDialog'; // Import conflict dialog

function CsvUploader({ onUploadSuccess, cocode, dbStatus, dbErrorMessage, checkDbConnection, isCheckingDb, cutoffDate, validateCutoffDate }) {
  // Existing state variables
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [uploadTotals, setUploadTotals] = useState(null);
  const [uploadOption, setUploadOption] = useState('poc');
  const [templateType, setTemplateType] = useState('short'); // 'short' or 'long'
  const [completionType, setCompletionType] = useState('A'); // 'A' for Actual, 'P' for Projected

  // NEW: Conflict handling state
  const [conflictDialog, setConflictDialog] = useState({
    isVisible: false,
    conflicts: [],
    pendingFile: null,
    pendingFormData: null,
    isProcessing: false
  });

  // Existing file change handler
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

  // NEW: Parse CSV to extract completion entries for conflict checking
  const parseCompletionEntriesFromFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split('\n');
          const entries = [];
          
          // Skip header row, process data rows
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
              const cols = line.split(',');
              if (cols.length >= 3) {
                entries.push({
                  project: cols[0]?.trim(),
                  phasecode: cols[1]?.trim(),
                  completionDate: cols[2]?.trim(),
                  completionType: completionType // Use the selected completion type
                });
              }
            }
          }
          resolve(entries);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  // NEW: Check for completion date conflicts
  const checkCompletionConflicts = async (entries) => {
    try {
      const response = await fetch('/api/check-completion-conflicts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          completionEntries: entries,
          cocode: cocode
        })
      });

      const result = await response.json();

      if (response.ok) {
        return result;
      } else {
        throw new Error(result.message || 'Failed to check conflicts');
      }
    } catch (error) {
      console.error('Error checking completion conflicts:', error);
      throw error;
    }
  };

  // NEW: Upload with conflict resolution
  const uploadWithConflictResolution = async (formData, conflicts) => {
    try {
      // Convert FormData to completion entries for the conflict resolution endpoint
      const completionEntries = await parseCompletionEntriesFromFile(conflictDialog.pendingFile);
      
      const response = await fetch('/api/upload-completion-with-conflicts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          completionEntries: completionEntries,
          conflicts: conflicts,
          cocode: cocode,
          completionType: completionType,
          confirmedBy: 'CSV Upload User' // You might want to get actual user info
        })
      });

      const result = await response.json();
      return { response, result };
    } catch (error) {
      throw error;
    }
  };

  // NEW: Normal upload process (extracted from original handleUpload)
  const proceedWithNormalUpload = async (formData) => {
    try {
      console.log('Testing backend connectivity...');
      const testResponse = await fetch('/api/db-status');
      if (!testResponse.ok) {
        throw new Error(`Backend test failed: ${testResponse.status}`);
      }
      console.log('Backend connectivity test: SUCCESS');

      const uploadUrl = '/api/upload-csv';
      console.log('Uploading to:', uploadUrl);
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      console.log('Upload response status:', response.status);
      console.log('Upload response ok:', response.ok);

      const result = await response.json();
      console.log('Upload result:', result);

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
        
        // Clear file selection
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
        
        if (result.errors && result.errors.length > 0) {
          const errorList = result.errors.slice(0, 5).join('\n');
          setMessage(`Upload failed: ${result.message}\n\nFirst few errors:\n${errorList}${result.errors.length > 5 ? '\n...and more' : ''}`);
        }
        
        logToServer('error', `CSV upload failed (backend error): ${result.message || response.statusText}`, 'CsvUploader', { response: result, fileName: selectedFile?.name });
      }
    } catch (error) {
      throw error; // Re-throw to be handled by the caller
    }
  };

  // UPDATED: Enhanced handleUpload with conflict checking
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

    if (uploadOption === 'poc') {
      const validation = validateCutoffDate();
      if (!validation.isValid) {
        setMessage(`Cannot upload: ${validation.error}`);
        return;
      }
    }

    setIsLoading(true);
    setMessage('Uploading...');
    setUploadSummary(null);
    setUploadTotals(null);

    const formData = new FormData();
    formData.append('csvFile', selectedFile);
    formData.append('uploadOption', uploadOption);
    formData.append('cocode', cocode);

    if (uploadOption === 'poc') {
      formData.append('templateType', templateType);
      formData.append('cutoffDate', cutoffDate);
    } else if (uploadOption === 'date') {
      formData.append('completionType', completionType);
    }

    try {
      // NEW: For completion date uploads, check for conflicts first
      if (uploadOption === 'date') {
        setMessage('Checking for POC data conflicts...');
        
        const completionEntries = await parseCompletionEntriesFromFile(selectedFile);
        const conflictCheck = await checkCompletionConflicts(completionEntries);
        
        if (conflictCheck.hasConflicts) {
          // Show conflict dialog
          setConflictDialog({
            isVisible: true,
            conflicts: conflictCheck.conflicts,
            pendingFile: selectedFile,
            pendingFormData: formData,
            isProcessing: false
          });
          setMessage(''); // Clear the checking message
          setIsLoading(false);
          return; // Stop here, wait for user confirmation
        }
      }

      // If no conflicts or POC upload, proceed with normal upload
      await proceedWithNormalUpload(formData);

    } catch (error) {
      console.error('Upload fetch error:', error);
      
      // Enhanced error handling
      let errorMessage = `Upload failed: ${error.message}`;
      
      if (error.message.includes('Failed to fetch')) {
        errorMessage = `Upload failed: Cannot connect to server. Please check:
        
1. Backend server is running (should see "Server listening on http://localhost:3001")
2. No firewall blocking port 3001
3. Try refreshing the page and uploading again
        
Technical error: ${error.message}`;
      }
      
      setMessage(errorMessage);
      setUploadSummary(null);
      setUploadTotals(null);
      logToServer('error', `CSV upload failed (network/fetch error): ${error.message}`, 'CsvUploader', { 
        error: {
          name: error.name,
          message: error.message
        }, 
        fileName: selectedFile?.name
      });
    } finally {
      setIsLoading(false);
    }
  };

  // NEW: Handle conflict dialog confirmation
  const handleConflictConfirmation = async (userConfirmation) => {
    if (userConfirmation !== 'CONFIRM DELETE POC DATA') {
      return;
    }

    try {
      setConflictDialog(prev => ({ ...prev, isProcessing: true }));
      setMessage('Processing upload with POC data deletion...');

      const { response, result } = await uploadWithConflictResolution(
        conflictDialog.pendingFormData,
        conflictDialog.conflicts
      );

      if (response.ok) {
        setMessage(`✅ Upload completed successfully! 
          ${result.totalInserted} completion dates saved.
          ${result.totalDeactivated} POC records marked as deleted.`);
        
        setUploadSummary(result.deactivationResults || []);
        setUploadTotals({
          inserted: result.totalInserted,
          updated: 0,
          errors: 0,
          processed: result.totalInserted,
          deactivated: result.totalDeactivated
        });

        logToServer('info', `CSV completion date upload with conflict resolution: ${result.totalInserted} inserted, ${result.totalDeactivated} POC deactivated`, 'CsvUploader', { data: result });

        // Clear file selection
        setSelectedFile(null);
        const fileInput = document.getElementById('csvFileInput');
        if (fileInput) fileInput.value = null;

        if (onUploadSuccess) {
          onUploadSuccess();
        }
      } else {
        setMessage(`❌ Upload failed: ${result.message}`);
      }

      // Close dialog
      setConflictDialog({
        isVisible: false,
        conflicts: [],
        pendingFile: null,
        pendingFormData: null,
        isProcessing: false
      });

    } catch (error) {
      console.error('Conflict resolution error:', error);
      setMessage(`❌ Error during conflict resolution: ${error.message}`);
      setConflictDialog(prev => ({ ...prev, isProcessing: false }));
    } finally {
      setIsLoading(false);
    }
  };

  // NEW: Handle conflict dialog cancellation
  const handleConflictCancellation = () => {
    setConflictDialog({
      isVisible: false,
      conflicts: [],
      pendingFile: null,
      pendingFormData: null,
      isProcessing: false
    });
    setIsLoading(false);
    setMessage('Upload cancelled by user due to POC data conflicts.');
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
              disabled={controlsDisabled}
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

        {/* Completion Type Selection for Completion Date Upload */}
        {uploadOption === 'date' && (
          <div className="template-selection-group">
            <strong className="option-title"><i>Select Completion Type</i></strong>
            <div className="radio-group">
              <label className={`radio-label ${controlsDisabled ? 'disabled-option' : ''}`}>
                <input
                  type="radio"
                  name="completionType"
                  value="A"
                  checked={completionType === 'A'}
                  onChange={() => setCompletionType('A')}
                  disabled={controlsDisabled}
                />
                Actual Completion
              </label>
              <label className={`radio-label ${controlsDisabled ? 'disabled-option' : ''}`}>
                <input
                  type="radio"
                  name="completionType"
                  value="P"
                  checked={completionType === 'P'}
                  onChange={() => setCompletionType('P')}
                  disabled={controlsDisabled}
                />
                Projected Completion
              </label>
            </div>
            <div style={{ 
              fontSize: '12px', 
              color: '#6c757d', 
              fontStyle: 'italic', 
              marginTop: '10px',
              paddingLeft: '25px'
            }}>
              📋 Expected format: Project, Phase, Completion Date (MM/DD/YYYY)<br/>
              ⚠️ Completion dates must be month-end dates (last day of the month)
            </div>
          </div>
        )}

        {/* Template Type Selection for POC Upload */}
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
            <div style={{ 
              fontSize: '12px', 
              color: '#6c757d', 
              fontStyle: 'italic', 
              marginTop: '10px',
              paddingLeft: '25px'
            }}>
              📋 Short: Project, Phase, Year, POC<br/>
              📋 Long: Project, Phase, Year, Jan, Feb, Mar, ..., Dec
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
          style={{ display: 'none' }}
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
        <div className={`feedback-message ${message.startsWith('Upload failed') || message.startsWith('Cannot upload') ? 'error-message' : 'success-message'}`}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{message}</pre>
        </div>
      )}
      
      {uploadTotals && (
        <div className="upload-results-summary">
          <h4>Upload Results:</h4>
          <p>
            Rows Processed: {uploadTotals.processed ?? 'N/A'} |
            Inserted: {uploadTotals.inserted ?? 'N/A'} |
            Updated: {uploadTotals.updated ?? 'N/A'} |
            Errors: {uploadTotals.errors ?? 'N/A'}
            {uploadTotals.deactivated && ` | Deactivated: ${uploadTotals.deactivated}`}
          </p>
          {uploadSummary && uploadSummary.length > 0 && (
            <>
              <h5>Details by Project/Phase:</h5>
              <table className="upload-summary-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Phase Code</th>
                    <th>Records</th>
                    {uploadOption === 'poc' && (
                      <>
                        <th>Actual</th>
                        <th>Projected</th>
                      </>
                    )}
                    {uploadOption === 'date' && (
                      <th>Type</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {uploadSummary.map((item, index) => (
                    <tr key={`${item.project}-${item.phasecode}-${index}`}>
                      <td>{item.project}</td>
                      <td>{item.phasecode}</td>
                      <td className="text-right">{item.inserted + (item.updated || 0)}</td>
                      {uploadOption === 'poc' && (
                        <>
                          <td className="text-right">{item.actualCount || 0}</td>
                          <td className="text-right">{item.projectedCount || 0}</td>
                        </>
                      )}
                      {uploadOption === 'date' && (
                        <td>{completionType === 'A' ? 'Actual' : 'Projected'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* NEW: Add Conflict Dialog */}
      <CompletionConflictDialog
        conflicts={conflictDialog.conflicts}
        onConfirm={handleConflictConfirmation}
        onCancel={handleConflictCancellation}
        isVisible={conflictDialog.isVisible}
        isProcessing={conflictDialog.isProcessing}
      />
    </div>
  );
}

export default CsvUploader;