// client/src/components/DataDisplay.js
// debugging
// Add charting for POC per month
// debugging for empty filters


import React, { useState, useEffect, useCallback, useRef } from 'react';
import { logToServer } from '../utils/logger.js';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const DataDisplay = ({ cutoffDate, cocode, dbStatus }) => {
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({ project: '', phasecode: '', year: '' });
  const [options, setOptions] = useState({ projects: [], phasecodes: [], years: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fontSize, setFontSize] = useState('medium');
  const [showChart, setShowChart] = useState(false); // New state for chart visibility

  // Debug logging
  console.log('DataDisplay - Props received:', { cutoffDate, cocode, dbStatus });

  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).format(date);
  };

  const formatDate = (dateString) => {
    if (!dateString) {
        return '';
    }
    const date = new Date(dateString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const fetchOptions = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams();
      if (cocode) queryParams.append('cocode', cocode);
      
      const optionsUrl = `http://localhost:3001/api/pocdata/options?${queryParams.toString()}`;
      console.log('DataDisplay - Fetching options from:', optionsUrl);
      
      const response = await fetch(optionsUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      
      console.log('DataDisplay - Options received by fetchOptions:', result);
      setOptions(result);
      logToServer({ level: 'info', message: 'Successfully fetched filter options.' });
    } catch (e) {
      console.error('DataDisplay - Error fetching options:', e);
      logToServer({ level: 'error', message: `Error fetching filter options: ${e.message}` });
    }
  }, [cocode]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    setShowChart(false); // Hide chart on new data fetch
    try {
      const queryParams = new URLSearchParams();
      if (filters.project) queryParams.append('project', filters.project);
      if (filters.phasecode) queryParams.append('phasecode', filters.phasecode);
      if (filters.year) queryParams.append('year', filters.year);
      if (cutoffDate) queryParams.append('cutoffDate', cutoffDate);
      if (cocode) queryParams.append('cocode', cocode);

      const dataUrl = `http://localhost:3001/api/pocdata?${queryParams.toString()}`;
      console.log('DataDisplay - Fetching data from:', dataUrl);

      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();

      console.log('DataDisplay - Data received:', {
        count: result.length,
        sample: result[0],
        sampleCocode: result[0]?.cocode,
        allCocodes: [...new Set(result.map(r => r.cocode))],
        allRecords: result.map(r => ({ ID: r.ID, cocode: r.cocode, project: r.project }))
      });
      setData(result);
      logToServer({ level: 'info', message: `Fetched ${result.length} rows for DataDisplay.` });
    } catch (e) {
      console.error('DataDisplay - Error fetching data:', e);
      setError('Failed to fetch data.');
      logToServer({ level: 'error', message: `Error fetching data for DataDisplay: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }, [filters, cutoffDate, cocode]);

  useEffect(() => {
    console.log('DataDisplay - fetchOptions useEffect triggered, cocode:', cocode);
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    console.log('DataDisplay - fetchData useEffect triggered');
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    console.log('DataDisplay - Company changed, resetting filters. New cocode:', cocode || 'All Companies');
    setFilters({ project: '', phasecode: '', year: '' });
    setShowChart(false); // Hide chart when company changes
  }, [cocode]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    console.log('DataDisplay - Filter changed:', name, value);
    setFilters(prev => ({ ...prev, [name]: value }));
    setShowChart(false); // Hide chart when filters change
  };

  const handleFontSizeChange = (e) => {
    setFontSize(e.target.value);
  };

  const toggleChartVisibility = () => {
    setShowChart(prev => !prev);
  };

  // NEW LOGIC for enabling chart button: only needs a specific project selected.
  // The chart data filtering will then handle the specific phase (including blank).
  const isSingleProjectPhaseSelected = filters.project !== '';
  const canShowChartButton = isSingleProjectPhaseSelected && data.length > 0;

  const getFontSize = () => {
    switch(fontSize) {
      case 'small': return '12px';
      case 'medium': return '14px';
      case 'large': return '16px';
      default: return '14px';
    }
  };

  const tableContainerStyle = {
    marginTop: '20px',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  };

  const tableStyle = {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: getFontSize(),
    backgroundColor: '#fff'
  };

  const headerStyle = {
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    padding: '12px 8px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#495057',
    position: 'sticky',
    top: 0,
    zIndex: 10
  };

  const cellStyle = {
    border: '1px solid #dee2e6',
    padding: '10px 8px',
    textAlign: 'left',
    verticalAlign: 'top',
    lineHeight: '1.4'
  };

  const evenRowStyle = {
    backgroundColor: '#f8f9fa'
  };

  const filterContainerStyle = {
    display: 'flex',
    gap: '15px',
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #dee2e6'
  };

  const selectStyle = {
    padding: '8px 12px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '14px',
    backgroundColor: 'white',
    cursor: 'pointer',
    minWidth: '120px'
  };

  const summaryStyle = {
    padding: '15px',
    backgroundColor: '#e8f4fd',
    border: '1px solid #007bff',
    borderRadius: '6px',
    marginBottom: '20px'
  };

  // Function to prepare data for Chart.js
  const getChartData = (rawData, cutoffDate) => {
    const datasets = [];
    const labels = new Set(); // To collect all unique dates for the X-axis

    const projectsPhases = {}; // Group data by project-phase

    // Filter data to only include the selected project and phase
    const filteredRawData = rawData.filter(item =>
        item.project === filters.project && item.phasecode === filters.phasecode
    );

    filteredRawData.forEach(item => {
      const key = `${item.project}-${item.phasecode}`; // Will be only one key now
      if (!projectsPhases[key]) {
        projectsPhases[key] = {
          label: `${item.project} - ${item.phasecode} (${item.description})`,
          dataPoints: [],
          actualCompletionDate: item.actualCompletionDate,
          projectedCompletionDate: item.projectedCompletionDate,
        };
      }
      const month = item.month;
      const year = item.year;

      projectsPhases[key].dataPoints.push({
        date: `${year}-${String(month).padStart(2, '0')}-01`, // Standardize to first day of month
        value: item.value,
        isDecember: month === 12 // Mark December records
      });
      labels.add(`${year}-${String(month).padStart(2, '0')}`); // Add YYYY-MM to labels
    });

    for (const key in projectsPhases) { // This loop will run only once for the selected project-phase
      const projectPhase = projectsPhases[key];

      projectPhase.dataPoints.sort((a, b) => new Date(a.date) - new Date(b.date));

      let finalCompletionDate = null;
      const cutoffDateTime = cutoffDate ? new Date(cutoffDate) : null;
      const actualCompDateTime = projectPhase.actualCompletionDate ? new Date(projectPhase.actualCompletionDate) : null;
      const projectedCompDateTime = projectPhase.projectedCompletionDate ? new Date(projectPhase.projectedCompletionDate) : null;

      if (actualCompDateTime && cutoffDateTime && actualCompDateTime >= cutoffDateTime) {
        finalCompletionDate = cutoffDateTime;
      } else if (projectedCompDateTime) {
        finalCompletionDate = projectedCompDateTime;
      }

      if (finalCompletionDate) {
          const year = finalCompletionDate.getFullYear();
          const month = finalCompletionDate.getMonth();
          finalCompletionDate = new Date(year, month + 1, 0); // Last day of the month
          finalCompletionDate.setHours(23, 59, 59, 999);
          const finalDateLabel = `${finalCompletionDate.getFullYear()}-${String(finalCompletionDate.getMonth() + 1).padStart(2, '0')}`;
          
          // Add 100% data point only if it's not already covered by an existing point at 100% for that month
          const existing100PercentPoint = projectPhase.dataPoints.find(dp =>
              new Date(dp.date).getFullYear() === finalCompletionDate.getFullYear() &&
              (new Date(dp.date).getMonth() + 1) === (finalCompletionDate.getMonth() + 1) &&
              dp.value === 100
          );

          if (!existing100PercentPoint) {
              projectPhase.dataPoints.push({
                date: finalCompletionDate.toISOString().substring(0, 10),
                value: 100,
                isDecember: (finalCompletionDate.getMonth() + 1) === 12 // Check if the 100% date falls in December
              });
          }
          labels.add(finalDateLabel); // Correctly add the 100% completion month to the main labels Set
      }
    }

    // Now, after all data points and potential 100% points are added, create the final sorted labels
    const finalSortedLabels = Array.from(labels).sort();

    for (const key in projectsPhases) { // This loop will run only once for the selected project-phase
        const projectPhase = projectsPhases[key];
        const chartDataValues = [];
        const pointBackgroundColors = [];
        const pointBorderColors = [];
        const pointRadius = [];

        finalSortedLabels.forEach(label => {
            const [yearStr, monthStr] = label.split('-');
            const targetMonth = parseInt(monthStr, 10);
            const targetYear = parseInt(yearStr, 10);

            const matchingPoint = projectPhase.dataPoints.find(dp => {
                const dpDate = new Date(dp.date);
                return dpDate.getFullYear() === targetYear && (dpDate.getMonth() + 1) === targetMonth;
            });

            chartDataValues.push(matchingPoint ? matchingPoint.value : null);

            if (matchingPoint) {
                if (matchingPoint.isDecember) {
                    pointBackgroundColors.push('red'); // Red dot for December
                    pointBorderColors.push('darkred');
                    pointRadius.push(5); // Larger radius for December
                } else if (matchingPoint.value === 100) {
                     pointBackgroundColors.push('green'); // Green dot for 100% completion
                     pointBorderColors.push('darkgreen');
                     pointRadius.push(5);
                } else {
                    // Default styling for other points
                    pointBackgroundColors.push(datasets.length > 0 ? datasets[datasets.length - 1].borderColor : 'blue'); // Fallback to blue or line color
                    pointBorderColors.push('black');
                    pointRadius.push(3);
                }
            } else {
                pointBackgroundColors.push('transparent'); // No point for null data
                pointBorderColors.push('transparent');
                pointRadius.push(0);
            }
        });

        datasets.push({
            label: projectPhase.label,
            data: chartDataValues,
            borderColor: `hsl(${Math.random() * 360}, 70%, 50%)`, // Random color for each line
            fill: false,
            tension: 0.1,
            pointBackgroundColor: pointBackgroundColors, // Apply custom background colors
            pointBorderColor: pointBorderColors,     // Apply custom border colors
            pointRadius: pointRadius                 // Apply custom radius
        });
    }

    return {
      labels: finalSortedLabels.map(label => {
        const [year, month] = label.split('-');
        return `${new Date(year, month - 1).toLocaleString('default', { month: 'short' })} ${year}`;
      }),
      datasets: datasets,
    };
  };

  return (
    <div className="data-display" style={{ padding: '0 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#343a40' }}>POC Per Month Report</h2>

        {/* Font Size Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label htmlFor="fontSize" style={{ fontSize: '14px', fontWeight: '500' }}>Font Size:</label>
          <select
            id="fontSize"
            value={fontSize}
            onChange={handleFontSizeChange}
            style={{ ...selectStyle, minWidth: '80px' }}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>
      </div>

      {/* Enhanced Filter Section */}
      <div style={filterContainerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', minWidth: '60px' }}>Project:</label>
          {/* Debugging log for project options */}
          {console.log('DataDisplay - Project options before render:', options.projects)}
          <select
            name="project"
            value={filters.project}
            onChange={handleFilterChange}
            disabled={loading}
            style={selectStyle}
          >
            <option value="">All Projects</option>
            {options.projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', minWidth: '50px' }}>Phase:</label>
          {/* Debugging log for phase options */}
          {console.log('DataDisplay - Phase options before render:', options.phasecodes)}
          <select
            name="phasecode"
            value={filters.phasecode}
            onChange={handleFilterChange}
            disabled={loading}
            style={selectStyle}
          >
            <option value="">All Phases</option>
            {options.phasecodes.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', minWidth: '40px' }}>Year:</label>
          <select
            name="year"
            value={filters.year}
            onChange={handleFilterChange}
            disabled={loading}
            style={selectStyle}
          >
            <option value="">All Years</option>
            {options.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {/* Button to display chart */}
        <button
          onClick={toggleChartVisibility}
          disabled={!canShowChartButton || loading}
          style={{
            padding: '10px 15px',
            backgroundColor: canShowChartButton ? '#007bff' : '#cccccc',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: canShowChartButton ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          {showChart ? 'Hide Chart' : 'Show Chart'}
        </button>
      </div>

      {/* Data Summary */}
      {data.length > 0 && (
        <div style={summaryStyle}>
          <strong>📊 Summary:</strong> Showing {data.length} record{data.length !== 1 ? 's' : ''}
          {cocode ? ` for ${cocode}` : ' for all companies'}
          {filters.project && ` | Project: ${filters.project}`}
          {filters.phasecode && ` | Phase: ${filters.phasecode}`}
          {filters.year && ` | Year: ${filters.year}`}
        </div>
      )}

      {loading && <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>🔄 Loading data...</div>}
      {error && <div style={{ padding: '20px', textAlign: 'center', color: '#dc3545', backgroundColor: '#f8d7da', borderRadius: '4px' }}>❌ Error: {error}</div>}

      {!loading && !error && data.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6c757d', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          📭 No data found matching the current filters.
        </div>
      )}

      {/* New Chart Section */}
      {showChart && !loading && !error && data.length > 0 && isSingleProjectPhaseSelected && (
        <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#343a40' }}>POC Progress Chart for {filters.project} - {filters.phasecode || 'Blank Phase'}</h3>
          <div style={{ position: 'relative', height: '400px', width: '100%' }}>
            <Line
              data={getChartData(data, cutoffDate)}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  title: {
                    display: true,
                    text: 'POC Progression Over Time Per Project/Phase',
                    font: { size: 16 }
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        return `${context.dataset.label}: ${context.raw}%`;
                      }
                    }
                  }
                },
                scales: {
                  x: {
                    title: {
                      display: true,
                      text: 'Month',
                      font: { size: 14 }
                    }
                  },
                  y: {
                    title: {
                      display: true,
                      text: 'Percentage of Completion (%)',
                      font: { size: 14 }
                    },
                    min: 0,
                    max: 110, // Set upper limit to 110%
                    ticks: {
                      callback: function(value) {
                        // Only display labels up to 100%
                        if (value <= 100) {
                          return value + '%';
                        }
                        return ''; // Don't show label for values > 100%
                      }
                    }
                  }
                }
              }}
            />
          </div>
        </div>
      )}
      {!showChart && isSingleProjectPhaseSelected && !loading && !error && data.length > 0 && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d', backgroundColor: '#f8f9fa', borderRadius: '8px', marginTop: '20px' }}>
            Select a single Project and Phase and click "Show Chart" to view the graphical report.
        </div>
      )}

      {/* Enhanced Table */}
      {data.length > 0 && (
        <div style={tableContainerStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerStyle}>ID</th>
                <th style={headerStyle}>Company</th>
                <th style={headerStyle}>Project</th>
                <th style={headerStyle}>Phase</th>
                <th style={headerStyle}>Description</th>
                <th style={headerStyle}>Year</th>
                <th style={headerStyle}>Month</th>
                <th style={headerStyle}>Value</th>
                <th style={headerStyle}>Created By</th>
                <th style={headerStyle}>Created At</th>
                <th style={headerStyle}>Updated By</th>
                <th style={headerStyle}>Updated At</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={row.ID} style={index % 2 === 0 ? {} : evenRowStyle}>
                  <td style={cellStyle}>{row.ID}</td>
                  <td style={{...cellStyle, fontWeight: '500', color: '#007bff'}}>{row.cocode}</td>
                  <td style={{...cellStyle, fontWeight: '500'}}>{row.project}</td>
                  <td style={cellStyle}>{row.phasecode}</td>
                  <td style={{...cellStyle, fontStyle: row.description === 'N/A' ? 'italic' : 'normal', color: row.description === 'N/A' ? '#6c757d' : 'inherit'}}>
                    {row.description || 'N/A'}
                  </td>
                  <td style={cellStyle}>{row.year}</td>
                  <td style={cellStyle}>{row.month}</td>
                  <td style={{...cellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: '500'}}>
                    {typeof row.value === 'number' ? row.value.toFixed(2) : row.value}
                  </td>
                  <td style={cellStyle}>{row.userC}</td>
                  <td style={{...cellStyle, fontSize: getFontSize() === '16px' ? '14px' : getFontSize(), color: '#6c757d'}}>
                    {formatDateTime(row.timestampC)}
                  </td>
                  <td style={cellStyle}>{row.userM}</td>
                  <td style={{...cellStyle, fontSize: getFontSize() === '16px' ? '14px' : getFontSize(), color: '#6c757d'}}>
                    {formatDateTime(row.timestampM)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DataDisplay;