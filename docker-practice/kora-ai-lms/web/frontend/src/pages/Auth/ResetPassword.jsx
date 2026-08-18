import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthApi from '../../api/authApi';

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const response = await AuthApi.resetPass({
        newPassword: data.newPassword,
        token,
        confirmNewPassword: data.confirmNewPassword,
      });
      toast.success(response.data.message);
      navigate('/login');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Something went wrong.');
    }
    setLoading(false);
  };

  const EyeIcon = ({ open }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {open ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(90deg,#9144E0,#6F2CCA)]">
      <div className="bg-white p-8 rounded-[22px] max-w-[500px] w-full shadow-[0px_0px_20px_3px_rgba(0,0,0,0.05)] pb-12 m-2">

        {/* Lock Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-[#f0f3ff] flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4a6cf7" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-2 text-center">Reset Password</h1>
        <p className="text-center text-gray-400 text-sm mb-8">Enter your new password below</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* New Password */}
          <div>
            <div className="relative">
              <input
                id="newPassword"
                type={showNew ? 'text' : 'password'}
                placeholder="New Password"
                className="w-full px-4 py-[10px] border-[1.5px] border-[rgba(167,167,167,1)] rounded-[7px] outline-none focus:outline-none focus:border-[#9144E0] pr-12 transition-colors"
                {...register('newPassword', {
                  required: 'New password is required',
                  minLength: { value: 6, message: 'At least 6 characters required' },
                })}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <EyeIcon open={showNew} />
              </button>
            </div>
            {errors.newPassword && (
              <p className="text-red-500 text-sm mt-1">{errors.newPassword.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <div className="relative">
              <input
                id="confirmNewPassword"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm New Password"
                className="w-full px-4 py-[10px] border-[1.5px] border-[rgba(167,167,167,1)] rounded-[7px] outline-none focus:outline-none focus:border-[#9144E0] pr-12 transition-colors"
                {...register('confirmNewPassword', {
                  required: 'Please confirm your password',
                  validate: (value) => value === watch('newPassword') || 'Passwords do not match',
                })}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <EyeIcon open={showConfirm} />
              </button>
            </div>
            {errors.confirmNewPassword && (
              <p className="text-red-500 text-sm mt-1">{errors.confirmNewPassword.message}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full px-4 py-[10px] bg-[linear-gradient(90deg,#9144E0,#6F2CCA)] text-white rounded-[7px] cursor-[pointer]"
            disabled={loading}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>

          <div className="text-center border bg-[#383838] text-white border-[#000] w-full rounded-[7px] py-2">
            <Link to="/login" className="  ">
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;