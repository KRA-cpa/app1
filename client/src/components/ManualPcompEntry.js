// client/src/components/ManualPcompEntry.js
// ✅ ENHANCED: Multiple manual entry support for both Completion Dates and POC data

import React, { useState, useEffect } from 'react';
import { logToServer } from '../utils/logger';
import CompletionConflictDialog from './CompletionConflictDialog'; // ✅ NEW: Import conflict dialog

// ✅ CONFIGURABLE: Year range for POC entry (easily editable)
const POC_YEAR_RANGE = {
  MIN: 2011,
  MAX: 2040
};

function ManualPcompEntry({ selectedCompany, cocode, dbStatus, cutoffDate, validateCutoffDate }) {
  const [projectOptions, setProjectOptions] = useState([]);
  const [phaseOptions, setPhaseOptions] = useState([]);
  const [activeEntryType, setActiveEntryType] = useState('completion'); // 'completion' or 'poc'
  
  // State for completion date entries
  const [completionEntries, setCompletionEntries] = useState([{
    id: Date.now(),
    project: '',
    phasecode: '',
    completionDate: '',
    completionType: 'A',
    projectDescription: '',
    phaseDescription: '',
    dateValidationError: ''
  }]);

  // State for POC entries
  const [pocEntries, setPocEntries] = useState([{
    id: Date.now(),
    project: '',
    phasecode: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    pocValue: '',
    projectDescription: '',
    phaseDescription: '',
    pocType: 'A',
    isExistingRecord: false,
    completionValidationError: ''
  }]);

  // State for completion dates cache
  const [completionDatesCache, setCompletionDatesCache] = useState({});

  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ NEW: Add conflict handling state
  const [conflictDialog, setConflictDialog] = useState({
    isVisible: false,
    conflicts: [],
    pendingEntries: [],
    isProcessing: false
  });

  // Debug logging for API calls
  useEffect(() => {
    console.log('ManualPcompEntry - Props received:', { selectedCompany, cocode, dbStatus });
  }, [selectedCompany, cocode, dbStatus]);

  // Fetch project/phase options from validation table
  useEffect(() => {
    if (dbStatus === 'connected' && cocode) {
      console.log('ManualPcompEntry - Fetching validation options for cocode:', cocode);
      fetchValidationOptions();
    } else {
      console.log('ManualPcompEntry - Not fetching options:', { dbStatus, cocode });
      setProjectOptions([]);
      setPhaseOptions([]);
    }
  }, [dbStatus, cocode]);

  const fetchValidationOptions = async () => {
    try {
      setIsLoading(true);
      setMessage('');
      
      const url = `http://localhost:3001/api/validation-options?cocode=${cocode}`;
      console.log('ManualPcompEntry - Fetching from URL:', url);
      
      const response = await fetch(url);
      
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

  // Helper function to get filtered phases for a project
  const getFilteredPhases = (project) => {
    return phaseOptions.filter(phase => phase.project === project);
  };

  // Helper function to get project description
  const getProjectDescription = (project) => {
    const projectOption = projectOptions.find(p => p.project === project);
    return projectOption?.description || '';
  };

  // Helper function to get phase description
  const getPhaseDescription = (project, phasecode) => {
    const phaseOption = phaseOptions.find(p => p.project === project && p.phasecode === phasecode);
    return phaseOption?.description || '';
  };

  // Helper function to determine POC type based on cutoff date
  const getPocType = (year, month) => {
    if (!cutoffDate) return 'A';

    const cutoffDateObj = new Date(cutoffDate);
    const cutoffYear = cutoffDateObj.getFullYear();
    const cutoffMonth = cutoffDateObj.getMonth() + 1;

    if (year < cutoffYear) {
      return 'A';
    } else if (year === cutoffYear && month <= cutoffMonth) {
      return 'A';
    } else {
      return 'P';
    }
  };

  // ✅ NEW: Fetch completion dates for a specific project/phase
  const fetchCompletionDates = async (project, phasecode) => {
    if (!project || !cocode) return null;

    const cacheKey = `${project}-${phasecode || ''}`;
    
    // Return cached data if available
    if (completionDatesCache[cacheKey]) {
      return completionDatesCache[cacheKey];
    }

    try {
      const params = new URLSearchParams({
        cocode: cocode,
        project: project
      });
      
      if (phasecode !== undefined) {
        params.append('phasecode', phasecode);
      }

      const response = await fetch(`http://localhost:3001/api/completion-dates?${params.toString()}`);
      
      if (response.ok) {
        const data = await response.json();
        const completionData = data.completionDates[cacheKey];
        
        // Cache the result
        setCompletionDatesCache(prev => ({
          ...prev,
          [cacheKey]: completionData
        }));
        
        return completionData;
      }
    } catch (error) {
      console.error('Error fetching completion dates:', error);
    }
    
    return null;
  };

  // ✅ NEW: Validate POC entry against completion dates
  const validatePocAgainstCompletion = async (project, phasecode, year, month, pocValue) => {
    const completionData = await fetchCompletionDates(project, phasecode);
    
    // ✅ NEW: Check if any completion date exists (Option 2 implementation)
    if (!completionData || (!completionData.A && !completionData.P)) {
      return 'POC entry requires a completion date to be set first. Please enter a projected completion date for this project/phase before adding POC data.';
    }

    // Only validate 100% POC constraint if POC value is 100%
    if (parseFloat(pocValue) !== 100) {
      return '';
    }

    // Determine which completion date to use (prefer Actual over Projected)
    let effectiveCompletionDate = null;
    if (completionData.A && completionData.A.date) {
      effectiveCompletionDate = new Date(completionData.A.date);
    } else if (completionData.P && completionData.P.date) {
      effectiveCompletionDate = new Date(completionData.P.date);
    }

    if (!effectiveCompletionDate) {
      return 'POC entry requires a completion date to be set first. Please enter a projected completion date for this project/phase before adding POC data.';
    }

    // Create date for the POC entry (last day of the month)
    const pocDate = new Date(year, month, 0); // Last day of the month
    
    if (pocDate > effectiveCompletionDate) {
      const completionType = completionData.A ? 'Actual' : 'Projected';
      const formattedCompletionDate = effectiveCompletionDate.toLocaleDateString();
      return `100% POC not allowed after ${completionType.toLowerCase()} completion date (${formattedCompletionDate})`;
    }

    return '';
  };

  // Validate completion date based on type
  const validateCompletionDate = (dateString, completionType) => {
    if (!dateString) return '';

    const completionDate = new Date(dateString);
    const today = new Date();
    
    today.setHours(0, 0, 0, 0);
    completionDate.setHours(0, 0, 0, 0);

    if (completionType === 'A') {
      if (completionDate > today) {
        return 'Actual completion dates cannot be in the future. Please select today or an earlier date.';
      }
    } else if (completionType === 'P') {
      if (completionDate <= today) {
        return 'Projected completion dates must be in the future. Please select a date after today.';
      }
    }

    return '';
  };

  const validateMonthEnd = (dateString) => {
    const date = new Date(dateString);
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);
    return nextDay.getDate() === 1;
  };

  // ✅ COMPLETION DATE ENTRY HANDLERS
  const addCompletionEntry = () => {
    setCompletionEntries(prev => [...prev, {
      id: Date.now(),
      project: '',
      phasecode: '',
      completionDate: '',
      completionType: 'A',
      projectDescription: '',
      phaseDescription: '',
      dateValidationError: ''
    }]);
  };

  const removeCompletionEntry = (id) => {
    if (completionEntries.length > 1) {
      setCompletionEntries(prev => prev.filter(entry => entry.id !== id));
    }
  };

  const updateCompletionEntry = (id, field, value) => {
    setCompletionEntries(prev => prev.map(entry => {
      if (entry.id === id) {
        const updated = { ...entry, [field]: value };
        
        // Update descriptions when project/phase changes
        if (field === 'project') {
          updated.projectDescription = getProjectDescription(value);
          updated.phasecode = ''; // Reset phase when project changes
          updated.phaseDescription = '';
        } else if (field === 'phasecode') {
          updated.phaseDescription = getPhaseDescription(entry.project, value);
        } else if (field === 'completionDate' || field === 'completionType') {
          updated.dateValidationError = validateCompletionDate(
            field === 'completionDate' ? value : entry.completionDate,
            field === 'completionType' ? value : entry.completionType
          );
        }
        
        return updated;
      }
      return entry;
    }));
  };

  // ✅ POC ENTRY HANDLERS
  const addPocEntry = () => {
    setPocEntries(prev => [...prev, {
      id: Date.now(),
      project: '',
      phasecode: '',
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      pocValue: '',
      projectDescription: '',
      phaseDescription: '',
      pocType: 'A',
      isExistingRecord: false,
      completionValidationError: ''
    }]);
  };

  const removePocEntry = (id) => {
    if (pocEntries.length > 1) {
      setPocEntries(prev => prev.filter(entry => entry.id !== id));
    }
  };

  const updatePocEntry = (id, field, value) => {
    setPocEntries(prev => prev.map(entry => {
      if (entry.id === id) {
        const updated = { ...entry, [field]: value };
        
        // Update descriptions when project/phase changes
        if (field === 'project') {
          updated.projectDescription = getProjectDescription(value);
          updated.phasecode = ''; // Reset phase when project changes
          updated.phaseDescription = '';
          updated.completionValidationError = '';
        } else if (field === 'phasecode') {
          updated.phaseDescription = getPhaseDescription(entry.project, value);
          // Clear cache for old project/phase combination
          const oldCacheKey = `${entry.project}-${entry.phasecode || ''}`;
          setCompletionDatesCache(prev => {
            const newCache = { ...prev };
            delete newCache[oldCacheKey];
            return newCache;
          });
          updated.completionValidationError = '';
        }
        
        // Update POC type when year/month changes
        if (field === 'year' || field === 'month') {
          const year = field === 'year' ? parseInt(value) : entry.year;
          const month = field === 'month' ? parseInt(value) : entry.month;
          updated.pocType = getPocType(year, month);
        }
        
        return updated;
      }
      return entry;
    }));

    // ✅ NEW: Perform async validation after state update
    if (['project', 'phasecode', 'year', 'month', 'pocValue'].includes(field)) {
      // Use setTimeout to ensure state update completes first
      setTimeout(async () => {
        const entry = pocEntries.find(e => e.id === id);
        if (!entry) return;

        const project = field === 'project' ? value : entry.project;
        const phasecode = field === 'phasecode' ? value : entry.phasecode;
        const year = field === 'year' ? parseInt(value) : entry.year;
        const month = field === 'month' ? parseInt(value) : entry.month;
        const pocValue = field === 'pocValue' ? value : entry.pocValue;
        
        if (project && phasecode !== undefined && pocValue) {
          const validationError = await validatePocAgainstCompletion(project, phasecode, year, month, pocValue);
          setPocEntries(currentEntries => currentEntries.map(currentEntry => 
            currentEntry.id === id 
              ? { ...currentEntry, completionValidationError: validationError }
              : currentEntry
          ));
        }
      }, 100);
    }
  };

  // Check if all entries are valid
  const validateAllEntries = () => {
    if (activeEntryType === 'completion') {
      for (const entry of completionEntries) {
        if (!entry.project || !entry.phasecode || !entry.completionDate) {
          return 'Please fill in all required fields for all completion date entries.';
        }
        if (!validateMonthEnd(entry.completionDate)) {
          return 'All completion dates must be month-end dates (last day of the month).';
        }
        if (entry.dateValidationError) {
          return `Invalid date: ${entry.dateValidationError}`;
        }
      }
    } else if (activeEntryType === 'poc') {
      for (const entry of pocEntries) {
        if (!entry.project || !entry.phasecode) {
          return 'Please fill in all required fields for all POC entries.';
        }
        // ✅ NEW: Check completion validation errors (blocking any POC entry without completion date)
        if (entry.completionValidationError) {
          return `POC validation error: ${entry.completionValidationError}`;
        }
        // Only check POC value if completion validation passed
        if (!entry.pocValue) {
          return 'Please fill in all required fields for all POC entries.';
        }
        if (isNaN(parseFloat(entry.pocValue))) {
          return 'All POC values must be valid numbers.';
        }
      }
    }
    return null;
  };

  const formatDateForUpload = (dateString) => {
    const date = new Date(dateString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  // ✅ NEW: Check for completion date conflicts
  const checkCompletionConflicts = async (entries) => {
    try {
      const response = await fetch('http://localhost:3001/api/check-completion-conflicts', {
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

  // ✅ NEW: Handle upload with conflict resolution
  const uploadWithConflictResolution = async (entries, conflicts, confirmedBy) => {
    try {
      const response = await fetch('http://localhost:3001/api/upload-completion-with-conflicts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          completionEntries: entries,
          conflicts: conflicts,
          cocode: cocode,
          completionType: entries[0]?.completionType || 'A',
          confirmedBy: confirmedBy
        })
      });

      const result = await response.json();

      if (response.ok) {
        return result;
      } else {
        throw new Error(result.message || 'Failed to upload with conflict resolution');
      }
    } catch (error) {
      console.error('Error uploading with conflict resolution:', error);
      throw error;
    }
  };

  // ✅ UPDATED: Enhanced handleSubmit with conflict checking
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validationError = validateAllEntries();
    if (validationError) {
      setMessage(validationError);
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
      setMessage('Checking for conflicts...');

      // ✅ NEW: For completion date entries, check for conflicts first
      if (activeEntryType === 'completion') {
        const conflictCheck = await checkCompletionConflicts(completionEntries);
        
        if (conflictCheck.hasConflicts) {
          // Show conflict dialog
          setConflictDialog({
            isVisible: true,
            conflicts: conflictCheck.conflicts,
            pendingEntries: completionEntries,
            isProcessing: false
          });
          setMessage(''); // Clear the checking message
          setIsSubmitting(false);
          return; // Stop here, wait for user confirmation
        }
      }

      // If no conflicts or POC entry, proceed with normal upload
      await proceedWithNormalUpload();

    } catch (error) {
      console.error('Error during submission:', error);
      setMessage(`❌ Error during submission: ${error.message}`);
      setIsSubmitting(false);
    }
  };

  // ✅ NEW: Normal upload process (extracted from original handleSubmit)
  const proceedWithNormalUpload = async () => {
    try {
      setMessage('Submitting entries...');

      let csvContent = '';
      let uploadOption = '';
      let templateType = '';
      let completionType = '';

      if (activeEntryType === 'completion') {
        csvContent = 'Project,Phase,Completion Date\n';
        completionEntries.forEach(entry => {
          const formattedDate = formatDateForUpload(entry.completionDate);
          csvContent += `${entry.project},${entry.phasecode},${formattedDate}\n`;
        });
        uploadOption = 'date';
        completionType = completionEntries[0].completionType;
      } else if (activeEntryType === 'poc') {
        csvContent = 'Project,Phase,Year,Month,POC\n';
        pocEntries.forEach(entry => {
          csvContent += `${entry.project},${entry.phasecode},${entry.year},${entry.month},${entry.pocValue}\n`;
        });
        uploadOption = 'poc';
        templateType = 'short';
      }

      const csvBlob = new Blob([csvContent], { type: 'text/csv' });
      const uploadFormData = new FormData();
      uploadFormData.append('csvFile', csvBlob, 'manual_entry.csv');
      uploadFormData.append('uploadOption', uploadOption);
      uploadFormData.append('cocode', cocode);
      uploadFormData.append('source', 'manual_entry');
      
      if (uploadOption === 'date') {
        uploadFormData.append('completionType', completionType);
      } else if (uploadOption === 'poc') {
        uploadFormData.append('templateType', templateType);
        uploadFormData.append('cutoffDate', cutoffDate);
      }

      const response = await fetch('http://localhost:3001/api/upload-csv', {
        method: 'POST',
        body: uploadFormData,
      });

      const result = await response.json();

      if (response.ok) {
        const entryCount = activeEntryType === 'completion' ? completionEntries.length : pocEntries.length;
        const entryType = activeEntryType === 'completion' ? 'completion date' : 'POC';
        setMessage(`✅ Successfully saved ${entryCount} ${entryType} ${entryCount === 1 ? 'entry' : 'entries'}! ${result.message}`);
        
        logToServer({ 
          level: 'info', 
          message: `Manual ${entryType} entries successful: ${entryCount} entries for company ${cocode}`,
          component: 'ManualPcompEntry',
          data: { entryType: activeEntryType, entryCount, cocode }
        });
        
        // Reset entries
        resetEntries();
      } else {
        setMessage(`❌ Failed to save entries: ${result.message}`);
        logToServer({ 
          level: 'error', 
          message: `Manual entry submission failed: ${result.message}`,
          component: 'ManualPcompEntry'
        });
      }
    } catch (error) {
      console.error('Normal upload error:', error);
      setMessage(`❌ Error submitting entries: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ NEW: Reset entries helper
  const resetEntries = () => {
    if (activeEntryType === 'completion') {
      setCompletionEntries([{
        id: Date.now(),
        project: '',
        phasecode: '',
        completionDate: '',
        completionType: 'A',
        projectDescription: '',
        phaseDescription: '',
        dateValidationError: ''
      }]);
    } else {
      setPocEntries([{
        id: Date.now(),
        project: '',
        phasecode: '',
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        pocValue: '',
        projectDescription: '',
        phaseDescription: '',
        pocType: 'A',
        isExistingRecord: false,
        completionValidationError: ''
      }]);
    }
  };

  // ✅ NEW: Handle conflict dialog confirmation
  const handleConflictConfirmation = async (userConfirmation) => {
    if (userConfirmation !== 'CONFIRM DELETE POC DATA') {
      return;
    }

    try {
      setConflictDialog(prev => ({ ...prev, isProcessing: true }));
      setMessage('Processing upload with POC data deletion...');

      const result = await uploadWithConflictResolution(
        conflictDialog.pendingEntries,
        conflictDialog.conflicts,
        'Manual Entry User' // You might want to get actual user info
      );

      setMessage(`✅ Upload completed successfully! 
        ${result.totalInserted} completion dates saved.
        ${result.totalDeactivated} POC records marked as deleted.`);
      
      logToServer({ 
        level: 'info', 
        message: `Manual completion date upload with conflict resolution: ${result.totalInserted} inserted, ${result.totalDeactivated} POC deactivated`,
        component: 'ManualPcompEntry',
        data: { 
          totalInserted: result.totalInserted, 
          totalDeactivated: result.totalDeactivated,
          cocode 
        }
      });

      // Reset and close dialog
      resetEntries();
      setConflictDialog({
        isVisible: false,
        conflicts: [],
        pendingEntries: [],
        isProcessing: false
      });

    } catch (error) {
      console.error('Conflict resolution error:', error);
      setMessage(`❌ Error during conflict resolution: ${error.message}`);
      
      setConflictDialog(prev => ({ ...prev, isProcessing: false }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ NEW: Handle conflict dialog cancellation
  const handleConflictCancellation = () => {
    setConflictDialog({
      isVisible: false,
      conflicts: [],
      pendingEntries: [],
      isProcessing: false
    });
    setIsSubmitting(false);
    setMessage('Upload cancelled by user due to POC data conflicts.');
  };

  const controlsDisabled = isLoading || isSubmitting || dbStatus !== 'connected';
  const submitDisabled = controlsDisabled || !cocode;

  // Generate year options
  const yearOptions = [];
  for (let year = POC_YEAR_RANGE.MIN; year <= POC_YEAR_RANGE.MAX; year++) {
    yearOptions.push(year);
  }

  // Generate month options
  const monthOptions = [
    { value: 1, name: 'January' }, { value: 2, name: 'February' }, { value: 3, name: 'March' },
    { value: 4, name: 'April' }, { value: 5, name: 'May' }, { value: 6, name: 'June' },
    { value: 7, name: 'July' }, { value: 8, name: 'August' }, { value: 9, name: 'September' },
    { value: 10, name: 'October' }, { value: 11, name: 'November' }, { value: 12, name: 'December' }
  ];

  return (
    <div className="csv-uploader-container">
      <h2>Manual Data Entry</h2>

      {!cocode && (
        <div className="warning-box">
          <strong>🛑 Manual Entry Requires Specific Company:</strong>
          <p>
            Please select a specific company to enter data. You cannot enter data for "All Companies".
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
          <strong>Debug Info:</strong> Company: {cocode || 'None'} | DB: {dbStatus} | Projects: {projectOptions.length} | Phases: {phaseOptions.length} | POC Year Range: {POC_YEAR_RANGE.MIN}-{POC_YEAR_RANGE.MAX}
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
        <>
          {/* ✅ ENTRY TYPE SELECTOR */}
          <div className="upload-options-group">
            <strong className="option-title">Select Entry Type</strong>
            <div className="radio-group">
              <label className={`radio-label ${controlsDisabled ? 'disabled-option' : ''}`}>
                <input
                  type="radio"
                  name="entryType"
                  value="completion"
                  checked={activeEntryType === 'completion'}
                  onChange={(e) => setActiveEntryType(e.target.value)}
                  disabled={controlsDisabled}
                />
                Completion Date Entry
              </label>
              <label className={`radio-label ${controlsDisabled ? 'disabled-option' : ''}`}>
                <input
                  type="radio"
                  name="entryType"
                  value="poc"
                  checked={activeEntryType === 'poc'}
                  onChange={(e) => setActiveEntryType(e.target.value)}
                  disabled={controlsDisabled}
                />
                POC Data Entry
              </label>
            </div>
          </div>

          {/* ✅ NEW: Add Conflict Dialog */}
          <CompletionConflictDialog
            conflicts={conflictDialog.conflicts}
            onConfirm={handleConflictConfirmation}
            onCancel={handleConflictCancellation}
            isVisible={conflictDialog.isVisible}
            isProcessing={conflictDialog.isProcessing}
          />

          {/* Message Display */}
          {message && (
            <div className={`feedback-message ${message.startsWith('❌') || message.includes('Failed') || message.includes('Error') || message.includes('Cannot submit') ? 'error-message' : 'success-message'}`}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{message}</pre>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* ✅ COMPLETION DATE ENTRIES */}
            {activeEntryType === 'completion' && (
              <div className="upload-options-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <strong className="option-title">Completion Date Entries</strong>
                  <button
                    type="button"
                    onClick={addCompletionEntry}
                    disabled={controlsDisabled}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: controlsDisabled ? 'not-allowed' : 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    ➕ Add Entry
                  </button>
                </div>

                {completionEntries.map((entry, index) => (
                  <div key={entry.id} style={{
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '15px',
                    marginBottom: '15px',
                    backgroundColor: '#f8f9fa'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ margin: 0, color: '#495057' }}>Entry #{index + 1}</h4>
                      {completionEntries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCompletionEntry(entry.id)}
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
                          ❌ Remove
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      {/* Project Selection */}
                      <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                          Project: <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                          value={entry.project}
                          onChange={(e) => updateCompletionEntry(entry.id, 'project', e.target.value)}
                          disabled={controlsDisabled}
                          required
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            backgroundColor: controlsDisabled ? '#e9ecef' : 'white'
                          }}
                        >
                          <option value="">-- Select Project --</option>
                          {projectOptions.map((proj, idx) => (
                            <option key={idx} value={proj.project}>{proj.project}</option>
                          ))}
                        </select>
                        {entry.projectDescription && (
                          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                            📋 {entry.projectDescription}
                          </div>
                        )}
                      </div>

                      {/* Phase Selection */}
                      <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                          Phase: <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                          value={entry.phasecode}
                          onChange={(e) => updateCompletionEntry(entry.id, 'phasecode', e.target.value)}
                          disabled={controlsDisabled || !entry.project}
                          required
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            backgroundColor: (controlsDisabled || !entry.project) ? '#e9ecef' : 'white'
                          }}
                        >
                          <option value="">-- Select Phase --</option>
                          {getFilteredPhases(entry.project).map((phase, idx) => (
                            <option key={idx} value={phase.phasecode}>
                              {phase.phasecode || '(Empty Phase)'}
                            </option>
                          ))}
                        </select>
                        {entry.phaseDescription && (
                          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                            📋 {entry.phaseDescription}
                          </div>
                        )}
                      </div>

                      {/* Completion Type */}
                      <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                          Type:
                        </label>
                        <select
                          value={entry.completionType}
                          onChange={(e) => updateCompletionEntry(entry.id, 'completionType', e.target.value)}
                          disabled={controlsDisabled}
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            backgroundColor: controlsDisabled ? '#e9ecef' : 'white'
                          }}
                        >
                          <option value="A">Actual</option>
                          <option value="P">Projected</option>
                        </select>
                      </div>

                      {/* Completion Date */}
                      <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                          Date: <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <input
                          type="date"
                          value={entry.completionDate}
                          onChange={(e) => updateCompletionEntry(entry.id, 'completionDate', e.target.value)}
                          disabled={controlsDisabled}
                          required
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: entry.dateValidationError ? '1px solid #dc3545' : '1px solid #ced4da',
                            borderRadius: '4px',
                            backgroundColor: controlsDisabled ? '#e9ecef' : 'white'
                          }}
                        />
                        {entry.dateValidationError && (
                          <div style={{ fontSize: '12px', color: '#dc3545', marginTop: '5px' }}>
                            ⚠️ {entry.dateValidationError}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ✅ POC ENTRIES */}
            {activeEntryType === 'poc' && (
              <div className="upload-options-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <strong className="option-title">POC Data Entries</strong>
                  <button
                    type="button"
                    onClick={addPocEntry}
                    disabled={controlsDisabled}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: controlsDisabled ? 'not-allowed' : 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    ➕ Add Entry
                  </button>
                </div>

                {pocEntries.map((entry, index) => (
                  <div key={entry.id} style={{
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '15px',
                    marginBottom: '15px',
                    backgroundColor: '#f8f9fa'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ margin: 0, color: '#495057' }}>
                        Entry #{index + 1} 
                        <span style={{ 
                          marginLeft: '10px', 
                          fontSize: '12px', 
                          padding: '2px 6px', 
                          backgroundColor: entry.pocType === 'A' ? '#d4edda' : '#fff3cd',
                          color: entry.pocType === 'A' ? '#155724' : '#856404',
                          borderRadius: '4px' 
                        }}>
                          {entry.pocType === 'A' ? 'Actual' : 'Projected'}
                        </span>
                      </h4>
                      {pocEntries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePocEntry(entry.id)}
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
                          ❌ Remove
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                      {/* Project Selection */}
                      <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                          Project: <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                          value={entry.project}
                          onChange={(e) => updatePocEntry(entry.id, 'project', e.target.value)}
                          disabled={controlsDisabled}
                          required
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            backgroundColor: controlsDisabled ? '#e9ecef' : 'white'
                          }}
                        >
                          <option value="">-- Select Project --</option>
                          {projectOptions.map((proj, idx) => (
                            <option key={idx} value={proj.project}>{proj.project}</option>
                          ))}
                        </select>
                        {entry.projectDescription && (
                          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                            📋 {entry.projectDescription}
                          </div>
                        )}
                      </div>

                      {/* Phase Selection */}
                      <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                          Phase: <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                          value={entry.phasecode}
                          onChange={(e) => updatePocEntry(entry.id, 'phasecode', e.target.value)}
                          disabled={controlsDisabled || !entry.project}
                          required
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            backgroundColor: (controlsDisabled || !entry.project) ? '#e9ecef' : 'white'
                          }}
                        >
                          <option value="">-- Select Phase --</option>
                          {getFilteredPhases(entry.project).map((phase, idx) => (
                            <option key={idx} value={phase.phasecode}>
                              {phase.phasecode || '(Empty Phase)'}
                            </option>
                          ))}
                        </select>
                        {entry.phaseDescription && (
                          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                            📋 {entry.phaseDescription}
                          </div>
                        )}
                      </div>

                      {/* Year Selection */}
                      <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                          Year: <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                          value={entry.year}
                          onChange={(e) => updatePocEntry(entry.id, 'year', parseInt(e.target.value))}
                          disabled={controlsDisabled}
                          required
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            backgroundColor: controlsDisabled ? '#e9ecef' : 'white'
                          }}
                        >
                          {yearOptions.map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>

                      {/* Month Selection */}
                      <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                          Month: <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                          value={entry.month}
                          onChange={(e) => updatePocEntry(entry.id, 'month', parseInt(e.target.value))}
                          disabled={controlsDisabled}
                          required
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            backgroundColor: controlsDisabled ? '#e9ecef' : 'white'
                          }}
                        >
                          {monthOptions.map(month => (
                            <option key={month.value} value={month.value}>{month.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* POC Value */}
                      <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                          POC Value: <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <input
                          type="number"
                          value={entry.pocValue}
                          onChange={(e) => updatePocEntry(entry.id, 'pocValue', e.target.value)}
                          disabled={controlsDisabled}
                          required
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="0.00"
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: entry.completionValidationError ? '1px solid #dc3545' : '1px solid #ced4da',
                            borderRadius: '4px',
                            backgroundColor: controlsDisabled ? '#e9ecef' : 'white'
                          }}
                        />
                        {/* ✅ NEW: Show completion validation error with helpful guidance */}
                        {entry.completionValidationError && (
                          <div style={{ 
                            fontSize: '12px', 
                            color: '#dc3545', 
                            fontWeight: '500',
                            marginTop: '5px',
                            padding: '12px',
                            backgroundColor: '#f8d7da',
                            borderRadius: '4px',
                            border: '1px solid #f5c6cb'
                          }}>
                            <div style={{ marginBottom: '8px' }}>
                              ⚠️ {entry.completionValidationError}
                            </div>
                            {entry.completionValidationError.includes('completion date to be set first') && (
                              <div style={{ 
                                fontSize: '11px', 
                                color: '#721c24',
                                fontStyle: 'italic'
                              }}>
                                💡 Switch to "Completion Date Entry" above to set a projected completion date for this project/phase first.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                }}
              >
                {isSubmitting ? '⏳ Saving...' : `💾 Save ${activeEntryType === 'completion' ? 'Completion Date' : 'POC'} Entries`}
              </button>
            </div>
          </form>
        </>
      )}

      {/* ✅ ENHANCED: Information Section */}
      <div style={{
        marginTop: '40px',
        padding: '20px',
        backgroundColor: '#e8f4fd',
        border: '1px solid #007bff',
        borderRadius: '8px'
      }}>
        <h4 style={{ color: '#0056b3', marginTop: 0 }}>ℹ️ Manual Entry Information</h4>

        {/* Apply textAlign: 'left' to the container div for this section */}
        <div style={{ marginBottom: '15px', textAlign: 'left' }}>
          <strong style={{ color: '#495057' }}>Completion Date Entries:</strong>
          <ul style={{ marginTop: '5px', color: '#495057' }}>
            <li>Each entry creates a new record (preserves audit trail)</li>
            <li>Actual dates: today or past only</li>
            <li>Projected dates: future only</li>
            <li>Must be month-end dates</li>
          </ul>
        </div>

        {/* Apply textAlign: 'left' to the container div for this section */}
        <div style={{ textAlign: 'left' }}>
          <strong style={{ color: '#495057' }}>POC Data Entries:</strong>
          <ul style={{ marginTop: '5px', color: '#495057' }}>
            <li>Updates existing records if found, creates new if not</li>
            <li>Year range: {POC_YEAR_RANGE.MIN} - {POC_YEAR_RANGE.MAX}</li>
            <li>Type determined by cutoff date: {cutoffDate || 'Not set'}</li>
            <li>POC values: 0-100 (percentage)</li>
            <li><strong>⚠️ Validation Rule:</strong> 100% POC not allowed for periods after project completion date</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default ManualPcompEntry;