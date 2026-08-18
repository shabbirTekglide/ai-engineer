import React, { useEffect, useState } from 'react';
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
    Calendar,
    Ticket
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchPromocodes, deletePromocode } from '../../store/slicers/promocodeSlice';
import { PromocodeDialog } from '../../components/kora/PromocodeDialog';
import { toast } from 'react-toastify';

function Promocodes() {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedPromocode, setSelectedPromocode] = useState(null);
    const [isViewOnly, setIsViewOnly] = useState(false);
    const dispatch = useDispatch();
    const { promocodes, loading, error, promocodeDetail } = useSelector((state) => state.promocode);

    useEffect(() => {
        dispatch(fetchPromocodes({ plan: 'all', active: statusFilter === 'all' ? null : statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : null }));
    }, [statusFilter]);

    const filteredPromoCodes = promocodes.filter(pc =>
        pc.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCreate = () => {
        setSelectedPromocode(null);
        setIsViewOnly(false);
        setDialogOpen(true);
    };

    const handleEdit = (pc) => {
        setSelectedPromocode(pc);
        setIsViewOnly(false);
        setDialogOpen(true);
    };

    const handleView = (pc) => {
        setSelectedPromocode(pc);
        setIsViewOnly(true);
        setDialogOpen(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this promo code?')) {
            try {
                await dispatch(deletePromocode(id)).unwrap();
                toast.success('Promo code deleted successfully');
            } catch (err) {
                toast.error(err || 'Failed to delete promo code');
            }
        }
    };

    const getStatusBadge = (pc) => {
        const isExpired = new Date(pc.expiryDate) < new Date();
        const isActive = pc.isActive && !isExpired;

        if (isActive) {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-700 border-green-200">
                    <CheckCircle className="h-3 w-3" /> Active
                </span>
            );
        } else if (isExpired && pc.isActive) {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-amber-100 text-amber-700 border-amber-200">
                    <Calendar className="h-3 w-3" /> Expired
                </span>
            );
        } else {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200">
                    <XCircle className="h-3 w-3" /> Inactive
                </span>
            );
        }
    };

    return (
        <AdminDashboardlayout>
            <div className="space-y-6 bg-gray-50 min-h-screen">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Ticket className="h-6 w-6 text-[#2B7FFF]" />
                            Promo Codes Management
                        </h1>
                        <p className="text-gray-500 text-sm">Create, update, and manage your platform discounts.</p>
                    </div>
                    <button
                        onClick={handleCreate}
                        className="flex items-center gap-2 px-4 py-2 bg-[#2B7FFF] text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1770f4] shadow-sm transition"
                    >
                        <Plus className="h-4 w-4" /> Create Promo Code
                    </button>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by promo code..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <Filter className="h-4 w-4 text-gray-500" />
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

                {/* Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col justify-center items-center h-64 gap-3 text-gray-500">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                            <p className="text-sm font-medium">Loading promo codes...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Promo Code</th>
                                        <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Expiry Date</th>
                                        <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Total Used</th>
                                        <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">Status</th>
                                        <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase ">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredPromoCodes.length > 0 ? (
                                        filteredPromoCodes.map((pc) => (
                                            <tr key={pc._id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-gray-900 group-hover:text-[#2B7FFF] transition-colors uppercase">
                                                            {pc.code}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-mono">{pc._id}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="h-4 w-4 text-gray-400" />
                                                        {new Date(pc.expiryDate).toLocaleDateString('en-US', {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric'
                                                        })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold w-fit">
                                                        {pc.totalUsed} Times
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {getStatusBadge(pc)}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2 text-gray-400">
                                                        <button
                                                            onClick={() => handleView(pc)}
                                                            className="p-1.5 hover:bg-blue-50 hover:text-[#2B7FFF] rounded-lg transition-all border border-transparent hover:border-blue-100"
                                                            title="View Details"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </button>
                                                        {/* <button
                                                            onClick={() => handleEdit(pc)}
                                                            className="p-1.5 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition-all border border-transparent hover:border-amber-100"
                                                            title="Edit Code"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </button> */}
                                                        <button
                                                            className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all border border-transparent hover:border-red-100"
                                                            title="Delete Code"
                                                            onClick={() => handleDelete(pc._id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="5" className="px-6 py-12 text-center">
                                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                                    <Ticket className="h-12 w-12 opacity-20" />
                                                    <p className="text-sm">No promo codes found matching your filters.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <PromocodeDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                promocode={selectedPromocode}
                viewOnly={isViewOnly}
            />
        </AdminDashboardlayout>
    );
}

export default Promocodes;