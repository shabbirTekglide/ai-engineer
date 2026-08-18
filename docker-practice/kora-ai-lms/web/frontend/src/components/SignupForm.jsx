import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { sendOtp, verifyOtp, setPassword, clearError } from '../store/slicers/authSlice';
import { Link, useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff } from "react-icons/fi";
import { toast } from 'react-toastify';
import ReactSpinner from './ui/ReactSpinner';


const SignupForm = () => {

  const [showPassword, setShowPassword] = useState({
    password: false,
    confirmPass: false
  });

  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm();
  const { otpVerified, loading, error, } = useSelector((state) => state.auth);
  console.log('otpVerification', otpVerified)
  const dispatch = useDispatch();

  const [otpFieldVisible, setOtpFieldVisible] = useState(false);

  const onSendOtp = async (data) => {
    try {
      const res = await dispatch(sendOtp({ email: data.email, name: data.name })).unwrap();
      toast.success(res.message);
      setOtpFieldVisible(true);
    } catch (error) {
      toast.error(error)
      setOtpFieldVisible(false);
    }
  };


  const onVerifyOtp = async (data) => {
    try {
      if (!data.otp) return;
      const res = await dispatch(verifyOtp({ email: data.email, otp: data.otp })).unwrap();
      toast.success(res.message);
    } catch (error) {
      console.log(error, "from verify")
      toast.error(error)
    }

  };

  const onSetPassword = (data) => {
    if (data.password !== data.confirm_password) {
      toast.error("Passwords do not match");
    }
    console.log(data)
    dispatch(setPassword({ email: data.email, password: data.password, confirm_password: data.confirm_password }))
      .unwrap() // Waits for the promise to resolve or reject
      .then(() => {
        // Navigate to the login page upon success
        navigate('/login');
        // window.location.href = '/login';
      })
      .catch((error) => {
        toast.error(error)
      });
  };

  if (loading) {
    return <ReactSpinner />
  }

  return (
    <div className="bg-white p-8 rounded-[22px] max-w-[500px] w-full shadow-[0px_0px_20px_3px_rgba(0,0,0,0.05)] pb-12 m-2">
      {/* <h1 className="text-2xl font-bold text-black mt-2 text-center mb-4">Signup Form</h1> */}
      <div className='max-w-[120px] flex justify-center items-center mx-[auto] mt-5 mb-10'>
        <img src="/login/assets/images/newImages/rubitt-lamp.png" className='w-full' alt="" />

      </div>

      {console.log('otpVerified', otpVerified)}
      {otpVerified !== true && !otpFieldVisible ? (
        <form onSubmit={handleSubmit(onSendOtp)} className="space-y-4">
          <div>
            <label htmlFor="name" className="text-black text-lg ">
              Name:
            </label>
            <input
              id="name"
              type="text"
              placeholder='Enter your name'
              className="mt-2 w-full px-4 py-2 border-[1.5px] border-[rgba(167,167,167,1)] rounded-[7px] outline-none focus:outline-none focus:border-[1.5px] focus:border-[rgba(167,167,167,1)] "
              {...register('name', { required: 'Name is required' })}
              disabled={loading}
            />
            {errors.name && (
              <p className="text-red-500 text-sm mt-1 px-1">{errors.name.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="email" className="text-black text-lg ">
              Email:
            </label>
            <input
              id="email"
              type="email"
              placeholder='Enter your email'
              className="mt-2 w-full px-4 py-2 border-[1.5px] border-[rgba(167,167,167,1)] rounded-[7px] outline-none focus:outline-none focus:border-[1.5px] focus:border-[rgba(167,167,167,1)] "
              {...register('email', { required: 'Email is required' })}
              disabled={loading}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1 px-1">{errors.email.message}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full px-4 py-[10px] bg-[linear-gradient(90deg,#9144E0,#6F2CCA)] text-white rounded-[7px] cursor-[pointer]"
            disabled={loading}
          >
            {loading ? 'Sending OTP...' : 'Send OTP'}
          </button>
        </form>
      ) : null}

      {otpFieldVisible && otpVerified !== true && (
        <form onSubmit={handleSubmit(onVerifyOtp)} className="space-y-4 mt-6">
          <div>
            <label htmlFor="otp" className="block font-medium  mb-1 hidden">
              OTP:
            </label>
            <input
              id="otp"
              type="text"
              placeholder='Enter your OTP'
              className="mt-2 w-full px-4 py-2 border-[1.5px] border-[rgba(167,167,167,1)] rounded-[7px] outline-none focus:outline-none focus:border-[1.5px] focus:border-[rgba(167,167,167,1)] "
              {...register('otp', { required: 'OTP is required' })}
              disabled={loading}
            />
            {errors.otp && (
              <p className="text-red-500 text-sm mt-1 px-1">{errors.otp.message}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full px-4 py-[10px] bg-[linear-gradient(90deg,#9144E0,#6F2CCA)] text-white rounded-[7px] cursor-[pointer]"
            disabled={loading}
          >
            {loading ? 'Verifying OTP...' : 'Verify OTP'}
          </button>
          <p className='text-center border bg-[#383838] text-white border-[#000] w-full rounded-[7px] py-2 cursor-[pointer]' onClick={() => {
            const email = getValues('email');
            const name = getValues('name');
            onSendOtp({ email, name });
          }}>Resend OTP</p>
        </form>
      )}

      {otpVerified === true && (
        <form onSubmit={handleSubmit(onSetPassword)} className="space-y-4">
          <div>
            <label htmlFor="password" className="block font-medium">
              Password:
            </label>
            <div className="input-field relative">
              <input
                id="password"
                type={showPassword.password ? "text" : "password"}
                className=" w-full px-4 py-3 border-[1.5px] border-[rgba(167,167,167,1)] rounded-[7px] outline-none focus:outline-none focus:border-[1.5px] focus:border-[rgba(167,167,167,1)]"
                {...register("password", { required: "Password is required" })}
                disabled={loading}
              />
              <div
                className="absolute right-[2%] top-0 bottom-0 flex justify-center items-center cursor-pointer"
                onClick={() => setShowPassword((prev) => ({ ...prev, password: !prev.password }))}
              >
                {showPassword.password ? <FiEyeOff /> : <FiEye />}
              </div>

            </div>


            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="confirm_password" className="block font-medium">
              Confirm Password:
            </label>
            <div className="input-field relative">
              <input
                id="confirm_password"
                type={showPassword.confirmPass ? "text" : "password"}
                className="w-full px-4 py-2 border-[1.5px] border-[rgba(167,167,167,1)] rounded-[7px] outline-none focus:outline-none focus:border-[1.5px] focus:border-[rgba(167,167,167,1)]"
                {...register('confirm_password', { required: 'Confirm password is required' })}
                disabled={loading}
              />
              <div
                className="absolute right-[2%] top-0 bottom-0 flex justify-center items-center cursor-pointer"
                onClick={() => setShowPassword((prev) => ({ ...prev, confirmPass: !prev.confirmPass }))}
              >
                {showPassword.confirmPass ? <FiEyeOff /> : <FiEye />}
              </div>
            </div>
            {errors.confirm_password && (
              <p className="text-red-500 text-sm mt-1">{errors.confirm_password.message}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full px-4 py-[10px] bg-[linear-gradient(90deg,#9144E0,#6F2CCA)] text-white rounded-[7px] cursor-[pointer]"
            disabled={loading}
          >
            {loading ? 'Setting Password...' : 'Set Password'}
          </button>
        </form>
      )}

    </div>
  );
};

export default SignupForm;
