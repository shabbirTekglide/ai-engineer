
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useDispatch, useSelector } from "react-redux";
import { logout, openPasswordModal } from "../store/slicers/authSlice";
import { IoCloseCircleOutline } from "react-icons/io5";
import Button from "./Button";
import AuthApi from "../api/authApi";
import { toast } from "react-toastify";
import ReactSpinner from './ReactSpinner';
import 'react-toastify/dist/ReactToastify.css';
const PasswordSecurityModal = () => {
  const [loading, setLoading] = useState(false)
  const dispatch = useDispatch();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();

  const { token } = useSelector((state) => state.auth);
  const newPassword = watch("newPassword");

  const onSubmit = (data) => {
    setLoading(true);
    console.log("Password Updated:", data);
    const { currentPassword, newPassword, confirmPassword } = data;
    console.log(currentPassword, newPassword, confirmPassword)
    AuthApi.changePass({ token: token, oldPassword: currentPassword, newPassword: newPassword, confirmNewPassword: confirmPassword })
      .then((res) => {
        toast.success('Password changed successfully');
        dispatch(logout());
        dispatch({ type: 'LOGOUT' }); 
      })
      .catch((err) => {
        toast.error(err?.response?.data?.message || 'Failed to change password');
      })
      .finally(() => {
        setLoading(false);
        dispatch(openPasswordModal(false));
      });
  };

  return (
    <>
      {
        loading ? <ReactSpinner /> : (
          <div className="fixed inset-0 flex items-center justify-center bg-[rgba(0,_0,_0,_0.8)] z-90">
            <div className="bg-white p-4 rounded-md shadow-md mx-2 max-w-[400px] w-full relative pb-8">
              <div className="inner-container mt-8">
                <div className="change_password_image mb-8 flex justify-center">
                  <img src="\assets\images\borrower\company-profile\update_password_image.png" alt="" />
                </div>
                <h2 className="mb-8 font-[Inter] font-bold text-[26px] leading-[24px] text-center">Change Password</h2>
                <form onSubmit={handleSubmit(onSubmit)}>
                  <div className="mb-4">
                    <label className="font-[Inter] font-semibold text-[14px] leading-[24px]">Current Password</label>
                    <input
                      type="password"
                      {...register("currentPassword", { required: "Current password is required" })}
                      className="w-full px-3 py-3 font-[Inter] text-[14px] font-[400] leading-[24px] my-0 border-none outline-none bg-[#F9F9F9] rounded-[4px]"
                    />
                    {errors.currentPassword && (
                      <p className="text-red-500 text-xs mt-1">{errors.currentPassword.message}</p>
                    )}
                  </div>

                  <div className="mb-4">
                    <label className="font-[Inter] font-semibold text-[14px] leading-[24px]">New Password</label>
                    <input
                      type="password"
                      {...register("newPassword", {
                        required: "New password is required",
                        minLength: { value: 8, message: "Password must be at least 8 characters" },
                        validate: (value) =>
                          value !== watch("currentPassword") || "New password must be different from current password",
                      })}
                      className="w-full px-3 py-3 font-[Inter] text-[14px] font-[400] leading-[24px] my-0 border-none outline-none bg-[#F9F9F9] rounded-[4px]"
                    />
                    {errors.newPassword && (
                      <p className="text-red-500 text-xs mt-1">{errors.newPassword.message}</p>
                    )}
                  </div>

                  <div className="mb-4">
                    <label className="font-[Inter] font-semibold text-[14px] leading-[24px] ">Confirm New Password</label>
                    <input
                      type="password"
                      {...register("confirmPassword", {
                        required: "Please confirm your password",
                        validate: (value) => value === newPassword || "Passwords do not match",
                      })}
                      className="w-full px-3 py-3  font-[Inter] text-[14px] font-[400] leading-[24px] my-0 border-none outline-none bg-[#F9F9F9] rounded-[4px]"
                    />
                    {errors.confirmPassword && (
                      <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>
                    )}
                  </div>

                  <div className="flex justify-end space-x-2 mt-4">
                    <Button type="submit" children={loading ? "Updating Password... " : "Update Password"}
                      className={`bg-[transparent] rounded-[5px] border-[1px] border-[#737373] text-black hover:bg-[#00AEEC] hover:text-white w-full hover:border-[#00AEEC] ${loading ? "opacity-50 cursor-not-allowed" : ""
                        }`} />

                  </div>
                </form>
              </div>
              <div className="close-icon absolute top-[3%] right-[5%]">
                <IoCloseCircleOutline className="text-2xl cursor-[pointer]" onClick={() => dispatch(openPasswordModal(false))} />
              </div>

            </div>
          </div>
        )
      }


    </>

  );
};

export default PasswordSecurityModal;