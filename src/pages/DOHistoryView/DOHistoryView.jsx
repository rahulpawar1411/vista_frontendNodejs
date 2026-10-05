// ====================================================================
// DO History View Component (src/pages/DOHistoryView/DOHistoryView.jsx)
// Paired with: src/pages/DOHistoryView/DOHistoryView.css
// Unified temperature logs history view with tabs, search, filters & lightboxes.
// ====================================================================

import React, { useState, useEffect } from 'react';
import { 
  History, Search, Calendar, Trash2, X, Eye, 
  Thermometer, ArrowDownLeft, ArrowUpRight, Loader2, AlertCircle, Edit, Download,
  Copy, Check
} from 'lucide-react';
import { 
  fetchChamberLogs, deleteChamberLog, 
  fetchInwardLogs, deleteInwardLog, 
  fetchOutwardLogs, deleteOutwardLog,
  checkEditPermission, requestEditPermission,
  fetchAllChamberLogs, fetchAllInwardLogs, fetchAllOutwardLogs,
  toApiDateParam,
  API_BASE_URL
} from '../../services/api';
import UpdatablePodPhoto from '../../components/UpdatablePodPhoto/UpdatablePodPhoto';
import PaginationBar from '../../components/PaginationBar/PaginationBar';
import {
  requireExportDates,
  downloadCsv,
  formatExportProgress,
  getExportErrorMessage,
  isRetryableExportError
} from '../../utils/exportCsv';
import {
  formatPhotoCaptureMetadataForExport,
  formatPhotoGpsForExport,
} from '../../utils/photoCaptureExport';
import ExportErrorBanner from '../../components/ExportErrorBanner/ExportErrorBanner';
import PhotoGpsLink from '../../components/PhotoGpsLink/PhotoGpsLink';
import PhotoCaptureMetaPanel from '../../components/PhotoCaptureMetaPanel/PhotoCaptureMetaPanel';
import './DOHistoryView.css';

/**
 * WHAT: Searchable history of daily, inward, and outward temperature logs.
 * WHY: Operators review past entries and jump to edit (with permission) from one place.
 * HOW: Tabbed filters call paginated API; row actions set edit state and switch DO menu.
 */
export default function DOHistoryView({ setActiveDOMenu, setEditInwardData, setEditOutwardData, setEditDailyData }) {
  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'inward' | 'outward'
  
  const formatDuration = (hoursStr, minsStr) => {
    const hours = parseInt(hoursStr) || 0;
    const mins = parseInt(minsStr) || 0;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `${days}d ${remHours}h ${mins}m`;
    }
    return `${hours}h ${mins}m`;
  };
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgressLabel, setExportProgressLabel] = useState('Exporting…');
  const [exportError, setExportError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);
  const [copiedRef, setCopiedRef] = useState(null);
  const logsPerPage = 15;
  
  // Permission Request States & Handlers
  const [permissionModalData, setPermissionModalData] = useState({
    isOpen: false,
    recordType: '',
    recordId: null,
    log: null,
    action: 'Edit',
    status: 'None',
    proceedWithEdit: null
  });

  const handleEditAttempt = async (recordType, log, proceedWithEdit) => {
    const recordId = recordType === 'Chamber' ? log.id : (recordType === 'Inward' ? log.inward_id : log.outward_id);
    try {
      const res = await checkEditPermission(recordType, recordId, 'Edit');
      if (res.approved) {
        proceedWithEdit();
      } else {
        setPermissionModalData({
          isOpen: true,
          recordType,
          recordId,
          log,
          action: 'Edit',
          status: res.status || 'None',
          proceedWithEdit
        });
      }
    } catch (err) {
      console.error(err);
      alert('Error verifying edit permissions. Please try again.');
    }
  };

  const handleRequestPermission = async () => {
    try {
      const { recordType, recordId, action, log } = permissionModalData;
      const actionLabel = action === 'Delete' ? 'delete' : 'edit';
      
      let extraDetails = '';
      if (log) {
        if (recordType === 'Chamber') {
          const client = log.client_name || 'N/A';
          extraDetails = ` | Client: ${client} | Chamber: ${log.chamber_name || 'N/A'} | Temp: ${log.box_temp || 'N/A'}°C`;
        } else if (recordType === 'Inward') {
          const client = log.inward_client_name || 'N/A';
          extraDetails = ` | Client: ${client} | Vehicle: ${log.inward_vehicle_no || 'N/A'} | Temp: ${log.inward_material_temp || 'N/A'}°C`;
        } else if (recordType === 'Outward') {
          const client = log.outward_client_name || 'N/A';
          extraDetails = ` | Client: ${client} | Vehicle: ${log.outward_vehicle_no || 'N/A'} | Temp: ${log.outward_material_temp || 'N/A'}°C`;
        }
      }

      const refNo = log ? log.reference_no : null;
      const descText = `Requested permission to ${actionLabel} ${recordType} log (Ref: ${refNo || ('ID: ' + recordId)})${extraDetails}`;
      const res = await requestEditPermission(
        recordType,
        recordId,
        descText,
        action || 'Edit'
      );
      setPermissionModalData(prev => ({
        ...prev,
        status: 'Pending'
      }));
      alert(res.message || 'Permission request sent successfully.');
    } catch (err) {
      alert(err.message || 'Failed to request permission.');
    }
  };
  
  // Data lists
  const [dailyLogs, setDailyLogs] = useState([]);
  const [inwardLogs, setInwardLogs] = useState([]);
  const [outwardLogs, setOutwardLogs] = useState([]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Applied filter state (only changed when clicking Find button)
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');

  // Log Detail modal state
  const [selectedDetailLog, setSelectedDetailLog] = useState(null);
  const [detailType, setDetailType] = useState('');
  // Helper to format today's date in YYYY-MM-DD
  const getTodayDateStr = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Handler to apply filters
  const handleFind = () => {
    const fromNum = parseDateToNumber(fromDate);
    const toNum = parseDateToNumber(toDate);
    const todayNum = parseInt(getTodayDateStr().replace(/-/g, ''), 10);

    if (fromNum && fromNum > todayNum) {
      alert("⚠️ Date Error:\n'From Date' cannot be in the future.");
      return;
    }
    if (toNum && toNum > todayNum) {
      alert("⚠️ Date Error:\n'To Date' cannot be in the future.");
      return;
    }
    if (fromNum && toNum && fromNum > toNum) {
      alert("⚠️ Date Range Error:\n'From Date' must be less than or equal to 'To Date'.");
      return;
    }
    setAppliedSearchTerm(searchTerm);
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    setCurrentPage(1);
  };

  // Handler to export filtered logs to Excel (CSV format) — fetches all matching pages from server
  const handleExportExcel = async () => {
    setExportLoading(true);
    setExportProgressLabel('Exporting…');
    setExportError(null);
    try {
      // Use dates currently selected in the filters (not only after Find)
      const { from, to } = requireExportDates(fromDate, toDate);
      setAppliedFromDate(fromDate);
      setAppliedToDate(toDate);
      setAppliedSearchTerm(searchTerm);

      const exportParams = {
        search: searchTerm,
        fromDate: from,
        toDate: to
      };
      const onProgress = (p) => setExportProgressLabel(formatExportProgress(p));

      let filteredLogs = [];
      if (activeTab === 'daily') {
        const { items } = await fetchAllChamberLogs(exportParams, onProgress);
        filteredLogs = items;
      } else if (activeTab === 'inward') {
        const { items } = await fetchAllInwardLogs(exportParams, onProgress);
        filteredLogs = items;
      } else {
        const { items } = await fetchAllOutwardLogs(exportParams, onProgress);
        filteredLogs = items;
      }

      if (filteredLogs.length === 0) {
        throw new Error('No data available to export.');
      }

      setExportProgressLabel('Building file…');

    let csvContent = "\uFEFF"; // UTF-8 BOM for correct Excel character loading

    if (activeTab === 'daily') {
      const headers = ["Date", "Chamber", "Client Name", "Inspection Time", "Box Temp (°C)", "Supervisor", "Photo Capture Time", "Photo Location (GPS)", "Last Updated"];
      csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

      filteredLogs.forEach(log => {
        const row = [
          formatDateStr(log.formatted_date || log.entry_date),
          log.chamber_name || '',
          log.client_name || '',
          log.inspection_time || '',
          log.box_temp !== undefined ? `${log.box_temp}°C` : '',
          log.monitor_supervisor_name || '',
          log.photo_capture_time || '',
          formatPhotoGpsForExport(
            log.photo_capture_latitude,
            log.photo_capture_longitude,
            log.photo_capture_accuracy
          ),
          getUpdateDiff(log.created_at, log.updated_at) ? formatDateTimeStr(log.updated_at) : ''
        ];
        csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",") + "\n";
      });
    } else if (activeTab === 'inward') {
      const headers = [
        "Date", "Vehicle No", "Seal No", "Invoice No", "Mens Power", "Client", "Transporter", "Driver Name", "Driver Contact", "Dock No", 
        "Reporting Time", "Vehicle Temp (°C)", "Material Temp (°C)", "Material Type", "Pallets Qty", 
        "Invoice Qty", "Received Pallets", "Received Boxes", "Short Boxes", "Excess Boxes", "Damage Boxes", 
        "Unloading Start", "Unloading End", "Unloading Duration", "Supervisor", "Remarks", "Photo Capture Time & Location", "Last Updated"
      ];
      csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

      filteredLogs.forEach(log => {
        const row = [
          formatDateStr(log.inward_entry_date),
          log.inward_vehicle_no || '',
          log.inward_seal_no || '',
          log.inward_invoice_no || '',
          log.inward_mens_power !== undefined && log.inward_mens_power !== null ? log.inward_mens_power : '',
          log.inward_client_name || '',
          log.inward_transporter_name || '',
          log.inward_driver_name || '',
          log.inward_driver_no || '',
          log.inward_dock_no || '',
          log.inward_vehicle_reporting_time || '',
          log.inward_vehicle_temp !== undefined ? `${log.inward_vehicle_temp}°C` : '',
          log.inward_material_temp !== undefined ? `${log.inward_material_temp}°C` : '',
          log.inward_material_type || '',
          log.inward_pallets_in_qty || 0,
          log.inward_invoice_qty || 0,
          log.inward_received_qty || 0,
          log.inward_received_boxes_qty || 0,
          log.inward_short_received_boxes_qty || 0,
          log.inward_excess_received_boxes_qty || 0,
          log.inward_damage_received_boxes_qty || 0,
          log.inward_unloading_start_time || '',
          log.inward_unloading_end_time || '',
          formatDuration(log.inward_unloading_duration_hours, log.inward_unloading_duration_mins),
          log.inward_unloading_supervisor_name || '',
          log.inward_remarks || '',
          formatPhotoCaptureMetadataForExport(log.photo_capture_metadata),
          getUpdateDiff(log.inward_created_at, log.inward_updated_at) ? formatDateTimeStr(log.inward_updated_at) : ''
        ];
        csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",") + "\n";
      });
    } else if (activeTab === 'outward') {
      const headers = [
        "Date", "Vehicle No", "Seal No", "Invoice No", "Mens Power", "Client", "Transporter", "Driver Name", "Driver Contact", "Dock No", 
        "Reporting Time", "Pre Vehicle Temp (°C)", "Material Temp (°C)", "Material Type", "Pallets Qty", 
        "Invoice Qty", "Loaded Pallets", "Loaded Boxes", "Short Loaded Boxes", "Excess Loaded Boxes", "Damage Boxes", 
        "Loading Start", "Loading End", "Loading Duration", "Supervisor", "Remarks", "Photo Capture Time & Location", "Last Updated"
      ];
      csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

      filteredLogs.forEach(log => {
        const row = [
          formatDateStr(log.outward_entry_date),
          log.outward_vehicle_no || '',
          log.outward_seal_no || '',
          log.outward_invoice_no || '',
          log.outward_mens_power !== undefined && log.outward_mens_power !== null ? log.outward_mens_power : '',
          log.outward_client_name || '',
          log.outward_transporter_name || '',
          log.outward_driver_name || '',
          log.outward_driver_no || '',
          log.outward_dock_no || '',
          log.outward_vehicle_reporting_time || '',
          (log.outward_pre_vehicle_temp !== undefined && log.outward_pre_vehicle_temp !== null) ? `${log.outward_pre_vehicle_temp}°C` : ((log.outward_vehicle_temp !== undefined && log.outward_vehicle_temp !== null) ? `${log.outward_vehicle_temp}°C` : ''),
          log.outward_material_temp !== undefined ? `${log.outward_material_temp}°C` : '',
          log.outward_material_type || '',
          log.outward_pallets_in_qty || 0,
          log.outward_invoice_qty || 0,
          log.outward_received_qty || 0,
          log.outward_received_boxes_qty || 0,
          log.outward_short_received_boxes_qty || 0,
          log.outward_excess_received_boxes_qty || 0,
          log.outward_damage_received_boxes_qty || 0,
          log.outward_loading_start_time || '',
          log.outward_loading_end_time || '',
          formatDuration(log.outward_loading_duration_hours, log.outward_loading_duration_mins),
          log.outward_loading_supervisor_name || '',
          log.outward_remarks || '',
          formatPhotoCaptureMetadataForExport(log.photo_capture_metadata),
          getUpdateDiff(log.outward_created_at, log.outward_updated_at) ? formatDateTimeStr(log.outward_updated_at) : ''
        ];
        csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",") + "\n";
      });
    }

    const tabLabel = activeTab === 'daily' ? 'Daily_Chamber' : activeTab === 'inward' ? 'Inward_Logs' : 'Outward_Logs';
    const dateSuffix = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    downloadCsv(`ReeferON_${tabLabel}_Export_${dateSuffix}.csv`, csvContent);
    } catch (err) {
      const message = getExportErrorMessage(err);
      if (message) {
        setExportError({
          message,
          retryable: isRetryableExportError(err)
        });
      }
    } finally {
      setExportLoading(false);
      setExportProgressLabel('Exporting…');
    }
  };
  
  // Photo Lightbox state
  const [lightboxImg, setLightboxImg] = useState(null);

  const logListParams = () => ({
    paginated: true,
    page: currentPage,
    limit: logsPerPage,
    search: appliedSearchTerm,
    fromDate: toApiDateParam(appliedFromDate),
    toDate: toApiDateParam(appliedToDate)
  });

  // Load one page from server (search + date filters applied on backend)
  const loadLogs = async () => {
    setLoading(true);
    try {
      const opts = logListParams();
      if (activeTab === 'daily') {
        const data = await fetchChamberLogs('', opts);
        setDailyLogs(data.items || []);
        setServerTotal(data.total ?? 0);
      } else if (activeTab === 'inward') {
        const data = await fetchInwardLogs('', opts);
        setInwardLogs(data.items || []);
        setServerTotal(data.total ?? 0);
      } else if (activeTab === 'outward') {
        const data = await fetchOutwardLogs('', opts);
        setOutwardLogs(data.items || []);
        setServerTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
      alert(err.message || 'Failed to load logs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [activeTab, currentPage, appliedSearchTerm, appliedFromDate, appliedToDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // Handle Log Deletion
  const handleDeleteLog = async (log) => {
    const id = activeTab === 'daily' ? log.id : (activeTab === 'inward' ? log.inward_id : log.outward_id);
    const recordType = activeTab === 'daily' ? 'Chamber' : (activeTab === 'inward' ? 'Inward' : 'Outward');
    try {
      const res = await checkEditPermission(recordType, id, 'Delete');
      if (res.approved) {
        if (!window.confirm("Are you sure you want to delete this log entry?")) return;
        if (activeTab === 'daily') {
          await deleteChamberLog(id);
        } else if (activeTab === 'inward') {
          await deleteInwardLog(id);
        } else if (activeTab === 'outward') {
          await deleteOutwardLog(id);
        }
        loadLogs();
      } else {
        setPermissionModalData({
          isOpen: true,
          recordType,
          recordId: id,
          log,
          action: 'Delete',
          status: res.status || 'None',
          proceedWithEdit: async () => {
            if (activeTab === 'daily') {
              await deleteChamberLog(id);
            } else if (activeTab === 'inward') {
              await deleteInwardLog(id);
            } else if (activeTab === 'outward') {
              await deleteOutwardLog(id);
            }
            loadLogs();
          }
        });
      }
    } catch (err) {
      console.error(err);
      alert('Error verifying delete permissions. Please try again.');
    }
  };

  // Safe split date formatter to return DD-MM-YYYY format
  const formatDateStr = (dateVal) => {
    if (!dateVal) return '-';
    let cleanDate = '';
    if (typeof dateVal === 'string') {
      cleanDate = dateVal.split('T')[0];
    } else if (dateVal instanceof Date) {
      const yyyy = dateVal.getFullYear();
      const mm = String(dateVal.getMonth() + 1).padStart(2, '0');
      const dd = String(dateVal.getDate()).padStart(2, '0');
      cleanDate = `${yyyy}-${mm}-${dd}`;
    } else {
      try {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          cleanDate = `${yyyy}-${mm}-${dd}`;
        } else {
          cleanDate = String(dateVal).split('T')[0];
        }
      } catch (e) {
        cleanDate = String(dateVal).split('T')[0];
      }
    }

    const parts = cleanDate.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // 'DD-MM-YYYY'
    }
    return cleanDate;
  };

  const formatDateTimeStr = (dateTimeVal) => {
    if (!dateTimeVal) return '';
    try {
      const d = new Date(dateTimeVal);
      if (isNaN(d.getTime())) return '';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
    } catch (e) {
      return '';
    }
  };

  const getUpdateDiff = (created, updated) => {
    if (!created || !updated) return false;
    const cTime = Math.floor(new Date(created).getTime() / 1000);
    const uTime = Math.floor(new Date(updated).getTime() / 1000);
    return uTime > cTime;
  };

  // Helper to format image paths
  const getFullImgPath = (path) => {
    if (!path) return null;
    const cleanBase = API_BASE_URL.replace('/api', '');
    if (cleanBase) {
      return `${cleanBase}/${path}`;
    }
    return `/${path}`;
  };

  // Helper to convert DD-MM-YYYY to YYYYMMDD number for easy comparison
  const parseDateToNumber = (ddMMyyyyStr) => {
    if (!ddMMyyyyStr) return null;
    const parts = ddMMyyyyStr.split('-');
    if (parts.length !== 3) return null;
    const dd = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const yyyy = parts[2];
    if (yyyy.length < 4) return null; // Wait for full year typing
    return parseInt(`${yyyy}${mm}${dd}`, 10);
  };

  // Helper to convert raw DB date (string/Date object) to YYYYMMDD number
  const rawDateToNumber = (rawDate) => {
    if (!rawDate) return 0;
    let datePart = '';
    if (typeof rawDate === 'string') {
      datePart = rawDate.split('T')[0]; // "YYYY-MM-DD"
    } else if (rawDate instanceof Date) {
      const yyyy = rawDate.getFullYear();
      const mm = String(rawDate.getMonth() + 1).padStart(2, '0');
      const dd = String(rawDate.getDate()).padStart(2, '0');
      datePart = `${yyyy}-${mm}-${dd}`;
    } else {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          datePart = `${yyyy}-${mm}-${dd}`;
        }
      } catch (e) {}
    }
    if (!datePart) return 0;
    const parts = datePart.split('-');
    if (parts.length !== 3) return 0;
    return parseInt(`${parts[0]}${parts[1]}${parts[2]}`, 10);
  };

  const currentLogs =
    activeTab === 'daily' ? dailyLogs : activeTab === 'inward' ? inwardLogs : outwardLogs;

  return (
    <div className="temp-monitor-page do-history-page">
      {/* 1. Header Banner */}
      <div className="do-header-banner">
        <div className="do-header-left">
          <h2>
            <History size={26} color="#00a2e8" />
            <span>DO Temperature Log History</span>
          </h2>
          <p>
            View, search, filter and audit all past daily chamber temperature, inward shipment, and outward shipment logs.
          </p>
        </div>
      </div>

      {/* 2. Tabs & Filters Control Panel */}
      <div className="history-control-card">
        {/* Navigation Tabs */}
        <div className="history-tabs">
          <button 
            className={`history-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
            onClick={() => { 
              setActiveTab('daily'); 
              setSearchTerm(''); setFromDate(''); setToDate(''); 
              setAppliedSearchTerm(''); setAppliedFromDate(''); setAppliedToDate('');
            }}
          >
            <Thermometer size={16} />
            <span>Daily Chamber Logs</span>
          </button>
          <button 
            className={`history-tab-btn ${activeTab === 'inward' ? 'active' : ''}`}
            onClick={() => { 
              setActiveTab('inward'); 
              setSearchTerm(''); setFromDate(''); setToDate(''); 
              setAppliedSearchTerm(''); setAppliedFromDate(''); setAppliedToDate('');
            }}
          >
            <ArrowDownLeft size={16} />
            <span>Inward Logs</span>
          </button>
          <button 
            className={`history-tab-btn ${activeTab === 'outward' ? 'active' : ''}`}
            onClick={() => { 
              setActiveTab('outward'); 
              setSearchTerm(''); setFromDate(''); setToDate(''); 
              setAppliedSearchTerm(''); setAppliedFromDate(''); setAppliedToDate('');
            }}
          >
            <ArrowUpRight size={16} />
            <span>Outward Logs</span>
          </button>
        </div>

        {/* Search and Filters Bar */}
        <div className="history-filters-bar">
          <div 
            className="filter-input-group search-group"
            title={
              activeTab === 'daily'
                ? "Search matches: Date, Ref No, Chamber, Client Name, or Supervisor"
                : "Search matches: Date, Ref No, Vehicle Number, Client Name, Supervisor, Transporter, or Driver"
            }
          >
            <Search size={16} className="filter-icon" />
            <input 
              type="text" 
              placeholder={
                activeTab === 'daily' 
                  ? "Search by Ref No, Client, Chamber, Supervisor, Date..." 
                  : "Search by Ref No, Vehicle No, Client, Supervisor, Date..."
              }
              title={
                activeTab === 'daily'
                  ? "Search matches: Date, Ref No, Chamber, Client Name, or Supervisor"
                  : "Search matches: Date, Ref No, Vehicle Number, Client Name, Supervisor, Transporter, or Driver"
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFind();
              }}
            />
          </div>

          <div className="filter-input-group date-group">
            <Calendar size={16} className="filter-icon" />
            <input 
              type="date" 
              placeholder="From Date"
              className={fromDate ? 'has-value' : 'empty-date'}
              style={{ cursor: 'pointer' }}
              value={fromDate ? fromDate.split('-').reverse().join('-') : ''}
              max={toDate ? (
                // Use minimum of toDate and today
                parseDateToNumber(toDate) < parseDateToNumber(getTodayDateStr().split('-').reverse().join('-')) 
                  ? toDate.split('-').reverse().join('-') 
                  : getTodayDateStr()
              ) : getTodayDateStr()}
              onClick={(e) => {
                if (typeof e.target.showPicker === 'function') {
                  try { e.target.showPicker(); } catch (err) {}
                }
              }}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setFromDate('');
                  setAppliedFromDate('');
                  return;
                }
                const [yyyy, mm, dd] = val.split('-');
                const nextFrom = `${dd}-${mm}-${yyyy}`;
                setFromDate(nextFrom);
                // Keep From ≤ To: if From moves past To, bump To up
                if (toDate) {
                  const fromNum = parseDateToNumber(nextFrom);
                  const toNum = parseDateToNumber(toDate);
                  if (fromNum && toNum && fromNum > toNum) {
                    setToDate(nextFrom);
                  }
                }
              }}
            />
            {fromDate && (
              <button className="clear-date-btn" onClick={() => { setFromDate(''); setAppliedFromDate(''); }}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="filter-input-group date-group">
            <Calendar size={16} className="filter-icon" />
            <input 
              type="date" 
              placeholder="To Date"
              className={toDate ? 'has-value' : 'empty-date'}
              style={{ cursor: 'pointer' }}
              value={toDate ? toDate.split('-').reverse().join('-') : ''}
              min={fromDate ? fromDate.split('-').reverse().join('-') : undefined}
              max={getTodayDateStr()}
              onClick={(e) => {
                if (typeof e.target.showPicker === 'function') {
                  try { e.target.showPicker(); } catch (err) {}
                }
              }}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setToDate('');
                  setAppliedToDate('');
                  return;
                }
                const [yyyy, mm, dd] = val.split('-');
                const nextTo = `${dd}-${mm}-${yyyy}`;
                setToDate(nextTo);
                // Keep From ≤ To: if To moves before From, pull From down
                if (fromDate) {
                  const fromNum = parseDateToNumber(fromDate);
                  const toNum = parseDateToNumber(nextTo);
                  if (fromNum && toNum && fromNum > toNum) {
                    setFromDate(nextTo);
                  }
                }
              }}
            />
            {toDate && (
              <button className="clear-date-btn" onClick={() => { setToDate(''); setAppliedToDate(''); }}>
                <X size={14} />
              </button>
            )}
          </div>

          <button 
            className="btn-find" 
            onClick={handleFind}
            style={{ 
              backgroundColor: 'var(--primary)', 
              color: '#ffffff', 
              border: 'none', 
              borderRadius: 'var(--radius-sm)', 
              height: '40px', 
              padding: '0 20px', 
              fontWeight: 700, 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <Search size={16} />
            <span>Find</span>
          </button>

          <button 
            className="btn-export" 
            onClick={handleExportExcel}
            disabled={exportLoading || loading}
            style={{ 
              backgroundColor: exportLoading ? '#94a3b8' : '#22c55e', 
              color: '#ffffff', 
              border: 'none', 
              borderRadius: 'var(--radius-sm)', 
              height: '40px', 
              padding: '0 20px', 
              fontWeight: 700, 
              cursor: exportLoading ? 'wait' : 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            title="Export filtered records to Excel"
          >
            {exportLoading ? <Loader2 size={16} className="spinner-icon" /> : <Download size={16} />}
            <span>{exportLoading ? exportProgressLabel : 'Export'}</span>
          </button>
        </div>
      </div>

      <ExportErrorBanner
        message={exportError?.message}
        retryable={exportError?.retryable}
        onRetry={() => {
          setExportError(null);
          handleExportExcel();
        }}
        onDismiss={() => setExportError(null)}
      />

      {/* 3. History Logs List Table */}
      <div className="inward-history-card">
        <div className="direct-form-header">
          <h3>
            <History size={18} color="#00a2e8" />
            <span>
              {activeTab === 'daily' && 'Daily Chamber Logs'}
              {activeTab === 'inward' && 'Inward Shipments Logs'}
              {activeTab === 'outward' && 'Outward Shipments Logs'}
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="loading-logs">
            <Loader2 size={28} className="spinner-icon" color="#00a2e8" />
            <span>Loading history database logs...</span>
          </div>
        ) : serverTotal === 0 ? (
          <div className="no-logs">
            <AlertCircle size={32} color="#94a3b8" />
            <p>No temperature logs found matching the filter criteria.</p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
            <table className="logs-table inward-table">
              <thead>
                {activeTab === 'daily' && (
                  <tr>
                    <th>Date</th>
                    <th>Ref No</th>
                    <th>Chamber</th>
                    <th>Client Name</th>
                    <th>Inspection Time</th>
                    <th>Box Temp (°C)</th>
                    <th>Supervisor</th>
                    <th>Warehouse / Operator</th>
                    <th>Actions</th>
                  </tr>
                )}
                {activeTab === 'inward' && (
                  <tr>
                    <th>Date</th>
                    <th>Ref No</th>
                    <th>Vehicle No</th>
                    <th>Invoice No</th>
                    <th>Mens Power</th>
                    <th className="wrap-text">Client</th>
                    <th>Inward Vehicle Temp</th>
                    <th>Inward Material Temp</th>
                    <th>Pallets</th>
                    <th>Unloading Time</th>
                    <th className="wrap-text">Supervisor</th>
                    <th>Warehouse / Operator</th>
                    <th>Actions</th>
                  </tr>
                )}
                {activeTab === 'outward' && (
                  <tr>
                    <th>Date</th>
                    <th>Ref No</th>
                    <th>Vehicle No</th>
                    <th>Invoice No</th>
                    <th>Mens Power</th>
                    <th className="wrap-text">Client</th>
                    <th>Pre Vehicle Temp</th>
                    <th>Outward Material Temp</th>
                    <th>Pallets</th>
                    <th>Loading Time</th>
                    <th className="wrap-text">Supervisor</th>
                    <th>Warehouse / Operator</th>
                    <th>Actions</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {activeTab === 'daily' && currentLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <strong>{formatDateStr(log.formatted_date || log.entry_date)}</strong>
                      {getUpdateDiff(log.created_at, log.updated_at) && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap' }} title="Last Updated">
                          Upd: {formatDateTimeStr(log.updated_at)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span 
                        className="status-badge" 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (log.reference_no) {
                            navigator.clipboard.writeText(log.reference_no);
                            setCopiedRef(log.reference_no);
                            setTimeout(() => setCopiedRef(null), 1500);
                          }
                        }}
                        title="Click to copy Reference Number"
                        style={{ 
                          backgroundColor: 'var(--bg-main)', 
                          color: copiedRef === log.reference_no ? '#10b981' : 'var(--text-dark)', 
                          fontWeight: 800, 
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'color 0.2s ease'
                        }}
                      >
                        {log.reference_no || '-'}
                        {log.reference_no && (
                          copiedRef === log.reference_no ? (
                            <Check size={12} color="#10b981" />
                          ) : (
                            <Copy size={10} style={{ opacity: 0.5 }} />
                          )
                        )}
                      </span>
                    </td>
                    <td><span className="status-badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 800 }}>{log.chamber_name}</span></td>
                    <td>{log.client_name || '-'}</td>
                    <td>{log.inspection_time || '-'}</td>
                    <td>
                      <span className="status-badge" style={{ 
                        backgroundColor: log.box_temp <= -18 ? '#dcfce7' : '#fee2e2', 
                        color: log.box_temp <= -18 ? '#15803d' : '#b91c1c', 
                        fontWeight: 800,
                        fontSize: '0.78rem'
                      }}>
                        {log.box_temp}°C
                      </span>
                    </td>
                    <td>{log.monitor_supervisor_name || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <strong>{log.warehouse_name || '-'}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{log.operator_email || '-'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button 
                          className="btn-view-log"
                          onClick={() => {
                            setSelectedDetailLog(log);
                            setDetailType('daily');
                          }}
                          title="View Data Profile & Photos"
                          style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Eye size={15} />
                        </button>
                        <button 
                          className="btn-edit-log"
                          onClick={() => handleEditAttempt('Chamber', log, () => {
                            setEditDailyData(log);
                            setActiveDOMenu('All');
                          })}
                          title="Edit Entry"
                          style={{ backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', color: '#0369a1', padding: '6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Edit size={15} />
                        </button>
                        <button 
                          className="btn-delete-log"
                          onClick={() => handleDeleteLog(log)}
                          title="Delete Entry"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {activeTab === 'inward' && currentLogs.map((log) => (
                  <tr key={log.inward_id}>
                    <td>
                      <strong>{formatDateStr(log.inward_entry_date)}</strong>
                      {getUpdateDiff(log.inward_created_at, log.inward_updated_at) && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap' }} title="Last Updated">
                          Upd: {formatDateTimeStr(log.inward_updated_at)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span 
                        className="status-badge" 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (log.reference_no) {
                            navigator.clipboard.writeText(log.reference_no);
                            setCopiedRef(log.reference_no);
                            setTimeout(() => setCopiedRef(null), 1500);
                          }
                        }}
                        title="Click to copy Reference Number"
                        style={{ 
                          backgroundColor: 'var(--bg-main)', 
                          color: copiedRef === log.reference_no ? '#10b981' : 'var(--text-dark)', 
                          fontWeight: 800, 
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'color 0.2s ease'
                        }}
                      >
                        {log.reference_no || '-'}
                        {log.reference_no && (
                          copiedRef === log.reference_no ? (
                            <Check size={12} color="#10b981" />
                          ) : (
                            <Copy size={10} style={{ opacity: 0.5 }} />
                          )
                        )}
                      </span>
                    </td>
                    <td><strong>{log.inward_vehicle_no}</strong></td>
                    <td>{log.inward_invoice_no != null && String(log.inward_invoice_no).trim() !== '' ? log.inward_invoice_no : '-'}</td>
                    <td>{log.inward_mens_power != null && log.inward_mens_power !== '' ? log.inward_mens_power : '-'}</td>
                    <td className="wrap-text">{log.inward_client_name}</td>
                    <td>{log.inward_vehicle_temp}°C</td>
                    <td>{log.inward_material_temp}°C</td>
                    <td>{log.inward_pallets_in_qty}</td>
                    <td>
                      <div style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        <div>S: {log.inward_unloading_start_time || '-'}</div>
                        <div>E: {log.inward_unloading_end_time || '-'}</div>
                        <div style={{ color: '#16a34a', fontWeight: 600, marginTop: '2px' }}>
                          Dur: {formatDuration(log.inward_unloading_duration_hours, log.inward_unloading_duration_mins)}
                        </div>
                      </div>
                    </td>
                    <td className="wrap-text">{log.inward_unloading_supervisor_name}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <strong>{log.warehouse_name || '-'}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{log.operator_email || '-'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button 
                          className="btn-view-log"
                          onClick={() => {
                            setSelectedDetailLog(log);
                            setDetailType('inward');
                          }}
                          title="View Data Profile & Photos"
                          style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Eye size={15} />
                        </button>
                        <button 
                          className="btn-edit-log"
                          onClick={() => handleEditAttempt('Inward', log, () => {
                            setEditInwardData(log);
                            setActiveDOMenu('Inward');
                          })}
                          title="Edit Entry"
                          style={{ backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', color: '#0369a1', padding: '6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Edit size={15} />
                        </button>
                        <button 
                          className="btn-delete-log"
                          onClick={() => handleDeleteLog(log)}
                          title="Delete Entry"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {activeTab === 'outward' && currentLogs.map((log) => (
                  <tr key={log.outward_id}>
                    <td>
                      <strong>{formatDateStr(log.outward_entry_date)}</strong>
                      {getUpdateDiff(log.outward_created_at, log.outward_updated_at) && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap' }} title="Last Updated">
                          Upd: {formatDateTimeStr(log.outward_updated_at)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span 
                        className="status-badge" 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (log.reference_no) {
                            navigator.clipboard.writeText(log.reference_no);
                            setCopiedRef(log.reference_no);
                            setTimeout(() => setCopiedRef(null), 1500);
                          }
                        }}
                        title="Click to copy Reference Number"
                        style={{ 
                          backgroundColor: 'var(--bg-main)', 
                          color: copiedRef === log.reference_no ? '#10b981' : 'var(--text-dark)', 
                          fontWeight: 800, 
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'color 0.2s ease'
                        }}
                      >
                        {log.reference_no || '-'}
                        {log.reference_no && (
                          copiedRef === log.reference_no ? (
                            <Check size={12} color="#10b981" />
                          ) : (
                            <Copy size={10} style={{ opacity: 0.5 }} />
                          )
                        )}
                      </span>
                    </td>
                    <td><strong>{log.outward_vehicle_no}</strong></td>
                    <td>{log.outward_invoice_no != null && String(log.outward_invoice_no).trim() !== '' ? log.outward_invoice_no : '-'}</td>
                    <td>{log.outward_mens_power != null && log.outward_mens_power !== '' ? log.outward_mens_power : '-'}</td>
                    <td className="wrap-text">{log.outward_client_name}</td>
                    <td>{log.outward_pre_vehicle_temp || log.outward_vehicle_temp}°C</td>
                    <td>{log.outward_material_temp}°C</td>
                    <td>{log.outward_pallets_in_qty || '-'}</td>
                    <td>
                      <div style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        <div>S: {log.outward_loading_start_time || '-'}</div>
                        <div>E: {log.outward_loading_end_time || '-'}</div>
                        <div style={{ color: '#16a34a', fontWeight: 600, marginTop: '2px' }}>
                          Dur: {formatDuration(log.outward_loading_duration_hours, log.outward_loading_duration_mins)}
                        </div>
                      </div>
                    </td>
                    <td className="wrap-text">{log.outward_loading_supervisor_name}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <strong>{log.warehouse_name || '-'}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{log.operator_email || '-'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button 
                          className="btn-view-log"
                          onClick={() => {
                            setSelectedDetailLog(log);
                            setDetailType('outward');
                          }}
                          title="View Data Profile & Photos"
                          style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Eye size={15} />
                        </button>
                        <button 
                          className="btn-edit-log"
                          onClick={() => handleEditAttempt('Outward', log, () => {
                            setEditOutwardData(log);
                            setActiveDOMenu('Outward');
                          })}
                          title="Edit Entry"
                          style={{ backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', color: '#0369a1', padding: '6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Edit size={15} />
                        </button>
                        <button 
                          className="btn-delete-log"
                          onClick={() => handleDeleteLog(log)}
                          title="Delete Entry"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <PaginationBar
            page={currentPage}
            totalItems={serverTotal}
            pageSize={logsPerPage}
            onPageChange={setCurrentPage}
            itemLabel="entries"
          />
          </>
        )}
      </div>

      {/* Lightbox View Modal with absolute positioned controls */}
      {lightboxImg && (
        <div 
          className="lightbox-overlay" 
          onClick={() => setLightboxImg(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            animation: 'fadeIn 0.22s ease'
          }}
        >
          {/* Absolute Floating Controls Header */}
          <div 
            style={{
              position: 'absolute',
              top: '24px',
              right: '24px',
              display: 'flex',
              gap: '12px',
              zIndex: 100000,
              pointerEvents: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <a 
              href={lightboxImg && lightboxImg.includes('res.cloudinary.com') ? lightboxImg.replace('/upload/', '/upload/fl_attachment/') : lightboxImg} 
              download={`DO_Audit_Attachment_${new Date().getTime()}.png`}
              title="Download Photo"
              style={{
                padding: '10px 20px',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                borderRadius: 'var(--radius-sm)',
                fontWeight: '700',
                fontSize: '0.84rem',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(0, 162, 232, 0.4)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Download size={16} />
              <span>Download Photo</span>
            </a>

            {/* Close Button */}
            <button 
              onClick={() => setLightboxImg(null)}
              style={{
                padding: '10px 18px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '0.84rem',
                gap: '6px',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)',
                transition: 'all 0.2s'
              }}
              title="Close View"
            >
              <X size={16} />
              <span>Close</span>
            </button>
          </div>

          {/* Image Wrapper */}
          <div 
            className="lightbox-content" 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              boxShadow: 'none',
              border: 'none',
              padding: 0
            }}
          >
            <img 
              src={lightboxImg} 
              alt="Enlarged Audit Attachment" 
              style={{
                display: 'block',
                maxWidth: '95vw',
                maxHeight: '85vh',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                border: '4px solid rgba(255,255,255,0.1)'
              }}
            />
          </div>
        </div>
      )}

      {/* 6. Detailed Data Profile Modal */}
      {selectedDetailLog && (
        <div className="profile-modal-overlay" onClick={() => setSelectedDetailLog(null)}>
          <div className="profile-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="profile-modal-header">
              <h3>
                <History size={20} color="var(--primary)" />
                <span>Log Details: {selectedDetailLog.reference_no || `ID: ${selectedDetailLog.id || selectedDetailLog.inward_id || selectedDetailLog.outward_id}`}</span>
              </h3>
              <button className="profile-modal-close-btn" onClick={() => setSelectedDetailLog(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="profile-modal-body">
              {/* Left Column: Data Fields */}
              <div className="profile-details-section">
                <div className="profile-group-card">
                  <div className="profile-group-title">Metadata & Warehouse</div>
                  <div className="profile-grid-list">
                    <div className="profile-item">
                      <span className="profile-label">Warehouse Facility</span>
                      <span className="profile-value">{selectedDetailLog.warehouse_name || '-'}</span>
                    </div>
                    <div className="profile-item">
                      <span className="profile-label">Recorded By Operator</span>
                      <span className="profile-value">{selectedDetailLog.operator_email || '-'}</span>
                    </div>
                    <div className="profile-item">
                      <span className="profile-label">Created Time</span>
                      <span className="profile-value">{formatDateTimeStr(selectedDetailLog.created_at || selectedDetailLog.inward_created_at || selectedDetailLog.outward_created_at)}</span>
                    </div>
                    <div className="profile-item">
                      <span className="profile-label">Last Updated Time</span>
                      <span
                        className="profile-value"
                        style={
                          getUpdateDiff(
                            selectedDetailLog.created_at || selectedDetailLog.inward_created_at || selectedDetailLog.outward_created_at,
                            selectedDetailLog.updated_at || selectedDetailLog.inward_updated_at || selectedDetailLog.outward_updated_at
                          )
                            ? { color: '#0284c7', fontWeight: '800' }
                            : undefined
                        }
                      >
                        {getUpdateDiff(
                          selectedDetailLog.created_at || selectedDetailLog.inward_created_at || selectedDetailLog.outward_created_at,
                          selectedDetailLog.updated_at || selectedDetailLog.inward_updated_at || selectedDetailLog.outward_updated_at
                        )
                          ? formatDateTimeStr(
                              selectedDetailLog.updated_at ||
                                selectedDetailLog.inward_updated_at ||
                                selectedDetailLog.outward_updated_at
                            )
                          : '-'}
                      </span>
                    </div>
                    {(Number(selectedDetailLog.update_count) > 0 || selectedDetailLog.update_details) && (
                      <div className="profile-item" style={{ gridColumn: 'span 2' }}>
                        <span className="profile-label" style={{ color: 'var(--primary)', fontWeight: '800' }}>Last Updated Details</span>
                        <span className="profile-value" style={{ fontWeight: '800', color: 'var(--text-dark)' }}>
                          Changed {Number(selectedDetailLog.update_count) > 0 ? selectedDetailLog.update_count : 1} {Number(selectedDetailLog.update_count) === 1 ? 'time' : 'times'}
                        </span>
                      </div>
                    )}
                    {selectedDetailLog.remarks || selectedDetailLog.inward_remarks || selectedDetailLog.outward_remarks ? (
                      <div className="profile-item" style={{ gridColumn: 'span 2' }}>
                        <span className="profile-label">Remarks</span>
                        <span className="profile-value profile-value-remarks">
                          {selectedDetailLog.remarks || selectedDetailLog.inward_remarks || selectedDetailLog.outward_remarks}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {detailType === 'daily' && (
                  <>
                    <div className="profile-group-card">
                      <div className="profile-group-title">General Information</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Date</span>
                          <span className="profile-value">{formatDateStr(selectedDetailLog.formatted_date || selectedDetailLog.entry_date)}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reference No</span>
                          <span 
                            className="profile-value"
                            onClick={() => {
                              if (selectedDetailLog.reference_no) {
                                navigator.clipboard.writeText(selectedDetailLog.reference_no);
                                setCopiedRef(selectedDetailLog.reference_no);
                                setTimeout(() => setCopiedRef(null), 1500);
                              }
                            }}
                            title="Click to copy Reference Number"
                            style={{ 
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: copiedRef === selectedDetailLog.reference_no ? '#10b981' : 'var(--text-dark)',
                              transition: 'color 0.2s ease'
                            }}
                          >
                            {selectedDetailLog.reference_no || '-'}
                            {selectedDetailLog.reference_no && (
                              copiedRef === selectedDetailLog.reference_no ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={10} style={{ opacity: 0.5 }} />
                              )
                            )}
                          </span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Chamber Name</span>
                          <span className="profile-value">{selectedDetailLog.chamber_name} ({selectedDetailLog.chamber_type || 'Frozen'})</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Client Name</span>
                          <span className="profile-value">{selectedDetailLog.client_name}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Box Count</span>
                          <span className="profile-value">{selectedDetailLog.box_count !== undefined && selectedDetailLog.box_count !== null ? `${selectedDetailLog.box_count} Boxes` : '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Temperature & Supervisor</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Box Temp</span>
                          <span className="profile-value">{selectedDetailLog.box_temp || selectedDetailLog.chamber_temp}°C</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Inspection Time</span>
                          <span className="profile-value">{selectedDetailLog.inspection_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Photo Capture Time</span>
                          <span className="profile-value">{selectedDetailLog.photo_capture_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Photo Location (GPS)</span>
                          <span className="profile-value">
                            <PhotoGpsLink
                              lat={selectedDetailLog.photo_capture_latitude}
                              lng={selectedDetailLog.photo_capture_longitude}
                              accuracy={selectedDetailLog.photo_capture_accuracy}
                            />
                          </span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Supervisor Name</span>
                          <span className="profile-value">{selectedDetailLog.monitor_supervisor_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Recorded Time variance</span>
                          <span className="profile-value">{selectedDetailLog.time_variance_minutes !== undefined ? `${selectedDetailLog.time_variance_minutes} mins` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Submission Delay (Overdue)</span>
                          <span className="profile-value" style={{ color: selectedDetailLog.overdue_time && selectedDetailLog.overdue_time !== 'same day' ? '#dc2626' : 'inherit', fontWeight: selectedDetailLog.overdue_time && selectedDetailLog.overdue_time !== 'same day' ? 'bold' : 'normal' }}>
                            {selectedDetailLog.overdue_time || 'same day'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {detailType === 'inward' && (
                  <>
                    <div className="profile-group-card">
                      <div className="profile-group-title">Vehicle & General Information</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Date</span>
                          <span className="profile-value">{formatDateStr(selectedDetailLog.inward_entry_date)}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reference No</span>
                          <span 
                            className="profile-value"
                            onClick={() => {
                              if (selectedDetailLog.reference_no) {
                                navigator.clipboard.writeText(selectedDetailLog.reference_no);
                                setCopiedRef(selectedDetailLog.reference_no);
                                setTimeout(() => setCopiedRef(null), 1500);
                              }
                            }}
                            title="Click to copy Reference Number"
                            style={{ 
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: copiedRef === selectedDetailLog.reference_no ? '#10b981' : 'var(--text-dark)',
                              transition: 'color 0.2s ease'
                            }}
                          >
                            {selectedDetailLog.reference_no || '-'}
                            {selectedDetailLog.reference_no && (
                              copiedRef === selectedDetailLog.reference_no ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={10} style={{ opacity: 0.5 }} />
                              )
                            )}
                          </span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Vehicle Number</span>
                          <span className="profile-value">{selectedDetailLog.inward_vehicle_no}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Client Name</span>
                          <span className="profile-value">{selectedDetailLog.inward_client_name}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Dock Number</span>
                          <span className="profile-value">{selectedDetailLog.inward_dock_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Seal Number</span>
                          <span className="profile-value">{selectedDetailLog.inward_seal_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Invoice No.</span>
                          <span className="profile-value">{selectedDetailLog.inward_invoice_no != null && String(selectedDetailLog.inward_invoice_no).trim() !== '' ? selectedDetailLog.inward_invoice_no : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Mens Power</span>
                          <span className="profile-value">{selectedDetailLog.inward_mens_power != null && selectedDetailLog.inward_mens_power !== '' ? selectedDetailLog.inward_mens_power : '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Temperature & Logistics Details</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Vehicle Temp</span>
                          <span className="profile-value">{selectedDetailLog.inward_vehicle_temp !== null ? `${selectedDetailLog.inward_vehicle_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Temp</span>
                          <span className="profile-value">{selectedDetailLog.inward_material_temp !== null ? `${selectedDetailLog.inward_material_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Pallets In Quantity</span>
                          <span className="profile-value">{selectedDetailLog.inward_pallets_in_qty || '0'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Type</span>
                          <span className="profile-value">{selectedDetailLog.inward_material_type || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading Supervisor</span>
                          <span className="profile-value">{selectedDetailLog.inward_unloading_supervisor_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Invoice / Received Qty</span>
                          <span className="profile-value">{selectedDetailLog.inward_invoice_qty || '0'} / {selectedDetailLog.inward_received_qty || '0'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Driver & Timing Info</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Transporter</span>
                          <span className="profile-value">{selectedDetailLog.inward_transporter_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Name</span>
                          <span className="profile-value">{selectedDetailLog.inward_driver_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Phone</span>
                          <span className="profile-value">{selectedDetailLog.inward_driver_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reporting Time</span>
                          <span className="profile-value">{selectedDetailLog.inward_vehicle_reporting_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading Start</span>
                          <span className="profile-value">{selectedDetailLog.inward_unloading_start_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading End</span>
                          <span className="profile-value">{selectedDetailLog.inward_unloading_end_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading Duration</span>
                          <span className="profile-value">
                            <strong>{formatDuration(selectedDetailLog.inward_unloading_duration_hours, selectedDetailLog.inward_unloading_duration_mins)}</strong>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <div>S: {selectedDetailLog.inward_unloading_start_time || '-'}</div>
                                <div>E: {selectedDetailLog.inward_unloading_end_time || '-'}</div>
                            </div>
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {detailType === 'outward' && (
                  <>
                    <div className="profile-group-card">
                      <div className="profile-group-title">Vehicle & General Information</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Date</span>
                          <span className="profile-value">{formatDateStr(selectedDetailLog.outward_entry_date)}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reference No</span>
                          <span 
                            className="profile-value"
                            onClick={() => {
                              if (selectedDetailLog.reference_no) {
                                navigator.clipboard.writeText(selectedDetailLog.reference_no);
                                setCopiedRef(selectedDetailLog.reference_no);
                                setTimeout(() => setCopiedRef(null), 1500);
                              }
                            }}
                            title="Click to copy Reference Number"
                            style={{ 
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: copiedRef === selectedDetailLog.reference_no ? '#10b981' : 'var(--text-dark)',
                              transition: 'color 0.2s ease'
                            }}
                          >
                            {selectedDetailLog.reference_no || '-'}
                            {selectedDetailLog.reference_no && (
                              copiedRef === selectedDetailLog.reference_no ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={10} style={{ opacity: 0.5 }} />
                              )
                            )}
                          </span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Vehicle Number</span>
                          <span className="profile-value">{selectedDetailLog.outward_vehicle_no}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Client Name</span>
                          <span className="profile-value">{selectedDetailLog.outward_client_name}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Dock Number</span>
                          <span className="profile-value">{selectedDetailLog.outward_dock_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Seal Number</span>
                          <span className="profile-value">{selectedDetailLog.outward_seal_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Invoice No.</span>
                          <span className="profile-value">{selectedDetailLog.outward_invoice_no != null && String(selectedDetailLog.outward_invoice_no).trim() !== '' ? selectedDetailLog.outward_invoice_no : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Mens Power</span>
                          <span className="profile-value">{selectedDetailLog.outward_mens_power != null && selectedDetailLog.outward_mens_power !== '' ? selectedDetailLog.outward_mens_power : '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Temperature & Logistics Details</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Pre-Cooling Temp</span>
                          <span className="profile-value">{selectedDetailLog.outward_pre_vehicle_temp !== null ? `${selectedDetailLog.outward_pre_vehicle_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Temp</span>
                          <span className="profile-value">{selectedDetailLog.outward_vehicle_temp !== null ? `${selectedDetailLog.outward_vehicle_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Temp</span>
                          <span className="profile-value">{selectedDetailLog.outward_material_temp !== null ? `${selectedDetailLog.outward_material_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Pallets Out Quantity</span>
                          <span className="profile-value">{selectedDetailLog.outward_pallets_in_qty || '0'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Type</span>
                          <span className="profile-value">{selectedDetailLog.outward_material_type || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Supervisor</span>
                          <span className="profile-value">{selectedDetailLog.outward_loading_supervisor_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Invoice / Loaded Qty</span>
                          <span className="profile-value">{selectedDetailLog.outward_invoice_qty || '0'} / {selectedDetailLog.outward_received_qty || '0'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Driver & Timing Info</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Transporter</span>
                          <span className="profile-value">{selectedDetailLog.outward_transporter_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Name</span>
                          <span className="profile-value">{selectedDetailLog.outward_driver_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Phone</span>
                          <span className="profile-value">{selectedDetailLog.outward_driver_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reporting Time</span>
                          <span className="profile-value">{selectedDetailLog.outward_vehicle_reporting_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Start</span>
                          <span className="profile-value">{selectedDetailLog.outward_loading_start_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading End</span>
                          <span className="profile-value">{selectedDetailLog.outward_loading_end_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Duration</span>
                          <span className="profile-value">
                            <strong>{formatDuration(selectedDetailLog.outward_loading_duration_hours, selectedDetailLog.outward_loading_duration_mins)}</strong>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <div>S: {selectedDetailLog.outward_loading_start_time || '-'}</div>
                                <div>E: {selectedDetailLog.outward_loading_end_time || '-'}</div>
                            </div>
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {(detailType === 'inward' || detailType === 'outward') && (
                <PhotoCaptureMetaPanel metadata={selectedDetailLog.photo_capture_metadata} />
              )}

              {/* Right Column: Uploaded Photos & Files */}
              <div className="profile-photos-section">
                <h4>Uploaded Audit Attachment Photos</h4>
                
                {/* Check if any photos exist */}
                {((detailType === 'daily' && selectedDetailLog.temp_sensor_image) ||
                  detailType === 'inward' ||
                  detailType === 'outward') ? (
                  <div className="profile-photo-grid">
                    {/* Render Chamber Logs Photo */}
                    {detailType === 'daily' && selectedDetailLog.temp_sensor_image && (
                      <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.temp_sensor_image.startsWith('data:') || /^https?:\/\//i.test(selectedDetailLog.temp_sensor_image) ? selectedDetailLog.temp_sensor_image : `/${selectedDetailLog.temp_sensor_image}`)}>
                        <div className="profile-photo-wrapper">
                          <img src={selectedDetailLog.temp_sensor_image.startsWith('data:') || /^https?:\/\//i.test(selectedDetailLog.temp_sensor_image) ? selectedDetailLog.temp_sensor_image : `/${selectedDetailLog.temp_sensor_image}`} alt="Temp Sensor" />
                        </div>
                        <div className="profile-photo-label">Temp Sensor</div>
                      </div>
                    )}

                    {/* Render Inward Logs Photos */}
                    {detailType === 'inward' && (
                      <>
                        {selectedDetailLog.inward_invoice_photos && selectedDetailLog.inward_invoice_photos.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`iinv-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(img.startsWith('data:') ? img : `/${img}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={img.startsWith('data:') ? img : `/${img}`} alt={`Invoice ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Invoice Photo' : `Invoice #${idx + 1}`}</div>
                          </div>
                        ))}
                        <UpdatablePodPhoto
                          type="inward"
                          recordId={selectedDetailLog.inward_id}
                          photoPath={selectedDetailLog.inward_pod_photo}
                          onPreview={setLightboxImg}
                          onUpdated={({ photoPath, update_details, updated_at, update_count }) => {
                            setSelectedDetailLog((prev) => ({
                              ...prev,
                              inward_pod_photo: photoPath,
                              update_details: update_details || prev.update_details,
                              update_count: update_count ?? (Number(prev.update_count) || 0) + 1,
                              inward_updated_at: updated_at || prev.inward_updated_at
                            }));
                            setInwardLogs((prev) =>
                              prev.map((row) =>
                                row.inward_id === selectedDetailLog.inward_id
                                  ? {
                                      ...row,
                                      inward_pod_photo: photoPath,
                                      update_details: update_details || row.update_details,
                                      update_count: update_count ?? (Number(row.update_count) || 0) + 1
                                    }
                                  : row
                              )
                            );
                          }}
                        />
                        {selectedDetailLog.inward_vehicle_seal_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.inward_vehicle_seal_photo.startsWith('data:') ? selectedDetailLog.inward_vehicle_seal_photo : `/${selectedDetailLog.inward_vehicle_seal_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.inward_vehicle_seal_photo.startsWith('data:') ? selectedDetailLog.inward_vehicle_seal_photo : `/${selectedDetailLog.inward_vehicle_seal_photo}`} alt="Vehicle Seal" />
                            </div>
                            <div className="profile-photo-label">Vehicle Seal</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_vehicle_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.inward_vehicle_temp_photo.startsWith('data:') ? selectedDetailLog.inward_vehicle_temp_photo : `/${selectedDetailLog.inward_vehicle_temp_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.inward_vehicle_temp_photo.startsWith('data:') ? selectedDetailLog.inward_vehicle_temp_photo : `/${selectedDetailLog.inward_vehicle_temp_photo}`} alt="Vehicle Temp" />
                            </div>
                            <div className="profile-photo-label">Vehicle Temp</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_material_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.inward_material_temp_photo.startsWith('data:') ? selectedDetailLog.inward_material_temp_photo : `/${selectedDetailLog.inward_material_temp_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.inward_material_temp_photo.startsWith('data:') ? selectedDetailLog.inward_material_temp_photo : `/${selectedDetailLog.inward_material_temp_photo}`} alt="Material Temp" />
                            </div>
                            <div className="profile-photo-label">Material Temp</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_vehicle_back_side_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.inward_vehicle_back_side_photo.startsWith('data:') ? selectedDetailLog.inward_vehicle_back_side_photo : `/${selectedDetailLog.inward_vehicle_back_side_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.inward_vehicle_back_side_photo.startsWith('data:') ? selectedDetailLog.inward_vehicle_back_side_photo : `/${selectedDetailLog.inward_vehicle_back_side_photo}`} alt="Vehicle Back" />
                            </div>
                            <div className="profile-photo-label">Vehicle Back</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_vehicle_back_side_photo_with_material && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.inward_vehicle_back_side_photo_with_material.startsWith('data:') ? selectedDetailLog.inward_vehicle_back_side_photo_with_material : `/${selectedDetailLog.inward_vehicle_back_side_photo_with_material}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.inward_vehicle_back_side_photo_with_material.startsWith('data:') ? selectedDetailLog.inward_vehicle_back_side_photo_with_material : `/${selectedDetailLog.inward_vehicle_back_side_photo_with_material}`} alt="Vehicle Back Load" />
                            </div>
                            <div className="profile-photo-label">Vehicle Loaded</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_count_sheet_photo && selectedDetailLog.inward_count_sheet_photo.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`ics-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(img.startsWith('data:') ? img : `/${img}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={img.startsWith('data:') ? img : `/${img}`} alt={`Count Sheet ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Count Sheet' : `Count Sheet #${idx + 1}`}</div>
                          </div>
                        ))}
                        {selectedDetailLog.inward_damage_boxes_photo && selectedDetailLog.inward_damage_boxes_photo.split(',').map((dmgImg, idx) => (
                          <div key={idx} className="profile-photo-card" onClick={() => setLightboxImg(dmgImg.startsWith('data:') ? dmgImg : `/${dmgImg}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={dmgImg.startsWith('data:') ? dmgImg : `/${dmgImg}`} alt={`Damage ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">Damage #{idx + 1}</div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Render Outward Logs Photos */}
                    {detailType === 'outward' && (
                      <>
                        {selectedDetailLog.outward_invoice_photos && selectedDetailLog.outward_invoice_photos.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`oinv-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(img.startsWith('data:') ? img : `/${img}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={img.startsWith('data:') ? img : `/${img}`} alt={`Invoice ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Invoice Photo' : `Invoice #${idx + 1}`}</div>
                          </div>
                        ))}
                        <UpdatablePodPhoto
                          type="outward"
                          recordId={selectedDetailLog.outward_id}
                          photoPath={selectedDetailLog.outward_pod_photo}
                          onPreview={setLightboxImg}
                          onUpdated={({ photoPath, update_details, updated_at, update_count }) => {
                            setSelectedDetailLog((prev) => ({
                              ...prev,
                              outward_pod_photo: photoPath,
                              update_details: update_details || prev.update_details,
                              update_count: update_count ?? (Number(prev.update_count) || 0) + 1,
                              outward_updated_at: updated_at || prev.outward_updated_at
                            }));
                            setOutwardLogs((prev) =>
                              prev.map((row) =>
                                row.outward_id === selectedDetailLog.outward_id
                                  ? {
                                      ...row,
                                      outward_pod_photo: photoPath,
                                      update_details: update_details || row.update_details,
                                      update_count: update_count ?? (Number(row.update_count) || 0) + 1
                                    }
                                  : row
                              )
                            );
                          }}
                        />
                        {selectedDetailLog.outward_vehicle_seal_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.outward_vehicle_seal_photo.startsWith('data:') ? selectedDetailLog.outward_vehicle_seal_photo : `/${selectedDetailLog.outward_vehicle_seal_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.outward_vehicle_seal_photo.startsWith('data:') ? selectedDetailLog.outward_vehicle_seal_photo : `/${selectedDetailLog.outward_vehicle_seal_photo}`} alt="Vehicle Seal" />
                            </div>
                            <div className="profile-photo-label">Vehicle Seal</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_pre_vehicle_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.outward_pre_vehicle_temp_photo.startsWith('data:') ? selectedDetailLog.outward_pre_vehicle_temp_photo : `/${selectedDetailLog.outward_pre_vehicle_temp_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.outward_pre_vehicle_temp_photo.startsWith('data:') ? selectedDetailLog.outward_pre_vehicle_temp_photo : `/${selectedDetailLog.outward_pre_vehicle_temp_photo}`} alt="Pre vehicle temp" />
                            </div>
                            <div className="profile-photo-label">Pre-Cooling Temp</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_vehicle_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.outward_vehicle_temp_photo.startsWith('data:') ? selectedDetailLog.outward_vehicle_temp_photo : `/${selectedDetailLog.outward_vehicle_temp_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.outward_vehicle_temp_photo.startsWith('data:') ? selectedDetailLog.outward_vehicle_temp_photo : `/${selectedDetailLog.outward_vehicle_temp_photo}`} alt="Vehicle Temp" />
                            </div>
                            <div className="profile-photo-label">Vehicle Temp</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_material_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.outward_material_temp_photo.startsWith('data:') ? selectedDetailLog.outward_material_temp_photo : `/${selectedDetailLog.outward_material_temp_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.outward_material_temp_photo.startsWith('data:') ? selectedDetailLog.outward_material_temp_photo : `/${selectedDetailLog.outward_material_temp_photo}`} alt="Material Temp" />
                            </div>
                            <div className="profile-photo-label">Material Temp</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_vehicle_back_side_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.outward_vehicle_back_side_photo.startsWith('data:') ? selectedDetailLog.outward_vehicle_back_side_photo : `/${selectedDetailLog.outward_vehicle_back_side_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.outward_vehicle_back_side_photo.startsWith('data:') ? selectedDetailLog.outward_vehicle_back_side_photo : `/${selectedDetailLog.outward_vehicle_back_side_photo}`} alt="Vehicle Back" />
                            </div>
                            <div className="profile-photo-label">Vehicle Back</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_vehicle_back_side_photo_with_material && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(selectedDetailLog.outward_vehicle_back_side_photo_with_material.startsWith('data:') ? selectedDetailLog.outward_vehicle_back_side_photo_with_material : `/${selectedDetailLog.outward_vehicle_back_side_photo_with_material}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={selectedDetailLog.outward_vehicle_back_side_photo_with_material.startsWith('data:') ? selectedDetailLog.outward_vehicle_back_side_photo_with_material : `/${selectedDetailLog.outward_vehicle_back_side_photo_with_material}`} alt="Vehicle Back Load" />
                            </div>
                            <div className="profile-photo-label">Vehicle Loaded</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_count_sheet_photo && selectedDetailLog.outward_count_sheet_photo.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`ocs-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(img.startsWith('data:') ? img : `/${img}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={img.startsWith('data:') ? img : `/${img}`} alt={`Count Sheet ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Count Sheet' : `Count Sheet #${idx + 1}`}</div>
                          </div>
                        ))}
                        {selectedDetailLog.outward_damage_boxes_photo && selectedDetailLog.outward_damage_boxes_photo.split(',').map((dmgImg, idx) => (
                          <div key={idx} className="profile-photo-card" onClick={() => setLightboxImg(dmgImg.startsWith('data:') ? dmgImg : `/${dmgImg}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={dmgImg.startsWith('data:') ? dmgImg : `/${dmgImg}`} alt={`Damage ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">Damage #{idx + 1}</div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', backgroundColor: 'var(--bg-main)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
                    No audit attachment photos uploaded for this record.
                  </div>
                )}
              </div>
            </div>

            <div className="profile-modal-body" style={{ gridTemplateColumns: '1fr', padding: '0 24px 24px 24px' }}>
              
            </div>

            <div className="profile-modal-footer">
              <button className="profile-close-btn" onClick={() => setSelectedDetailLog(null)}>Close View</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Permission Verification & Request Modal */}
      {permissionModalData.isOpen && (
        <div className="lightbox-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: '450px', width: '90%', padding: '24px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#ffffff', borderRadius: 'var(--radius-lg)', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} color="#eab308" />
                <span>Permission Required</span>
              </h3>
              <button 
                onClick={() => setPermissionModalData(prev => ({ ...prev, isOpen: false }))} 
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              <p style={{ fontWeight: '700', color: '#b45309', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', padding: '12px', borderRadius: 'var(--radius-sm)', margin: '0 0 14px 0' }}>
                If you want to {permissionModalData.action === 'Delete' ? 'delete' : 'edit'} this data, first get permission from admin.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: 'var(--bg-main)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '14px' }}>
                <div><strong>Record Type:</strong> {permissionModalData.recordType} DO Log</div>
                <div><strong>Record ID:</strong> #{permissionModalData.recordId}</div>
                <div><strong>Action Attempted:</strong> {permissionModalData.action || 'Edit'}</div>
                <div><strong>Current Request Status:</strong> 
                  <span style={{ 
                    marginLeft: '6px', 
                    fontWeight: 800, 
                    color: permissionModalData.status === 'Pending' ? '#ca8a04' : (permissionModalData.status === 'Denied' ? '#dc2626' : '#16a34a') 
                  }}>
                    {permissionModalData.status === 'None' ? 'Not Requested' : permissionModalData.status}
                  </span>
                </div>
              </div>

              {permissionModalData.status === 'Pending' ? (
                <p style={{ fontWeight: '600', color: '#ca8a04', margin: 0 }}>
                  Your request is already pending admin approval. Please wait for the admin to grant access.
                </p>
              ) : (
                <p style={{ fontWeight: '600', color: 'var(--text-dark)', margin: 0 }}>
                  Do you want to send a {permissionModalData.action === 'Delete' ? 'delete' : 'edit'} request to the admin?
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button 
                type="button" 
                onClick={() => setPermissionModalData(prev => ({ ...prev, isOpen: false }))} 
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  backgroundColor: '#ffffff',
                  color: 'var(--text-dark)',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Back
              </button>

              {(permissionModalData.status === 'None' || permissionModalData.status === 'Denied') && (
                <button 
                  type="button" 
                  onClick={handleRequestPermission}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    backgroundColor: '#ea580c',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(234, 88, 12, 0.25)'
                  }}
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
