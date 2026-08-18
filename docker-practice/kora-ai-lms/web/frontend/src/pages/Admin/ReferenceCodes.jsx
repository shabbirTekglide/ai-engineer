import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminDashboardlayout } from '../../components/admin';
import {
    Search,
    Filter,
    Plus,
    Edit2,
    Trash2,
    Eye,
    Loader2,
    CheckCircle,
    XCircle,
    Ticket,
    Download,
    Info,
    Upload
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import {
    deleteReferenceCode,
    fetchReferenceCodes,
    fetchAttributionReport,
    importReferenceCodes
} from '../../store/slicers/referenceCodeSlice';
import { ReferenceCodeDialog } from '../../components/kora/ReferenceCodeDialog';
import { toast } from 'react-toastify';

const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (filename, headers, rows) => {
    const csvContent = [
        headers.map(escapeCsvValue).join(','),
        ...rows.map((row) => row.map(escapeCsvValue).join(','))
    ].join('\r\n');
    const blob = new Blob(['\uFEFF', csvContent, '\r\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

function ReferenceCodes() {
    const [activeTab, setActiveTab] = useState('codes'); // 'codes' or 'attribution'

    // Reference Codes states
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [semesterFilter, setSemesterFilter] = useState('all');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedReferenceCode, setSelectedReferenceCode] = useState(null);
    const [isViewOnly, setIsViewOnly] = useState(false);
    const [isExportingCodes, setIsExportingCodes] = useState(false);
    const [isImportingCodes, setIsImportingCodes] = useState(false);
    const importInputRef = useRef(null);

    // Attribution Report states
    const [attributionSearch, setAttributionSearch] = useState('');
    const [selectedSemester, setSelectedSemester] = useState('all');
    const [selectedProfessor, setSelectedProfessor] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const dispatch = useDispatch();
    const {
        referenceCodes,
        plans,
        loading,
        attributionReport,
        attributionLoading
    } = useSelector((state) => state.referenceCode);

    useEffect(() => {
        if (activeTab === 'codes') {
            dispatch(fetchReferenceCodes({
                active: statusFilter === 'all' ? null : statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : null,
                semester: semesterFilter
            }));
        } else if (activeTab === 'attribution') {
            dispatch(fetchAttributionReport());
        }
    }, [statusFilter, semesterFilter, activeTab, dispatch]);

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [attributionSearch, selectedSemester, selectedProfessor]);

    // Format date in helper
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatExpiryDate = (dateString) => {
        if (!dateString) return 'N/A';

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';

        const year = date.getUTCFullYear();
        const month = date.getUTCMonth();
        const day = date.getUTCDate();

        return new Date(Date.UTC(year, month, day)).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
        });
    };

    const getProfessorNameParts = (referenceCode) => {
        if (referenceCode.professorFirstName || referenceCode.professorLastName) {
            return {
                firstName: referenceCode.professorFirstName || '',
                lastName: referenceCode.professorLastName || '',
            };
        }

        const parts = String(referenceCode.professorName || referenceCode.professor || '').trim().split(/\s+/).filter(Boolean);
        return {
            firstName: parts.slice(0, -1).join(' ') || parts[0] || '',
            lastName: parts.length > 1 ? parts[parts.length - 1] : '',
        };
    };

    const getProfessorName = (referenceCode) => {
        const { firstName, lastName } = getProfessorNameParts(referenceCode);
        return `${firstName} ${lastName}`.trim();
    };

    // Filter reference codes (Tab 1)
    const filteredReferenceCodes = referenceCodes.filter((referenceCode) => {
        const q = searchTerm.toLowerCase();
        return (
            referenceCode.code?.toLowerCase().includes(q) ||
            getProfessorName(referenceCode).toLowerCase().includes(q) ||
            referenceCode.semester?.toLowerCase().includes(q)
        );
    });

    const codeSemesters = useMemo(() => {
        const semesters = referenceCodes
            .map((referenceCode) => referenceCode.semester)
            .filter((semester) => typeof semester === 'string' && semester.trim() !== '');
        return Array.from(new Set(semesters)).sort((a, b) => a.localeCompare(b));
    }, [referenceCodes]);

    // Semesters list dynamically populated from loaded report records
    const uniqueSemesters = React.useMemo(() => {
        const semesters = attributionReport
            .map(r => r.semester)
            .filter(sem => typeof sem === 'string' && sem.trim() !== 'N/A' && sem.trim() !== '');
        return Array.from(new Set(semesters));
    }, [attributionReport]);

    // Professors list dynamically populated from loaded report records
    const uniqueProfessors = React.useMemo(() => {
        const professors = attributionReport
            .map(r => r.professor)
            .filter(prof => typeof prof === 'string' && prof.trim() !== 'N/A' && prof.trim() !== '');
        return Array.from(new Set(professors));
    }, [attributionReport]);

    // Filter attribution report (Tab 2)
    const filteredAttribution = React.useMemo(() => {
        return attributionReport.filter(record => {
            const q = attributionSearch.toLowerCase();
            const matchesSearch = !q ||
                (record.studentName || '').toLowerCase().includes(q) ||
                (record.email || '').toLowerCase().includes(q) ||
                (record.classCode || '').toLowerCase().includes(q);

            const matchesSemester = selectedSemester === 'all' || record.semester === selectedSemester;
            const matchesProfessor = selectedProfessor === 'all' || record.professor === selectedProfessor;

            return matchesSearch && matchesSemester && matchesProfessor;
        });
    }, [attributionReport, attributionSearch, selectedSemester, selectedProfessor]);

    // Paginated attribution report list
    const paginatedAttribution = React.useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredAttribution.slice(start, start + itemsPerPage);
    }, [filteredAttribution, currentPage]);

    const totalPages = Math.ceil(filteredAttribution.length / itemsPerPage) || 1;

    const handleCreate = () => {
        setSelectedReferenceCode(null);
        setIsViewOnly(false);
        setDialogOpen(true);
    };

    const handleEdit = (referenceCode) => {
        setSelectedReferenceCode(referenceCode);
        setIsViewOnly(false);
        setDialogOpen(true);
    };

    const handleView = (referenceCode) => {
        setSelectedReferenceCode(referenceCode);
        setIsViewOnly(true);
        setDialogOpen(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this reference code?')) {
            try {
                await dispatch(deleteReferenceCode(id)).unwrap();
                toast.success('Reference code deleted successfully');
            } catch (err) {
                toast.error(err || 'Failed to delete reference code');
            }
        }
    };

    const triggerImportPicker = () => {
        importInputRef.current?.click();
    };

    const handleImportFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) return;

        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!['csv', 'xlsx'].includes(extension)) {
            toast.error('Please upload a CSV or XLSX file.');
            return;
        }

        try {
            setIsImportingCodes(true);
            const formData = new FormData();
            formData.append('file', file);
            const result = await dispatch(importReferenceCodes(formData)).unwrap();
            toast.success(result?.message || 'Reference codes imported successfully');
            dispatch(fetchReferenceCodes({
                active: statusFilter === 'all' ? null : statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : null,
                semester: semesterFilter
            }));
        } catch (error) {
            toast.error(error || 'Failed to import reference codes');
        } finally {
            setIsImportingCodes(false);
        }
    };

    const handleExportReferenceCodes = () => {
        try {
            setIsExportingCodes(true);

            const headers = [
                'Reference Code',
                'First Name',
                'Last Name',
                'Semester',
                'Description',
                'Expiry',
                'Status',
                'Total Assigned',
                ...plans.map((plan) => plan.label),
                'Created At',
                'Updated At',
                'Reference Code ID'
            ];
            const rows = filteredReferenceCodes.map((referenceCode) => {
                const { firstName, lastName } = getProfessorNameParts(referenceCode);
                return [
                    referenceCode.code,
                    firstName,
                    lastName,
                    referenceCode.semester,
                    referenceCode.description || '',
                    referenceCode.expiresAt ? formatExpiryDate(referenceCode.expiresAt) : '',
                    referenceCode.isActive ? 'Active' : 'Inactive',
                    referenceCode.totalAssigned || 0,
                    ...plans.map((plan) => referenceCode.planSubscriptionCounts?.[plan.id] || 0),
                    referenceCode.createdAt ? formatDate(referenceCode.createdAt) : '',
                    referenceCode.updatedAt ? formatDate(referenceCode.updatedAt) : '',
                    referenceCode._id
                ];
            });
            downloadCsv(
                `Reference_Codes_${new Date().toISOString().slice(0, 10)}.csv`,
                headers,
                rows
            );
        } catch (error) {
            toast.error('Failed to export reference codes');
        } finally {
            setIsExportingCodes(false);
        }
    };

    const handleDownloadImportTemplate = () => {
        const currentYear = new Date().getFullYear();
        const templateHeaders = ['First Name', 'Last Name', 'Semester', 'Expiry'];
        const sampleRows = [
            ['Jane', 'Smith', `Fall ${currentYear}`, `${currentYear}-08-01`],
            ['Michael', 'Lee', `Spring ${currentYear + 1}`, `${currentYear + 1}-01-15`],
        ];

        downloadCsv('reference-codes-import-template.csv', templateHeaders, sampleRows);
    };

    const getStatusBadge = (referenceCode) => {
        if (referenceCode.isActive) {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-700 border-green-200">
                    <CheckCircle className="h-3 w-3" /> Active
                </span>
            );
        }

        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200">
                <XCircle className="h-3 w-3" /> Inactive
            </span>
        );
    };

    const getSubscriptionBadge = (status) => {
        switch (status) {
            case 'Active':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                        Active
                    </span>
                );
            case 'Trial':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        Trial
                    </span>
                );
            case 'Free':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        Free
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-50 text-gray-500 border border-gray-200">
                        None
                    </span>
                );
        }
    };

    const handleExportCSV = () => {
        const headers = ['Student ID', 'Student Email', 'Class Code', 'First Name', 'Last Name', 'Semester', 'Date Code Entered', 'Account Created', 'Subscription Status'];

        const rows = filteredAttribution.map(record => {
            const { firstName, lastName } = getProfessorNameParts(record);
            return [
                record.userId,
                record.email,
                record.classCode,
                firstName,
                lastName,
                record.semester,
                formatDate(record.dateCodeEntered),
                formatDate(record.accountCreated),
                record.subscriptionStatus
            ];
        });

        downloadCsv(
            `Class_Code_Attribution_Report_${new Date().toISOString().slice(0, 10)}.csv`,
            headers,
            rows
        );
    };

    return (
        <AdminDashboardlayout>
            <div className="space-y-6 bg-gray-50 min-h-screen p-6">

                {/* Tab Navigation header */}
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            onClick={() => setActiveTab('codes')}
                            className={`border-b-2 py-4 px-1 text-sm font-medium transition cursor-pointer flex items-center gap-2 ${activeTab === 'codes'
                                ? 'border-blue-500 text-blue-600 font-semibold'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                        >
                            <Ticket className="h-4 w-4" />
                            Reference Codes
                        </button>
                        <button
                            onClick={() => setActiveTab('attribution')}
                            className={`border-b-2 py-4 px-1 text-sm font-medium transition cursor-pointer flex items-center gap-2 ${activeTab === 'attribution'
                                ? 'border-blue-500 text-blue-600 font-semibold'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                        >
                            Class Code Attribution
                        </button>
                    </nav>
                </div>

                {activeTab === 'codes' ? (
                    // CODE MANAGEMENT VIEW
                    <>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                    <Ticket className="h-6 w-6 text-[#2B7FFF]" />
                                    Reference Codes Management
                                </h1>
                                <p className="text-gray-500 text-sm">Create, update, and assign professor reference codes.</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    ref={importInputRef}
                                    type="file"
                                    accept=".csv,.xlsx"
                                    className="hidden"
                                    onChange={handleImportFile}
                                />
                                <button
                                    onClick={handleExportReferenceCodes}
                                    disabled={isExportingCodes || loading}
                                    className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isExportingCodes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    Export CSV
                                </button>
                                <button
                                    onClick={triggerImportPicker}
                                    disabled={isImportingCodes || loading}
                                    className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isImportingCodes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    Import
                                </button>
                                <button
                                    onClick={handleDownloadImportTemplate}
                                    className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 shadow-sm transition"
                                >
                                    <Download className="h-4 w-4" />
                                    Sample Import CSV
                                </button>
                                <button
                                    onClick={handleCreate}
                                    className="flex items-center gap-2 px-4 py-2 bg-[#2B7FFF] text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1770f4] shadow-sm transition"
                                >
                                    <Plus className="h-4 w-4" /> Create Reference Code
                                </button>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="relative w-full md:w-96">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by code, professor, or semester..."
                                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <Filter className="h-4 w-4 text-gray-500" />
                                    <select
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={semesterFilter}
                                        onChange={(e) => setSemesterFilter(e.target.value)}
                                    >
                                        <option value="all">All Semesters</option>
                                        {codeSemesters.map((semester) => (
                                            <option key={semester} value={semester}>{semester}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <select
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                    >
                                        <option value="all">All Status</option>
                                        <option value="active">Active Only</option>
                                        <option value="inactive">Inactive Only</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            {loading ? (
                                <div className="flex flex-col justify-center items-center h-64 gap-3 text-gray-500">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                    <p className="text-sm font-medium">Loading reference codes...</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-200">
                                                <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Reference Code</th>
                                                <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Professor</th>
                                                <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Semester</th>
                                                <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Assigned</th>
                                                <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Status</th>
                                                
                                                {plans.map((plan) => (
                                                    <th
                                                        key={plan.id}
                                                        className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase"
                                                    >
                                                        {plan.label}
                                                    </th>
                                                ))}
                                                <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Expiry</th>
                                                <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Actions</th>
                                            </tr>

                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredReferenceCodes.length > 0 ? (
                                                filteredReferenceCodes.map((referenceCode) => (
                                                    <tr key={referenceCode._id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-gray-900 uppercase">
                                                                    {referenceCode.code}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400 font-mono">{referenceCode._id}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-600">{getProfessorName(referenceCode)}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-600">{referenceCode.semester}</td>
                                                        <td className="px-6 py-4">
                                                            <div className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold w-fit">
                                                                {referenceCode.totalAssigned || 0} Students
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">{getStatusBadge(referenceCode)}</td>
                                        
                                                        {plans.map((plan) => (
                                                            <td key={`${referenceCode._id}-${plan.id}`} className="px-6 py-4">
                                                                <div className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold w-fit">
                                                                    {referenceCode.planSubscriptionCounts?.[plan.id] || 0}
                                                                </div>
                                                            </td>
                                                        ))}
                                                        <td className="px-6 py-4">
                                                            {referenceCode.expiresAt ? (
                                                                (() => {
                                                                    const exp = new Date(referenceCode.expiresAt);
                                                                    const isExpired = exp < new Date();
                                                                    return (
                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${isExpired
                                                                                ? 'bg-red-50 text-red-600 border-red-200'
                                                                                : 'bg-green-50 text-green-700 border-green-200'
                                                                            }`}>
                                                                            {isExpired ? '✗ Expired' : '✓ ' + formatExpiryDate(referenceCode.expiresAt)}
                                                                        </span>
                                                                    );
                                                                })()
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">No expiry</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-2 text-gray-400">
                                                                <button
                                                                    onClick={() => handleView(referenceCode)}
                                                                    className="p-1.5 hover:bg-blue-50 hover:text-[#2B7FFF] rounded-lg transition-all border border-transparent hover:border-blue-100"
                                                                    title="View Details"
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleEdit(referenceCode)}
                                                                    className="p-1.5 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition-all border border-transparent hover:border-amber-100"
                                                                    title="Edit Code"
                                                                >
                                                                    <Edit2 className="h-4 w-4" />
                                                                </button>
                                                                <button
                                                                    className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all border border-transparent hover:border-red-100"
                                                                    title="Delete Code"
                                                                    onClick={() => handleDelete(referenceCode._id)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={9 + plans.length} className="px-6 py-12 text-center">
                                                        <div className="flex flex-col items-center gap-2 text-gray-400">
                                                            <Ticket className="h-12 w-12 opacity-20" />
                                                            <p className="text-sm">No reference codes found matching your filters.</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    // CLASS CODE ATTRIBUTION REPORT VIEW
                    <>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                    Class Code Attribution
                                </h1>
                                <p className="text-gray-500 text-sm">Internal Phase 1A student attribution report</p>
                            </div>
                            <button
                                onClick={handleExportCSV}
                                disabled={filteredAttribution.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-[#2B7FFF] hover:bg-[#1770f4] text-white rounded-lg text-sm font-medium cursor-pointer shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Download className="h-4 w-4" /> Export CSV
                            </button>
                        </div>

                        {/* Internal Warning Banner */}
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                            <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-700 font-medium">
                                This report is for internal use only and not visible to students or instructors.
                            </div>
                        </div>

                        {/* Search & Filters */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="relative w-full md:w-96">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by student, email, or class code..."
                                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    value={attributionSearch}
                                    onChange={(e) => setAttributionSearch(e.target.value)}
                                />
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <Filter className="h-4 w-4 text-gray-500" />
                                    <select
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={selectedSemester}
                                        onChange={(e) => setSelectedSemester(e.target.value)}
                                    >
                                        <option value="all">All Semesters</option>
                                        {uniqueSemesters.map((sem) => (
                                            <option key={sem} value={sem}>{sem}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <select
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={selectedProfessor}
                                        onChange={(e) => setSelectedProfessor(e.target.value)}
                                    >
                                        <option value="all">All Professors</option>
                                        {uniqueProfessors.map((prof) => (
                                            <option key={prof} value={prof}>{prof}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Report Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            {attributionLoading ? (
                                <div className="flex flex-col justify-center items-center h-64 gap-3 text-gray-500">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                    <p className="text-sm font-medium">Loading attribution information...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="overflow-x-auto font-[Inter]">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-200">
                                                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] uppercase">Student: User ID</th>
                                                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] uppercase">Student: Email</th>
                                                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] uppercase">Class Code</th>
                                                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] uppercase">Professor</th>
                                                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] uppercase">Semester</th>
                                                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] uppercase">Date Code Entered</th>
                                                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] uppercase">Account Created</th>
                                                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] uppercase">Subscription Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {paginatedAttribution.length > 0 ? (
                                                    paginatedAttribution.map((record) => (
                                                        <tr key={record.mongoUserId} className="hover:bg-gray-50 transition-colors">
                                                            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono">
                                                                {record.userId}
                                                            </td>
                                                            <td className="px-4 py-4 text-sm text-gray-600 font-medium">
                                                                <div className="flex flex-col">
                                                                    <span className="text-gray-900 text-sm font-semibold">{record.studentName}</span>
                                                                    <span className="text-[12px] text-gray-400">{record.email}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-sm font-bold text-gray-900 uppercase">
                                                                {record.classCode}
                                                            </td>
                                                            <td className="px-4 py-4 text-sm text-gray-700">{record.professor}</td>
                                                            <td className="px-4 py-4 text-sm text-gray-700">{record.semester}</td>
                                                            <td className="px-4 py-4 text-sm text-gray-600 font-mono">
                                                                {formatDate(record.dateCodeEntered)}
                                                            </td>
                                                            <td className="px-4 py-4 text-sm text-gray-600 font-mono">
                                                                {formatDate(record.accountCreated)}
                                                            </td>
                                                            <td className="px-4 py-4 whitespace-nowrap">
                                                                {getSubscriptionBadge(record.subscriptionStatus)}
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan="8" className="px-6 py-12 text-center">
                                                            <div className="flex flex-col items-center gap-2 text-gray-400">
                                                                <Ticket className="h-12 w-12 opacity-20" />
                                                                <p className="text-sm">No attribution entries found matching your criteria.</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination Controls */}
                                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/50">
                                        <span className="text-sm text-gray-500">
                                            Showing {filteredAttribution.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredAttribution.length)} of {filteredAttribution.length} results
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                disabled={currentPage === 1}
                                                className="px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded hover:bg-gray-50 hover:text-gray-900 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                            >
                                                Previous
                                            </button>
                                            {Array.from({ length: totalPages }).map((_, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setCurrentPage(idx + 1)}
                                                    className={`px-3 py-1.5 text-xs font-bold border rounded transition cursor-pointer ${currentPage === idx + 1
                                                        ? 'bg-blue-600 text-white border-blue-600 shadow'
                                                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                                                        }`}
                                                >
                                                    {idx + 1}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                                disabled={currentPage === totalPages}
                                                className="px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded hover:bg-gray-50 hover:text-gray-900 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>

            <ReferenceCodeDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                referenceCode={selectedReferenceCode}
                viewOnly={isViewOnly}
            />
        </AdminDashboardlayout>
    );
}

export default ReferenceCodes;
