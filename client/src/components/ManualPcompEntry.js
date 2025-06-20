// client/src/components/ManualPcompEntry.js

import React, { useState, useEffect } from 'react';
import { logToServer } from '../utils/logger';

function ManualPCompEntry({ selectedCompany, cocode, dbStatus, cutoffDate, validateCutoffDate }) {
  const [projectOptions, setProjectOptions] = useState([]);
  const [phaseOptions, setPhaseOptions] = useState([]);
  const [filteredPhases, setFilteredPhases] = useState([]);
  const [formData, setFormData] = useState({
    project: '',
    phasecode: '',
    completionDate: '',
    completionType: 'A'
  });
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch project/phase options from validation table (same table used by CsvUploader)
  useEffect(() => {
    if (dbStatus === 'connected' && cocode) {
      fetchValidationOptions();
    }
  }, [dbStatus, cocode]);

  // Filter phases when project changes
  useEffect(() => {
    if (formData.project) {
      const validPhasesForProject = phaseOptions.filter(phase => 
        phase.project === formData.project
      );
      setFilteredPhases(validPhasesForProject);
      
      // Reset phase selection if current phase is not valid for new project
      if (formData.phasecode && !validPhasesForProject.some(p => p.phasecode === formData.phasecode)) {
        setFormData(prev => ({ ...prev, phasecode: '' }));
      }
    } else {
      setFilteredPhases([]);
      setFormData(prev => ({ ...prev, phasecode: '' }));
    }
  }, [formData.project, phaseOptions]);

  const fetchValidationOptions = async () => {
    try {
      setIsLoading(true);
      // Fetch from the same project_phase_validation table that CsvUploader uses
      const response = await fetch(`http://localhost:3001/api/validation-options?cocode=${cocode}`);
      
      if (response.ok) {
        const data = await response.json();
        setProjectOptions(data.projects || []);
        setPhaseOptions(data.phases || []);
      } else {
        throw new Error(`Failed to fetch validation options: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching validation options:', error);
      setMessage('Error loading project/phase options from validation table. Please refresh and try again.');
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
          message: `Manual completion date entry successful: ${formData.project}-${formData.phasecode} (same validation as CsvUploader)`,
          component: 'ManualPcompEntry',
          data: formData
        });
        
        // Reset form
        setFormData({
          project: '',
          phasecode: '',
          completionDate: '',
          completionType: 'A'
        });
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
    <div className="manual-completion-entry-container">
      <h2>Manual Completion Date Entry</h2>

      {!cocode && (
        <div className="warning-box">
          <strong>🛑 Manual Entry Requires Specific Company:</strong>
          <p>
            Please select a specific company to enter completion dates. You cannot enter data for "All Companies".
          </p>
        </div>
      )}

      {isLoading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>
          🔄 Loading project and phase options...
        </div>
      )}

      {!isLoading && cocode && (
        <form onSubmit={handleSubmit} className="manual-entry-form">
          <div className="form-section">
            <h3>Project Information</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="project"><strong>Project:</strong></label>
                <select
                  id="project"
                  name="project"
                  value={formData.project}
                  onChange={handleInputChange}
                  disabled={controlsDisabled}
                  required
                  className="form-select"
                >
                  <option value="">-- Select Project --</option>
                  {projectOptions.map((proj, index) => (
                    <option key={index} value={proj.project}>
                      {proj.project}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="phasecode"><strong>Phase:</strong></label>
                <select
                  id="phasecode"
                  name="phasecode"
                  value={formData.phasecode}
                  onChange={handleInputChange}
                  disabled={controlsDisabled || !formData.project}
                  required
                  className="form-select"
                >
                  <option value="">-- Select Phase --</option>
                  {filteredPhases.map((phase, index) => (
                    <option key={index} value={phase.phasecode}>
                      {phase.phasecode || '(Empty Phase)'}
                    </option>
                  ))}
                </select>
                {formData.project && filteredPhases.length === 0 && (
                  <small style={{ color: '#6c757d', fontStyle: 'italic' }}>
                    No phases available for selected project
                  </small>
                )}
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Completion Details</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="completionDate"><strong>Completion Date:</strong></label>
                <input
                  type="date"
                  id="completionDate"
                  name="completionDate"
                  value={formData.completionDate}
                  onChange={handleInputChange}
                  disabled={controlsDisabled}
                  required
                  className="form-input"
                />
                <small style={{ color: '#6c757d', fontStyle: 'italic' }}>
                  Must be a month-end date (last day of the month)
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="completionType"><strong>Completion Type:</strong></label>
                <select
                  id="completionType"
                  name="completionType"
                  value={formData.completionType}
                  onChange={handleInputChange}
                  disabled={controlsDisabled}
                  className="form-select"
                >
                  <option value="A">Actual Completion</option>
                  <option value="P">Projected Completion</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              disabled={submitDisabled}
              className="submit-button"
            >
              {isSubmitting ? 'Saving...' : 'Save Completion Date'}
            </button>
          </div>
        </form>
      )}

      {message && (
        <div className={`feedback-message ${message.startsWith('❌') || message.includes('Failed') || message.includes('Error') ? 'error-message' : 'success-message'}`}>
          {message}
        </div>
      )}

      <div className="info-section">
        <h4>ℹ️ Information</h4>
        <ul>
          <li>Completion dates must be month-end dates (last day of the month)</li>
          <li>The system will automatically set the creation timestamp</li>
          <li>This uses the same validation and upload process as CSV upload</li>
          <li>Project/phase combinations are validated against the same table as CSV uploads</li>
          <li>If a completion date already exists for this project/phase combination, it will be updated</li>
        </ul>
      </div>
    </div>
  );
}

export default ManualPcompEntry;