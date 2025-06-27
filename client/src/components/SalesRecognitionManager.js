// client/src/components/SalesRecognitionManager.js
import React, { useState } from 'react';
import { logToServer } from '../utils/logger';

function SalesRecognitionManager({ dbStatus, cutoffDate }) {
  const [activeMode, setActiveMode] = useState('csv'); // 'csv' or 'manual'
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);
  
  // Manual entry state
  const [manualEntries, setManualEntries] = useState([
    { id: Date.now(), accountNo: '', date: '', error: '' }
  ]);

  // Month-end date validation
  const isMonthEndDate = (dateString) => {
    if (!dateString) return false;
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;
    
    // Get the next day
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);
    
    // If next day is the 1st, then current date is month-end
    return nextDay.getDate() === 1;
  };

  // Date validation with cutoff check
  const validateDate = (dateString) => {
    if (!dateString) {
      return { isValid: false, error: 'Date is required' };
    }

    // Check if it's a valid date
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return { isValid: false, error: 'Invalid date format' };
    }

    // Check if it's month-end
    if (!isMonthEndDate(dateString)) {
      return { isValid: false, error: 'Date must be a month-end date (last day of the month)' };
    }

    // Check against cutoff date
    if (cutoffDate) {
      const cutoffDateObj = new Date(cutoffDate);
      if (date > cutoffDateObj) {
        return { isValid: false, error: `Date cannot be beyond cutoff date (${cutoffDate})` };
      }
    }

    return { isValid: true, error: null };
  };

// Date formatting
const formatDisplayDate = (dateString) => {
  if (!dateString) {
    return 'Not set';
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

  // Handle CSV file selection
  const handleFileChange = (event) => {
    setMessage('');
    setUploadResults(null);
    const file = event.target.files[0];
    
    if (file && file.type === 'text/csv') {
      setSelectedFile(file);
      logToServer({ level: 'info', message: `Sales Recognition CSV file selected: ${file.name}` });
    } else {
      setSelectedFile(null);
      setMessage('Please select a valid .csv file.');
      const fileInput = event.target;
      if (fileInput) fileInput.value = null;
    }
  };

  // Handle CSV upload
  const handleCsvUpload = async () => {
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
    setUploadResults(null);

    const formData = new FormData();
    formData.append('csvFile', selectedFile);
    formData.append('uploadType', 'salesrecognition');
    formData.append('cutoffDate', cutoffDate);

    try {
      const response = await fetch('http://localhost:3001/api/upload-salesrecognition', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`✅ Upload successful! ${result.message}`);
        setUploadResults(result);
        setSelectedFile(null);
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) fileInput.value = null;
        
        logToServer({ 
          level: 'info', 
          message: 'Sales Recognition CSV upload successful',
          data: result
        });
      } else {
        setMessage(`❌ Upload failed: ${result.message}`);
        if (result.errors && result.errors.length > 0) {
          const errorList = result.errors.slice(0, 5).join('\n');
          setMessage(`❌ Upload failed: ${result.message}\n\nFirst few errors:\n${errorList}${result.errors.length > 5 ? '\n...and more' : ''}`);
        }
      }
    } catch (error) {
      setMessage(`❌ Upload failed: ${error.message}`);
      logToServer({ level: 'error', message: `Sales Recognition upload error: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  // Manual entry functions
  const addManualEntry = () => {
    setManualEntries(prev => [...prev, {
      id: Date.now(),
      accountNo: '',
      date: '',
      error: ''
    }]);
  };

  const removeManualEntry = (id) => {
    if (manualEntries.length > 1) {
      setManualEntries(prev => prev.filter(entry => entry.id !== id));
    }
  };

  const updateManualEntry = (id, field, value) => {
    setManualEntries(prev => prev.map(entry => {
      if (entry.id === id) {
        const updated = { ...entry, [field]: value, error: '' };
        
        // Validate date if it's the date field
        if (field === 'date' && value) {
          const validation = validateDate(value);
          if (!validation.isValid) {
            updated.error = validation.error;
          }
        }
        
        return updated;
      }
      return entry;
    }));
  };

  // Handle paste from Excel
  const handlePaste = (event) => {
    event.preventDefault();
    const pastedData = event.clipboardData.getData('text/plain');
    const rows = pastedData.split('\n').filter(row => row.trim());
    
    const newEntries = rows.map((row, index) => {
      const [accountNo, date] = row.split('\t').map(cell => cell.trim());
      const validation = date ? validateDate(date) : { isValid: true, error: '' };
      
      return {
        id: Date.now() + index,
        accountNo: accountNo || '',
        date: date || '',
        error: validation.isValid ? '' : validation.error
      };
    });

    if (newEntries.length > 0) {
      setManualEntries(newEntries);
      setMessage(`📋 Pasted ${newEntries.length} entries from clipboard`);
    }
  };

  // Handle manual entry submission
  const handleManualSubmit = async () => {
    if (dbStatus !== 'connected') {
      setMessage('Cannot submit: Database is not connected.');
      return;
    }

    // Validate all entries
    const validEntries = [];
    const errors = [];

    manualEntries.forEach((entry, index) => {
      if (!entry.accountNo.trim()) {
        errors.push(`Row ${index + 1}: Account Number is required`);
        return;
      }
      
      if (!entry.date.trim()) {
        errors.push(`Row ${index + 1}: Date is required`);
        return;
      }

      const dateValidation = validateDate(entry.date);
      if (!dateValidation.isValid) {
        errors.push(`Row ${index + 1}: ${dateValidation.error}`);
        return;
      }

      validEntries.push({
        accountNo: entry.accountNo.trim(),
        date: entry.date.trim()
      });
    });

    if (errors.length > 0) {
      setMessage(`❌ Validation errors:\n${errors.join('\n')}`);
      return;
    }

    if (validEntries.length === 0) {
      setMessage('No valid entries to submit.');
      return;
    }

    setIsLoading(true);
    setMessage('Submitting entries...');

    try {
      const response = await fetch('http://localhost:3001/api/manual-salesrecognition', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          entries: validEntries,
          cutoffDate: cutoffDate
        })
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`✅ Manual entry successful! ${result.message}`);
        setUploadResults(result);
        
        // Reset entries
        setManualEntries([{ id: Date.now(), accountNo: '', date: '', error: '' }]);
        
        logToServer({ 
          level: 'info', 
          message: 'Sales Recognition manual entry successful',
          data: result
        });
      } else {
        setMessage(`❌ Submission failed: ${result.message}`);
      }
    } catch (error) {
      setMessage(`❌ Submission failed: ${error.message}`);
      logToServer({ level: 'error', message: `Sales Recognition manual entry error: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const controlsDisabled = isLoading || dbStatus !== 'connected';

  return (
    <div className="csv-uploader-container">
      <h2>Sales Recognition Data Management</h2>

      {/* Mode Selection */}
      <div className="upload-options-group">
        <strong className="option-title">Select Data Entry Method</strong>
        <div className="radio-group">
          <label className={`radio-label ${controlsDisabled ? 'disabled-option' : ''}`}>
            <input
              type="radio"
              name="entryMode"
              value="csv"
              checked={activeMode === 'csv'}
              onChange={(e) => setActiveMode(e.target.value)}
              disabled={controlsDisabled}
            />
            CSV File Upload
          </label>
          <label className={`radio-label ${controlsDisabled ? 'disabled-option' : ''}`}>
            <input
              type="radio"
              name="entryMode"
              value="manual"
              checked={activeMode === 'manual'}
              onChange={(e) => setActiveMode(e.target.value)}
              disabled={controlsDisabled}
            />
            Manual Data Entry
          </label>
        </div>
      </div>

      {/* CSV Upload Section */}
      {activeMode === 'csv' && (
        <div className="upload-section">
          <div style={{ 
            backgroundColor: '#e8f4fd',
            border: '1px solid #007bff',
            borderRadius: '6px',
            padding: '15px',
            marginBottom: '20px'
          }}>
            <h4 style={{ color: '#0056b3', marginTop: 0 }}>📋 CSV File Format</h4>
            {/* Apply styles to the ul element only */}
            <ul style={{ color: '#495057', marginBottom: 0, paddingLeft: '20px', textAlign: 'left' }}>
              <li><strong>Column A:</strong> Account Number (required)</li>
              <li><strong>Column B:</strong> Date in YYYY-MM-DD or MM/DD/YYYY format (required)</li>
              <li><strong>Row 1:</strong> Can contain headers (will be skipped)</li>
              <li>Data starts from Row 2</li>
              <li>Dates must be month-end dates only</li>
              <li>Dates cannot be beyond cutoff date: <strong>{formatDisplayDate(cutoffDate)}</strong></li>
            </ul>
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
            onClick={handleCsvUpload}
            disabled={!selectedFile || controlsDisabled}
            className="upload-button"
          >
            {isLoading ? 'Uploading...' : 'Upload CSV File'}
          </button>
        </div>
      )}

      {/* Manual Entry Section */}
      {activeMode === 'manual' && (
        <div className="manual-entry-section">
          <div style={{ 
            backgroundColor: '#e8f4fd',
            border: '1px solid #007bff',
            borderRadius: '6px',
            padding: '15px',
            marginBottom: '20px'
          }}>
            <h4 style={{ color: '#0056b3', marginTop: 0 }}>📝 Manual Entry Instructions</h4>
            {/* Apply styles to the ul element only */}
            <ul style={{ color: '#495057', marginBottom: 0, paddingLeft: '20px', textAlign: 'left' }}>
              <li>You can copy data from Excel and paste it here <strong><i>(Ctrl+V)</i></strong></li>
              <li>Each row represents one account record</li>
              <li>Dates must be month-end dates only</li>
              <li>Dates cannot be beyond cutoff date: <strong>{formatDisplayDate(cutoffDate)}</strong></li>
              <li>Existing accounts will be updated with new dates</li>
            </ul>
          </div>

          <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={addManualEntry}
              disabled={controlsDisabled}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: controlsDisabled ? 'not-allowed' : 'pointer'
              }}
            >
              ➕ Add Row
            </button>
            <span style={{ fontSize: '12px', color: '#6c757d' }}>
              Or paste Excel data (Ctrl+V) to replace all entries
            </span>
          </div>

          <div 
            onPaste={handlePaste}
            style={{ 
              border: '2px dashed #007bff',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '20px',
              backgroundColor: '#f8f9fa'
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#e9ecef' }}>
                  <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>Account Number</th>
                  <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>Date (YYYY-MM-DD)</th>
                  <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'center', width: '100px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {manualEntries.map((entry, index) => (
                  <tr key={entry.id}>
                    <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                      <input
                        type="text"
                        value={entry.accountNo}
                        onChange={(e) => updateManualEntry(entry.id, 'accountNo', e.target.value)}
                        placeholder="Enter account number"
                        disabled={controlsDisabled}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ced4da',
                          borderRadius: '4px'
                        }}
                      />
                    </td>
                   
                   {/* Old date input (via picker) */}
                    {/* <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                      <input
                        type="date"
                        value={entry.date}
                        onChange={(e) => updateManualEntry(entry.id, 'date', e.target.value)}
                        disabled={controlsDisabled}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: entry.error ? '1px solid #dc3545' : '1px solid #ced4da',
                          borderRadius: '4px'
                        }}
                      />
                      {entry.error && (
                        <div style={{ fontSize: '12px', color: '#dc3545', marginTop: '5px' }}>
                          {entry.error}
                        </div>
                      )}
                    </td> */}

{/* new Date entry as text */}
<td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
    <input
        type="text" // Changed from "date" to "text"
        value={entry.date}
        onChange={(e) => updateManualEntry(entry.id, 'date', e.target.value)}
        placeholder="Enter date (YYYY-MM-DD)" // Updated placeholder for clarity
        disabled={controlsDisabled}
        style={{
            width: '100%',
            padding: '8px',
            border: entry.error ? '1px solid #dc3545' : '1px solid #ced4da',
            borderRadius: '4px'
        }}
    />
    {entry.error && (
        <div style={{ fontSize: '12px', color: '#dc3545', marginTop: '5px' }}>
            {entry.error}
        </div>
    )}
</td>

                    <td style={{ padding: '5px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                      {manualEntries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeManualEntry(entry.id)}
                          disabled={controlsDisabled}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: controlsDisabled ? 'not-allowed' : 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          ❌
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleManualSubmit}
            disabled={controlsDisabled}
            className="upload-button"
          >
            {isLoading ? 'Submitting...' : `Submit ${manualEntries.length} Entries`}
          </button>
        </div>
      )}

      {/* Results Display */}
      {message && (
        <div className={`feedback-message ${message.startsWith('❌') ? 'error-message' : 'success-message'}`}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{message}</pre>
        </div>
      )}

      {uploadResults && (
        <div className="upload-results-summary">
          <h4>📊 Processing Results</h4>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
            gap: '15px',
            marginBottom: '15px'
          }}>
            <div style={{ 
              padding: '15px', 
              backgroundColor: '#d4edda', 
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#155724' }}>
                {uploadResults.totalInserted || 0}
              </div>
              <div style={{ fontSize: '14px', color: '#155724' }}>New Records</div>
            </div>
            <div style={{ 
              padding: '15px', 
              backgroundColor: '#fff3cd', 
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#856404' }}>
                {uploadResults.totalUpdated || 0}
              </div>
              <div style={{ fontSize: '14px', color: '#856404' }}>Updated Records</div>
            </div>
            <div style={{ 
              padding: '15px', 
              backgroundColor: '#f8d7da', 
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#721c24' }}>
                {uploadResults.totalErrors || 0}
              </div>
              <div style={{ fontSize: '14px', color: '#721c24' }}>Errors</div>
            </div>
            <div style={{ 
              padding: '15px', 
              backgroundColor: '#e2e3e5', 
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#383d41' }}>
                {uploadResults.totalRowsProcessed || 0}
              </div>
              <div style={{ fontSize: '14px', color: '#383d41' }}>Total Processed</div>
            </div>
          </div>

          {uploadResults.summary && uploadResults.summary.length > 0 && (
            <div>
              <h5>📋 Detailed Summary</h5>
              <table className="upload-summary-table">
                <thead>
                  <tr>
                    <th>Account Number</th>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadResults.summary.map((item, index) => (
                    <tr key={index}>
                      <td>{item.accountNo}</td>
                      <td>{item.date}</td>
                      <td>{item.action}</td>
                      <td style={{ color: item.status === 'Success' ? '#28a745' : '#dc3545' }}>
                        {item.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SalesRecognitionManager;