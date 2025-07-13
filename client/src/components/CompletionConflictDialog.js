// client/src/components/CompletionConflictDialog.js
// Conflict Resolution Dialog for Completion Date Uploads

import React, { useState } from 'react';

function CompletionConflictDialog({ conflicts, onConfirm, onCancel, isVisible, isProcessing }) {
  const [confirmationText, setConfirmationText] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  if (!isVisible) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm(confirmationText);
    setConfirmationText(''); // Reset after confirmation
  };

  const isConfirmEnabled = confirmationText === 'CONFIRM DELETE POC DATA';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '12px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ 
            color: '#dc3545', 
            margin: '0 0 15px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            ⚠️ POC Data Conflict Warning
          </h3>
          
          <div style={{
            backgroundColor: '#fff3cd',
            border: '1px solid #ffeaa7',
            borderRadius: '6px',
            padding: '15px',
            marginBottom: '20px'
          }}>
            <strong style={{ color: '#856404' }}>Data Conflict Detected!</strong>
            <p style={{ margin: '10px 0 0 0', color: '#856404', lineHeight: '1.5' }}>
              The completion dates you're uploading conflict with existing POC data. 
              Uploading completion dates will <strong>permanently delete</strong> the conflicting POC records.
            </p>
          </div>

          <p style={{ margin: '0 0 15px 0', lineHeight: '1.6' }}>
            <strong>{conflicts.length}</strong> project/phase combinations have conflicts:
          </p>

          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              padding: '8px 15px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '15px',
              fontSize: '14px'
            }}
          >
            {showDetails ? '▼ Hide Details' : '▶ Show Conflicting Records'}
          </button>

          {showDetails && (
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              backgroundColor: '#f8f9fa'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e9ecef' }}>
                    <th style={{ 
                      padding: '8px 12px', 
                      textAlign: 'left',
                      borderBottom: '1px solid #dee2e6',
                      fontSize: '14px'
                    }}>
                      Project
                    </th>
                    <th style={{ 
                      padding: '8px 12px', 
                      textAlign: 'left',
                      borderBottom: '1px solid #dee2e6',
                      fontSize: '14px'
                    }}>
                      Phase
                    </th>
                    <th style={{ 
                      padding: '8px 12px', 
                      textAlign: 'right',
                      borderBottom: '1px solid #dee2e6',
                      fontSize: '14px'
                    }}>
                      POC Records
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {conflicts.map((conflict, index) => (
                    <tr key={index}>
                      <td style={{ 
                        padding: '6px 12px', 
                        borderBottom: '1px solid #dee2e6',
                        fontSize: '13px'
                      }}>
                        {conflict.project}
                      </td>
                      <td style={{ 
                        padding: '6px 12px', 
                        borderBottom: '1px solid #dee2e6',
                        fontSize: '13px'
                      }}>
                        {conflict.phasecode}
                      </td>
                      <td style={{ 
                        padding: '6px 12px', 
                        borderBottom: '1px solid #dee2e6',
                        textAlign: 'right',
                        fontSize: '13px'
                      }}>
                        {conflict.pocCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '6px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <strong style={{ color: '#721c24' }}>⚠️ This action cannot be undone!</strong>
          <p style={{ margin: '10px 0 0 0', color: '#721c24', lineHeight: '1.5' }}>
            If you proceed, the POC data for these project/phase combinations will be 
            marked as deleted and cannot be recovered through the application.
          </p>
        </div>

        <div style={{ marginBottom: '25px' }}>
          <label style={{ 
            display: 'block', 
            fontWeight: 'bold', 
            marginBottom: '10px',
            color: '#343a40'
          }}>
            To confirm this action, type: <code style={{ 
              backgroundColor: '#f1f3f4', 
              padding: '2px 6px',
              borderRadius: '3px',
              color: '#dc3545'
            }}>CONFIRM DELETE POC DATA</code>
          </label>
          <input
            type="text"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Type the confirmation text exactly..."
            disabled={isProcessing}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #ced4da',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: 'monospace'
            }}
          />
        </div>

        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          justifyContent: 'flex-end',
          borderTop: '1px solid #dee2e6',
          paddingTop: '20px'
        }}>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Cancel Upload
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isConfirmEnabled || isProcessing}
            style={{
              padding: '12px 24px',
              backgroundColor: isConfirmEnabled && !isProcessing ? '#dc3545' : '#cccccc',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isConfirmEnabled && !isProcessing ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {isProcessing ? 'Processing...' : 'Delete POC Data & Upload'}
          </button>
        </div>

        {isProcessing && (
          <div style={{
            marginTop: '15px',
            padding: '10px',
            backgroundColor: '#d1ecf1',
            border: '1px solid #bee5eb',
            borderRadius: '4px',
            textAlign: 'center',
            color: '#0c5460'
          }}>
            Processing upload and POC data deletion...
          </div>
        )}
      </div>
    </div>
  );
}

export default CompletionConflictDialog;