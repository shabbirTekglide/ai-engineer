import React from 'react'
import { useFormContext } from "react-hook-form";

function Contact_info() {
    const { register, formState: { errors } } = useFormContext();
    const profile = {
        contactName: "John Carter",
        email: "john.carter@nexoratech.com",
        designation: "Senior Project Manager",
        phone: "+1 (415) 789-4562",
        whatsapp: "+1 (415) 789-4562"
    }

    return (
        <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Contact Info</h2>
            <div className="grid gap-4">
                {/* First Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Contact Name
                        </label>
                        <input
                            {...register("contactInfo.contactName", { 
                                required: "Contact name is required",
                                value: profile.contactName 
                            })}
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                        />
                        {errors.contactInfo?.contactName && (
                            <p className="text-red-500 text-xs mt-1">{errors.contactInfo.contactName.message}</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Email
                        </label>
                        <input
                            {...register("contactInfo.email", {
                                required: "Email is required",
                                pattern: {
                                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                    message: "Invalid email address"
                                },
                                value: profile.email
                            })}
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                        />
                        {errors.contactInfo?.email && (
                            <p className="text-red-500 text-xs mt-1">{errors.contactInfo.email.message}</p>
                        )}
                    </div>
                </div>
                {/* Second Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Designation
                        </label>
                        <input
                            {...register("contactInfo.designation", { 
                                required: "Designation is required",
                                value: profile.designation 
                            })}
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                        />
                        {errors.contactInfo?.designation && (
                            <p className="text-red-500 text-xs mt-1">{errors.contactInfo.designation.message}</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Phone Number
                        </label>
                        <input
                            {...register("contactInfo.phone", { 
                                required: "Phone number is required",
                                value: profile.phone 
                            })}
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                        />
                        {errors.contactInfo?.phone && (
                            <p className="text-red-500 text-xs mt-1">{errors.contactInfo.phone.message}</p>
                        )}
                    </div>
                </div>
                {/* WhatsApp */}
                <div>
                    <label className="block text-gray-700 text-sm font-bold mb-2">
                        WhatsApp
                    </label>
                    <input
                        {...register("contactInfo.whatsapp", {
                            value: profile.whatsapp
                        })}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                    />
                </div>
            </div>
        </div>
    )
}

export default Contact_info