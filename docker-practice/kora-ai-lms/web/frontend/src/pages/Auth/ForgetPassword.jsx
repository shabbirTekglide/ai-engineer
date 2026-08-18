import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Link } from 'react-router-dom';
import AuthApi from '../../api/authApi';

const ForgotPassword = () => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await AuthApi.forgetPass(data.email)
      toast.success('Password reset email sent! Check your inbox.');
    } catch (error) {
      toast.error('Failed to send reset email. Try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(90deg,#9144E0,#6F2CCA)]">
      <div className="bg-white p-8 rounded-[22px] max-w-[500px] w-full shadow-[0px_0px_20px_3px_rgba(0,0,0,0.05)] pb-12 m-2">
        <h1 className="text-2xl font-bold mb-8 text-center">Forgot Password</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="email" className="block font-medium mb-1 hidden">
              Enter your email:
            </label>
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              className="mt-2 w-full px-4 py-2 border-[1.5px] border-[rgba(167,167,167,1)] rounded-[7px] outline-none focus:outline-none focus:border-[1.5px] focus:border-[rgba(167,167,167,1)] "
              {...register('email', { required: 'Email is required' })}
              disabled={loading}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full px-4 py-[10px] bg-[linear-gradient(90deg,#9144E0,#6F2CCA)] text-white rounded-[7px] cursor-[pointer]"
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send Reset Email'}
          </button>

          <div className="text-center border bg-[#383838] text-white border-[#000] w-full rounded-[7px] py-2">
            <Link to="/login" className="text-black-800  ">
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;
