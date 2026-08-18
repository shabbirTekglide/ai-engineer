import React from "react";
import { useFormContext } from "react-hook-form";
const ProfileCard = ({ profile }) => {
  const { register, formState: { errors } } = useFormContext();

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Company Info Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Company Info</h2>
          <div className="grid gap-4">
            {/* First Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  Company Name
                </label>
                <input
                  {...register("companyInfo.companyName", { required: "Company name is required" })}
                  defaultValue={profile.companyName}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                />
                {errors.companyInfo?.companyName && (
                  <p className="text-red-500 text-xs mt-1">{errors.companyInfo.companyName.message}</p>
                )}
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  Industry Type
                </label>
                <input
                  {...register("companyInfo.industryType", { required: "Industry type is required" })}
                  defaultValue={profile.industryType}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                />
                {errors.companyInfo?.industryType && (
                  <p className="text-red-500 text-xs mt-1">{errors.companyInfo.industryType.message}</p>
                )}
              </div>
            </div>

            {/* Second Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  Company Website
                </label>
                <input
                  {...register("companyInfo.website", {
                    pattern: {
                      value: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
                      message: "Please enter a valid URL"
                    }
                  })}
                  defaultValue={profile.website}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                />
                {errors.companyInfo?.website && (
                  <p className="text-red-500 text-xs mt-1">{errors.companyInfo.website.message}</p>
                )}
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  EIN (Tax ID)
                </label>
                <input
                  {...register("companyInfo.taxId", { required: "Tax ID is required" })}
                  defaultValue={profile.taxId}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                />
                {errors.companyInfo?.taxId && (
                  <p className="text-red-500 text-xs mt-1">{errors.companyInfo.taxId.message}</p>
                )}
              </div>
            </div>

            {/* Company Address */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Company Address
              </label>
              <input
                {...register("companyInfo.address", { required: "Address is required" })}
                defaultValue={profile.address}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
              />
              {errors.companyInfo?.address && (
                <p className="text-red-500 text-xs mt-1">{errors.companyInfo.address.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Company Logo Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Company Logo</h2>
          <div className="flex justify-center items-center h-full">
            <div className="w-48 h-48 rounded-full border-2 border-gray-200 overflow-hidden">
              <img
                src={profile.companyLogo}
                alt="Company Logo"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileCard;
