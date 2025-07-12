// =====================================================
// Completion Date Conflict Dialog Component
// File: client/src/components/CompletionConflictDialog.js
// =====================================================

import React, { useState } from 'react';

const CompletionConflictDialog = ({ 
    conflicts, 
    onConfirm, 
    onCancel, 
    isVisible, 
    isProcessing = false 
}) => {
    const [userConfirmation, setUserConfirmation] = useState('');
    
    if (!isVisible || !conflicts || conflicts.length === 0) {
        return null;
    }

    const handleConfirm = () => {
        onConfirm(userConfirmation);
        setUserConfirmation('');
    };

    const handleCancel = () => {
        onCancel();
        setUserConfirmation('');
    };

    const totalConflictingRecords = conflicts.reduce(
        (total, conflict) => total + conflict.conflictingRecords.length, 
        0
    );

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
                maxWidth: '800px',
                width: '100%',
                maxHeight: '90vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid #e5e5e5',
                    backgroundColor: '#fef2f2'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '24px' }}>⚠️</span>
                        <div>
                            <h3 style={{ 
                                margin: 0, 
                                color: '#dc2626', 
                                fontSize: '20px',
                                fontWeight: '600'
                            }}>
                                POC Data Conflict Detected
                            </h3>
                            <p style={{ 
                                margin: '4px 0 0 0', 
                                color: '#7c2d12',
                                fontSize: '14px'
                            }}>
                                The completion dates you're uploading will affect existing POC data
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div style={{
                    padding: '24px',
                    overflowY: 'auto',
                    flex: 1
                }}>
                    <div style={{
                        backgroundColor: '#fff3cd',
                        border: '1px solid #ffeaa7',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '24px'
                    }}>
                        <h4 style={{ 
                            margin: '0 0 8px 0', 
                            color: '#856404',
                            fontSize: '16px'
                        }}>
                            📊 Impact Summary
                        </h4>
                        <p style={{ margin: 0, color: '#856404' }}>
                            <strong>{conflicts.length}</strong> project/phase combinations will have POC data marked as deleted.<br/>
                            <strong>{totalConflictingRecords}</strong> total POC records will be affected.
                        </p>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <h4 style={{ 
                            margin: '0 0 16px 0', 
                            color: '#374151',
                            fontSize: '16px',
                            fontWeight: '600'
                        }}>
                            🗑️ POC Records That Will Be Marked as Deleted:
                        </h4>

                        {conflicts.map((conflict, index) => (
                            <div key={index} style={{
                                border: '1px solid #e5e5e5',
                                borderRadius: '8px',
                                marginBottom: '16px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    backgroundColor: '#f9fafb',
                                    padding: '12px 16px',
                                    borderBottom: '1px solid #e5e5e5'
                                }}>
                                    <h5 style={{ 
                                        margin: 0,
                                        color: '#1f2937',
                                        fontSize: '14px',
                                        fontWeight: '600'
                                    }}>
                                        {conflict.description}
                                    </h5>
                                    <p style={{ 
                                        margin: '4px 0 0 0',
                                        fontSize: '12px',
                                        color: '#6b7280'
                                    }}>
                                        New {conflict.completionType === 'A' ? 'Actual' : 'Projected'} completion: {new Date(conflict.completionDate).toLocaleDateString()}
                                    </p>
                                </div>
                                <div style={{ padding: '12px 16px' }}>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                                        gap: '8px'
                                    }}>
                                        {conflict.conflictingRecords.map((record, recordIndex) => (
                                            <div key={recordIndex} style={{
                                                backgroundColor: '#fee2e2',
                                                padding: '8px',
                                                borderRadius: '4px',
                                                textAlign: 'center',
                                                fontSize: '12px'
                                            }}>
                                                <div style={{ fontWeight: '600', color: '#dc2626' }}>
                                                    {record.year}/{record.month}
                                                </div>
                                                <div style={{ color: '#7f1d1d' }}>
                                                    {record.value}% ({record.type === 'A' ? 'Actual' : 'Projected'})
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{
                        backgroundColor: '#f0f9ff',
                        border: '1px solid #bae6fd',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '20px'
                    }}>
                        <h4 style={{ 
                            margin: '0 0 8px 0', 
                            color: '#0369a1',
                            fontSize: '14px'
                        }}>
                            ℹ️ What This Means:
                        </h4>
                        <ul style={{ 
                            margin: 0, 
                            paddingLeft: '20px',
                            color: '#0369a1',
                            fontSize: '13px'
                        }}>
                            <li>POC records beyond the completion dates will be marked as "deleted" but preserved for audit trail</li>
                            <li>The affected POC data will no longer appear in reports and charts</li>
                            <li>You can review deletion history in the system logs</li>
                            <li>This action cannot be easily undone - consider if the completion dates are correct</li>
                        </ul>
                    </div>

                    {/* User Confirmation Input */}
                    <div style={{
                        border: '2px solid #fca5a5',
                        borderRadius: '8px',
                        padding: '16px',
                        backgroundColor: '#fef2f2'
                    }}>
                        <label style={{
                            display: 'block',
                            fontWeight: '600',
                            color: '#dc2626',
                            marginBottom: '8px',
                            fontSize: '14px'
                        }}>
                            To proceed, please type "CONFIRM DELETE POC DATA" below:
                        </label>
                        <input
                            type="text"
                            value={userConfirmation}
                            onChange={(e) => setUserConfirmation(e.target.value)}
                            placeholder="Type exactly: CONFIRM DELETE POC DATA"
                            disabled={isProcessing}
                            style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '14px',
                                fontFamily: 'monospace'
                            }}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '20px 24px',
                    borderTop: '1px solid #e5e5e5',
                    backgroundColor: '#f9fafb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px'
                }}>
                    <button
                        onClick={handleCancel}
                        disabled={isProcessing}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#6b7280',
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
                        disabled={isProcessing || userConfirmation !== 'CONFIRM DELETE POC DATA'}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: userConfirmation === 'CONFIRM DELETE POC DATA' && !isProcessing ? '#dc2626' : '#d1d5db',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: (userConfirmation === 'CONFIRM DELETE POC DATA' && !isProcessing) ? 'pointer' : 'not-allowed',
                            fontSize: '14px',
                            fontWeight: '500',
                            minWidth: '200px'
                        }}
                    >
                        {isProcessing ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>⏳</span> Processing...
                            </span>
                        ) : (
                            'Proceed with Upload & Delete POC'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CompletionConflictDialog;