// ====================================================================
// DO Inward Temp Monitor Component (src/pages/InwardMonitor/InwardMonitor.jsx)
// Paired with: src/pages/InwardMonitor/InwardMonitor.css
// Handles comprehensive Inward vehicle inspections in a single card with rounded boxes.
// ====================================================================

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownLeft, Plus, CheckCircle, PlusCircle, Camera, Loader2, Trash2, Calendar, FileText, Truck, Thermometer, Check, RefreshCw
} from 'lucide-react';
import { addInwardLog, fetchInwardLogs, deleteInwardLog, updateInwardLog } from '../../services/api';
import { resolveMediaSrc } from '../../utils/resolveMediaSrc';
import exifr from 'exifr';
import './InwardMonitor.css';

export default function InwardMonitor({ editData, setEditData, setActiveDOMenu }) {
  const getLocalTodayStr = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const todayStr = getLocalTodayStr();
  const fileInputRef = useRef({});
  const submissionKeyRef = useRef(null);

  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [invalidFields, setInvalidFields] = useState({});
  const [lightboxImage, setLightboxImage] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    inward_entry_date: todayStr,
    inward_vehicle_no: '',
    inward_seal_no: '',
    inward_invoice_no: '',
    inward_mens_power: '',
    inward_vehicle_temp: '',
    inward_material_temp: '',
    inward_transporter_name: '',
    inward_driver_name: '',
    inward_driver_no: '',
    inward_client_name: '',
    inward_dock_no: '',
    inward_vehicle_reporting_time: '11:00',
    inward_unloading_start_date: todayStr,
    inward_unloading_start_time: '11:30',
    inward_unloading_end_date: todayStr,
    inward_unloading_end_time: '12:30',
    inward_unloading_duration_hours: '1',
    inward_unloading_duration_mins: '0',
    inward_pallets_in_qty: '',
    inward_invoice_qty: '',
    inward_received_qty: '',
    inward_received_boxes_qty: '',
    inward_short_received_boxes_qty: 0,
    inward_excess_received_boxes_qty: 0,
    inward_damage_received_boxes_qty: '',
    inward_material_type: 'Frozen',
    inward_unloading_supervisor_name: '',
    inward_remarks: ''
  });

  // Custom text triggers for dropdown inputs
  const [isMaterialCustom, setIsMaterialCustom] = useState(false);
  const [driverCountryCode, setDriverCountryCode] = useState('+91');

  // Uploaded Files State
  const [invoicePhotos, setInvoicePhotos] = useState([]);
  const [invoicePreviews, setInvoicePreviews] = useState([]);
  const [podPhoto, setPodPhoto] = useState(null);
  const [podPreview, setPodPreview] = useState(null);
  const [sealPhoto, setSealPhoto] = useState(null);
  const [sealPreview, setSealPreview] = useState(null);
  const [vehicleTempPhoto, setVehicleTempPhoto] = useState(null);
  const [vehicleTempPreview, setVehicleTempPreview] = useState(null);
  const [materialTempPhoto, setMaterialTempPhoto] = useState(null);
  const [materialTempPreview, setMaterialTempPreview] = useState(null);
  const [vehicleBackPhoto, setVehicleBackPhoto] = useState(null);
  const [vehicleBackPreview, setVehicleBackPreview] = useState(null);
  const [vehicleBackWithMaterialPhoto, setVehicleBackWithMaterialPhoto] = useState(null);
  const [vehicleBackWithMaterialPreview, setVehicleBackWithMaterialPreview] = useState(null);
  const [countSheetPhotos, setCountSheetPhotos] = useState([]);
  const [countSheetPreviews, setCountSheetPreviews] = useState([]);
  const [damagePhotos, setDamagePhotos] = useState([]);
  const [damagePreviews, setDamagePreviews] = useState([]);

  const clearInvalid = (field) => {
    setInvalidFields((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const clearInvalidMany = (fields) => {
    setInvalidFields((prev) => {
      let changed = false;
      const next = { ...prev };
      fields.forEach((f) => {
        if (next[f]) {
          delete next[f];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  };

  const ReqStar = ({ field }) => (
    <span className={`req-star${invalidFields[field] ? ' req-star--missing' : ''}`} aria-hidden="true">*</span>
  );

  // Time Verification Modal State
  const [verificationData, setVerificationData] = useState(null);

  // Load Logs
  const loadLogs = async () => {
    setLoadingLogs(true);
    const data = await fetchInwardLogs();
    setLogs(data || []);
    setLoadingLogs(false);
  };

  const convertDDMMYYYYToYYYYMMDD = (ddmmyyyy) => {
    if (!ddmmyyyy || !ddmmyyyy.includes('-')) return '';
    const parts = ddmmyyyy.split('-');
    if (parts.length === 3) {
      const [dd, mm, yyyy] = parts;
      return `${yyyy}-${mm}-${dd}`;
    }
    return '';
  };

  const convertYYYYMMDDToDDMMYYYY = (yyyymmdd) => {
    if (!yyyymmdd || !yyyymmdd.includes('-')) return '';
    const parts = yyyymmdd.split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      return `${dd}-${mm}-${yyyy}`;
    }
    return '';
  };

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    if (editData) {
      const entryDateOnly = editData.inward_entry_date ? editData.inward_entry_date.split('T')[0] : todayStr;
      const startHasSpace = editData.inward_unloading_start_time && editData.inward_unloading_start_time.includes(' ');
      const endHasSpace = editData.inward_unloading_end_time && editData.inward_unloading_end_time.includes(' ');
      
      setFormData({
        inward_entry_date: entryDateOnly,
        inward_vehicle_no: editData.inward_vehicle_no || '',
        inward_seal_no: editData.inward_seal_no || '',
        inward_invoice_no: editData.inward_invoice_no || '',
        inward_mens_power: editData.inward_mens_power ?? '',
        inward_vehicle_temp: editData.inward_vehicle_temp || '',
        inward_material_temp: editData.inward_material_temp || '',
        inward_transporter_name: editData.inward_transporter_name || '',
        inward_driver_name: editData.inward_driver_name || '',
        inward_driver_no: editData.inward_driver_no ? editData.inward_driver_no.replace(/^\+\d+\s*/, '') : '',
        inward_client_name: editData.inward_client_name || '',
        inward_dock_no: editData.inward_dock_no || '',
        inward_vehicle_reporting_time: editData.inward_vehicle_reporting_time || '11:00',
        inward_unloading_start_date: startHasSpace 
          ? convertDDMMYYYYToYYYYMMDD(editData.inward_unloading_start_time.split(' ')[0]) 
          : entryDateOnly,
        inward_unloading_start_time: startHasSpace 
          ? editData.inward_unloading_start_time.split(' ')[1] 
          : (editData.inward_unloading_start_time || '11:30'),
        inward_unloading_end_date: endHasSpace 
          ? convertDDMMYYYYToYYYYMMDD(editData.inward_unloading_end_time.split(' ')[0]) 
          : entryDateOnly,
        inward_unloading_end_time: editData.inward_unloading_end_time 
          ? (endHasSpace 
              ? editData.inward_unloading_end_time.split(' ')[1] 
              : editData.inward_unloading_end_time)
          : '12:30',
        inward_unloading_duration_hours: editData.inward_unloading_duration_hours || '1',
        inward_unloading_duration_mins: editData.inward_unloading_duration_mins || '0',
        inward_pallets_in_qty: editData.inward_pallets_in_qty || '',
        inward_invoice_qty: editData.inward_invoice_qty || '',
        inward_received_qty: editData.inward_received_boxes_qty || editData.inward_received_qty || '',
        inward_received_boxes_qty: editData.inward_received_boxes_qty || editData.inward_received_qty || '',
        inward_short_received_boxes_qty: editData.inward_short_received_boxes_qty || 0,
        inward_excess_received_boxes_qty: editData.inward_excess_received_boxes_qty || 0,
        inward_damage_received_boxes_qty: editData.inward_damage_received_boxes_qty || '',
        inward_material_type: editData.inward_material_type || 'Frozen',
        inward_unloading_supervisor_name: editData.inward_unloading_supervisor_name || '',
        inward_remarks: editData.inward_remarks || ''
      });
      if (editData.inward_driver_no) {
        const parts = editData.inward_driver_no.split(' ');
        if (parts.length > 1) {
          setDriverCountryCode(parts[0]);
        }
      }
      const getImgUrl = (path) => resolveMediaSrc(path);
      setInvoicePhotos([]);
      setInvoicePreviews(
        editData.inward_invoice_photos
          ? editData.inward_invoice_photos.split(',').map(getImgUrl).filter(Boolean)
          : []
      );
      setPodPreview(getImgUrl(editData.inward_pod_photo));
      setSealPreview(getImgUrl(editData.inward_vehicle_seal_photo));
      setVehicleTempPreview(getImgUrl(editData.inward_vehicle_temp_photo));
      setMaterialTempPreview(getImgUrl(editData.inward_material_temp_photo));
      setVehicleBackPreview(getImgUrl(editData.inward_vehicle_back_side_photo));
      setVehicleBackWithMaterialPreview(getImgUrl(editData.inward_vehicle_back_side_photo_with_material));
      setCountSheetPhotos([]);
      setCountSheetPreviews(
        editData.inward_count_sheet_photo
          ? editData.inward_count_sheet_photo.split(',').map(getImgUrl).filter(Boolean)
          : []
      );
      if (editData.inward_damage_boxes_photo) {
        setDamagePreviews(editData.inward_damage_boxes_photo.split(',').map(getImgUrl));
      } else {
        setDamagePreviews([]);
      }
    }
  }, [editData]);

  // Update auto-calculated boxes quantity
  useEffect(() => {
    const inv = parseInt(formData.inward_invoice_qty) || 0;
    const rec = parseInt(formData.inward_received_boxes_qty) || 0;

    setFormData(prev => ({
      ...prev,
      inward_short_received_boxes_qty: inv > rec ? inv - rec : 0,
      inward_excess_received_boxes_qty: rec > inv ? rec - inv : 0
    }));
  }, [formData.inward_invoice_qty, formData.inward_received_boxes_qty]);

  // Reset damage photo files if damage quantity is reset to 0
  useEffect(() => {
    const damageQty = parseInt(formData.inward_damage_received_boxes_qty) || 0;
    if (damageQty === 0) {
      setDamagePhotos([]);
      setDamagePreviews([]);
    }
  }, [formData.inward_damage_received_boxes_qty]);

  const calculateEndDateTime = (dateStr, timeStr, durationMinutes) => {
    if (!dateStr || !timeStr || isNaN(durationMinutes)) return '';

    // Parse entry date & reporting time
    const [yyyy, mm, dd] = dateStr.split('-').map(Number);
    const [hours, mins] = timeStr.split(':').map(Number);

    // Create Date object
    const startDateTime = new Date(yyyy, mm - 1, dd, hours, mins, 0);
    // Add duration minutes
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);

    // Format outputs
    const endYear = endDateTime.getFullYear();
    const endMonth = String(endDateTime.getMonth() + 1).padStart(2, '0');
    const endDate = String(endDateTime.getDate()).padStart(2, '0');
    const endHours = String(endDateTime.getHours()).padStart(2, '0');
    const endMinutes = String(endDateTime.getMinutes()).padStart(2, '0');

    return `${endDate}-${endMonth}-${endYear} ${endHours}:${endMinutes}`;
  };

  // Update unloading duration hours and mins dynamically based on start and end times
  useEffect(() => {
    const startTime = formData.inward_unloading_start_time;
    const endTime = formData.inward_unloading_end_time;
    const startDate = formData.inward_unloading_start_date || formData.inward_entry_date;
    const endDate = formData.inward_unloading_end_date || formData.inward_entry_date;

    if (startTime && endTime && startDate && endDate) {
      const startDateTime = new Date(`${startDate}T${startTime}:00`);
      const endClean = endTime.includes(' ') ? endTime.split(' ')[1] : endTime;
      const endDateTime = new Date(`${endDate}T${endClean}:00`);

      if (!isNaN(startDateTime.getTime()) && !isNaN(endDateTime.getTime())) {
        const diffMs = endDateTime.getTime() - startDateTime.getTime();
        const diffMins = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;

        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;

        setFormData(prev => ({
          ...prev,
          inward_unloading_duration_hours: hours.toString(),
          inward_unloading_duration_mins: mins.toString()
        }));
      }
    }
  }, [
    formData.inward_unloading_start_time, 
    formData.inward_unloading_end_time,
    formData.inward_unloading_start_date,
    formData.inward_unloading_end_date,
    formData.inward_entry_date
  ]);

  const cleanTimePart = (t) => {
    if (!t) return '';
    const s = String(t).trim();
    return s.includes(' ') ? s.split(/\s+/).pop() : s;
  };

  /** Build Date from YYYY-MM-DD + HH:MM (optionally with embedded date in time). */
  const buildUnloadingDateTime = (dateStr, timeStr) => {
    const t = cleanTimePart(timeStr);
    if (!dateStr || !t) return null;
    const normalized = t.length === 5 ? `${t}:00` : t;
    const d = new Date(`${dateStr}T${normalized}`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  /**
   * Unloading End must be strictly after Unloading Start.
   * Same end/start date → End Time must be greater than Start Time.
   */
  const validateUnloadingEndAfterStart = () => {
    const startDate = formData.inward_unloading_start_date || formData.inward_entry_date;
    const endDate = formData.inward_unloading_end_date || formData.inward_entry_date;
    const start = buildUnloadingDateTime(startDate, formData.inward_unloading_start_time);
    const end = buildUnloadingDateTime(endDate, formData.inward_unloading_end_time);
    if (!start || !end) return true;

    if (end.getTime() <= start.getTime()) {
      const startT = cleanTimePart(formData.inward_unloading_start_time);
      const endT = cleanTimePart(formData.inward_unloading_end_time);
      if (endDate === startDate) {
        alert(
          `Unloading End Time must be later than Unloading Start Time.\n\nStart: ${startT}\nEnd: ${endT}`
        );
      } else {
        alert('Unloading End Date/Time must be later than Unloading Start Date/Time.');
      }
      setInvalidFields((prev) => ({ ...prev, inward_unloading_end_time: true }));
      return false;
    }
    return true;
  };

  /**
   * Same Unloading Start Date as Entry Date →
   * Unloading Start Time must be later than Vehicle Reporting Time.
   */
  const validateUnloadingStartAfterReporting = () => {
    const startDate = formData.inward_unloading_start_date || formData.inward_entry_date;
    const entryDate = formData.inward_entry_date;
    if (!startDate || !entryDate || startDate !== entryDate) return true;

    const repT = cleanTimePart(formData.inward_vehicle_reporting_time);
    const startT = cleanTimePart(formData.inward_unloading_start_time);
    if (!repT || !startT) return true;

    if (startT <= repT) {
      alert(
        `Unloading Start Time must be later than Vehicle Reporting Time.\n\nReporting: ${repT}\nStart: ${startT}`
      );
      setInvalidFields((prev) => ({ ...prev, inward_unloading_start_time: true }));
      return false;
    }
    return true;
  };

  // Client-Side Canvas Image Compressor
  const compressImageFile = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const maxWidth = 1200;
          const maxHeight = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name || 'compressed-photo.jpg', {
                type: 'image/jpeg',
                lastModified: file.lastModified
              });
              resolve({ file: compressedFile, previewUrl: URL.createObjectURL(blob) });
            } else {
              resolve({ file, previewUrl: URL.createObjectURL(file) });
            }
          }, 'image/jpeg', 0.75);
        };
      };
    });
  };

  // Image Selection Handlers

  const handleMultipleImageChange = async (e, setPhotos, setPreviews, defaultName = 'photo.jpg', fieldKey) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setCompressing(true);
    const compressedList = [];
    const previewList = [];

    for (let file of files) {
      let originalCaptureDate = null;
      try {
        const exif = await exifr.parse(file);
        if (exif && exif.DateTimeOriginal) {
          originalCaptureDate = new Date(exif.DateTimeOriginal);
        }
      } catch (err) {
        console.warn('Failed to parse EXIF metadata on frontend:', err.message);
      }

      const res = await compressImageFile(file);
      const captureTime = originalCaptureDate || new Date(file.lastModified || Date.now());

      const finalFile = new File([res.file], file.name || defaultName, {
        type: 'image/jpeg',
        lastModified: captureTime.getTime()
      });

      compressedList.push(finalFile);
      previewList.push(res.previewUrl);
    }

    setPhotos(prev => [...prev, ...compressedList]);
    setPreviews(prev => [...prev, ...previewList]);
    if (fieldKey) clearInvalid(fieldKey);
    setCompressing(false);

    // Clear input value so selecting files repeatedly triggers onChange
    e.target.value = '';
  };

  const handleMultipleDamageChange = (e) =>
    handleMultipleImageChange(e, setDamagePhotos, setDamagePreviews, 'damage-photo.jpg', 'damage_boxes_photo');

  const handleMultipleInvoiceChange = (e) =>
    handleMultipleImageChange(e, setInvoicePhotos, setInvoicePreviews, 'invoice-photo.jpg', 'invoice_photos');

  const handleMultipleCountSheetChange = (e) =>
    handleMultipleImageChange(e, setCountSheetPhotos, setCountSheetPreviews, 'count-sheet-photo.jpg', 'count_sheet_photo');

  const handleSingleImageChange = async (e, setFile, setPreview, fieldKey) => {
    const file = e.target.files[0];
    if (!file) return;

    setCompressing(true);

    // Parse EXIF DateTimeOriginal before compression strips it
    let originalCaptureDate = null;
    try {
      const exif = await exifr.parse(file);
      if (exif && exif.DateTimeOriginal) {
        originalCaptureDate = new Date(exif.DateTimeOriginal);
      }
    } catch (err) {
      console.warn('Failed to parse EXIF metadata on frontend:', err.message);
    }

    const res = await compressImageFile(file);
    const captureTime = originalCaptureDate || new Date(file.lastModified || Date.now());

    const finalFile = new File([res.file], file.name || 'compressed-photo.jpg', {
      type: 'image/jpeg',
      lastModified: captureTime.getTime()
    });

    setFile(finalFile);
    setPreview(res.previewUrl);
    if (fieldKey) clearInvalid(fieldKey);
    setCompressing(false);

    // Clear input value so selecting files repeatedly triggers onChange
    e.target.value = '';
  };

  // Variance calculator (Unloading End Time vs Vehicle Temp Photo capture)
  const calculateVariance = (endTimeStr, captureDate) => {
    try {
      if (!endTimeStr || !captureDate) return 0;
      
      let endHours, endMinutes;
      let endYear = captureDate.getFullYear();
      let endMonth = captureDate.getMonth();
      let endDate = captureDate.getDate();

      if (endTimeStr.includes(' ')) {
        // Old format: "DD-MM-YYYY HH:MM"
        const [datePart, timePart] = endTimeStr.split(' ');
        const [day, month, year] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        endYear = year;
        endMonth = month - 1;
        endDate = day;
        endHours = hours;
        endMinutes = minutes;
      } else {
        // New format: "HH:MM"
        const [hours, minutes] = endTimeStr.split(':').map(Number);
        endHours = hours;
        endMinutes = minutes;
        
        if (formData.inward_unloading_end_date || formData.inward_entry_date) {
          const dateSrc = formData.inward_unloading_end_date || formData.inward_entry_date;
          const [y, m, d] = dateSrc.split('-').map(Number);
          endYear = y;
          endMonth = m - 1;
          endDate = d;
        }
      }

      const expectedEndDate = new Date(endYear, endMonth, endDate, endHours, endMinutes, 0, 0);
      const diffMs = Math.abs(captureDate.getTime() - expectedEndDate.getTime());
      return Math.round(diffMs / (1000 * 60));
    } catch (e) {
      return 0;
    }
  };

  // Submit Handler: Show Verification Pop-up Modal First
  const handleFormSubmit = async (e) => {
    e.preventDefault();

    const isBlank = (v) => {
      if (v === 0 || v === '0') return false;
      return v === null || v === undefined || String(v).trim() === '';
    };

    const requiredFields = [
      ['inward_entry_date', 'Entry Date'],
      ['inward_client_name', 'Client Name'],
      ['inward_dock_no', 'Dock No.'],
      ['inward_material_type', 'Material Type'],
      ['inward_vehicle_no', 'Vehicle No.'],
      ['inward_invoice_no', 'Invoice No.'],
      ['inward_transporter_name', 'Transporter Name'],
      ['inward_driver_name', 'Driver Name'],
      ['inward_driver_no', 'Driver Phone No.'],
      ['inward_vehicle_reporting_time', 'Vehicle Reporting Time'],
      ['inward_unloading_start_date', 'Unloading Start Date'],
      ['inward_unloading_start_time', 'Unloading Start Time'],
      ['inward_unloading_end_date', 'Unloading End Date'],
      ['inward_unloading_end_time', 'Unloading End Time'],
      ['inward_unloading_duration_hours', 'Unloading Duration Hours'],
      ['inward_unloading_duration_mins', 'Unloading Duration Mins'],
      ['inward_vehicle_temp', 'Vehicle Temp'],
      ['inward_material_temp', 'Material Temp'],
      ['inward_pallets_in_qty', 'Pallets In Qty'],
      ['inward_invoice_qty', 'Invoice Boxes Qty'],
      ['inward_received_boxes_qty', 'Boxes Received Qty'],
      ['inward_unloading_supervisor_name', 'Unloading Supervisor Name']
      // Seal No., Mens Power, Remarks & Damage Qty are optional
    ];

    const missingKeys = requiredFields
      .filter(([key]) => isBlank(formData[key]))
      .map(([key]) => key);
    const missing = requiredFields
      .filter(([key]) => isBlank(formData[key]))
      .map(([, label]) => label);

    const hasInvoice = invoicePhotos.length > 0 || invoicePreviews.length > 0;
    const hasVehicleTemp = !!(vehicleTempPhoto || vehicleTempPreview);
    const hasMaterialTemp = !!(materialTempPhoto || materialTempPreview);
    const hasVehicleBack = !!(vehicleBackPhoto || vehicleBackPreview);
    const hasVehicleBackLoaded = !!(vehicleBackWithMaterialPhoto || vehicleBackWithMaterialPreview);
    const hasCountSheet = countSheetPhotos.length > 0 || countSheetPreviews.length > 0;
    const damageQty = parseInt(formData.inward_damage_received_boxes_qty, 10) || 0;
    const hasDamage = damagePhotos.length > 0 || damagePreviews.length > 0;

    if (!hasInvoice) { missingKeys.push('invoice_photos'); missing.push('Invoice Photo'); }
    if (!hasVehicleTemp) { missingKeys.push('vehicle_temp_photo'); missing.push('Vehicle Temp Photo'); }
    if (!hasMaterialTemp) { missingKeys.push('material_temp_photo'); missing.push('Material Temp Photo'); }
    if (!hasVehicleBack) { missingKeys.push('vehicle_back_photo'); missing.push('Vehicle Back Photo'); }
    if (!hasVehicleBackLoaded) { missingKeys.push('vehicle_back_with_material_photo'); missing.push('Vehicle Back Photo With Material'); }
    if (!hasCountSheet) { missingKeys.push('count_sheet_photo'); missing.push('Count Sheet Photo'); }
    if (damageQty > 0 && !hasDamage) { missingKeys.push('damage_boxes_photo'); missing.push('Damage Boxes Photo'); }
    // POD Photo & Vehicle Seal Photo optional

    if (missingKeys.length > 0) {
      setInvalidFields(Object.fromEntries(missingKeys.map((k) => [k, true])));
      alert(`⚠️ Validation Error:\nPlease fill all required fields:\n- ${missing.join('\n- ')}`);
      return;
    }

    setInvalidFields({});

    const digits = (formData.inward_driver_no || '').replace(/\D/g, '');
    const expectedDigits = (driverCountryCode === '+91') ? 10 : (['+971', '+966', '+61'].includes(driverCountryCode) ? 9 : (driverCountryCode === '+65' ? 8 : 10));
    if (digits.length < expectedDigits) {
      setInvalidFields({ inward_driver_no: true });
      alert(`⚠️ Invalid Phone Number:\nPlease enter a valid ${expectedDigits}-digit mobile number for country code ${driverCountryCode}.`);
      return;
    }

    if (!validateUnloadingStartAfterReporting()) {
      return;
    }

    if (!validateUnloadingEndAfterStart()) {
      return;
    }

    let captureDate = new Date();
    let photoDateStr = todayStr;

    // Choose the first available uploaded photo as the inspection reference
    const refPhoto = vehicleTempPhoto || materialTempPhoto || podPhoto || sealPhoto || vehicleBackPhoto || vehicleBackWithMaterialPhoto || countSheetPhotos[0] || invoicePhotos[0] || damagePhotos[0];

    if (refPhoto) {
      captureDate = new Date(refPhoto.lastModified);
    } else if (editData?.photo_capture_time) {
      const raw = String(editData.photo_capture_time).trim();
      const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
      if (m) {
        captureDate = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
      } else {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) captureDate = parsed;
      }
    }

    const yyyy = captureDate.getFullYear();
    const mm = String(captureDate.getMonth() + 1).padStart(2, '0');
    const dd = String(captureDate.getDate()).padStart(2, '0');
    const hh = String(captureDate.getHours()).padStart(2, '0');
    const min = String(captureDate.getMinutes()).padStart(2, '0');
    const ss = String(captureDate.getSeconds()).padStart(2, '0');

    photoDateStr = `${dd}-${mm}-${yyyy}`;
    const formattedCapture = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
    const photoTimeStr = `${hh}:${min}`;

    const endDateForVariance = formData.inward_unloading_end_date || formData.inward_entry_date;
    const endTimeCombined = endDateForVariance
      ? `${convertYYYYMMDDToDDMMYYYY(endDateForVariance)} ${formData.inward_unloading_end_time}`
      : formData.inward_unloading_end_time;
    const variance = calculateVariance(endTimeCombined, captureDate);

    setVerificationData({
      photo_capture_time_str: formattedCapture,
      photo_date_str: photoDateStr,
      photo_time_str: photoTimeStr,
      end_date_str: endDateForVariance ? convertYYYYMMDDToDDMMYYYY(endDateForVariance) : '',
      end_time_str: formData.inward_unloading_end_time || '',
      time_variance_minutes: variance
    });
  };

  const handleConfirmSubmit = async () => {
    if (submitting) return;
    if (!validateUnloadingStartAfterReporting()) {
      return;
    }

    if (!validateUnloadingEndAfterStart()) {
      return;
    }

    setSubmitting(true);

    if (!editData && !submissionKeyRef.current) {
      submissionKeyRef.current = {
        id: `web_in_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        at: new Date().toISOString()
      };
    }

    const submissionData = new FormData();
    Object.keys(formData).forEach(key => {
      if (key === 'inward_driver_no') {
        const fullPhone = formData.inward_driver_no ? `${driverCountryCode} ${formData.inward_driver_no}` : '';
        submissionData.append('inward_driver_no', fullPhone);
      } else if (key === 'inward_unloading_start_time') {
        const startDate = formData.inward_unloading_start_date || formData.inward_entry_date;
        const formatted = `${convertYYYYMMDDToDDMMYYYY(startDate)} ${formData.inward_unloading_start_time}`;
        submissionData.append('inward_unloading_start_time', formatted);
      } else if (key === 'inward_unloading_end_time') {
        const endDate = formData.inward_unloading_end_date || formData.inward_entry_date;
        const rawTime = formData.inward_unloading_end_time.includes(' ') ? formData.inward_unloading_end_time.split(' ')[1] : formData.inward_unloading_end_time;
        const formatted = `${convertYYYYMMDDToDDMMYYYY(endDate)} ${rawTime}`;
        submissionData.append('inward_unloading_end_time', formatted);
      } else if (key === 'inward_unloading_start_date' || key === 'inward_unloading_end_date') {
        // Combined into start/end time values, omit separate fields
      } else {
        submissionData.append(key, formData[key]);
      }
    });

    invoicePhotos.forEach(file => {
      submissionData.append('inward_invoice_photos', file);
    });
    if (podPhoto) submissionData.append('inward_pod_photo', podPhoto);
    if (sealPhoto) submissionData.append('inward_vehicle_seal_photo', sealPhoto);
    if (vehicleTempPhoto) submissionData.append('inward_vehicle_temp_photo', vehicleTempPhoto);
    if (materialTempPhoto) submissionData.append('inward_material_temp_photo', materialTempPhoto);
    if (vehicleBackPhoto) submissionData.append('inward_vehicle_back_side_photo', vehicleBackPhoto);
    if (vehicleBackWithMaterialPhoto) submissionData.append('inward_vehicle_back_side_photo_with_material', vehicleBackWithMaterialPhoto);
    countSheetPhotos.forEach(file => {
      submissionData.append('inward_count_sheet_photo', file);
    });

    damagePhotos.forEach(file => {
      submissionData.append('inward_damage_boxes_photo', file);
    });

    if (!editData && submissionKeyRef.current) {
      submissionData.append('client_submission_id', submissionKeyRef.current.id);
      submissionData.append('client_submitted_at', submissionKeyRef.current.at);
    }

    let res;
    if (editData) {
      res = await updateInwardLog(editData.inward_id, submissionData);
    } else {
      res = await addInwardLog(submissionData);
    }
    setSubmitting(false);
    setVerificationData(null);

     if (res) {
      submissionKeyRef.current = null;
      setSuccessMsg(editData ? 'Inward record updated successfully' : 'Inward temperature saved successfully');
      if (editData && setEditData) setEditData(null);
      loadLogs();
      if (editData && setActiveDOMenu) {
        setTimeout(() => setActiveDOMenu('History'), 1500);
      }

      // Reset State
      setDriverCountryCode('+91');
      setFormData({
        inward_entry_date: todayStr,
        inward_vehicle_no: '',
        inward_seal_no: '',
        inward_invoice_no: '',
        inward_mens_power: '',
        inward_vehicle_temp: '',
        inward_material_temp: '',
        inward_transporter_name: '',
        inward_driver_name: '',
        inward_driver_no: '',
        inward_client_name: '',
        inward_dock_no: '',
        inward_vehicle_reporting_time: '11:00',
        inward_unloading_start_time: '11:30',
        inward_unloading_duration_hours: '1',
        inward_unloading_duration_mins: '0',
        inward_unloading_end_time: '12:30',
        inward_pallets_in_qty: '',
        inward_invoice_qty: '',
        inward_received_qty: '',
        inward_received_boxes_qty: '',
        inward_short_received_boxes_qty: 0,
        inward_excess_received_boxes_qty: 0,
        inward_damage_received_boxes_qty: '',
        inward_material_type: 'Frozen',
        inward_unloading_supervisor_name: '',
        inward_remarks: ''
      });
      setInvoicePhotos([]);
      setInvoicePreviews([]);
      setPodPhoto(null);
      setPodPreview(null);
      setSealPhoto(null);
      setSealPreview(null);
      setVehicleTempPhoto(null);
      setVehicleTempPreview(null);
      setMaterialTempPhoto(null);
      setMaterialTempPreview(null);
      setVehicleBackPhoto(null);
      setVehicleBackPreview(null);
      setVehicleBackWithMaterialPhoto(null);
      setVehicleBackWithMaterialPreview(null);
      setCountSheetPhotos([]);
      setCountSheetPreviews([]);
      setDamagePhotos([]);
      setDamagePreviews([]);
      setInvalidFields({});

      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  const handleDeleteRecord = async (id) => {
    if (window.confirm('Are you sure you want to delete this Inward record?')) {
      await deleteInwardLog(id);
      loadLogs();
    }
  };

  const handleInputChange = (e) => {
    let { name, value } = e.target;

    // 1. Vehicle Number (uppercase and auto hyphen formatting like MP-04-ZD-1990)
    if (name === 'inward_vehicle_no') {
      const raw = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
      let formatted = '';
      if (raw.length <= 2) {
        formatted = raw;
      } else if (raw.length <= 4) {
        formatted = `${raw.slice(0, 2)}-${raw.slice(2)}`;
      } else if (raw.length <= 6) {
        formatted = `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4)}`;
      } else {
        formatted = `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
      }
      value = formatted;
    }
    // 2. Seal Number (uppercase only)
    else if (name === 'inward_seal_no') {
      value = value.toUpperCase();
    }
    else if (name === 'inward_invoice_no') {
      value = value.toUpperCase();
    }
    // 2b. Text fields (names only)
    else if (['inward_driver_name', 'inward_unloading_supervisor_name', 'inward_transporter_name'].includes(name)) {
      value = value.replace(/[^a-zA-Z\s]/g, '');
    }
    // 3. Phone number (Allow only digits, restrict length dynamically)
    else if (name === 'inward_driver_no') {
      const digits = value.replace(/\D/g, '');
      const maxDigits = (driverCountryCode === '+91') ? 10 : (['+971', '+966', '+61'].includes(driverCountryCode) ? 9 : (driverCountryCode === '+65' ? 8 : 10));
      value = digits.slice(0, maxDigits);
    }
    // 4. Integer fields (Pallets, Boxes, Quantities)
    else if (['inward_pallets_in_qty', 'inward_invoice_qty', 'inward_received_qty', 'inward_received_boxes_qty', 'inward_damage_received_boxes_qty', 'inward_mens_power'].includes(name)) {
      value = value.replace(/\D/g, '');
    }
    // 4b. Duration fields (with 60-mins rollover validation)
    else if (name === 'inward_unloading_duration_hours') {
      value = value.replace(/\D/g, '');
      if (parseInt(value) > 24) value = '24';
    }
    else if (name === 'inward_unloading_duration_mins') {
      value = value.replace(/\D/g, '');
      const minsNum = parseInt(value) || 0;
      if (minsNum >= 60) {
        const extraHours = Math.floor(minsNum / 60);
        const remMins = minsNum % 60;

        setFormData(prev => {
          const currentHours = parseInt(prev.inward_unloading_duration_hours) || 0;
          const newHours = Math.min(currentHours + extraHours, 24);
          return {
            ...prev,
            inward_unloading_duration_hours: newHours.toString(),
            inward_unloading_duration_mins: remMins.toString()
          };
        });
        return;
      }
    }
    // 5. Float/Decimal fields (Temperatures)
    else if (['inward_vehicle_temp', 'inward_material_temp'].includes(name)) {
      // Allow only digits, dot, and minus sign
      let clean = value.replace(/[^\d\.\-]/g, '');
      // Ensure minus sign only at start
      if (clean.includes('-')) {
        const parts = clean.split('-');
        clean = (clean.startsWith('-') ? '-' : '') + parts.join('');
      }
      // Ensure only single dot
      if (clean.includes('.')) {
        const parts = clean.split('.');
        clean = parts[0] + '.' + parts.slice(1).join('');
      }
      value = clean;
    }
    // 6. Text-only Name fields (no numbers or punctuation except dot and dash)
    else if (name.toLowerCase().includes('name')) {
      value = value.replace(/[^a-zA-Z\s\.\-]/g, '');
    }

    if (name === 'inward_entry_date') {
      setFormData(prev => ({
        ...prev,
        inward_entry_date: value,
        inward_unloading_start_date: value,
        inward_unloading_end_date: value
      }));
      clearInvalidMany(['inward_entry_date', 'inward_unloading_start_date', 'inward_unloading_end_date']);
      return;
    }

    if (name === 'inward_unloading_start_date') {
      const minDate = formData.inward_entry_date;
      let cleanVal = value;
      if (cleanVal < minDate) {
        cleanVal = minDate;
      }
      setFormData(prev => ({
        ...prev,
        inward_unloading_start_date: cleanVal,
        inward_unloading_end_date: cleanVal
      }));
      clearInvalidMany(['inward_unloading_start_date', 'inward_unloading_end_date', 'inward_unloading_start_time']);
      return;
    }

    if (name === 'inward_unloading_end_date') {
      const minDate = formData.inward_unloading_start_date || formData.inward_entry_date;
      let cleanVal = value;
      if (cleanVal < minDate) {
        cleanVal = minDate;
      }
      setFormData(prev => ({
        ...prev,
        inward_unloading_end_date: cleanVal
      }));
      clearInvalidMany(['inward_unloading_end_date', 'inward_unloading_end_time']);
      return;
    }

    if (name === 'inward_vehicle_reporting_time') {
      setFormData(prev => ({ ...prev, inward_vehicle_reporting_time: value }));
      clearInvalidMany(['inward_vehicle_reporting_time', 'inward_unloading_start_time']);
      return;
    }

    if (name === 'inward_unloading_start_time') {
      setFormData(prev => ({ ...prev, inward_unloading_start_time: value }));
      clearInvalidMany(['inward_unloading_start_time', 'inward_unloading_end_time']);
      return;
    }

    if (name === 'inward_unloading_end_time') {
      setFormData(prev => ({ ...prev, inward_unloading_end_time: value }));
      clearInvalid('inward_unloading_end_time');
      return;
    }

    if (name === 'inward_received_boxes_qty') {
      setFormData(prev => ({ ...prev, inward_received_boxes_qty: value, inward_received_qty: value }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    clearInvalid(name);
  };

  return (
    <div className="temp-monitor-page inward-monitor-page">
      {/* Header Banner */}
      <div className="do-header-banner">
        <div className="do-header-left">
          <h2>
            <ArrowDownLeft size={26} color="#00a2e8" />
            <span>DO Inward Temperature Monitor</span>
          </h2>
          <p>
            Verify and record vehicle arrivals, pallet counts, cargo temperature checks, and multiple invoice documents.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="success-banner-inward">
          <CheckCircle size={20} color="#16a34a" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Single Card Form exactly like DO Daily Temp Monitor */}
      <div className="inward-form-card direct-form-card">
        {editData && (
          <div className="editing-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', padding: '10px 16px', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
            <span style={{ color: '#b45309', fontWeight: 700 }}>⚠️ Editing Inward Record: {editData.inward_vehicle_no} ({editData.inward_entry_date ? editData.inward_entry_date.split('T')[0] : ''})</span>
            <button 
              type="button" 
              className="btn-cancel-edit" 
              onClick={() => {
                setEditData(null);
                setFormData({
                  inward_entry_date: todayStr,
                  inward_vehicle_no: '',
                  inward_seal_no: '',
                  inward_invoice_no: '',
                  inward_mens_power: '',
                  inward_vehicle_temp: '',
                  inward_material_temp: '',
                  inward_transporter_name: '',
                  inward_driver_name: '',
                  inward_driver_no: '',
                  inward_client_name: '',
                  inward_dock_no: '',
                  inward_vehicle_reporting_time: '11:00',
                  inward_unloading_start_time: '11:30',
                  inward_unloading_duration_hours: '1',
                  inward_unloading_duration_mins: '0',
                  inward_unloading_end_time: '12:30',
                  inward_pallets_in_qty: '',
                  inward_invoice_qty: '',
                  inward_received_qty: '',
                  inward_received_boxes_qty: '',
                  inward_short_received_boxes_qty: 0,
                  inward_excess_received_boxes_qty: 0,
                  inward_damage_received_boxes_qty: '',
                  inward_material_type: 'Frozen',
                  inward_unloading_supervisor_name: '',
                  inward_remarks: ''
                });
                setDriverCountryCode('+91');
                setInvoicePhotos([]);
                setInvoicePreviews([]);
                setPodPhoto(null);
                setPodPreview(null);
                setSealPhoto(null);
                setSealPreview(null);
                setVehicleTempPhoto(null);
                setVehicleTempPreview(null);
                setMaterialTempPhoto(null);
                setMaterialTempPreview(null);
                setVehicleBackPhoto(null);
                setVehicleBackPreview(null);
                setVehicleBackWithMaterialPhoto(null);
                setVehicleBackWithMaterialPreview(null);
                setCountSheetPhotos([]);
                setCountSheetPreviews([]);
                setDamagePhotos([]);
                setDamagePreviews([]);
              }}
              style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
            >
              Cancel Edit
            </button>
          </div>
        )}
        <div className="direct-form-header">
          <h3>
            <PlusCircle size={18} color="#00a2e8" />
            <span>{editData ? 'Edit Inward Record' : 'Add New Inward Record'}</span>
          </h3>
        </div>

        <form className="inward-entry-form" onSubmit={handleFormSubmit}>
          <div className="form-cards-grid">

            {/* Section 1: Basic Inward Info */}
            <div className="form-section-box">
              <h5 className="section-box-title">
                <Calendar size={15} /> 1. Basic Inward Info
              </h5>
              <div className="inward-form-grid">
                <div className="inward-form-group">
                  <label>Entry Date <ReqStar field="inward_entry_date" /></label>
                  <input
                    type="date"
                    name="inward_entry_date"
                    value={formData.inward_entry_date}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="inward-form-group">
                  <label>Client Name <ReqStar field="inward_client_name" /></label>
                  <input
                    type="text"
                    name="inward_client_name"
                    value={formData.inward_client_name}
                    onChange={handleInputChange}
                    placeholder="e.g. ColdStore Logistics"
                    required
                  />
                </div>

                <div className="inward-form-group">
                  <label>Dock No. <ReqStar field="inward_dock_no" /></label>
                  <input
                    type="text"
                    name="inward_dock_no"
                    value={formData.inward_dock_no}
                    onChange={handleInputChange}
                    placeholder="e.g. Dock-1"
                    required
                  />
                </div>

                <div className="inward-form-group">
                  <label>Material Type <ReqStar field="inward_material_type" /></label>
                  {isMaterialCustom ? (
                    <div className="input-with-reset">
                      <input
                        type="text"
                        name="inward_material_type"
                        value={formData.inward_material_type}
                        onChange={handleInputChange}
                        placeholder="Enter Material Type"
                        required
                      />
                      <button type="button" className="field-reset-btn" onClick={() => { setIsMaterialCustom(false); setFormData(p => ({ ...p, inward_material_type: 'Frozen' })); }}>Select</button>
                    </div>
                  ) : (
                    <select
                      name="inward_material_type"
                      value={formData.inward_material_type}
                      required
                      onChange={(e) => {
                        if (e.target.value === 'other') {
                          setIsMaterialCustom(true);
                          setFormData(p => ({ ...p, inward_material_type: '' }));
                        } else {
                          handleInputChange(e);
                        }
                      }}
                    >
                      <option value="Frozen">Frozen</option>
                      <option value="dry">dry</option>
                      <option value="chiller">chiller</option>
                      <option value="other">other</option>
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Vehicle & Transporter */}
            <div className="form-section-box">
              <h5 className="section-box-title">
                <Truck size={15} /> 2. Vehicle & Transporter
              </h5>
              <div className="inward-form-grid">
                <div className="inward-form-group">
                  <label>Vehicle No. <ReqStar field="inward_vehicle_no" /></label>
                  <input
                    type="text"
                    name="inward_vehicle_no"
                    value={formData.inward_vehicle_no}
                    onChange={handleInputChange}
                    placeholder="e.g. MH-12-QW-1234"
                    required
                  />
                </div>

                <div className="inward-form-group">
                  <label>Seal No.</label>
                  <input
                    type="text"
                    name="inward_seal_no"
                    value={formData.inward_seal_no}
                    onChange={handleInputChange}
                    placeholder="e.g. SL-998822"
                  />
                </div>

                <div className="inward-form-group">
                  <label>Invoice No. <ReqStar field="inward_invoice_no" /></label>
                  <input
                    type="text"
                    name="inward_invoice_no"
                    value={formData.inward_invoice_no}
                    onChange={handleInputChange}
                    placeholder="e.g. INV-12345"
                    required
                  />
                </div>

                <div className="inward-form-group">
                  <label>Mens Power</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="inward_mens_power"
                    value={formData.inward_mens_power}
                    onChange={handleInputChange}
                    placeholder="e.g. 4"
                  />
                </div>

                <div className="inward-form-group">
                  <label>Transporter Name <ReqStar field="inward_transporter_name" /></label>
                  <input
                    type="text"
                    name="inward_transporter_name"
                    value={formData.inward_transporter_name}
                    onChange={handleInputChange}
                    placeholder="e.g. BlueDart Express"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Driver & Timing Info */}
            <div className="form-section-box">
              <h5 className="section-box-title">
                <FileText size={15} /> 3. Driver & Timing Info
              </h5>
              <div className="inward-form-grid">
                <div className="inward-form-group">
                  <label>Driver Name <ReqStar field="inward_driver_name" /></label>
                  <input
                    type="text"
                    name="inward_driver_name"
                    value={formData.inward_driver_name}
                    onChange={handleInputChange}
                    placeholder="e.g. Rajesh kumar"
                    required
                  />
                </div>
                <div className="inward-form-group">
                  <label>Driver Phone No. <ReqStar field="inward_driver_no" /></label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      value={driverCountryCode}
                      onChange={(e) => {
                        const newCode = e.target.value;
                        setDriverCountryCode(newCode);
                        const maxDigits = (newCode === '+91') ? 10 : (['+971', '+966', '+61'].includes(newCode) ? 9 : (newCode === '+65' ? 8 : 10));
                        setFormData(prev => ({
                          ...prev,
                          inward_driver_no: (prev.inward_driver_no || '').replace(/\D/g, '').slice(0, maxDigits)
                        }));
                      }}
                      style={{ width: '90px', padding: '8px 4px', fontSize: '0.85rem', border: '1px solid #ccc', borderRadius: '4px', background: 'var(--surface)' }}
                    >
                      <option value="+91">+91 (IN)</option>
                      <option value="+1">+1 (US)</option>
                      <option value="+44">+44 (UK)</option>
                      <option value="+971">+971 (AE)</option>
                      <option value="+966">+966 (SA)</option>
                      <option value="+65">+65 (SG)</option>
                      <option value="+61">+61 (AU)</option>
                      <option value="+92">+92 (PK)</option>
                      <option value="+880">+880 (BD)</option>
                      <option value="+977">+977 (NP)</option>
                    </select>
                    <input
                      type="text"
                      name="inward_driver_no"
                      value={formData.inward_driver_no}
                      onChange={handleInputChange}
                      placeholder="98765 43210"
                      style={{ flex: 1 }}
                      required
                    />
                  </div>
                </div>
                <div className="inward-form-group">
                  <label>Vehicle Reporting Time <ReqStar field="inward_vehicle_reporting_time" /></label>
                  <input
                    type="time"
                    name="inward_vehicle_reporting_time"
                    value={formData.inward_vehicle_reporting_time}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="inward-form-group">
                  <label>Unloading Start Date <ReqStar field="inward_unloading_start_date" /></label>
                  <input
                    type="date"
                    name="inward_unloading_start_date"
                    min={formData.inward_entry_date}
                    value={formData.inward_unloading_start_date}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="inward-form-group">
                  <label>Unloading Start Time <ReqStar field="inward_unloading_start_time" /></label>
                  <input
                    type="time"
                    name="inward_unloading_start_time"
                    value={formData.inward_unloading_start_time}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="inward-form-group">
                  <label>Unloading End Date <ReqStar field="inward_unloading_end_date" /></label>
                  <input
                    type="date"
                    name="inward_unloading_end_date"
                    min={formData.inward_unloading_start_date || formData.inward_entry_date}
                    value={formData.inward_unloading_end_date}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="inward-form-group">
                  <label>Unloading End Time <ReqStar field="inward_unloading_end_time" /></label>
                  <input
                    type="time"
                    name="inward_unloading_end_time"
                    value={formData.inward_unloading_end_time ? (formData.inward_unloading_end_time.includes(' ') ? formData.inward_unloading_end_time.split(' ')[1] : formData.inward_unloading_end_time) : '12:30'}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="inward-form-group">
                  <label>Unloading Duration (Auto)</label>
                  <input
                    type="text"
                    name="inward_unloading_duration_combined"
                    value={(() => {
                      const h = parseInt(formData.inward_unloading_duration_hours) || 0;
                      const m = parseInt(formData.inward_unloading_duration_mins) || 0;
                      if (h >= 24) {
                        const days = Math.floor(h / 24);
                        const remH = h % 24;
                        return `${days}d ${remH}h ${m}m (${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')})`;
                      }
                      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                    })()}
                    readOnly
                    className="readonly-field"
                    style={{ background: 'var(--surface-overlay, #f5f5f5)', cursor: 'not-allowed' }}
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Temperature Checks */}
            <div className="form-section-box">
              <h5 className="section-box-title">
                <Thermometer size={15} /> 4. Temperature Checks
              </h5>
              <div className="inward-form-grid">
                <div className="inward-form-group">
                  <label>Inward Vehicle Temp. (°C) <ReqStar field="inward_vehicle_temp" /></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="inward_vehicle_temp"
                    value={formData.inward_vehicle_temp}
                    onChange={handleInputChange}
                    placeholder="-18.5"
                    required
                  />
                </div>
                <div className="inward-form-group">
                  <label>Inward Material Temp. (°C) <ReqStar field="inward_material_temp" /></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="inward_material_temp"
                    value={formData.inward_material_temp}
                    onChange={handleInputChange}
                    placeholder="-20.2"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Section 5: Pallets & Boxes Quantity Audit */}
            <div className="form-section-box">
              <h5 className="section-box-title">
                <CheckCircle size={15} /> 5. Pallets & Boxes Quantity Audit
              </h5>
              <div className="inward-form-grid">
                <div className="inward-form-group">
                  <label>Pallets In Qty <ReqStar field="inward_pallets_in_qty" /></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="inward_pallets_in_qty"
                    value={formData.inward_pallets_in_qty}
                    onChange={handleInputChange}
                    placeholder="0"
                    required
                  />
                </div>
                <div className="inward-form-group">
                  <label>Invoice Boxes Qty <ReqStar field="inward_invoice_qty" /></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="inward_invoice_qty"
                    value={formData.inward_invoice_qty}
                    onChange={handleInputChange}
                    placeholder="0"
                    required
                  />
                </div>
                <div className="inward-form-group">
                  <label>Boxes Received Qty <ReqStar field="inward_received_boxes_qty" /></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="inward_received_boxes_qty"
                    value={formData.inward_received_boxes_qty}
                    onChange={handleInputChange}
                    placeholder="0"
                    required
                  />
                </div>
                <div className="inward-form-group">
                  <label>Damage Qty</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="inward_damage_received_boxes_qty"
                    value={formData.inward_damage_received_boxes_qty}
                    onChange={handleInputChange}
                    placeholder="0"
                  />
                </div>
                <div className="inward-form-group">
                  <label>Short Qty (Auto)</label>
                  <input
                    type="text"
                    name="inward_short_received_boxes_qty"
                    value={formData.inward_short_received_boxes_qty}
                    readOnly
                    className="readonly-field short"
                  />
                </div>
                <div className="inward-form-group">
                  <label>Excess Qty (Auto)</label>
                  <input
                    type="text"
                    name="inward_excess_received_boxes_qty"
                    value={formData.inward_excess_received_boxes_qty}
                    readOnly
                    className="readonly-field excess"
                  />
                </div>
              </div>
            </div>

            {/* Section 6: Remarks & Supervisor */}
            <div className="form-section-box">
              <h5 className="section-box-title">
                <FileText size={15} /> 6. Remarks & Supervisor Details
              </h5>
              <div className="inward-form-grid">
                <div className="inward-form-group">
                  <label>Unloading Supervisor Name <ReqStar field="inward_unloading_supervisor_name" /></label>
                  <input
                    type="text"
                    name="inward_unloading_supervisor_name"
                    value={formData.inward_unloading_supervisor_name}
                    onChange={handleInputChange}
                    placeholder="e.g. Sandeep V."
                    required
                  />
                </div>
                <div className="inward-form-group span-3">
                  <label>Remarks</label>
                  <textarea
                    name="inward_remarks"
                    value={formData.inward_remarks}
                    onChange={handleInputChange}
                    placeholder="Write inward monitoring notes..."
                    rows="2"
                  />
                </div>
              </div>
            </div>

            {/* Section 7: Inspection Photos Uploads */}
            <div className="form-section-box">
              <h5 className="section-box-title">
                <Camera size={15} /> 7. Inspection Photos Upload
              </h5>
              <div className="inward-form-grid">

                {/* Invoice Photos */}
                <div className="inward-form-group file-field">
                  <label>Invoice Photos <ReqStar field="invoice_photos" /></label>
                  {invoicePreviews.length === 0 ? (
                    <div className="image-uploader-btn">
                      <Camera size={18} />
                      <span>Choose Invoice Photos</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleMultipleInvoiceChange}
                      />
                    </div>
                  ) : (
                    <div className="multi-photo-verified-list">
                      {invoicePreviews.map((url, idx) => (
                        <div key={`invoice-${idx}-${url}`} className="sensor-photo-verified-card">
                          <div className="verified-thumb-wrapper">
                            <img src={url} alt={`Invoice ${idx + 1}`} />
                            <div className="verified-check-badge">
                              <Check size={8} />
                            </div>
                          </div>
                          <div className="verified-action-group">
                            <button
                              type="button"
                              className="retake-icon-btn"
                              onClick={() => {
                                setInvoicePhotos((p) => p.filter((_, i) => i !== idx));
                                setInvoicePreviews((p) => p.filter((_, i) => i !== idx));
                              }}
                              title="Retake Photo"
                            >
                              <RefreshCw size={12} />
                              <span>Retake</span>
                            </button>
                            <button
                              type="button"
                              className="delete-photo-btn"
                              onClick={() => {
                                setInvoicePhotos((p) => p.filter((_, i) => i !== idx));
                                setInvoicePreviews((p) => p.filter((_, i) => i !== idx));
                              }}
                              title="Remove Photo"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="image-uploader-btn">
                        <Camera size={18} />
                        <span>Add Invoice Photos</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleMultipleInvoiceChange}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* POD Upload */}
                <div className="inward-form-group file-field">
                  <label>POD Photo</label>
                  {!podPreview ? (
                    <div className="image-uploader-btn">
                      <Camera size={18} />
                      <span>Choose POD Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleSingleImageChange(e, setPodPhoto, setPodPreview)}
                      />
                    </div>
                  ) : (
                    <div className="sensor-photo-verified-card">
                      <div className="verified-thumb-wrapper">
                        <img src={podPreview} alt="POD Verified" />
                        <div className="verified-check-badge">
                          <Check size={8} />
                        </div>
                      </div>
                      <div className="verified-action-group">
                        <button
                          type="button"
                          className="retake-icon-btn"
                          onClick={() => { setPodPhoto(null); setPodPreview(null); }}
                          title="Retake Photo"
                        >
                          <RefreshCw size={12} />
                          <span>Retake</span>
                        </button>
                        <button
                          type="button"
                          className="delete-photo-btn"
                          onClick={() => { setPodPhoto(null); setPodPreview(null); }}
                          title="Remove Photo"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Vehicle Seal Upload */}
                <div className="inward-form-group file-field">
                  <label>Vehicle Seal Photo</label>
                  {!sealPreview ? (
                    <div className="image-uploader-btn">
                      <Camera size={18} />
                      <span>Choose Seal Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleSingleImageChange(e, setSealPhoto, setSealPreview)}
                      />
                    </div>
                  ) : (
                    <div className="sensor-photo-verified-card">
                      <div className="verified-thumb-wrapper">
                        <img src={sealPreview} alt="Seal Verified" />
                        <div className="verified-check-badge">
                          <Check size={8} />
                        </div>
                      </div>
                      <div className="verified-action-group">
                        <button
                          type="button"
                          className="retake-icon-btn"
                          onClick={() => { setSealPhoto(null); setSealPreview(null); }}
                          title="Retake Photo"
                        >
                          <RefreshCw size={12} />
                          <span>Retake</span>
                        </button>
                        <button
                          type="button"
                          className="delete-photo-btn"
                          onClick={() => { setSealPhoto(null); setSealPreview(null); }}
                          title="Remove Photo"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Vehicle Back Side Upload */}
                <div className="inward-form-group file-field">
                  <label>Vehicle Back Side Photo <ReqStar field="vehicle_back_photo" /></label>
                  {!vehicleBackPreview ? (
                    <div className="image-uploader-btn">
                      <Camera size={18} />
                      <span>Choose Back Side Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleSingleImageChange(e, setVehicleBackPhoto, setVehicleBackPreview, 'vehicle_back_photo')}
                      />
                    </div>
                  ) : (
                    <div className="sensor-photo-verified-card">
                      <div className="verified-thumb-wrapper">
                        <img src={vehicleBackPreview} alt="Back Side Verified" />
                        <div className="verified-check-badge">
                          <Check size={8} />
                        </div>
                      </div>
                      <div className="verified-action-group">
                        <button
                          type="button"
                          className="retake-icon-btn"
                          onClick={() => { setVehicleBackPhoto(null); setVehicleBackPreview(null); }}
                          title="Retake Photo"
                        >
                          <RefreshCw size={12} />
                          <span>Retake</span>
                        </button>
                        <button
                          type="button"
                          className="delete-photo-btn"
                          onClick={() => { setVehicleBackPhoto(null); setVehicleBackPreview(null); }}
                          title="Remove Photo"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Vehicle Back Side with Material Upload */}
                <div className="inward-form-group file-field">
                  <label>Vehicle Back Side Photo with Material <ReqStar field="vehicle_back_with_material_photo" /></label>
                  {!vehicleBackWithMaterialPreview ? (
                    <div className="image-uploader-btn">
                      <Camera size={18} />
                      <span>Choose Back Side Photo with Material</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleSingleImageChange(e, setVehicleBackWithMaterialPhoto, setVehicleBackWithMaterialPreview, 'vehicle_back_with_material_photo')}
                      />
                    </div>
                  ) : (
                    <div className="sensor-photo-verified-card">
                      <div className="verified-thumb-wrapper">
                        <img src={vehicleBackWithMaterialPreview} alt="Back Side with Material Verified" />
                        <div className="verified-check-badge">
                          <Check size={8} />
                        </div>
                      </div>
                      <div className="verified-action-group">
                        <button
                          type="button"
                          className="retake-icon-btn"
                          onClick={() => { setVehicleBackWithMaterialPhoto(null); setVehicleBackWithMaterialPreview(null); }}
                          title="Retake Photo"
                        >
                          <RefreshCw size={12} />
                          <span>Retake</span>
                        </button>
                        <button
                          type="button"
                          className="delete-photo-btn"
                          onClick={() => { setVehicleBackWithMaterialPhoto(null); setVehicleBackWithMaterialPreview(null); }}
                          title="Remove Photo"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Vehicle Temp Upload */}
                <div className="inward-form-group file-field">
                  <label>Inward Vehicle Temp Photo <ReqStar field="vehicle_temp_photo" /></label>
                  {!vehicleTempPreview ? (
                    <div className="image-uploader-btn">
                      <Camera size={18} />
                      <span>Choose Inward Vehicle Temp Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleSingleImageChange(e, setVehicleTempPhoto, setVehicleTempPreview, 'vehicle_temp_photo')}
                      />
                    </div>
                  ) : (
                    <div className="sensor-photo-verified-card">
                      <div className="verified-thumb-wrapper">
                        <img src={vehicleTempPreview} alt="Vehicle Temp Verified" />
                        <div className="verified-check-badge">
                          <Check size={8} />
                        </div>
                      </div>
                      <div className="verified-action-group">
                        <button
                          type="button"
                          className="retake-icon-btn"
                          onClick={() => { setVehicleTempPhoto(null); setVehicleTempPreview(null); }}
                          title="Retake Photo"
                        >
                          <RefreshCw size={12} />
                          <span>Retake</span>
                        </button>
                        <button
                          type="button"
                          className="delete-photo-btn"
                          onClick={() => { setVehicleTempPhoto(null); setVehicleTempPreview(null); }}
                          title="Remove Photo"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Material Temp Upload */}
                <div className="inward-form-group file-field">
                  <label>Inward Material Temp Photo <ReqStar field="material_temp_photo" /></label>
                  {!materialTempPreview ? (
                    <div className="image-uploader-btn">
                      <Camera size={18} />
                      <span>Choose Inward Material Temp Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleSingleImageChange(e, setMaterialTempPhoto, setMaterialTempPreview, 'material_temp_photo')}
                      />
                    </div>
                  ) : (
                    <div className="sensor-photo-verified-card">
                      <div className="verified-thumb-wrapper">
                        <img src={materialTempPreview} alt="Material Temp Verified" />
                        <div className="verified-check-badge">
                          <Check size={8} />
                        </div>
                      </div>
                      <div className="verified-action-group">
                        <button
                          type="button"
                          className="retake-icon-btn"
                          onClick={() => { setMaterialTempPhoto(null); setMaterialTempPreview(null); }}
                          title="Retake Photo"
                        >
                          <RefreshCw size={12} />
                          <span>Retake</span>
                        </button>
                        <button
                          type="button"
                          className="delete-photo-btn"
                          onClick={() => { setMaterialTempPhoto(null); setMaterialTempPreview(null); }}
                          title="Remove Photo"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Inward Count Sheet Photos Upload */}
                <div className="inward-form-group file-field">
                  <label>Inward Count Sheet Photos <ReqStar field="count_sheet_photo" /></label>
                  <div className="image-uploader-btn">
                    <Camera size={18} />
                    <span>Choose Count Sheet Photos</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleMultipleCountSheetChange}
                    />
                  </div>
                  {countSheetPreviews.length > 0 && (
                    <div className="preview-thumbnails">
                      {countSheetPreviews.map((url, idx) => (
                        <div key={idx} className="thumb-container">
                          <img src={url} alt={`Count Sheet ${idx}`} className="mini-thumb" />
                          <button
                            type="button"
                            className="thumb-remove"
                            onClick={() => {
                              setCountSheetPhotos(p => p.filter((_, i) => i !== idx));
                              setCountSheetPreviews(p => p.filter((_, i) => i !== idx));
                            }}
                            title="Remove Photo"
                          >
                            ×
                          </button>
                          <div className="thumb-verified-check">
                            <Check size={6} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Damage Boxes Photo */}
                <div className="inward-form-group file-field">
                  <label>Damage Boxes Photos <ReqStar field="damage_boxes_photo" /> (required if Damage Qty &gt; 0)</label>
                  <div
                    className={`image-uploader-btn ${((parseInt(formData.inward_damage_received_boxes_qty) || 0) <= 0) ? 'disabled' : ''}`}
                    style={((parseInt(formData.inward_damage_received_boxes_qty) || 0) <= 0) ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
                  >
                    <Camera size={18} />
                    <span>Choose Damage Photos</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleMultipleDamageChange}
                      disabled={((parseInt(formData.inward_damage_received_boxes_qty) || 0) <= 0)}
                    />
                  </div>
                  {damagePreviews.length > 0 && (
                    <div className="preview-thumbnails">
                      {damagePreviews.map((url, idx) => (
                        <div key={idx} className="thumb-container">
                          <img src={url} alt={`Damage ${idx}`} className="mini-thumb" />
                          <button
                            type="button"
                            className="thumb-remove"
                            onClick={() => {
                              setDamagePhotos(p => p.filter((_, i) => i !== idx));
                              setDamagePreviews(p => p.filter((_, i) => i !== idx));
                            }}
                            title="Remove Photo"
                          >
                            ×
                          </button>
                          <div className="thumb-verified-check">
                            <Check size={6} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>

          {/* Form Action Submit */}
          <div className="submit-section-inward">
            <button 
              type="submit" 
              className="submit-inward-btn" 
              disabled={submitting || compressing}
              style={editData ? { background: 'linear-gradient(135deg, #f97316, #ea580c)', borderColor: '#ea580c', boxShadow: '0 4px 14px rgba(249, 115, 22, 0.35)' } : {}}
            >
              {submitting ? <Loader2 size={18} className="spinner-icon" /> : <Plus size={18} />}
              <span>{submitting ? 'Saving...' : (editData ? 'Update Inward Record' : 'Add Inward Record')}</span>
            </button>
          </div>

        </form>
      </div>



      {/* Lightbox Modal */}
      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxImage} alt="Full Size" />
            <button className="lightbox-close" onClick={() => setLightboxImage(null)}>×</button>
          </div>
        </div>
      )}

      {/* Verification Modal Popup Overlay — portaled so Super Admin edit also shows DO-style popup */}
      {verificationData && createPortal(
        <div className="verification-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="inward-verify-title">
          <div className="verification-modal-content">
            <div className="direct-form-header">
              <h3 id="inward-verify-title" className="verify-title">
                <CheckCircle size={20} color="#10b981" />
                <span>Verify Inward Time Audit</span>
              </h3>
            </div>

            <div className="verification-content-wrapper-modal">
              <div className="verify-time-comparison-box">
                <h4>Inward Punctuality Audit</h4>

                <div className="comparison-row">
                  <div className="comp-item">
                    <span className="comp-label">Calculated End Time</span>
                    <div className="comp-val-dt">
                      <span className="comp-date">{verificationData.end_date_str}</span>
                      <span className="comp-time">{verificationData.end_time_str}</span>
                    </div>
                  </div>
                  <div className="comp-divider">⚡</div>
                  <div className="comp-item">
                    <span className="comp-label">Inspection Photo Time</span>
                    <div className="comp-val-dt">
                      <span className="comp-date">{verificationData.photo_date_str}</span>
                      <span className="comp-time">{verificationData.photo_time_str}</span>
                    </div>
                  </div>
                </div>

                <div className="variance-audit-result">
                  <span>Variance Detected:</span>
                  <strong className={`variance-pill ${verificationData.time_variance_minutes > 120 ? 'variance-red' : 'variance-green'
                    }`}>
                    {verificationData.time_variance_minutes} minutes
                  </strong>
                </div>

                {verificationData.time_variance_minutes <= 120 ? (
                  <div className="variance-success-banner">
                    ✅ Audit Verified: Inspection photos recorded within the expected unloading window.
                  </div>
                ) : (
                  <div className="variance-alert-banner">
                    ⚠️ Audit Alert: Inspection photos recorded outside the expected unloading window.
                  </div>
                )}

                {verificationData.photo_date_str !== verificationData.end_date_str && (
                  <div className="variance-alert-banner" style={{ marginTop: '8px', border: '1.5px solid #ef4444', color: '#b91c1c', backgroundColor: '#fef2f2' }}>
                    ⚠️ Date Alert: Inspection Photo captured on {verificationData.photo_date_str}, but unloading end date is calculated as {verificationData.end_date_str}!
                  </div>
                )}
              </div>
            </div>

            <div className="verification-actions">
              <button
                type="button"
                className="cancel-verify-btn"
                onClick={() => setVerificationData(null)}
                disabled={submitting}
              >
                <span>Back to Edit Form</span>
              </button>

              <button
                type="button"
                className="confirm-submit-btn"
                onClick={handleConfirmSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="spinner-icon" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <span>Confirm & Save</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
