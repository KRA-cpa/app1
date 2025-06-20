// client/src/components/ManualPcompEntry.js


import React, { useState, useEffect } from 'react';
import { logToServer } from '../utils/logger';

function ManualPcompEntry({ selectedCompany, cocode, dbStatus, cutoffDate, validateCutoffDate }) {
  const [projectOptions, setProjectOptions] = useState([]);
  const [phaseOptions, setPhaseOptions] = useState([]);
  const [filteredPhases, setFilteredPhases] = useState([]);
  const [selectedProjectDescription, setSelectedProjectDescription] = useState('');
  const [selectedPhaseDescription, setSelectedPhaseDescription] = useState('');
  const [formData, setFormData] = useState({
    project: '',
    phasecode: '',
    completionDate: '',
    completionType: 'A'
  });
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debug logging for API calls
  useEffect(() => {
    console.log('ManualPcompEntry - Props received:', { selectedCompany, cocode, dbStatus });
  }, [selectedCompany, cocode, dbStatus]);

  // Fetch project/phase options from validation table (same table used by CsvUploader)
  useEffect(() => {
    if (dbStatus === 'connected' && cocode) {
      console.log('ManualPcompEntry - Fetching validation options for cocode:', cocode);
      fetchValidationOptions();
    } else {
      console.log('ManualPcompEntry - Not fetching options:', { dbStatus, cocode });
      // Clear options when no company selected
      setProjectOptions([]);
      setPhaseOptions([]);
      setFilteredPhases([]);
    }
  }, [dbStatus, cocode]);

  // Filter phases when project changes
  useEffect(() => {
    if (formData.project) {
      const validPhasesForProject = phaseOptions.filter(phase => 
        phase.project === formData.project
      );
      setFilteredPhases(validPhasesForProject);
      
      // Set project description
      const selectedProject = projectOptions.find(p => p.project === formData.project);
      setSelectedProjectDescription(selectedProject?.description || '');
      
      // Reset phase selection if current phase is not valid for new project
      if (formData.phasecode && !validPhasesForProject.some(p => p.phasecode === formData.phasecode)) {
        setFormData(prev => ({ ...prev, phasecode: '' }));
        setSelectedPhaseDescription('');
      }
    } else {
      setFilteredPhases([]);
      setSelectedProjectDescription('');
      setSelectedPhaseDescription('');
      setFormData(prev => ({ ...prev, phasecode: '' }));
    }
  }, [formData.project, phaseOptions, projectOptions]);

  // Update phase description when phase changes
  useEffect(() => {
    if (formData.phasecode && filteredPhases.length > 0) {
      const selectedPhase = filteredPhases.find(p => p.phasecode === formData.phasecode);
      setSelectedPhaseDescription(selectedPhase?.description || '');
    } else {
      setSelectedPhaseDescription('');
    }
  }, [formData.phasecode, filteredPhases]);

  const fetchValidationOptions = async () => {
    try {
      setIsLoading(true);
      setMessage('');
      
      const url = `http://localhost:3001/api/validation-options?cocode=${cocode}`;
      console.log('ManualPcompEntry - Fetching from URL:', url);
      
      const response = await fetch(url);
      
      console.log('ManualPcompEntry - Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('ManualPcompEntry - Received data:', data);
        
        setProjectOptions(data.projects || []);
        setPhaseOptions(data.phases || []);
        
        if (data.projects && data.projects.length > 0) {
          console.log('ManualPcompEntry - Successfully loaded', data.projects.length, 'projects');
        } else {
          console.warn('ManualPcompEntry - No projects found for company:', cocode);
          setMessage('No projects found for the selected company. Please check if projects are configured for this company.');
        }
      } else {
        const errorText = await response.text();
        console.error('ManualPcompEntry - API Error:', response.status, errorText);
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error('ManualPcompEntry - Error fetching validation options:', error);
      setMessage(`Error loading project/phase options: ${error.message}. Please refresh and try again.`);
      setProjectOptions([]);
      setPhaseOptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setMessage(''); // Clear any previous messages
  };

  const formatDateForUpload = (dateString) => {
    // Convert YYYY-MM-DD to MM/DD/YYYY format expected by upload route
    const date = new Date(dateString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const validateMonthEnd = (dateString) => {
    const date = new Date(dateString);
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);
    return nextDay.getDate() === 1;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.project || !formData.phasecode || !formData.completionDate) {
      setMessage('Please fill in all required fields.');
      return;
    }

    if (!validateMonthEnd(formData.completionDate)) {
      setMessage('Completion date must be a month-end date (last day of the month).');
      return;
    }

    if (dbStatus !== 'connected') {
      setMessage('Cannot submit: Database is not connected.');
      return;
    }

    if (!cocode) {
      setMessage('Cannot submit: No company selected.');
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage('Submitting completion date...');

      // Create CSV content programmatically
      const formattedDate = formatDateForUpload(formData.completionDate);
      const csvContent = `Project,Phase,Completion Date\n${formData.project},${formData.phasecode},${formattedDate}`;
      
      // Create a Blob with CSV content
      const csvBlob = new Blob([csvContent], { type: 'text/csv' });
      
      // Create FormData to mimic file upload
      const uploadFormData = new FormData();
      uploadFormData.append('csvFile', csvBlob, 'manual_entry.csv');
      uploadFormData.append('uploadOption', 'date');
      uploadFormData.append('completionType', formData.completionType);
      uploadFormData.append('cocode', cocode);
      uploadFormData.append('source', 'manual_entry'); // Track source for logging

      const response = await fetch('http://localhost:3001/api/upload-csv', {
        method: 'POST',
        body: uploadFormData,
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`✅ Completion date saved successfully! ${result.message}`);
        logToServer({ 
          level: 'info', 
          message: `Manual completion date entry successful: ${formData.project}-${formData.phasecode} (${selectedProjectDescription})`,
          component: 'ManualPcompEntry',
          data: { ...formData, projectDescription: selectedProjectDescription, phaseDescription: selectedPhaseDescription }
        });
        
        // Reset form
        setFormData({
          project: '',
          phasecode: '',
          completionDate: '',
          completionType: 'A'
        });
        setSelectedProjectDescription('');
        setSelectedPhaseDescription('');
      } else {
        setMessage(`❌ Failed to save completion date: ${result.message}`);
        logToServer({ 
          level: 'error', 
          message: `Manual completion date entry failed: ${result.message}`,
          component: 'ManualPcompEntry',
          data: formData
        });
      }
    } catch (error) {
      console.error('Submission error:', error);
      setMessage(`❌ Error submitting completion date: ${error.message}`);
      logToServer({ 
        level: 'error', 
        message: `Manual completion date entry error: ${error.message}`,
        component: 'ManualPcompEntry'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const controlsDisabled = isLoading || isSubmitting || dbStatus !== 'connected';
  const submitDisabled = controlsDisabled || !cocode || !formData.project || !formData.phasecode || !formData.completionDate;

  return (
    <div className="csv-uploader-container">
      <h2>Manual Completion Date Entry</h2>

      {!cocode && (
        <div className="warning-box">
          <strong>🛑 Manual Entry Requires Specific Company:</strong>
          <p>
            Please select a specific company to enter completion dates. You cannot enter data for "All Companies".
          </p>
        </div>
      )}

      {/* Debug Info for Development */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{ 
          fontSize: '12px', 
          color: '#6c757d', 
          backgroundColor: '#f8f9fa', 
          padding: '10px', 
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <strong>Debug Info:</strong> Company: {cocode || 'None'} | DB: {dbStatus} | Projects: {projectOptions.length} | Phases: {phaseOptions.length}
        </div>
      )}

      {isLoading && (
        <div style={{ 
          padding: '20px', 
          textAlign: 'center', 
          color: '#6c757d',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          🔄 Loading project and phase options from validation table...
        </div>
      )}

      {!isLoading && cocode && (
        <form onSubmit={handleSubmit}>
          {/* Project/Phase Selection Section */}
          <div className="upload-options-group">
            <strong className="option-title">Project & Phase Selection</strong>
            
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '15px' }}>
              {/* Project Selection */}
              <div style={{ flex: '1', minWidth: '250px' }}>
                <label htmlFor="project" style={{ 
                  display: 'block', 
                  fontWeight: 'bold', 
                  marginBottom: '8px',
                  color: '#495057'
                }}>
                  Project: <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <select
                  id="project"
                  name="project"
                  value={formData.project}
                  onChange={handleInputChange}
                  disabled={controlsDisabled}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: controlsDisabled ? '#e9ecef' : 'white',
                    cursor: controlsDisabled ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="">-- Select Project --</option>
                  {projectOptions.map((proj, index) => (
                    <option key={index} value={proj.project}>
                      {proj.project}
                    </option>
                  ))}
                </select>
                {selectedProjectDescription && (
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#6c757d', 
                    fontStyle: 'italic', 
                    marginTop: '5px',
                    padding: '8px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    border: '1px solid #e9ecef'
                  }}>
                    📋 {selectedProjectDescription}
                  </div>
                )}
              </div>

              {/* Phase Selection */}
              <div style={{ flex: '1', minWidth: '250px' }}>
                <label htmlFor="phasecode" style={{ 
                  display: 'block', 
                  fontWeight: 'bold', 
                  marginBottom: '8px',
                  color: '#495057'
                }}>
                  Phase: <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <select
                  id="phasecode"
                  name="phasecode"
                  value={formData.phasecode}
                  onChange={handleInputChange}
                  disabled={controlsDisabled || !formData.project}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: (controlsDisabled || !formData.project) ? '#e9ecef' : 'white',
                    cursor: (controlsDisabled || !formData.project) ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="">-- Select Phase --</option>
                  {filteredPhases.map((phase, index) => (
                    <option key={index} value={phase.phasecode}>
                      {phase.phasecode || '(Empty Phase)'}
                    </option>
                  ))}
                </select>
                {formData.project && filteredPhases.length === 0 && (
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#856404', 
                    fontStyle: 'italic', 
                    marginTop: '5px',
                    padding: '8px',
                    backgroundColor: '#fff3cd',
                    borderRadius: '4px',
                    border: '1px solid #ffeaa7'
                  }}>
                    ⚠️ No phases available for selected project
                  </div>
                )}
                {selectedPhaseDescription && (
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#6c757d', 
                    fontStyle: 'italic', 
                    marginTop: '5px',
                    padding: '8px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    border: '1px solid #e9ecef'
                  }}>
                    📋 {selectedPhaseDescription}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Completion Details Section */}
          <div className="upload-options-group">
            <strong className="option-title">Completion Details</strong>
            
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '15px' }}>
              {/* Completion Date */}
              <div style={{ flex: '1', minWidth: '250px' }}>
                <label htmlFor="completionDate" style={{ 
                  display: 'block', 
                  fontWeight: 'bold', 
                  marginBottom: '8px',
                  color: '#495057'
                }}>
                  Completion Date: <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <input
                  type="date"
                  id="completionDate"
                  name="completionDate"
                  value={formData.completionDate}
                  onChange={handleInputChange}
                  disabled={controlsDisabled}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: controlsDisabled ? '#e9ecef' : 'white',
                    cursor: controlsDisabled ? 'not-allowed' : 'text'
                  }}
                />
                <div style={{ 
                  fontSize: '12px', 
                  color: '#6c757d', 
                  fontStyle: 'italic', 
                  marginTop: '5px'
                }}>
                  📅 Must be a month-end date (last day of the month)
                </div>
              </div>

              {/* Completion Type */}
              <div style={{ flex: '1', minWidth: '250px' }}>
                <label htmlFor="completionType" style={{ 
                  display: 'block', 
                  fontWeight: 'bold', 
                  marginBottom: '8px',
                  color: '#495057'
                }}>
                  Completion Type:
                </label>
                <select
                  id="completionType"
                  name="completionType"
                  value={formData.completionType}
                  onChange={handleInputChange}
                  disabled={controlsDisabled}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: controlsDisabled ? '#e9ecef' : 'white',
                    cursor: controlsDisabled ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="A">Actual Completion</option>
                  <option value="P">Projected Completion</option>
                </select>
                <div style={{ 
                  fontSize: '12px', 
                  color: '#6c757d', 
                  fontStyle: 'italic', 
                  marginTop: '5px'
                }}>
                  🎯 {formData.completionType === 'A' ? 'Actual completion date' : 'Projected completion date'}
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div style={{ textAlign: 'center', marginTop: '30px' }}>
            <button
              type="submit"
              disabled={submitDisabled}
              className="upload-button"
              style={{
                padding: '12px 30px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: submitDisabled ? '#cccccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: submitDisabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                transform: submitDisabled ? 'none' : 'translateY(0)',
              }}
              onMouseOver={(e) => {
                if (!submitDisabled) {
                  e.target.style.backgroundColor = '#218838';
                  e.target.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseOut={(e) => {
                if (!submitDisabled) {
                  e.target.style.backgroundColor = '#28a745';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
            >
              {isSubmitting ? '⏳ Saving...' : '💾 Save Completion Date'}
            </button>
          </div>
        </form>
      )}

      {/* Message Display */}
      {message && (
        <div className={`feedback-message ${message.startsWith('❌') || message.includes('Failed') || message.includes('Error') ? 'error-message' : 'success-message'}`}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{message}</pre>
        </div>
      )}

      {/* Information Section */}
      <div style={{ 
        marginTop: '40px',
        padding: '20px',
        backgroundColor: '#e8f4fd',
        border: '1px solid #007bff',
        borderRadius: '8px'
      }}>
        <h4 style={{ color: '#0056b3', marginTop: 0 }}>ℹ️ Information</h4>
        <ul style={{ marginBottom: 0, color: '#495057' }}>
          <li>Completion dates must be month-end dates (last day of the month)</li>
          <li>The system automatically sets the creation timestamp</li>
          <li>This uses the same validation and upload process as CSV upload</li>
          <li>Project/phase combinations are validated against the validation table</li>
          <li>If a completion date already exists for this project/phase combination, it will be updated</li>
          <li>All entries are logged with source tracking for audit purposes</li>
        </ul>
      </div>
    </div>
  );
}

export default ManualPcompEntry;