import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '../ui/Dialog';
import { useForm } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { createStudentProfile } from '../../store/slicers/studProfileSlice';
import { toast } from '../../hooks/use-toast';
import ReactSpinner from '../ui/ReactSpinner';

export function StudentProfileDialog({ children }) {
    const dispatch = useDispatch();
    const { loading, profileExists } = useSelector((s) => s.studentprofile || {});
    // Control dialog open state: open when profile does NOT exist AND terms are accepted
    const [open, setOpen] = useState(!(profileExists === true));

    // Sync open state when profileExists or termsConditionsAccepted changes.
    useEffect(() => {
        if (profileExists === true) {
            setOpen(false);
        } else {
            setOpen(true);
        }
    }, [profileExists]);

    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm();

    const onSubmit = async (data) => {

        // Build FormData for multipart/form-data
        const fd = new FormData();
        Object.entries(data).forEach(([k, v]) => {
            if (v instanceof FileList) {
                if (v.length > 0) fd.append(k, v[0]);
            } else if (v !== undefined && v !== null) {
                fd.append(k, v);
            }
        });

        const action = await dispatch(createStudentProfile(fd));

        // on success, reset form and close dialog
        if (action?.meta?.requestStatus === 'fulfilled') {
            toast({
                title: "Profile Created",
                description: "Your student profile has been saved successfully!"
            });
            reset();
            setOpen(false);
        }
        else {
            const errorMessage = action?.payload?.message || action?.payload || "Something went wrong";
            toast({
                title: "Error",
                description: errorMessage,
            });
        }
    };

    if (loading) {
        return <ReactSpinner />
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            // Prevent closing the dialog with overlay/ESC unless profileExists is true
            if (val === false && profileExists !== true) {
                // ignore close attempt
                return;
            }
            setOpen(val);
        }}>
            {/* Optional trigger for manual opening when profile exists; otherwise dialog auto-opens */}
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent showCloseButton={false} className="max-w-[480px] no-close max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl text-center tracking-wide">Create Student Profile</DialogTitle>
                </DialogHeader>

                <form
                    onSubmit={handleSubmit(onSubmit)}
                    className="space-y-6 "
                >

                    {/* NAME + SCHOOL */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-semibold text-gray-700">
                                Name <span className="text-red-600">*</span>
                            </label>
                            <input
                                {...register("name", { required: "Name is required" })}
                                placeholder="Full name"
                                className="
          mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm
          focus:outline-none focus:ring-2 focus:ring-[#976AF2] focus:border-[#976AF2]
        "
                            />
                            {errors.name && (
                                <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>
                            )}
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-gray-700">
                                School <span className="text-red-600">*</span>
                            </label>
                            <input
                                {...register("school", { required: "School is required" })}
                                placeholder="School name"
                                className="
          mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm
          focus:outline-none focus:ring-2 focus:ring-[#976AF2] focus:border-[#976AF2]
        "
                            />
                            {errors.school && (
                                <p className="text-xs text-red-600 mt-1">{errors.school.message}</p>
                            )}
                        </div>
                    </div>

                    {/* CLASS YEAR + DOB */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-semibold text-gray-700">
                                Class Year  <span className="text-red-600">*</span>
                            </label>
                            <input
                                {...register("classYear", {
                                    onChange: (e) => {
                                        let val = e.target.value;
                                        val = val.replace(/\D/g, "");
                                        if (val.length > 4) val = val.slice(0, 4);
                                        e.target.value = val;
                                    },
                                })}
                                placeholder="Class between 1900 - 2035"
                                className="
          mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm
          focus:outline-none focus:ring-2 focus:ring-[#976AF2] focus:border-[#976AF2]
        "
                            />
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-gray-700">
                                Date of Birth
                            </label>
                            <input
                                type="date"
                                {...register("dateOfBirth")}
                                className="
          mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm
          focus:outline-none focus:ring-2 focus:ring-[#976AF2] focus:border-[#976AF2]
        "
                            />
                        </div>
                    </div>

                    {/* PHONE */}
                    <div>
                        <label className="text-sm font-semibold text-gray-700">
                            Phone
                        </label>
                        <input
                            type="tel"
                            {...register("phone", {
                                // required: "Phone is required",
                                pattern: {
                                    value: /^[0-9+\-\s()]{6,20}$/,
                                    message: "Enter a valid phone number",
                                },
                            })}
                            placeholder="e.g. +1 555 555 5555"
                            className="
        mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm
        focus:outline-none focus:ring-2 focus:ring-[#976AF2] focus:border-[#976AF2]
      "
                        />
                        {errors.phone && (
                            <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>
                        )}
                    </div>

                    {/* PROFESSOR / CLASS CODE */}
                    <div>
                        <label className="text-sm font-semibold text-gray-700">
                            Professor/Class Code <span className="text-gray-500">(Optional)</span>
                        </label>
                        <input
                            maxLength={40}
                            {...register("professorClassCode", {
                                onChange: (e) => {
                                    e.target.value = e.target.value.toUpperCase();
                                },
                            })}
                            placeholder="Enter class code"
                            className="
          mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm uppercase
          focus:outline-none focus:ring-2 focus:ring-[#976AF2] focus:border-[#976AF2]
        "
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Enter your professor's class code, if applicable.
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            You can still create an account without a class code.
                        </p>
                        {errors.professorClassCode && (
                            <p className="text-xs text-red-600 mt-1">{errors.professorClassCode.message}</p>
                        )}
                    </div>

                    {/* PROFILE PICTURE */}
                    <div>
                        <label className="text-sm font-semibold text-gray-700">
                            Profile Picture
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            {...register("profilePic")}
                            className="
        mt-2 w-full text-sm
        block rounded-lg border border-gray-300 bg-gray-50 p-2
        file:bg-[#976AF2] file:text-white file:border-none file:px-4 file:py-2 
        file:rounded-md file:cursor-pointer
      "
                        />
                    </div>

                    {/* TERMS AND CONDITIONS */}
                    {/* <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="terms"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-[#976AF2] focus:ring-[#976AF2]"
                        />
                        <label htmlFor="terms" className="text-sm text-gray-600">
                            i agreed with the{" "}
                            <a
                                href="https://dev.koralearning.com/terms_condition"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#976AF2] hover:underline"
                            >
                                terms and conditions
                            </a>
                        </label>
                    </div> */}

                    {/* SUBMIT BUTTON */}
                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="
        cursor-pointer w-full rounded-lg bg-[#976AF2] text-white py-3 text-sm
        hover:bg-[#8357db] transition-all shadow
        disabled:opacity-60 disabled:cursor-not-allowed
      "
                        >
                            {loading ? "Saving..." : "Save Profile"}
                        </button>
                    </div>
                </form>

            </DialogContent>
        </Dialog>
    );
}

export default StudentProfileDialog;
