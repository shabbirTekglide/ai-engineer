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
import { Checkbox } from '../ui/Checkbox';
import { Check, CalendarDays, Loader2, Search } from 'lucide-react';
import { cn } from '../../libs/Utils';
import { Controller, useForm } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import {
    addReferenceCode,
    clearReferenceCodeDetail,
    fetchReferenceUsers,
    getReferenceCodeDetailById,
    updateReferenceCode
} from '../../store/slicers/referenceCodeSlice';

const formatDateForInput = (value) => {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return date.toISOString().split('T')[0];
};

const formatExpiryDate = (value) => {
    const normalizedValue = formatDateForInput(value);
    if (!normalizedValue) return '';

    const [year, month, day] = normalizedValue.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });
};
// It splits the full name into first and last names automatically.
const getProfessorNameParts = (referenceCode) => {
    if (referenceCode?.professorFirstName || referenceCode?.professorLastName) {
        return {
            firstName: referenceCode.professorFirstName || '',
            lastName: referenceCode.professorLastName || '',
        };
    }

    const parts = String(referenceCode?.professorName || '').trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts.slice(0, -1).join(' ') || parts[0] || '',
        lastName: parts.length > 1 ? parts[parts.length - 1] : '',
    };
};

export function ReferenceCodeDialog({
    children,
    referenceCode = null,
    open = false,
    onOpenChange,
    viewOnly = false
}) {
    const dispatch = useDispatch();
    const { loading, users, referenceCodeDetail } = useSelector((state) => state.referenceCode);
    const [searchTerm, setSearchTerm] = useState('');

    const {
        control,
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors },
    } = useForm({
        defaultValues: {
            code: '',
            description: '',
            professorFirstName: '',
            professorLastName: '',
            semester: '',
            assignedUsers: [],
            isActive: true,
            expiresAt: '',
        },

    });

    const isEditing = !!referenceCode;
    const selectedUsers = watch('assignedUsers') || [];
    const isActive = watch('isActive');
    const expiresAtValue = watch('expiresAt');
    const selectedSemester = watch('semester');
    const semesterOptions = ['Spring', 'Summer', 'Fall'].map(
        (semester) => `${semester} ${new Date().getFullYear()}`
    );

    useEffect(() => {
        if (open) {
            dispatch(fetchReferenceUsers());
            if (referenceCode) {
                dispatch(getReferenceCodeDetailById(referenceCode._id || referenceCode.id));
            } else {
                reset({
                    code: '',
                    description: '',
                    professorFirstName: '',
                    professorLastName: '',
                    semester: '',
                    assignedUsers: [],
                    isActive: true,
                    expiresAt: '',
                });

            }
        }
    }, [open, referenceCode, reset, dispatch]);

    useEffect(() => {
        if (open && referenceCodeDetail && (referenceCode?._id === referenceCodeDetail._id || referenceCode?.id === referenceCodeDetail._id)) {
            const professorNameParts = getProfessorNameParts(referenceCodeDetail);
            reset({
                code: referenceCodeDetail.code || '',
                description: referenceCodeDetail.description || '',
                professorFirstName: professorNameParts.firstName,
                professorLastName: professorNameParts.lastName,
                semester: referenceCodeDetail.semester || '',
                assignedUsers: referenceCodeDetail.assignedUsers || [],
                isActive: referenceCodeDetail.isActive !== false,
                expiresAt: formatDateForInput(referenceCodeDetail.expiresAt),
            });

        }
    }, [referenceCodeDetail, open, reset, referenceCode]);

    const onSubmit = async (data) => {
        try {
            const payload = {
                ...data,
                code: data.code.toUpperCase().trim(),
                expiresAt: data.expiresAt?.trim() || null,
            };

            if (isEditing) {
                await dispatch(updateReferenceCode({ id: referenceCode._id, ...payload })).unwrap();
                toast.success('Reference code updated successfully');
            } else {
                await dispatch(addReferenceCode(payload)).unwrap();
                toast.success('Reference code created successfully');
            }
            onOpenChange(false);
        } catch (error) {
            toast.error(error || 'Failed to save reference code');
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
        setValue('assignedUsers', current);
    };

    const filteredUsers = (users || []).filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleOpenChange = (newOpen) => {
        if (!newOpen) {
            dispatch(clearReferenceCodeDetail());
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
                            {viewOnly ? 'View Reference Code' : isEditing ? 'Edit Reference Code' : 'Create Reference Code'}
                        </DialogTitle>
                        <DialogDescription>
                            {viewOnly
                                ? 'Details of the selected reference code.'
                                : isEditing
                                    ? 'Update the details and assigned students.'
                                    : 'Create a professor reference code and assign students.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 pt-2 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="code">Reference Code <span className="text-red-500">*</span></Label>
                            <Input
                                id="code"
                                placeholder="E.g. BIO101FALL"
                                disabled={viewOnly}
                                className={cn("uppercase", errors.code && "border-red-500")}
                                {...register('code', {
                                    required: 'Code is required',
                                    maxLength: { value: 40, message: 'Max 40 characters' },
                                    validate: (value) => !/\s/.test(value) || 'Reference code cannot contain spaces',
                                    onChange: (event) => {
                                        event.target.value = event.target.value.replace(/\s+/g, '').toUpperCase();
                                    },
                                })}
                            />
                            {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="professorFirstName">Professor First Name <span className="text-red-500">*</span></Label>
                                <Input
                                    id="professorFirstName"
                                    placeholder="E.g. Jane"
                                    disabled={viewOnly}
                                    {...register('professorFirstName', { required: 'First name is required' })}
                                />
                                {errors.professorFirstName && <p className="text-xs text-red-500">{errors.professorFirstName.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="professorLastName">Professor Last Name <span className="text-red-500">*</span></Label>
                                <Input
                                    id="professorLastName"
                                    placeholder="E.g. Smith"
                                    disabled={viewOnly}
                                    {...register('professorLastName', { required: 'Last name is required' })}
                                />
                                {errors.professorLastName && <p className="text-xs text-red-500">{errors.professorLastName.message}</p>}
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="semester">Semester <span className="text-red-500">*</span></Label>
                                <select
                                    id="semester"
                                    disabled={viewOnly}
                                    className={cn(
                                        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                                        errors.semester && 'border-red-500'
                                    )}
                                    {...register('semester', { required: 'Semester is required' })}
                                >
                                    <option value="">Select semester</option>
                                    {selectedSemester && !semesterOptions.includes(selectedSemester) && (
                                        <option value={selectedSemester}>{selectedSemester}</option>
                                    )}
                                    {semesterOptions.map((semester) => (
                                        <option key={semester} value={semester}>
                                            {semester}
                                        </option>
                                    ))}
                                </select>
                                {errors.semester && <p className="text-xs text-red-500">{errors.semester.message}</p>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Input
                                id="description"
                                placeholder="Optional internal note"
                                disabled={viewOnly}
                                {...register('description')}
                            />
                        </div>

                        <div className="flex items-center gap-2 rounded-lg border p-3">
                            <Checkbox
                                id="isActive"
                                checked={!!isActive}
                                disabled={viewOnly}
                                onCheckedChange={(checked) => setValue('isActive', !!checked)}
                            />
                            <Label htmlFor="isActive" className="text-sm font-medium">Active reference code</Label>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="expiresAt" className="flex items-center gap-1.5">
                                <CalendarDays className="h-3.5 w-3.5 text-gray-500" />
                                Expiry Date
                                <span className="text-gray-400 font-normal text-xs">(Optional)</span>
                            </Label>
                            <Controller
                                control={control}
                                name="expiresAt"
                                render={({ field }) => (
                                    <Input
                                        id="expiresAt"
                                        type="date"
                                        disabled={viewOnly}
                                        min={new Date().toISOString().slice(0, 10)}
                                        className="block"
                                        value={field.value || ''}
                                        onChange={(event) => field.onChange(event.target.value)}
                                    />
                                )}
                            />
                            {viewOnly && expiresAtValue && (
                                (() => {
                                    const expDate = new Date(expiresAtValue);
                                    const isExpired = expDate < new Date();
                                    return (
                                        <p className={`text-xs font-semibold mt-1 flex items-center gap-1 ${isExpired ? 'text-red-500' : 'text-green-600'}`}>
                                            {isExpired ? '⚠ This code has expired.' : '✓ Code is still valid until ' + formatExpiryDate(expiresAtValue)}
                                        </p>
                                    );
                                })()
                            )}
                            {!viewOnly && (
                                <p className="text-xs text-gray-400">If set, students cannot use this code after this date.</p>
                            )}
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
                                disabled={loading}
                            >
                                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                {isEditing ? 'Update Reference Code' : 'Create Reference Code'}
                            </Button>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
