import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '../ui/Dialog';
import { Button } from '../ui/Button'; // Adjust import path as needed
import paymentApi from '../../api/paymentApi';
import { Loader2 } from 'lucide-react';

function SubscriptionUsageDialog({ open, onClose, subscriptionId }) {
    const [usageData, setUsageData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchSubscriptionUsageAnalytics = async () => {
        if (!open || !subscriptionId) return;
        setLoading(true);
        setError(null);
        try {
            const response = await paymentApi.getSubscriptionUsageAnalytics(subscriptionId);
            setUsageData(response.data?.data); // assuming data is the object shown
        } catch (err) {
            setError(err.message || 'Failed to load usage data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSubscriptionUsageAnalytics();
    }, [open, subscriptionId]);

    // Helper to format cost
    const formatCost = (cost) => {
        if (!cost) return 'N/A';
        return `${cost.amount} ${cost.currency}`;
    };

    // Helper to format tokens
    const formatTokens = (tokens) => {
        if (!tokens) return '0';
        return `${tokens.input} input / ${tokens.output} output (total ${tokens.total})`;
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Subscription Usage Analytics</DialogTitle>
                </DialogHeader>

                {loading && (
                    <div className="flex justify-center items-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-50 text-red-700 rounded-md">
                        {error}
                    </div>
                )}

                {!loading && !error && usageData && (
                    <div className="space-y-6">
                        {/* Totals */}
                        <div className="border-t pt-4">
                            <h3 className="text-lg font-semibold mb-2">Summary</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-blue-50 p-3 rounded-lg">
                                    <p className="text-sm text-blue-600 font-medium">Total Cost</p>
                                    <p className="text-xl font-bold text-blue-800">{formatCost(usageData.totals.cost)}</p>
                                </div>
                                <div className="bg-green-50 p-3 rounded-lg">
                                    <p className="text-sm text-green-600 font-medium">Total Tokens</p>
                                    <p className="text-xl font-bold text-green-800">{usageData.totals.tokens}</p>
                                </div>
                                <div className="bg-purple-50 p-3 rounded-lg">
                                    <p className="text-sm text-purple-600 font-medium">Services Used</p>
                                    <p className="text-xl font-bold text-purple-800">{usageData.totals.serviceCount}</p>
                                </div>
                                <div className="bg-amber-50 p-3 rounded-lg">
                                    <p className="text-sm text-amber-600 font-medium">Audio Processed</p>
                                    <p className="text-xl font-bold text-amber-800">
                                        {usageData.services.reduce((acc, s) => acc + (s.audioSeconds || 0), 0).toFixed(1)}s
                                    </p>
                                </div>
                            </div>
                        </div>
                        {/* Services list */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                <h3 className="text-xl font-bold text-gray-800 tracking-tight">Usage by Service</h3>
                                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                                    {usageData.services.length} Active Services
                                </span>
                            </div>

                            <div className="grid gap-4">
                                {usageData.services.map((service, index) => (
                                    <div
                                        key={index}
                                        className="group relative border border-gray-200 rounded-xl p-5 bg-white hover:bg-blue-50/30 hover:border-blue-200 transition-all duration-300 shadow-sm hover:shadow-md overflow-hidden"
                                    >
                                        {/* Background Accent Decor */}
                                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-bold text-gray-900 capitalize tracking-wide">
                                                        {service.service.replace(/-/g, ' ')}
                                                    </h4>
                                                    {/* Visual Indicator for Active status */}
                                                    <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
                                                </div>

                                                <div className="flex flex-wrap gap-1.5">
                                                    {service.models.map((model, idx) => (
                                                        <span key={idx} className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                                                            {model}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 sm:text-right">
                                                <div className="space-y-0.5">
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] text-gray-400 uppercase font-bold">Volume</span>
                                                        <span className="text-sm font-medium text-gray-700">
                                                            {formatTokens(service.tokens)} <span className="text-gray-400 font-normal">tokens</span>
                                                        </span>
                                                    </div>
                                                    {service.audioSeconds > 0 && (
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] text-gray-400 uppercase font-bold">Audio duration</span>
                                                            <span className="text-sm font-medium text-gray-700">
                                                                {service.audioSeconds.toFixed(2)}s
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="pl-6 border-l border-gray-100 sm:min-w-[100px]">
                                                    <span className="text-[11px] text-gray-400 uppercase font-bold block">Net Cost</span>
                                                    <span className="text-lg font-black text-green-600">
                                                        {formatCost(service.cost)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {!loading && !error && !usageData && (
                    <div className="text-center py-8 text-gray-500">
                        No usage data available.
                    </div>
                )}

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default SubscriptionUsageDialog;