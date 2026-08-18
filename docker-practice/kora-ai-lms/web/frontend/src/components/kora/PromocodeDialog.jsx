import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    DialogTrigger,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/Select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../ui/Popover';
import { CalendarIcon, Loader2, X, Check, Search } from 'lucide-react';
import { Calendar } from '../ui/Calender';
import { format } from 'date-fns';
import { cn } from '../../libs/Utils';
import { useForm, Controller } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { addPromocode, updatePromocode, fetchAllUsers, getPromocodeDetailById, clearPromocodeDetail } from '../../store/slicers/promocodeSlice';

export function PromocodeDialog({
    children,
    promocode = null,
    open = false,
    onOpenChange,
    viewOnly = false
}) {
    const dispatch = useDispatch();
    const { loading: promocodeLoading, users: promocodeUsers, promocodeDetail } = useSelector((state) => state.promocode);
    const [searchTerm, setSearchTerm] = useState('');

    const {
        register,
        handleSubmit,
        control,
        reset,
        setValue,
        watch,
        formState: { errors },
    } = useForm({
        defaultValues: {
            code: '',
            description: '',
            expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days from now
            applicablePlan: 'all',
            maxUsagePerUser: 1,
            eligibleUsers: [],
        },
    });

    const isEditing = !!promocode;
    const selectedUsers = watch('eligibleUsers') || [];

    useEffect(() => {
        if (open) {
            dispatch(fetchAllUsers());
            if (promocode) {
                dispatch(getPromocodeDetailById(promocode._id || promocode.id));
            } else {
                reset({
                    code: '',
                    description: '',
                    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    applicablePlan: 'all',
                    maxUsagePerUser: 1,
                    eligibleUsers: [],
                });
            }
        }
    }, [open, promocode, reset, dispatch]);

    useEffect(() => {
        if (open && promocodeDetail && (promocode?._id === promocodeDetail._id || promocode?.id === promocodeDetail._id)) {
            reset({
                code: promocodeDetail.code || '',
                description: promocodeDetail.description || '',
                expiryDate: promocodeDetail.expiryDate ? new Date(promocodeDetail.expiryDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                applicablePlan: promocodeDetail.applicablePlan || 'all',
                maxUsagePerUser: promocodeDetail.maxUsagePerUser || 1,
                eligibleUsers: promocodeDetail.eligibleUsers || [],
            });
        }
    }, [promocodeDetail, open, reset]);

    const onSubmit = async (data) => {
        try {
            console.log(data);
            const payload = {
                ...data,
                code: data.code.toUpperCase().trim(),
                expiryDate: data.expiryDate.toISOString(),
            };

            if (isEditing) {
                await dispatch(updatePromocode({ id: promocode._id, ...payload })).unwrap();
                toast.success('Promo code updated successfully');
            } else {
                await dispatch(addPromocode(payload)).unwrap();
                toast.success('Promo code created successfully');
            }
            onOpenChange(false);
        } catch (error) {
            toast.error(error || 'Failed to save promo code');
        }
    };

    const toggleUser = (userId) => {
        const current = [...selectedUsers];
        const index = current.indexOf(userId);
        if (index > -1) {
            current.splice(index, 1);
        } else {
            current.push(userId);
        }
        setValue('eligibleUsers', current);
    };

    const filteredUsers = (promocodeUsers || []).filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleOpenChange = (newOpen) => {
        if (!newOpen) {
            dispatch(clearPromocodeDetail());
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="max-w-[500px] max-h-[95vh] overflow-y-auto p-0">
                <form onSubmit={handleSubmit(onSubmit)}>
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle className="text-2xl font-bold">
                            {viewOnly ? 'View Promo Code' : isEditing ? 'Edit Promo Code' : 'Create Promo Code'}
                        </DialogTitle>
                        <DialogDescription>
                            {viewOnly
                                ? 'Details of the selected promo code.'
                                : isEditing
                                    ? 'Update the details of the existing promo code.'
                                    : 'Define a new promo code for your users and plans.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 pt-2 space-y-4">
                        {/* Promo Code */}
                        <div className="space-y-2">
                            <Label htmlFor="code">Promo Code <span className="text-red-500">*</span></Label>
                            <Input
                                id="code"
                                placeholder="E.g. SUMMER50"
                                disabled={viewOnly}
                                className={cn("uppercase", errors.code && "border-red-500")}
                                {...register('code', {
                                    required: 'Code is required',
                                    pattern: {
                                        value: /^[A-Z0-9_\-]+$/i,
                                        message: 'Invalid code format'
                                    }
                                })}
                            />
                            {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Input
                                id="description"
                                placeholder="E.g. 50% discount for summer"
                                disabled={viewOnly}
                                {...register('description')}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Expiry Date */}
                            <div className="space-y-2">
                                <Label>Expiry Date <span className="text-red-500">*</span></Label>
                                <Controller
                                    control={control}
                                    name="expiryDate"
                                    rules={{ required: 'Expiry date is required' }}
                                    render={({ field }) => (
                                        <Popover>
                                            <PopoverTrigger asChild disabled={viewOnly}>
                                                <Button
                                                    variant="outline"
                                                    disabled={viewOnly}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal",
                                                        !field.value && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            {!viewOnly && (
                                                <PopoverContent className="promo-code-calendar-dialog w-auto p-0 bg-white shadow-xl rounded-xl border border-gray-200" align="start">
                                                    <Calendar
                                                        mode="single"
                                                        selected={field.value}
                                                        onSelect={field.onChange}
                                                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            )}
                                        </Popover>
                                    )}
                                />
                                {errors.expiryDate && <p className="text-xs text-red-500">{errors.expiryDate.message}</p>}
                            </div>

                            {/* Max Usage Per User */}
                            <div className="space-y-2">
                                <Label htmlFor="maxUsagePerUser">Max Usage Per User</Label>
                                <Input
                                    id="maxUsagePerUser"
                                    type="number"
                                    min="1"
                                    disabled={viewOnly}
                                    {...register('maxUsagePerUser', {
                                        required: 'Required',
                                        min: { value: 1, message: 'Min 1' },
                                        valueAsNumber: true
                                    })}
                                />
                                {errors.maxUsagePerUser && <p className="text-xs text-red-500">{errors.maxUsagePerUser.message}</p>}
                            </div>
                        </div>

                        {/* Applicable Plan */}
                        <div className="space-y-2">
                            <Label htmlFor="applicablePlan">Applicable Plan</Label>
                            <Controller
                                control={control}
                                name="applicablePlan"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange} disabled={viewOnly}>
                                        <SelectTrigger id="applicablePlan" className="w-full">
                                            <SelectValue placeholder="Select Plan" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Plans</SelectItem>
                                            <SelectItem value="free">Free Tier</SelectItem>
                                            <SelectItem value="basic_plan">Basic Plan</SelectItem>
                                            <SelectItem value="pro_plan">Pro Plan</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>

                        {/* Eligible Users Selection */}
                        <div className="space-y-2">
                            <Label>Eligible Users (Optional - Empty for all)</Label>
                            <div className="border rounded-lg overflow-hidden bg-gray-50">
                                {!viewOnly && (
                                    <div className="p-2 border-b bg-white flex items-center gap-2">
                                        <Search className="h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Search users..."
                                            className="text-sm outline-none w-full"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') e.preventDefault();
                                            }}
                                        />
                                    </div>
                                )}
                                <div className="max-h-[150px] overflow-y-auto">
                                    {promocodeLoading ? (
                                        <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading users...</div>
                                    ) : filteredUsers.length > 0 ? (
                                        filteredUsers.map(user => (
                                            <div
                                                key={user._id}
                                                className={cn(
                                                    "flex items-center justify-between p-2 px-3 transition-colors border-b last:border-0",
                                                    viewOnly ? "bg-white/50" : "hover:bg-white cursor-pointer"
                                                )}
                                                onClick={() => !viewOnly && toggleUser(user._id)}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium">{user.name}</span>
                                                    <span className="text-[10px] text-gray-500 font-mono">{user.email}</span>
                                                </div>
                                                {selectedUsers.includes(user._id) ? (
                                                    <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center">
                                                        <Check className="h-3 w-3 text-white" />
                                                    </div>
                                                ) : (
                                                    <div className="h-5 w-5 rounded-full border border-gray-300" />
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center text-gray-500 text-sm">No users found</div>
                                    )}
                                </div>
                                <div className="p-2 px-3 bg-white border-t text-[11px] text-gray-500 flex justify-between items-center">
                                    <span>{selectedUsers.length} users selected</span>
                                    {selectedUsers.length > 0 && !viewOnly && (
                                        <button
                                            type="button"
                                            className="text-blue-600 hover:underline"
                                            onClick={() => setValue('eligibleUsers', [])}
                                        >
                                            Clear All
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-6 bg-gray-50 border-t flex flex-row justify-end gap-2">
                        <DialogClose asChild>
                            <Button variant="ghost" type="button" className="border bg-white hover:bg-gray-100 transition-colors">
                                {viewOnly ? 'Close' : 'Cancel'}
                            </Button>
                        </DialogClose>
                        {!viewOnly && (
                            <Button
                                type="submit"
                                className="bg-[#976AF2] hover:bg-[#7640e0] text-white transition-all shadow-md"
                                disabled={promocodeLoading}
                            >
                                {promocodeLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                {isEditing ? 'Update Promo Code' : 'Create Promo Code'}
                            </Button>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
