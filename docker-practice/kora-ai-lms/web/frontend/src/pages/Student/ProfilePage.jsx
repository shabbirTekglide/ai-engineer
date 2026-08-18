import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  getStudentProfile,
  updateStudentProfile,
} from "../../store/slicers/studProfileSlice";
import { toast } from "react-toastify";
import ReactSpinner from "../../components/ReactSpinner";
import {
  Award,
  Calendar1,
  Camera,
  Edit2,
  Phone,
  Save,
  School,
  Tag,
  User,
  X,
} from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const ProfilePage = () => {
  const dispatch = useDispatch();
  const { loading, profile } = useSelector((s) => s.studentprofile || {});
  const [imageTimestamp, setImageTimestamp] = useState(Date.now());
  const [isUpdating, setIsUpdating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    school: "",
    classYear: "",
    dateOfBirth: "",
    phone: "",
    professorClassCode: "",
    profilePic: "",
  });

  const [editing, setEditing] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null); // ✅ NEW

  // Fetch profile once
  useEffect(() => {
    dispatch(getStudentProfile());
  }, [dispatch]);

  // Load profile into formData
  useEffect(() => {
    if (profile && !editing) {
      const p = profile || {};
      setFormData({
        name: p.name || "",
        school: p.school || "",
        classYear: p.classYear || "",
        dateOfBirth: p.dateOfBirth ? p.dateOfBirth.split("T")[0] : "",
        phone: p.phone || "",
        professorClassCode: p.professorClassCode || "",
        profilePic: p.profilePic || "",
      });
      setSelectedDate(p.dateOfBirth ? new Date(p.dateOfBirth) : null); // ✅ NEW
      setImagePreview(null);
      setImageFile(null);
    }
  }, [profile, editing]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "classYear") {
      if (!/^\d*$/.test(value)) return;
      if (value.length > 4) return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ✅ NEW: Date picker change handler
  const handleDateChange = (date) => {
    setSelectedDate(date);
    setFormData((prev) => ({
      ...prev,
      dateOfBirth: date ? date.toISOString().split("T")[0] : "",
    }));
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    } else if (!allowedTypes.includes(file.type)) {
      toast.error("Only JPG, JPEG, PNG formats are allowed");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setIsUploadingImage(true);

    try {
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setImageFile(file);
      await new Promise((resolve) => setTimeout(resolve, 500));
      toast.success("Image ready to upload");
    } catch (error) {
      toast.error("Failed to process image");
      console.error(error);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleUpdate = async () => {
    const fd = new FormData();
    fd.append("name", formData.name);
    fd.append("school", formData.school);
    fd.append("classYear", formData.classYear);
    fd.append("dateOfBirth", formData.dateOfBirth);
    fd.append("phone", formData.phone);
    if (imageFile) fd.append("profilePic", imageFile);

    setIsUpdating(true); // overlay spinner starts

    const action = await dispatch(updateStudentProfile(fd));

    if (action?.meta?.requestStatus === "fulfilled") {
      await dispatch(getStudentProfile());
      setImageTimestamp(Date.now());
      setEditing(false);
      setImagePreview(null);
      setImageFile(null);
      if (imagePreview) URL.revokeObjectURL(imagePreview);

      toast.success("Profile updated successfully!"); 
    } else {
      toast.error(action?.payload || "Failed to update profile"); 
    }

    setIsUpdating(false); // overlay spinner stops
  };

  const handleCancel = () => {
    setEditing(false);
    setImagePreview(null);
    setImageFile(null);

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    const p = profile || {};
    setFormData({
      name: p.name || "",
      school: p.school || "",
      classYear: p.classYear || "",
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.split("T")[0] : "",
      phone: p.phone || "",
      professorClassCode: p.professorClassCode || "",
      profilePic: p.profilePic || "",
    });
    setSelectedDate(p.dateOfBirth ? new Date(p.dateOfBirth) : null); // ✅ NEW
  };

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  if (!profile)
    return (
      <div className="min-h-screen flex justify-center items-center">
        <p className="text-center py-10 text-gray-500">
          No profile found. Please create your Student Profile.
        </p>
      </div>
    );

    if (loading && !profile) return <ReactSpinner />;

  const displayImage =
    imagePreview ||
    (formData.profilePic ? `${formData.profilePic}?t=${imageTimestamp}` : null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 py-8 px-4 relative">

      <div className="max-w-5xl mx-auto">
        {/* Header Section */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
          <div className="h-32 bg-gradient-to-br from-[#427CF0] via-[#7A69E2] to-[#976AF2] relative">
            <div className="absolute -bottom-16 left-8">
              <div className="relative group">
                <div className="w-32 h-32 rounded-full border-4 border-white shadow-xl overflow-hidden bg-gray-200">
                  {isUploadingImage ? (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-400 to-indigo-500">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                    </div>
                  ) : displayImage ? (
                    <img
                      src={displayImage}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-400 to-indigo-500">
                      <User className="w-16 h-16 text-white" />
                    </div>
                  )}
                </div>

                {editing && (
                  <label
                    className={`absolute bottom-0 right-0 bg-purple-600 p-2 rounded-full shadow-lg transition-all ${
                      isUploadingImage
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer hover:bg-purple-700"
                    }`}
                  >
                    <Camera className="w-5 h-5 text-white" />
                    <input
                      type="file"
                      name="profilePic"
                      onChange={handleImageChange}
                      accept="image/*"
                      disabled={isUploadingImage}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="absolute top-4 right-6">
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="cursor-pointer flex items-center gap-2 bg-white text-purple-600 px-5 py-2.5 rounded-full transition-all duration-300 hover:shadow-lg"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdate}
                    disabled={isUploadingImage}
                    className={`cursor-pointer flex items-center gap-2 bg-white text-green-600 px-5 py-2.5 rounded-full transition-all ${
                      isUploadingImage
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:shadow-lg"
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isUploadingImage}
                    className={`cursor-pointer flex items-center gap-2 bg-white text-red-600 px-5 py-2.5 rounded-full transition-all ${
                      isUploadingImage
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:shadow-lg"
                    }`}
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="pt-20 pb-6 px-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              {formData.name}
            </h1>
            <p className="text-gray-500 flex items-center gap-2">
              <School className="w-4 h-4" />
              {formData.school} • Class of {formData.classYear}
            </p>
          </div>
        </div>

        {/* Form Section */}
        <div className="bg-white rounded-2xl shadow-lg md:p-8 p-4">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-purple-600" />
            Personal Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name Field */}
            <div className="group">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <User className="w-4 h-4 text-purple-600" />
                Full Name
              </label>
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                disabled={!editing}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${
                  editing
                    ? "border-purple-300 bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-100"
                    : "border-gray-200 bg-gray-50 text-gray-600"
                } outline-none`}
                placeholder="Enter your name"
              />
            </div>

            {/* School Field */}
            <div className="group">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <School className="w-4 h-4 text-purple-600" />
                School/University
              </label>
              <input
                name="school"
                value={formData.school}
                onChange={handleChange}
                disabled={!editing}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${
                  editing
                    ? "border-purple-300 bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-100"
                    : "border-gray-200 bg-gray-50 text-gray-600"
                } outline-none`}
                placeholder="Enter your school"
              />
            </div>

            {/* Class Year Field */}
            <div className="group">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Award className="w-4 h-4 text-purple-600" />
                Class Year
              </label>
              <input
                name="classYear"
                value={formData.classYear}
                onChange={handleChange}
                disabled={!editing}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${
                  editing
                    ? "border-purple-300 bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-100"
                    : "border-gray-200 bg-gray-50 text-gray-600"
                } outline-none`}
                placeholder="Enter Class between 1900 - 2035"
              />
            </div>

            {/* ✅ Date of Birth Field — replaced with react-datepicker */}
            <div className="group">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Calendar1 className="w-4 h-4 text-purple-600" />
                Date of Birth
              </label>

              {editing ? (
                <div className="react-datepicker-wrapper-custom">
                  <DatePicker
                    selected={selectedDate}
                    onChange={handleDateChange}
                    dateFormat="MM/dd/yyyy"
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    yearDropdownItemNumber={100}
                    scrollableYearDropdown
                    maxDate={new Date()}
                    placeholderText="Select date of birth"
                    isClearable={true}
                    className="w-full px-4 py-3 rounded-xl border-2 border-purple-300 bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-100 outline-none"
                    wrapperClassName="w-full"
                    popperPlacement="bottom-start"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={
                    formData.dateOfBirth
                      ? new Date(formData.dateOfBirth).toLocaleDateString(
                          "en-US",
                          {
                            month: "2-digit",
                            day: "2-digit",
                            year: "numeric",
                          },
                        )
                      : ""
                  }
                  disabled
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-600 outline-none"
                  placeholder="No date set"
                />
              )}
            </div>

            {/* Phone Field - Full Width */}
            <div className="md:col-span-2 group">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Phone className="w-4 h-4 text-purple-600" />
                Phone Number
              </label>
              <input
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                disabled={!editing}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${
                  editing
                    ? "border-purple-300 bg-white focus:border-purple-600 focus:ring-4 focus:ring-purple-100"
                    : "border-gray-200 bg-gray-50 text-gray-600"
                } outline-none`}
                placeholder="Enter your phone number"
              />
            </div>

            <div className="md:col-span-2 group">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Tag className="w-4 h-4 text-purple-600" />
                Professor/Class Code
              </label>
              <input
                value={formData.professorClassCode}
                disabled
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-600 outline-none uppercase"
                placeholder="No class code provided"
              />
            </div>
          </div>

          {/* Info Card */}
          {!editing && (
            <div className="mt-8 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-100">
              <p className="text-sm text-gray-600">
                💡 <span className="font-semibold">Tip:</span> Keep your profile
                information up to date to help us serve you better.
              </p>
            </div>
          )}

          {/* Image Upload Info */}
          {editing && imagePreview && (
            <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
              <p className="text-sm text-gray-600">
                ✅ <span className="font-semibold">New image selected!</span>{" "}
                Click "Save" to update your profile picture.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
