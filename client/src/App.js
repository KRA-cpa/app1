// client/src/App.js - Complete version with Sales Recognition tab added
// kra-cpa/app1/app1-test1/client/src/App.js

import React, { useState, useEffect } from 'react';
import DataDisplay from './components/DataDisplay';
import PcompDataDisplay from './components/PcompDataDisplay';
import CsvUploader from './components/CsvUploader';
import ManualPcompEntry from './components/ManualPcompEntry';
import SalesRecognitionManager from './components/SalesRecognitionManager';
import { logToServer } from './utils/logger';

// Calculate last month's end date dynamically in UTC+8 timezone
const getLastMonthEndDate = () => {
  // Get current date
  const now = new Date();
  
  // Convert to UTC+8 timezone (Philippines)
  const utc8Offset = 8 * 60; // UTC+8 in minutes
  const localTime = now.getTime();
  const localOffset = now.getTimezoneOffset() * 60000; // Convert to milliseconds
  const utc = localTime + localOffset;
  const utc8Time = utc + (utc8Offset * 60000);
  const utc8Date = new Date(utc8Time);
  
  // Get last day of previous month by using current month and day 0
  // This automatically handles leap years and month boundaries
  const lastMonthEnd = new Date(utc8Date.getFullYear(), utc8Date.getMonth(), 0);
  
  // Format as YYYY-MM-DD
  return lastMonthEnd.getFullYear() + '-' + 
    String(lastMonthEnd.getMonth() + 1).padStart(2, '0') + '-' + 
    String(lastMonthEnd.getDate()).padStart(2, '0');
};

/**
 * Checks if a date is the last day of its month (month-end date)
 * @param {string} dateString - The date string to validate (YYYY-MM-DD format)
 * @returns {boolean} - True if it's a month-end date, false otherwise
 */
const isMonthEndDate = (dateString) => {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return false;
  }

  // Create a new date with the next day
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);
  
  // If the next day is the 1st, then the current date is month-end
  return nextDay.getDate() === 1;
};

/**
 * Checks if a date is in the future (compared to today)
 * @param {string} dateString - The date string to check
 * @returns {boolean} - True if it's a future date
 */
const isFutureDate = (dateString) => {
  if (!dateString) return false;
  
  const inputDate = new Date(dateString);
  const today = new Date();
  
  // Set time to start of day for comparison
  today.setHours(0, 0, 0, 0);
  inputDate.setHours(0, 0, 0, 0);
  
  return inputDate > today;
};

/**
 * Validates cutoff date for Upload tab (month-end, not future)
 * @param {string} dateString - The date string to validate
 * @returns {object} - {isValid: boolean, error: string}
 */
const validateForUpload = (dateString) => {
  if (!dateString) {
    return { isValid: false, error: 'Please select a cutoff date' };
  }

  if (!isMonthEndDate(dateString)) {
    return { isValid: false, error: 'Upload requires a month-end date (last day of the month)' };
  }

  if (isFutureDate(dateString)) {
    return { isValid: false, error: 'Upload does not allow future dates' };
  }

  return { isValid: true, error: null };
};

/**
 * Validates cutoff date for Reports tab (month-end, can be future)
 * @param {string} dateString - The date string to validate
 * @returns {object} - {isValid: boolean, error: string}
 */
const validateForReports = (dateString) => {
  if (!dateString) {
    return { isValid: false, error: 'Please select a cutoff date' };
  }

  if (!isMonthEndDate(dateString)) {
    return { isValid: false, error: 'Reports require a month-end date (last day of the month)' };
  }

  return { isValid: true, error: null };
};

/**
 * General validation - checks if it's a month-end date
 * @param {string} dateString - The date string to validate
 * @returns {boolean} - True if valid month-end date
 */
const validateCutoffDate = (dateString) => {
  return isMonthEndDate(dateString);
};

const App = () => {
  const [dbStatus, setDbStatus] = useState('checking');
  const [lastDbCheck, setLastDbCheck] = useState(null);
  const [cutoffDate, setCutoffDate] = useState(getLastMonthEndDate()); // UNIFIED cutoff date
  const [selectedCompany, setSelectedCompany] = useState(''); // Start with 'All Companies'
  const [activeTab, setActiveTab] = useState('upload');
  const [activeReport, setActiveReport] = useState('poc');
  const [cutoffError, setCutoffError] = useState(null);

  const companies = [
    { code: '', name: 'All Companies' },
    { code: 'MBPH', name: 'Manila Bayshore' },
    { code: 'MCTI', name: 'Capital Town' },
    { code: 'OPI', name: 'Oceantown' },
    { code: 'SVCI', name: 'San Vicente Coast' },
    { code: 'NPI', name: 'Northwin' },
    { code: 'API', name: 'Arcovia' },
    { code: 'MBPI', name: 'MEG Bacolod' },
  ];

  // Get current validation based on active tab
  const getCurrentValidation = () => {
    if (activeTab === 'upload') {
      return validateForUpload(cutoffDate);
    } else if (activeTab === 'reports') {
      return validateForReports(cutoffDate);
    } else if (activeTab === 'sales-recognition') {
      // Sales Recognition uses the same validation as upload (month-end, not future)
      return validateForUpload(cutoffDate);
    } else {
      return { isValid: true, error: null };
    }
  };

  // URL parameter handling with /completiondate and /sales-recognition support
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab') || 'upload';
    const report = urlParams.get('report') || 'poc';
    
    setActiveTab(tab);
    setActiveReport(report);
    
    // Handle direct URL access
    const path = window.location.pathname;
    if (path.includes('/reports')) {
      setActiveTab('reports');
      if (path.includes('/completion')) {
        setActiveReport('completion');
      }
    } else if (path.includes('/manual-entry') || path.includes('/POCDataEntrya')) {
      setActiveTab('manual-entry');
    } else if (path.includes('/sales-recognition')) {
      setActiveTab('sales-recognition');
    } else if (path.includes('/upload')) {
      setActiveTab('upload');
    }
  }, []);

  // Update validation when tab changes
  useEffect(() => {
    const validation = getCurrentValidation();
    setCutoffError(validation.error);
  }, [activeTab, cutoffDate]);

  // Update URL when tab/report changes with /completiondate and /sales-recognition support
  const updateURL = (tab, report = null) => {
    let url = '/';
    if (tab === 'reports') {
      url = '/reports';
      if (report === 'completion') {
        url = '/reports/completion';
      }
    } else if (tab === 'upload') {
      url = '/upload';
    } else if (tab === 'manual-entry') {
      url = '/POCDataEntry';
    } else if (tab === 'sales-recognition') {
      url = '/sales-recognition';
    }
    
    window.history.pushState(null, '', url);
  };

  // Check database status
  useEffect(() => {
    checkDbStatus();
    
    // Set up periodic checks
    const statusInterval = setInterval(checkDbStatus, 30000); // Check every 30 seconds
    
    return () => {
      clearInterval(statusInterval);
    };
  }, []);

  const checkDbStatus = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/db-status');
      const now = new Date();
      setLastDbCheck(now);
      
      if (response.ok) {
        setDbStatus('connected');
        logToServer({ level: 'info', message: 'Database connection successful.' });
      } else {
        setDbStatus('error');
        logToServer({ level: 'error', message: 'Database connection failed.' });
      }
    } catch (error) {
      const now = new Date();
      setLastDbCheck(now);
      
      setDbStatus('error');
      logToServer({ level: 'error', message: `Database connection error: ${error.message}` });
    }
  };

  const handleCutoffDateChange = (e) => {
    const value = e.target.value;
    setCutoffDate(value); // This will update for ALL tabs
    
    // Validate based on current tab
    const validation = getCurrentValidation();
    setCutoffError(validation.error);
    
    if (validation.isValid) {
      logToServer({ level: 'info', message: `Cutoff date changed to: ${value}` });
    } else {
      logToServer({ level: 'warn', message: `Invalid cutoff date: ${value} - ${validation.error}` });
    }
  };

  const handleCompanyChange = (e) => {
    setSelectedCompany(e.target.value);
    logToServer({ level: 'info', message: `Company changed to: ${e.target.value || 'All Companies'}` });
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    updateURL(tab, activeReport);
    checkDbStatus(); // Check DB when switching tabs
    
    // Re-validate cutoff date for the new tab
    const validation = getCurrentValidation();
    setCutoffError(validation.error);
  };

  const handleReportChange = (report) => {
    setActiveReport(report);
    updateURL('reports', report);
  };

  const getStatusColor = () => {
    switch (dbStatus) {
      case 'connected': return '#28a745';
      case 'error': return '#dc3545';
      default: return '#ffc107';
    }
  };

  const getStatusText = () => {
    switch (dbStatus) {
      case 'connected': return 'Connected';
      case 'error': return 'Error';
      default: return 'Checking...';
    }
  };

  const formatDateTime = (date) => {
    if (!date) return '';
    
    const options = {
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila' // UTC+8 Philippines timezone
    };
    
    return date.toLocaleString('en-US', options);
  };

  const isCurrentlyValid = getCurrentValidation().isValid;

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f8f9fa',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{ 
        background: '#003DA5', // Megaworld Blue
        color: 'white',
        padding: '10px',
        textAlign: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '2.5rem', display: 'flex', alignItems: 'center' }}>
          <img src="/logo2019-v2-white_0.png" alt="MEG Logo" width="25%" height="25%" />&nbsp;POC Data Management
        </h1>
      </div>

    {/* Right side - Log Management Link */}
        <div style={{ width: '120px', display: 'flex', justifyContent: 'flex-end' }}>
          <a 
            href="http://localhost:3001/managelogs" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              padding: '8px 15px',
              borderRadius: '20px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '500',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
            onMouseOver={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.3)';
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.2)';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            🗂️ Server Logs
          </a>
        </div>
      </div>

      {/* UNIFIED Control Bar: Company + Cutoff Date + Database Status */}
      <div style={{ 
        padding: '20px', 
        backgroundColor: 'white',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
      }}>
        {/* Left Side: Company Selector + Cutoff Date (show cutoff date for upload/reports/sales-recognition) */}
        <div style={{ 
          display: 'flex',
          alignItems: 'flex-start',
          gap: '30px'
        }}>
          {/* Company Selector */}
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            marginTop: '8px' // Align with cutoff date input
          }}>
            <label style={{ fontWeight: 'bold', color: '#495057' }}>Company:</label>
            <select 
              value={selectedCompany} 
              onChange={handleCompanyChange}
              style={{
                padding: '8px 12px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer',
                minWidth: '150px'
              }}
            >
              {companies.map(company => (
                <option key={company.code} value={company.code}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {/* UNIFIED Cutoff Date with Error Display - show for upload/reports/sales-recognition tabs */}
          {(activeTab === 'upload' || activeTab === 'reports' || activeTab === 'sales-recognition') && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '15px',
                backgroundColor: isCurrentlyValid ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
                padding: '8px 15px',
                borderRadius: '8px',
                border: isCurrentlyValid ? '1px solid #28a745' : '1px solid #dc3545'
              }}>
                <label style={{ 
                  fontSize: '14px', 
                  fontWeight: 'bold', 
                  color: '#495057',
                  whiteSpace: 'nowrap'
                }}>
                  📅 Cutoff Date:
                </label>
                <input
                  type="date"
                  value={cutoffDate}
                  onChange={handleCutoffDateChange}
                  style={{
                    padding: '6px 10px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: 'white',
                    minWidth: '140px'
                  }}
                />
                <div style={{
                  fontSize: '14px',
                  fontWeight: 'bold',
                  color: isCurrentlyValid ? '#28a745' : '#dc3545'
                }}>
                  {isCurrentlyValid ? '✅' : '❌'}
                </div>
              </div>
              
              {/* Error Message */}
              {cutoffError && (
                <div style={{
                  backgroundColor: '#f8d7da',
                  color: '#721c24',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  border: '1px solid #f5c6cb',
                  maxWidth: '350px'
                }}>
                  ⚠️ {cutoffError}
                </div>
              )}
              
              {/* Helpful hint */}
              <div style={{
                fontSize: '11px',
                color: '#6c757d',
                fontStyle: 'italic',
                maxWidth: '350px'
              }}>
                {activeTab === 'upload' 
                  ? 'Upload: Month-end dates only, no future dates'
                  : activeTab === 'sales-recognition'
                  ? 'Sales Recognition: Month-end dates only, not beyond cutoff'
                  : 'Reports: Month-end dates only, future dates allowed'
                }
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Database Status */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '15px'
        }}>
          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '5px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 'bold', color: '#495057' }}>
                Database Status:
              </span>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 15px',
                borderRadius: '20px',
                backgroundColor: `${getStatusColor()}15`,
                border: `1px solid ${getStatusColor()}`,
                cursor: 'pointer'
              }}
              onClick={checkDbStatus}
              title="Click to refresh status"
              >
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(),
                  animation: dbStatus === 'connected' ? 'pulse 2s infinite' : 'none'
                }}></div>
                <span style={{ 
                  color: getStatusColor(),
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}>
                  {getStatusText()}
                </span>
              </div>
              {dbStatus === 'error' && (
                <button 
                  onClick={checkDbStatus} 
                  style={{ 
                    padding: '5px 10px', 
                    fontSize: '12px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Retry
                </button>
              )}
            </div>
            {lastDbCheck && (
              <div style={{ 
                fontSize: '12px', 
                color: '#6c757d',
                fontStyle: 'italic'
              }}>
                Last checked: {formatDateTime(lastDbCheck)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center',
        backgroundColor: 'white',
        borderBottom: '1px solid #dee2e6'
      }}>
        <button
          onClick={() => handleTabChange('upload')}
          style={{
            padding: '15px 30px',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'upload' ? '#007bff' : '#6c757d',
            fontWeight: activeTab === 'upload' ? 'bold' : 'normal',
            fontSize: '16px',
            cursor: 'pointer',
            borderBottom: activeTab === 'upload' ? '3px solid #007bff' : '3px solid transparent',
            transition: 'all 0.2s ease'
          }}
        >
          Upload Completion/POC Data
        </button>
        <button
          onClick={() => handleTabChange('manual-entry')}
          style={{
            padding: '15px 30px',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'manual-entry' ? '#007bff' : '#6c757d',
            fontWeight: activeTab === 'manual-entry' ? 'bold' : 'normal',
            fontSize: '16px',
            cursor: 'pointer',
            borderBottom: activeTab === 'manual-entry' ? '3px solid #007bff' : '3px solid transparent',
            transition: 'all 0.2s ease'
          }}
        >
          Completion Date/POC Detailed Entry
        </button>
        <button
          onClick={() => handleTabChange('sales-recognition')}
          style={{
            padding: '15px 30px',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'sales-recognition' ? '#007bff' : '#6c757d',
            fontWeight: activeTab === 'sales-recognition' ? 'bold' : 'normal',
            fontSize: '16px',
            cursor: 'pointer',
            borderBottom: activeTab === 'sales-recognition' ? '3px solid #007bff' : '3px solid transparent',
            transition: 'all 0.2s ease'
          }}
        >
          Sales Recognition
        </button>
        <button
          onClick={() => handleTabChange('reports')}
          style={{
            padding: '15px 30px',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'reports' ? '#007bff' : '#6c757d',
            fontWeight: activeTab === 'reports' ? 'bold' : 'normal',
            fontSize: '16px',
            cursor: 'pointer',
            borderBottom: activeTab === 'reports' ? '3px solid #007bff' : '3px solid transparent',
            transition: 'all 0.2s ease'
          }}
        >
          Reports
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1 }}>
        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div style={{ padding: '30px' }}>
            <CsvUploader 
              selectedCompany={selectedCompany} 
              cocode={selectedCompany}
              dbStatus={dbStatus}
              cutoffDate={cutoffDate} // Pass the unified cutoff date
              validateCutoffDate={() => validateForUpload(cutoffDate)} // Pass upload-specific validation
            />
          </div>
        )}

        {/* Manual Entry Tab */}
        {activeTab === 'manual-entry' && (
          <div style={{ padding: '30px' }}>
            <ManualPcompEntry 
              selectedCompany={selectedCompany} 
              cocode={selectedCompany}
              dbStatus={dbStatus}
              cutoffDate={cutoffDate}
              validateCutoffDate={() => ({ isValid: true, error: null })} // Manual entry doesn't need cutoff validation
            />
          </div>
        )}

        {/* Sales Recognition Tab */}
        {activeTab === 'sales-recognition' && (
          <div style={{ padding: '30px' }}>
            <SalesRecognitionManager 
              dbStatus={dbStatus}
              cutoffDate={cutoffDate}
            />
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div style={{ padding: '30px' }}>
            {/* Report Header - Simplified since cutoff date is now in top bar */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: '40px',
              paddingBottom: '20px',
              borderBottom: '2px solid #e9ecef'
            }}>
              {/* Report Selector Tabs - Back to original 2 tabs */}
              <div style={{ display: 'flex', gap: '30px' }}>
                <button 
                  onClick={() => handleReportChange('poc')}
                  style={{
                    padding: '15px 25px',
                    border: 'none',
                    borderBottom: activeReport === 'poc' ? '3px solid #007bff' : '3px solid transparent',
                    backgroundColor: 'transparent',
                    color: activeReport === 'poc' ? '#007bff' : '#6c757d',
                    fontWeight: activeReport === 'poc' ? 'bold' : 'normal',
                    fontSize: '18px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseOver={(e) => {
                    if (activeReport !== 'poc') {
                      e.target.style.color = '#007bff';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (activeReport !== 'poc') {
                      e.target.style.color = '#6c757d';
                    }
                  }}
                >
                  POC Per Month Report
                </button>
                
                <button 
                  onClick={() => handleReportChange('completion')}
                  style={{
                    padding: '15px 25px',
                    border: 'none',
                    borderBottom: activeReport === 'completion' ? '3px solid #007bff' : '3px solid transparent',
                    backgroundColor: 'transparent',
                    color: activeReport === 'completion' ? '#007bff' : '#6c757d',
                    fontWeight: activeReport === 'completion' ? 'bold' : 'normal',
                    fontSize: '18px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseOver={(e) => {
                    if (activeReport !== 'completion') {
                      e.target.style.color = '#007bff';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (activeReport !== 'completion') {
                      e.target.style.color = '#6c757d';
                    }
                  }}
                >
                  Completion Date Report
                </button>
              </div>
            </div>

            {/* Report Content */}
            {dbStatus === 'connected' && isCurrentlyValid && (
              <>
                {activeReport === 'poc' && (
                  <DataDisplay 
                    cutoffDate={cutoffDate}  // Uses unified cutoff date
                    cocode={selectedCompany} 
                    dbStatus={dbStatus} 
                  />
                )}
                {activeReport === 'completion' && (
                  <PcompDataDisplay 
                    cutoffDate={cutoffDate}  // Uses unified cutoff date
                    cocode={selectedCompany} 
                  />
                )}
              </>
            )}
            
            {(dbStatus !== 'connected' || !isCurrentlyValid) && (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center', 
                color: '#6c757d',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
              }}>
                <h3>
                  {dbStatus !== 'connected' ? 'Database Connection Required' : 'Valid Cutoff Date Required'}
                </h3>
                <p>
                  {dbStatus !== 'connected' 
                    ? 'Please ensure the database is connected to view reports.'
                    : 'Please enter a valid month-end cutoff date in the control bar above to view reports.'
                  }
                </p>
                {dbStatus !== 'connected' && (
                  <button 
                    onClick={checkDbStatus}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Check Connection
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Footer */}
      <footer style={{ marginTop: '30px', fontSize: '0.8em', color: '#555', textAlign: 'center' }}>
        <p>Current Date/Time: {new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })} | {new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' })}</p>
        <p>All Rights Reserved (r) 2025 by Kenneth Advento</p>
      </footer>

      {/* Add CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default App;