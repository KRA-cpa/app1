// kra-cpa/app1/app1-test1/client/src/App.js

import React, { useState, useEffect } from 'react';
import DataDisplay from './components/DataDisplay';
import PcompDataDisplay from './components/PcompDataDisplay';
import CsvUploader from './components/CsvUploader';
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

const App = () => {
  const [dbStatus, setDbStatus] = useState('checking');
  const [lastDbCheck, setLastDbCheck] = useState(null);
  const [cutoffDate, setCutoffDate] = useState(getLastMonthEndDate());
  const [selectedCompany, setSelectedCompany] = useState(''); // Start with 'All Companies'
  const [activeTab, setActiveTab] = useState('upload');
  const [activeReport, setActiveReport] = useState('poc');

  const companies = [
    { code: '', name: 'All Companies' },
    { code: 'MBPH', name: 'Bayshore' },
    { code: 'MCTI', name: 'CapTown' },
    { code: 'OPI', name: 'Oceantown' },
    { code: 'SVCI', name: 'San Vicente' },
    { code: 'NPI', name: 'Northwin' },
    { code: 'API', name: 'Arcovia' },
    { code: 'MBPI', name: 'MEG Bacolod' },
  ];

  // URL parameter handling
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
    }
  }, []);

  // Update URL when tab/report changes
  const updateURL = (tab, report = null) => {
    let url = '/';
    if (tab === 'reports') {
      url = '/reports';
      if (report === 'completion') {
        url = '/reports/completion';
      }
    } else if (tab === 'upload') {
      url = '/upload';
    }
    
    window.history.pushState(null, '', url);
  };

  // Check database status on component mount
  useEffect(() => {
    checkDbStatus();
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
    setCutoffDate(e.target.value);
    logToServer({ level: 'info', message: `Cutoff date changed to: ${e.target.value}` });
  };

  const handleCompanyChange = (e) => {
    setSelectedCompany(e.target.value);
    logToServer({ level: 'info', message: `Company changed to: ${e.target.value || 'All Companies'}` });
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    updateURL(tab, activeReport);
    checkDbStatus(); // Check DB when switching tabs
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

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f8f9fa',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{ 
        background: '#003DA5', // Megaworld Blue
        // background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '10px',
        textAlign: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex', // Add this
        alignItems: 'center', // Corrected property
        justifyContent: 'center' // Add this to center the h1 content
      }}>
        <h1 style={{ margin: 0, fontSize: '2.5rem', display: 'flex', alignItems: 'center' }}>
      <img src = "/logo2019-v2-white_0.png" alt="MEG Logo" width="25%" height="25%" />&nbsp;POC Data Management</h1>
      </div>

      {/* Combined Company Selector and Database Status Bar */}
      <div style={{ 
        padding: '20px', 
        backgroundColor: 'white',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        {/* Company Selector - Left Side */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '15px'
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
              cursor: 'pointer'
            }}
          >
            {companies.map(company => (
              <option key={company.code} value={company.code}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {/* Database Status - Right Side */}
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
              <span style={{ 
                color: getStatusColor(),
                fontWeight: 'bold',
                padding: '5px 10px',
                borderRadius: '15px',
                backgroundColor: `${getStatusColor()}20`,
                border: `1px solid ${getStatusColor()}`
              }}>
                {getStatusText()}
              </span>
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
          Upload Data
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
            />
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div style={{ padding: '30px' }}>
            {/* Report Header with improved layout */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '40px',
              paddingBottom: '20px',
              borderBottom: '2px solid #e9ecef'
            }}>
              {/* Report Selector Tabs - Left Side */}
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
              
              {/* Cutoff Date - Right Side */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '15px',
                backgroundColor: '#f8f9fa',
                padding: '12px 20px',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
              }}>
                <label style={{ 
                  fontSize: '16px', 
                  fontWeight: '600', 
                  color: '#495057',
                  whiteSpace: 'nowrap'
                }}>
                  Cutoff Date:
                </label>
                <input
                  type="date"
                  value={cutoffDate}
                  onChange={handleCutoffDateChange}
                  style={{
                    padding: '10px 15px',
                    border: '1px solid #ced4da',
                    borderRadius: '6px',
                    fontSize: '16px',
                    backgroundColor: 'white',
                    minWidth: '160px'
                  }}
                />
              </div>
            </div>

            {/* Report Content */}
            {dbStatus === 'connected' && (
              <>
                {activeReport === 'poc' && (
                  <DataDisplay 
                    cutoffDate={cutoffDate} 
                    cocode={selectedCompany} 
                    dbStatus={dbStatus} 
                  />
                )}
                {activeReport === 'completion' && (
                  <PcompDataDisplay 
                    cutoffDate={cutoffDate} 
                    cocode={selectedCompany} 
                  />
                )}
              </>
            )}
            
            {dbStatus !== 'connected' && (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center', 
                color: '#6c757d',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
              }}>
                <h3>Database Connection Required</h3>
                <p>Please ensure the database is connected to view reports.</p>
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
    </div>
  );
};

export default App;