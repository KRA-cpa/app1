// client/src/components/LogManagement.js
import React, { useState, useEffect } from 'react';

const LogManagement = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [logInfo, setLogInfo] = useState([]);
  const [backups, setBackups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Google Client ID - should be set in environment variables
  const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || 'your-google-client-id.googleusercontent.com';

  useEffect(() => {
    // Load Google Sign-In API
    const loadGoogleScript = () => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogleSignIn;
      document.head.appendChild(script);
    };

    const initializeGoogleSignIn = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCallback,
          auto_select: false,
        });
      }
    };

    loadGoogleScript();
  }, []);

  const handleGoogleCallback = async (response) => {
    try {
      setIsLoading(true);
      setError('');
      
      // Store the token for API calls
      localStorage.setItem('google_token', response.credential);
      
      // Decode the JWT to get user info (for display purposes)
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      
      setUser({
        name: payload.name,
        email: payload.email,
        picture: payload.picture
      });
      
      setIsAuthenticated(true);
      setMessage(`Welcome, ${payload.name}! You can now manage server logs.`);
      
      // Fetch initial log info
      await fetchLogInfo();
      
    } catch (err) {
      setError('Authentication failed. Please try again.');
      console.error('Google auth error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = () => {
    if (window.google) {
      window.google.accounts.id.prompt();
    } else {
      setError('Google Sign-In is not loaded. Please refresh the page.');
    }
  };

  const signOut = () => {
    localStorage.removeItem('google_token');
    setIsAuthenticated(false);
    setUser(null);
    setLogInfo([]);
    setBackups([]);
    setMessage('');
    setError('');
  };

  const makeAuthenticatedRequest = async (url, options = {}) => {
    const token = localStorage.getItem('google_token');
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 401 || response.status === 403) {
      signOut();
      throw new Error('Authentication expired or access denied');
    }

    return response;
  };

  const fetchLogInfo = async () => {
    try {
      setIsLoading(true);
      const response = await makeAuthenticatedRequest('/api/logs/info');
      
      if (response.ok) {
        const data = await response.json();
        setLogInfo(data.logs);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to fetch log information');
      }
    } catch (err) {
      setError(err.message || 'Error fetching log information');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      setIsLoading(true);
      const response = await makeAuthenticatedRequest('/api/logs/backups');
      
      if (response.ok) {
        const data = await response.json();
        setBackups(data.backups);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to fetch backup information');
      }
    } catch (err) {
      setError(err.message || 'Error fetching backup information');
    } finally {
      setIsLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all server logs? This action will create backups but cannot be undone.')) {
      return;
    }

    try {
      setIsLoading(true);
      setMessage('');
      setError('');
      
      const response = await makeAuthenticatedRequest('/api/logs/clear', {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessage(`✅ ${data.message}`);
        
        // Refresh log info and backups
        await fetchLogInfo();
        await fetchBackups();
        
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to clear logs');
      }
    } catch (err) {
      setError(err.message || 'Error clearing logs');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadLog = async (filename) => {
    try {
      const response = await makeAuthenticatedRequest(`/api/logs/download/${filename}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        setMessage(`📥 Downloaded ${filename}`);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to download log file');
      }
    } catch (err) {
      setError(err.message || 'Error downloading log file');
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{ 
          maxWidth: '400px', 
          padding: '40px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '30px' }}>
            <span style={{ fontSize: '48px', marginBottom: '20px', display: 'block' }}>🔒</span>
            <h2 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>Server Log Management</h2>
            <p style={{ color: '#6c757d', margin: 0 }}>
              Secure access required to manage server logs
            </p>
          </div>
          
          {error && (
            <div style={{ 
              padding: '10px',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '6px',
              marginBottom: '20px',
              border: '1px solid #f5c6cb'
            }}>
              {error}
            </div>
          )}
          
          <button
            onClick={signIn}
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              backgroundColor: '#4285f4',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '500',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              width: '100%',
              transition: 'background-color 0.3s ease'
            }}
            onMouseOver={(e) => {
              if (!isLoading) e.target.style.backgroundColor = '#3367d6';
            }}
            onMouseOut={(e) => {
              if (!isLoading) e.target.style.backgroundColor = '#4285f4';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ fill: 'white' }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {isLoading ? 'Signing in...' : 'Sign in with Google'}
          </button>
          
          <p style={{ 
            fontSize: '12px', 
            color: '#6c757d', 
            marginTop: '20px',
            textAlign: 'center'
          }}>
            Only authorized administrators can access this feature
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f8f9fa',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{ 
        background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
        color: 'white',
        padding: '20px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem' }}>🗂️ Server Log Management</h1>
            <p style={{ margin: '5px 0 0 0', opacity: 0.9 }}>
              Secure log clearing and backup management
            </p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold' }}>{user?.name}</div>
              <div style={{ fontSize: '14px', opacity: 0.8 }}>{user?.email}</div>
            </div>
            {user?.picture && (
              <img 
                src={user.picture} 
                alt="Profile"
                style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '50%',
                  border: '2px solid white'
                }}
              />
            )}
            <button
              onClick={signOut}
              style={{
                padding: '8px 16px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '30px' }}>
        {/* Messages */}
        {message && (
          <div style={{ 
            margin: '0 0 25px 0',
            padding: '15px',
            backgroundColor: '#d4edda',
            color: '#155724',
            borderRadius: '8px',
            border: '1px solid #c3e6cb'
          }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{ 
            margin: '0 0 25px 0',
            padding: '15px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            borderRadius: '8px',
            border: '1px solid #f5c6cb'
          }}>
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          marginBottom: '30px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={fetchLogInfo}
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: '500'
            }}
          >
            🔄 Refresh Log Info
          </button>
          
          <button
            onClick={fetchBackups}
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: '500'
            }}
          >
            📦 View Backups
          </button>
          
          <button
            onClick={clearLogs}
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: '500'
            }}
          >
            🗑️ Clear All Logs
          </button>
        </div>

        {/* Current Log Files */}
        {logInfo.length > 0 && (
          <div style={{ 
            marginBottom: '30px',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <div style={{ 
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderBottom: '1px solid #dee2e6'
            }}>
              <h3 style={{ margin: 0, color: '#495057' }}>📋 Log Files (Current & Backup)</h3>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>File</th>
                      <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Type</th>
                      <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Size</th>
                      <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Last Modified</th>
                      <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'center', border: '1px solid #dee2e6' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logInfo.map((log, index) => (
                      <tr key={log.file} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa' }}>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6', fontWeight: '500' }}>
                          {log.file}
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            backgroundColor: log.type === 'current' ? '#e3f2fd' : '#fff3cd',
                            color: log.type === 'current' ? '#1565c0' : '#856404'
                          }}>
                            {log.type === 'current' ? 'CURRENT' : 'BACKUP'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          {log.size}
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          {log.lastModified ? new Date(log.lastModified).toLocaleString() : 'N/A'}
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            backgroundColor: log.exists ? '#d4edda' : '#f8d7da',
                            color: log.exists ? '#155724' : '#721c24'
                          }}>
                            {log.exists ? 'EXISTS' : 'MISSING'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                          {log.exists && (
                            <button
                              onClick={() => downloadLog(log.file)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              📥 Download
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Backup Files */}
        {backups.length > 0 && (
          <div style={{ 
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <div style={{ 
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderBottom: '1px solid #dee2e6'
            }}>
              <h3 style={{ margin: 0, color: '#495057' }}>📦 Backup Files ({backups.length})</h3>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Backup File</th>
                      <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Size</th>
                      <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Created</th>
                      <th style={{ padding: '12px', textAlign: 'center', border: '1px solid #dee2e6' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((backup, index) => (
                      <tr key={backup.filename} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa' }}>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6', fontFamily: 'monospace', fontSize: '13px' }}>
                          {backup.filename}
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          {backup.size}
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
                          {new Date(backup.created).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                          <button
                            onClick={() => downloadLog(backup.filename)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            📥 Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* No data message */}
        {logInfo.length === 0 && backups.length === 0 && !isLoading && (
          <div style={{ 
            textAlign: 'center',
            padding: '60px',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '20px' }}>📁</span>
            <h3 style={{ color: '#6c757d', margin: '0 0 10px 0' }}>No log data loaded</h3>
            <p style={{ color: '#6c757d', margin: 0 }}>
              Click "Refresh Log Info" to load current log file information
            </p>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div style={{ 
            textAlign: 'center',
            padding: '40px',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ 
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #007bff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <p style={{ marginTop: '20px', color: '#6c757d' }}>Loading...</p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LogManagement;