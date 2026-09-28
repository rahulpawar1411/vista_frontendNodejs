// ====================================================================
// DO Profile Lookup Portal (src/pages/DOProfileLookup/DOProfileLookup.jsx)
// Paired with: src/pages/DOProfileLookup/DOProfileLookup.css
// Allows Data Operators to search across all logs and view profiles with Edit/Delete workflows.
// ====================================================================

import React, { useState } from 'react';
import { 
  Search, Calendar, Trash2, X, Eye, Thermometer, ArrowDownLeft, ArrowUpRight, 
  Loader2, AlertCircle, Edit, Download, Copy, Check, History, Lock
} from 'lucide-react';
import { 
  fetchChamberLogs, deleteChamberLog, 
  fetchInwardLogs, deleteInwardLog, 
  fetchOutwardLogs, deleteOutwardLog,
  checkEditPermission, requestEditPermission
} from '../../services/api';
import UpdatablePodPhoto from '../../components/UpdatablePodPhoto/UpdatablePodPhoto';
import './DOProfileLookup.css';

export default function DOProfileLookup({ setActiveDOMenu, setEditInwardData, setEditOutwardData, setEditDailyData }) {
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
  
  const [lookupQuery, setLookupQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedRef, setCopiedRef] = useState(null);
  const [lightboxImg, setLightboxImg] = useState(null);
  
  // Selected profile details states
  const [searchedRecord, setSearchedRecord] = useState(null);
  const [searchedRecordType, setSearchedRecordType] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Permission Request States
  const [permissionModalData, setPermissionModalData] = useState({
    isOpen: false,
    recordType: '',
    recordId: null,
    log: null,
    action: 'Edit',
    status: 'None',
    proceedWithAction: null
  });

  const handleLookupSearch = async (options = { autoOpenSingle: true }) => {
    const q = lookupQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchedRecord(null);
      setSearchedRecordType('');
      return;
    }

    setLoading(true);
    try {
      const searchOpts = { paginated: true, search: q, page: 1, limit: 100 };
      const [chamberRes, inwardRes, outwardRes] = await Promise.all([
        fetchChamberLogs('', searchOpts),
        fetchInwardLogs('', searchOpts),
        fetchOutwardLogs('', searchOpts)
      ]);

      const results = [];
      const qLower = q.toLowerCase();

      (chamberRes.items || []).forEach((log) => {
        const dateStr = log.formatted_date || (log.entry_date ? String(log.entry_date).split('T')[0] : '');
        results.push({
          id: `daily-${log.id}`,
          type: 'daily',
          title: `Daily Chamber Log - ${log.chamber_name}`,
          refNo: log.reference_no,
          date: dateStr,
          client: log.client_name,
          details: `Temp: ${log.chamber_temp}°C | Supervisor: ${log.monitor_supervisor_name || '-'}`,
          original: log
        });
      });

      (inwardRes.items || []).forEach((log) => {
        const dateStr = log.inward_entry_date ? String(log.inward_entry_date).split('T')[0] : '';
        results.push({
          id: `inward-${log.inward_id}`,
          type: 'inward',
          title: `Inward Shipment - ${log.inward_vehicle_no}`,
          refNo: log.reference_no,
          date: dateStr,
          client: log.inward_client_name,
          details: `Pallets: ${log.inward_pallets_in_qty || 0} | Supervisor: ${log.inward_unloading_supervisor_name || '-'}`,
          original: log
        });
      });

      (outwardRes.items || []).forEach((log) => {
        const dateStr = log.outward_entry_date ? String(log.outward_entry_date).split('T')[0] : '';
        results.push({
          id: `outward-${log.outward_id}`,
          type: 'outward',
          title: `Outward Shipment - ${log.outward_vehicle_no}`,
          refNo: log.reference_no,
          date: dateStr,
          client: log.outward_client_name,
          details: `Pallets: ${log.outward_pallets_in_qty || 0} | Supervisor: ${log.outward_loading_supervisor_name || '-'}`,
          original: log
        });
      });

      // Stable sort: ref match first when server returns broad LIKE matches
      results.sort((a, b) => {
        const aRef = (a.refNo || '').toLowerCase().includes(qLower) ? 0 : 1;
        const bRef = (b.refNo || '').toLowerCase().includes(qLower) ? 0 : 1;
        return aRef - bRef;
      });

      setSearchResults(results);

      if (options.autoOpenSingle && results.length === 1) {
        setSearchedRecord(results[0].original);
        setSearchedRecordType(results[0].type);
      } else {
        setSearchedRecord(null);
        setSearchedRecordType('');
      }
    } catch (err) {
      console.error('Lookup search failed:', err);
      alert(err.message || 'Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const backToSearchResults = () => {
    setSearchedRecord(null);
    setSearchedRecordType('');
  };

  // Safe Split date formatter
  const formatDateStr = (dateVal) => {
    if (!dateVal) return '-';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return dateVal;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    } catch {
      return dateVal;
    }
  };

  const formatDateTimeStr = (dateVal) => {
    if (!dateVal) return '-';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return dateVal;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
    } catch {
      return dateVal;
    }
  };

  const getUpdateDiff = (created, updated) => {
    if (!created || !updated) return false;
    const cTime = Math.floor(new Date(created).getTime() / 1000);
    const uTime = Math.floor(new Date(updated).getTime() / 1000);
    return uTime > cTime;
  };

  // Handle Edit Actions
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
          proceedWithAction: proceedWithEdit
        });
      }
    } catch (err) {
      console.error(err);
      alert('Error verifying edit permissions. Please try again.');
    }
  };

  // Handle Delete Actions
  const handleDeleteLog = async (log, recordType) => {
    const id = recordType === 'Chamber' ? log.id : (recordType === 'Inward' ? log.inward_id : log.outward_id);
    try {
      const res = await checkEditPermission(recordType, id, 'Delete');
      if (res.approved) {
        if (!window.confirm("Are you sure you want to delete this log entry?")) return;
        setLoading(true);
        if (recordType === 'Chamber') {
          await deleteChamberLog(id);
        } else if (recordType === 'Inward') {
          await deleteInwardLog(id);
        } else if (recordType === 'Outward') {
          await deleteOutwardLog(id);
        }
        setSearchedRecord(null);
        setSearchResults([]);
        setLookupQuery('');
      } else {
        setPermissionModalData({
          isOpen: true,
          recordType,
          recordId: id,
          log,
          action: 'Delete',
          status: res.status || 'None',
          proceedWithAction: async () => {
            setLoading(true);
            if (recordType === 'Chamber') {
              await deleteChamberLog(id);
            } else if (recordType === 'Inward') {
              await deleteInwardLog(id);
            } else if (recordType === 'Outward') {
              await deleteOutwardLog(id);
            }
            setSearchedRecord(null);
            setSearchResults([]);
            setLookupQuery('');
          }
        });
      }
    } catch (err) {
      console.error(err);
      alert('Error verifying delete permissions. Please try again.');
    }
  };

  // Handle Request Permission Submission
  const handleRequestPermission = async () => {
    try {
      const { recordType, recordId, action, log } = permissionModalData;
      const actionLabel = action === 'Delete' ? 'delete' : 'edit';
      
      let extraDetails = '';
      if (log) {
        if (recordType === 'Chamber') {
          const client = log.client_name || 'N/A';
          extraDetails = ` | Client: ${client} | Chamber: ${log.chamber_name || 'N/A'} | Temp: ${log.chamber_temp || 'N/A'}°C`;
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

  return (
    <div className="temp-monitor-page do-history-page">
      <div className="do-header-banner">
        <div className="do-header-left">
          <h2>
            <Search size={26} color="#00a2e8" />
            <span>Profile Lookup Portal</span>
          </h2>
          <p>Search across Daily Chamber Logs, Inwards, and Outwards to inspect data profiles, edit or delete entries under strict admin permissions.</p>
        </div>
      </div>

      <div className="diagnostics-card" style={{ padding: '24px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Search Input Controls */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 12px', flex: 1, backgroundColor: 'var(--bg-main)' }}
            title="Search matches: Reference Number, Date, Vehicle Number, Client Name, Supervisor"
          >
            <Search size={16} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Search by Ref No, Vehicle No, Client Name, Date..."
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLookupSearch();
              }}
              style={{ width: '100%', padding: '10px 0', border: 'none', outline: 'none', backgroundColor: 'transparent', fontSize: '0.85rem', color: 'var(--text-dark)' }}
            />
          </div>
          <button 
            onClick={handleLookupSearch}
            style={{ padding: '10px 22px', backgroundColor: 'var(--primary)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Search Profile
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={24} className="spinner-icon" color="#00a2e8" style={{ margin: '0 auto 10px auto' }} />
            <span>Searching database logs...</span>
          </div>
        ) : searchedRecord ? (
          
          /* DETAILED SINGLE PROFILE RECORD */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <button
                type="button"
                onClick={backToSearchResults}
                style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 'var(--radius-sm)', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-dark)' }}
              >
                ← Back to Search Results
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => {
                    const actionType = searchedRecordType === 'daily' ? 'Chamber' : (searchedRecordType === 'inward' ? 'Inward' : 'Outward');
                    handleEditAttempt(actionType, searchedRecord, () => {
                      if (searchedRecordType === 'daily') {
                        setEditDailyData(searchedRecord);
                        setActiveDOMenu('All');
                      } else if (searchedRecordType === 'inward') {
                        setEditInwardData(searchedRecord);
                        setActiveDOMenu('Inward');
                      } else if (searchedRecordType === 'outward') {
                        setEditOutwardData(searchedRecord);
                        setActiveDOMenu('Outward');
                      }
                    });
                  }}
                  style={{ padding: '8px 14px', backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', color: '#0369a1', borderRadius: 'var(--radius-sm)', fontWeight: '700', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                >
                  <Edit size={14} />
                  <span>Edit Profile</span>
                </button>
                <button 
                  onClick={() => {
                    const actionType = searchedRecordType === 'daily' ? 'Chamber' : (searchedRecordType === 'inward' ? 'Inward' : 'Outward');
                    handleDeleteLog(searchedRecord, actionType);
                  }}
                  style={{ padding: '8px 14px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 'var(--radius-sm)', fontWeight: '700', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                >
                  <Trash2 size={14} />
                  <span>Delete Profile</span>
                </button>
              </div>
            </div>

            <div className="profile-modal-body" style={{ padding: '0', animation: 'fadeIn 0.2s' }}>
              <div className="profile-details-section">
                <div className="profile-group-card">
                  <div className="profile-group-title">Warehouse & Audit Operator Info</div>
                  <div className="profile-grid-list">
                    <div className="profile-item">
                      <span className="profile-label">Warehouse facility</span>
                      <span className="profile-value">{searchedRecord.warehouse_name || 'Generic'}</span>
                    </div>
                    <div className="profile-item">
                      <span className="profile-label">Recorded By Operator</span>
                      <span className="profile-value">{searchedRecord.operator_email || '-'}</span>
                    </div>
                    <div className="profile-item">
                      <span className="profile-label">Created Time</span>
                      <span className="profile-value">{formatDateTimeStr(searchedRecord.created_at || searchedRecord.inward_created_at || searchedRecord.outward_created_at)}</span>
                    </div>
                    <div className="profile-item">
                      <span className="profile-label">Last Updated Time</span>
                      <span
                        className="profile-value"
                        style={
                          getUpdateDiff(
                            searchedRecord.created_at || searchedRecord.inward_created_at || searchedRecord.outward_created_at,
                            searchedRecord.updated_at || searchedRecord.inward_updated_at || searchedRecord.outward_updated_at
                          )
                            ? { color: '#0284c7', fontWeight: '800' }
                            : undefined
                        }
                      >
                        {getUpdateDiff(
                          searchedRecord.created_at || searchedRecord.inward_created_at || searchedRecord.outward_created_at,
                          searchedRecord.updated_at || searchedRecord.inward_updated_at || searchedRecord.outward_updated_at
                        )
                          ? formatDateTimeStr(
                              searchedRecord.updated_at ||
                                searchedRecord.inward_updated_at ||
                                searchedRecord.outward_updated_at
                            )
                          : '-'}
                      </span>
                    </div>
                    {(Number(searchedRecord.update_count) > 0 || searchedRecord.update_details) && (
                      <div className="profile-item" style={{ gridColumn: 'span 2' }}>
                        <span className="profile-label" style={{ color: 'var(--primary)', fontWeight: '800' }}>Last Updated Details</span>
                        <span className="profile-value" style={{ fontWeight: '800', color: 'var(--text-dark)' }}>
                          Changed {Number(searchedRecord.update_count) > 0 ? searchedRecord.update_count : 1} {Number(searchedRecord.update_count) === 1 ? 'time' : 'times'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {searchedRecordType === 'daily' && (
                  <>
                    <div className="profile-group-card">
                      <div className="profile-group-title">General Information</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Date</span>
                          <span className="profile-value">{formatDateStr(searchedRecord.formatted_date || searchedRecord.entry_date)}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reference No</span>
                          <span 
                            className="profile-value"
                            onClick={() => {
                              if (searchedRecord.reference_no) {
                                navigator.clipboard.writeText(searchedRecord.reference_no);
                                setCopiedRef(searchedRecord.reference_no);
                                setTimeout(() => setCopiedRef(null), 1500);
                              }
                            }}
                            title="Click to copy Reference Number"
                            style={{ 
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: copiedRef === searchedRecord.reference_no ? '#10b981' : 'var(--text-dark)',
                              transition: 'color 0.2s ease'
                            }}
                          >
                            {searchedRecord.reference_no || '-'}
                            {searchedRecord.reference_no && (
                              copiedRef === searchedRecord.reference_no ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={10} style={{ opacity: 0.5 }} />
                              )
                            )}
                          </span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Chamber Name</span>
                          <span className="profile-value">{searchedRecord.chamber_name}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Client Name</span>
                          <span className="profile-value">{searchedRecord.client_name}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Temperature & Supervisor</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Chamber Temp</span>
                          <span className="profile-value">{searchedRecord.chamber_temp}°C</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Inspection Time</span>
                          <span className="profile-value">{searchedRecord.inspection_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Supervisor Name</span>
                          <span className="profile-value">{searchedRecord.monitor_supervisor_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Recorded Time variance</span>
                          <span className="profile-value">{searchedRecord.time_variance_minutes !== undefined ? `${searchedRecord.time_variance_minutes} mins` : '-'}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {searchedRecordType === 'inward' && (
                  <>
                    <div className="profile-group-card">
                      <div className="profile-group-title">Vehicle & General Information</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Date</span>
                          <span className="profile-value">{formatDateStr(searchedRecord.inward_entry_date)}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reference No</span>
                          <span 
                            className="profile-value"
                            onClick={() => {
                              if (searchedRecord.reference_no) {
                                navigator.clipboard.writeText(searchedRecord.reference_no);
                                setCopiedRef(searchedRecord.reference_no);
                                setTimeout(() => setCopiedRef(null), 1500);
                              }
                            }}
                            title="Click to copy Reference Number"
                            style={{ 
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: copiedRef === searchedRecord.reference_no ? '#10b981' : 'var(--text-dark)',
                              transition: 'color 0.2s ease'
                            }}
                          >
                            {searchedRecord.reference_no || '-'}
                            {searchedRecord.reference_no && (
                              copiedRef === searchedRecord.reference_no ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={10} style={{ opacity: 0.5 }} />
                              )
                            )}
                          </span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Vehicle Number</span>
                          <span className="profile-value">{searchedRecord.inward_vehicle_no}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Client Name</span>
                          <span className="profile-value">{searchedRecord.inward_client_name}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Dock Number</span>
                          <span className="profile-value">{searchedRecord.inward_dock_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Seal Number</span>
                          <span className="profile-value">{searchedRecord.inward_seal_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Invoice No.</span>
                          <span className="profile-value">{searchedRecord.inward_invoice_no != null && String(searchedRecord.inward_invoice_no).trim() !== '' ? searchedRecord.inward_invoice_no : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Mens Power</span>
                          <span className="profile-value">{searchedRecord.inward_mens_power != null && searchedRecord.inward_mens_power !== '' ? searchedRecord.inward_mens_power : '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Temperature & Logistics Details</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Vehicle Temp</span>
                          <span className="profile-value">{searchedRecord.inward_vehicle_temp !== null ? `${searchedRecord.inward_vehicle_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Temp</span>
                          <span className="profile-value">{searchedRecord.inward_material_temp !== null ? `${searchedRecord.inward_material_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Pallets In Quantity</span>
                          <span className="profile-value">{searchedRecord.inward_pallets_in_qty || '0'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Type</span>
                          <span className="profile-value">{searchedRecord.inward_material_type || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading Supervisor</span>
                          <span className="profile-value">{searchedRecord.inward_unloading_supervisor_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Invoice / Received Qty</span>
                          <span className="profile-value">{searchedRecord.inward_invoice_qty || '0'} / {searchedRecord.inward_received_qty || '0'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Driver & Timing Info</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Transporter</span>
                          <span className="profile-value">{searchedRecord.inward_transporter_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Name</span>
                          <span className="profile-value">{searchedRecord.inward_driver_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Phone</span>
                          <span className="profile-value">{searchedRecord.inward_driver_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reporting Time</span>
                          <span className="profile-value">{searchedRecord.inward_vehicle_reporting_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading Start</span>
                          <span className="profile-value">{searchedRecord.inward_unloading_start_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading End</span>
                          <span className="profile-value">{searchedRecord.inward_unloading_end_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading Duration</span>
                          <span className="profile-value">
                            <strong>{formatDuration(searchedRecord.inward_unloading_duration_hours, searchedRecord.inward_unloading_duration_mins)}</strong>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <div>S: {searchedRecord.inward_unloading_start_time || '-'}</div>
                                <div>E: {searchedRecord.inward_unloading_end_time || '-'}</div>
                            </div>
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {searchedRecordType === 'outward' && (
                  <>
                    <div className="profile-group-card">
                      <div className="profile-group-title">Vehicle & General Information</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Date</span>
                          <span className="profile-value">{formatDateStr(searchedRecord.outward_entry_date)}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reference No</span>
                          <span 
                            className="profile-value"
                            onClick={() => {
                              if (searchedRecord.reference_no) {
                                navigator.clipboard.writeText(searchedRecord.reference_no);
                                setCopiedRef(searchedRecord.reference_no);
                                setTimeout(() => setCopiedRef(null), 1500);
                              }
                            }}
                            title="Click to copy Reference Number"
                            style={{ 
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: copiedRef === searchedRecord.reference_no ? '#10b981' : 'var(--text-dark)',
                              transition: 'color 0.2s ease'
                            }}
                          >
                            {searchedRecord.reference_no || '-'}
                            {searchedRecord.reference_no && (
                              copiedRef === searchedRecord.reference_no ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={10} style={{ opacity: 0.5 }} />
                              )
                            )}
                          </span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Vehicle Number</span>
                          <span className="profile-value">{searchedRecord.outward_vehicle_no}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Client Name</span>
                          <span className="profile-value">{searchedRecord.outward_client_name}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Dock Number</span>
                          <span className="profile-value">{searchedRecord.outward_dock_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Seal Number</span>
                          <span className="profile-value">{searchedRecord.outward_seal_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Invoice No.</span>
                          <span className="profile-value">{searchedRecord.outward_invoice_no != null && String(searchedRecord.outward_invoice_no).trim() !== '' ? searchedRecord.outward_invoice_no : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Mens Power</span>
                          <span className="profile-value">{searchedRecord.outward_mens_power != null && searchedRecord.outward_mens_power !== '' ? searchedRecord.outward_mens_power : '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Temperature & Logistics Details</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Pre vehicle Temp</span>
                          <span className="profile-value">{searchedRecord.outward_pre_vehicle_temp !== null ? `${searchedRecord.outward_pre_vehicle_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Temp</span>
                          <span className="profile-value">{searchedRecord.outward_material_temp !== null ? `${searchedRecord.outward_material_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Pallets Out Quantity</span>
                          <span className="profile-value">{searchedRecord.outward_pallets_in_qty || '0'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Type</span>
                          <span className="profile-value">{searchedRecord.outward_material_type || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Supervisor</span>
                          <span className="profile-value">{searchedRecord.outward_loading_supervisor_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Invoice / Loaded Qty</span>
                          <span className="profile-value">{searchedRecord.outward_invoice_qty || '0'} / {searchedRecord.outward_received_qty || '0'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Driver & Timing Info</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Transporter</span>
                          <span className="profile-value">{searchedRecord.outward_transporter_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Name</span>
                          <span className="profile-value">{searchedRecord.outward_driver_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Phone</span>
                          <span className="profile-value">{searchedRecord.outward_driver_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reporting Time</span>
                          <span className="profile-value">{searchedRecord.outward_vehicle_reporting_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Start</span>
                          <span className="profile-value">{searchedRecord.outward_loading_start_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading End</span>
                          <span className="profile-value">{searchedRecord.outward_loading_end_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Duration</span>
                          <span className="profile-value">
                            <strong>{formatDuration(searchedRecord.outward_loading_duration_hours, searchedRecord.outward_loading_duration_mins)}</strong>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <div>S: {searchedRecord.outward_loading_start_time || '-'}</div>
                                <div>E: {searchedRecord.outward_loading_end_time || '-'}</div>
                            </div>
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Photos Section */}
              <div className="profile-photos-section">
                <h4>Audit Attachment Documents</h4>
                
                {((searchedRecordType === 'daily' && searchedRecord.temp_sensor_image) ||
                  searchedRecordType === 'inward' ||
                  searchedRecordType === 'outward') ? (
                  <div className="profile-photo-grid">
                    {searchedRecordType === 'daily' && searchedRecord.temp_sensor_image && (
                      <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.temp_sensor_image.startsWith('data:') || /^https?:\/\//i.test(searchedRecord.temp_sensor_image) ? searchedRecord.temp_sensor_image : `/${searchedRecord.temp_sensor_image}`)}>
                        <div className="profile-photo-wrapper">
                          <img src={searchedRecord.temp_sensor_image.startsWith('data:') || /^https?:\/\//i.test(searchedRecord.temp_sensor_image) ? searchedRecord.temp_sensor_image : `/${searchedRecord.temp_sensor_image}`} alt="Temp Sensor" />
                        </div>
                        <div className="profile-photo-label">Temp Sensor</div>
                      </div>
                    )}

                    {searchedRecordType === 'inward' && (
                      <>
                        {searchedRecord.inward_invoice_photos && searchedRecord.inward_invoice_photos.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`iinv-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(img.startsWith('data:') ? img : `/${img}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={img.startsWith('data:') ? img : `/${img}`} alt={`Invoice ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Invoice Photo' : `Invoice #${idx + 1}`}</div>
                          </div>
                        ))}
                        <UpdatablePodPhoto
                          type="inward"
                          recordId={searchedRecord.inward_id}
                          photoPath={searchedRecord.inward_pod_photo}
                          onPreview={setLightboxImg}
                          onUpdated={({ photoPath, update_details, updated_at, update_count }) => {
                            setSearchedRecord((prev) => ({
                              ...prev,
                              inward_pod_photo: photoPath,
                              update_details: update_details || prev.update_details,
                              update_count: update_count ?? (Number(prev.update_count) || 0) + 1,
                              inward_updated_at: updated_at || prev.inward_updated_at
                            }));
                          }}
                        />
                        {searchedRecord.inward_vehicle_seal_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.inward_vehicle_seal_photo.startsWith('data:') ? searchedRecord.inward_vehicle_seal_photo : `/${searchedRecord.inward_vehicle_seal_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.inward_vehicle_seal_photo.startsWith('data:') ? searchedRecord.inward_vehicle_seal_photo : `/${searchedRecord.inward_vehicle_seal_photo}`} alt="Vehicle Seal" />
                            </div>
                            <div className="profile-photo-label">Vehicle Seal</div>
                          </div>
                        )}
                        {searchedRecord.inward_vehicle_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.inward_vehicle_temp_photo.startsWith('data:') ? searchedRecord.inward_vehicle_temp_photo : `/${searchedRecord.inward_vehicle_temp_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.inward_vehicle_temp_photo.startsWith('data:') ? searchedRecord.inward_vehicle_temp_photo : `/${searchedRecord.inward_vehicle_temp_photo}`} alt="Vehicle Temp" />
                            </div>
                            <div className="profile-photo-label">Vehicle Temp</div>
                          </div>
                        )}
                        {searchedRecord.inward_material_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.inward_material_temp_photo.startsWith('data:') ? searchedRecord.inward_material_temp_photo : `/${searchedRecord.inward_material_temp_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.inward_material_temp_photo.startsWith('data:') ? searchedRecord.inward_material_temp_photo : `/${searchedRecord.inward_material_temp_photo}`} alt="Material Temp" />
                            </div>
                            <div className="profile-photo-label">Material Temp</div>
                          </div>
                        )}
                        {searchedRecord.inward_vehicle_back_side_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.inward_vehicle_back_side_photo.startsWith('data:') ? searchedRecord.inward_vehicle_back_side_photo : `/${searchedRecord.inward_vehicle_back_side_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.inward_vehicle_back_side_photo.startsWith('data:') ? searchedRecord.inward_vehicle_back_side_photo : `/${searchedRecord.inward_vehicle_back_side_photo}`} alt="Vehicle Back" />
                            </div>
                            <div className="profile-photo-label">Vehicle Back</div>
                          </div>
                        )}
                        {searchedRecord.inward_vehicle_back_side_photo_with_material && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.inward_vehicle_back_side_photo_with_material.startsWith('data:') ? searchedRecord.inward_vehicle_back_side_photo_with_material : `/${searchedRecord.inward_vehicle_back_side_photo_with_material}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.inward_vehicle_back_side_photo_with_material.startsWith('data:') ? searchedRecord.inward_vehicle_back_side_photo_with_material : `/${searchedRecord.inward_vehicle_back_side_photo_with_material}`} alt="Vehicle Back Load" />
                            </div>
                            <div className="profile-photo-label">Vehicle Loaded</div>
                          </div>
                        )}
                        {searchedRecord.inward_count_sheet_photo && searchedRecord.inward_count_sheet_photo.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`ics-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(img.startsWith('data:') ? img : `/${img}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={img.startsWith('data:') ? img : `/${img}`} alt={`Count Sheet ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Count Sheet' : `Count Sheet #${idx + 1}`}</div>
                          </div>
                        ))}
                        {searchedRecord.inward_damage_boxes_photo && searchedRecord.inward_damage_boxes_photo.split(',').map((dmgImg, idx) => (
                          <div key={idx} className="profile-photo-card" onClick={() => setLightboxImg(dmgImg.startsWith('data:') ? dmgImg : `/${dmgImg}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={dmgImg.startsWith('data:') ? dmgImg : `/${dmgImg}`} alt={`Damage ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">Damage #{idx + 1}</div>
                          </div>
                        ))}
                      </>
                    )}

                    {searchedRecordType === 'outward' && (
                      <>
                        {searchedRecord.outward_invoice_photos && searchedRecord.outward_invoice_photos.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`oinv-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(img.startsWith('data:') ? img : `/${img}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={img.startsWith('data:') ? img : `/${img}`} alt={`Invoice ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Invoice Photo' : `Invoice #${idx + 1}`}</div>
                          </div>
                        ))}
                        <UpdatablePodPhoto
                          type="outward"
                          recordId={searchedRecord.outward_id}
                          photoPath={searchedRecord.outward_pod_photo}
                          onPreview={setLightboxImg}
                          onUpdated={({ photoPath, update_details, updated_at, update_count }) => {
                            setSearchedRecord((prev) => ({
                              ...prev,
                              outward_pod_photo: photoPath,
                              update_details: update_details || prev.update_details,
                              update_count: update_count ?? (Number(prev.update_count) || 0) + 1,
                              outward_updated_at: updated_at || prev.outward_updated_at
                            }));
                          }}
                        />
                        {searchedRecord.outward_vehicle_seal_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.outward_vehicle_seal_photo.startsWith('data:') ? searchedRecord.outward_vehicle_seal_photo : `/${searchedRecord.outward_vehicle_seal_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.outward_vehicle_seal_photo.startsWith('data:') ? searchedRecord.outward_vehicle_seal_photo : `/${searchedRecord.outward_vehicle_seal_photo}`} alt="Vehicle Seal" />
                            </div>
                            <div className="profile-photo-label">Vehicle Seal</div>
                          </div>
                        )}
                        {searchedRecord.outward_pre_vehicle_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.outward_pre_vehicle_temp_photo.startsWith('data:') ? searchedRecord.outward_pre_vehicle_temp_photo : `/${searchedRecord.outward_pre_vehicle_temp_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.outward_pre_vehicle_temp_photo.startsWith('data:') ? searchedRecord.outward_pre_vehicle_temp_photo : `/${searchedRecord.outward_pre_vehicle_temp_photo}`} alt="Pre vehicle temp" />
                            </div>
                            <div className="profile-photo-label">Pre-Cooling Temp</div>
                          </div>
                        )}
                        {searchedRecord.outward_vehicle_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.outward_vehicle_temp_photo.startsWith('data:') ? searchedRecord.outward_vehicle_temp_photo : `/${searchedRecord.outward_vehicle_temp_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.outward_vehicle_temp_photo.startsWith('data:') ? searchedRecord.outward_vehicle_temp_photo : `/${searchedRecord.outward_vehicle_temp_photo}`} alt="Vehicle Temp" />
                            </div>
                            <div className="profile-photo-label">Vehicle Temp</div>
                          </div>
                        )}
                        {searchedRecord.outward_material_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.outward_material_temp_photo.startsWith('data:') ? searchedRecord.outward_material_temp_photo : `/${searchedRecord.outward_material_temp_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.outward_material_temp_photo.startsWith('data:') ? searchedRecord.outward_material_temp_photo : `/${searchedRecord.outward_material_temp_photo}`} alt="Material Temp" />
                            </div>
                            <div className="profile-photo-label">Material Temp</div>
                          </div>
                        )}
                        {searchedRecord.outward_vehicle_back_side_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.outward_vehicle_back_side_photo.startsWith('data:') ? searchedRecord.outward_vehicle_back_side_photo : `/${searchedRecord.outward_vehicle_back_side_photo}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.outward_vehicle_back_side_photo.startsWith('data:') ? searchedRecord.outward_vehicle_back_side_photo : `/${searchedRecord.outward_vehicle_back_side_photo}`} alt="Vehicle Back" />
                            </div>
                            <div className="profile-photo-label">Vehicle Back</div>
                          </div>
                        )}
                        {searchedRecord.outward_vehicle_back_side_photo_with_material && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(searchedRecord.outward_vehicle_back_side_photo_with_material.startsWith('data:') ? searchedRecord.outward_vehicle_back_side_photo_with_material : `/${searchedRecord.outward_vehicle_back_side_photo_with_material}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={searchedRecord.outward_vehicle_back_side_photo_with_material.startsWith('data:') ? searchedRecord.outward_vehicle_back_side_photo_with_material : `/${searchedRecord.outward_vehicle_back_side_photo_with_material}`} alt="Vehicle Back Load" />
                            </div>
                            <div className="profile-photo-label">Vehicle Loaded</div>
                          </div>
                        )}
                        {searchedRecord.outward_count_sheet_photo && searchedRecord.outward_count_sheet_photo.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`ocs-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(img.startsWith('data:') ? img : `/${img}`)}>
                            <div className="profile-photo-wrapper">
                              <img src={img.startsWith('data:') ? img : `/${img}`} alt={`Count Sheet ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Count Sheet' : `Count Sheet #${idx + 1}`}</div>
                          </div>
                        ))}
                        {searchedRecord.outward_damage_boxes_photo && searchedRecord.outward_damage_boxes_photo.split(',').map((dmgImg, idx) => (
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
          </div>
        ) : searchResults.length === 0 ? (
          
          /* EMPTY SEARCH STATE */
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <span>No query results found. Enter a keyword to start searching logs.</span>
          </div>
        ) : (
          
          /* SEARCH RESULTS LIST CARD GRID */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--text-dark)' }}>
              Lookup Results ({searchResults.length} records found)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {searchResults.map((res) => (
                <div 
                  key={res.id}
                  onClick={() => {
                    setSearchedRecord(res.original);
                    setSearchedRecordType(res.type);
                  }}
                  className="lookup-result-card"
                  style={{ padding: '16px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--primary)' }}>
                      {res.type === 'daily' ? 'Chamber Log' : res.type === 'inward' ? 'Inward Shipment' : 'Outward Shipment'}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>
                      {res.date}
                    </span>
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.86rem', fontWeight: 800, margin: '0 0 2px 0', color: 'var(--text-dark)' }}>
                      {res.title}
                    </h4>
                    <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>
                      Client: {res.client || '-'}
                    </p>
                    <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '4px 0 0 0', fontStyle: 'italic' }}>
                      {res.details}
                    </p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: '800', color: 'var(--primary)' }}>
                      {res.refNo || '-'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>View Profile</span>
                      <Eye size={12} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
              download={`DO_Lookup_Attachment_${new Date().getTime()}.png`}
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
                cursor: 'pointer'
              }}
            >
              <Download size={16} />
              <span>Download Photo</span>
            </a>

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
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)'
              }}
            >
              <X size={16} />
              <span>Close</span>
            </button>
          </div>

          <div 
            className="lightbox-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 }}
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

      {/* Permission Verification & Request Modal */}
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
                    color: permissionModalData.status === 'Pending' ? '#ca8a0ca' : (permissionModalData.status === 'Denied' ? '#dc2626' : '#ca8a04') 
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
