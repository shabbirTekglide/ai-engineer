import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useDispatch, useSelector } from 'react-redux'
import {
  fetchConfig,
  updateConfig,
  addModel as addModelAction,
  clearSaved
} from '../../store/slicers/configSlice'
import { AdminDashboardlayout } from '../../components/admin'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '../../components/ui/Dialog'

function Integrations() {
  const dispatch = useDispatch()
  const { settings, models = [], loading, error, saved } =
    useSelector((s) => s.adminConfig || {})

  const [editing, setEditing] = useState(false)
  const [localError, setLocalError] = useState(null)

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { translation: 'none', aiIntegration: 'none' }
  })

  useEffect(() => { dispatch(fetchConfig()) }, [dispatch])

  useEffect(() => {
    if (settings) {
      reset({
        translation: settings.translation?.modelName || 'none',
        aiIntegration: settings.aiIntegration?.modelName || 'none'
      })
    }
  }, [settings, reset])

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => dispatch(clearSaved()), 1500)
      return () => clearTimeout(t)
    }
  }, [saved, dispatch])

  const onSave = async (data) => {
    setLocalError(null)
    const payload = {}

    if (data.translation !== 'none') {
      const tm = models.find(m => m.name === data.translation)
      if (!tm) return setLocalError('Translation model not found')
      payload.translation = { modelName: tm.name, apiKey: tm.apiKey }
    }

    if (data.aiIntegration !== 'none') {
      const am = models.find(m => m.name === data.aiIntegration)
      if (!am) return setLocalError('AI model not found')
      payload.aiIntegration = { modelName: am.name, apiKey: am.apiKey }
    }

    try {
      await dispatch(updateConfig(payload)).unwrap()
      setEditing(false)
    } catch (e) {
      setLocalError(e)
    }
  }

  const onCancel = () => {
    reset({
      translation: settings?.translation?.modelName || 'none',
      aiIntegration: settings?.aiIntegration?.modelName || 'none'
    })
    setEditing(false)
  }

  return (
    <AdminDashboardlayout>
      <div className="min-h-screen">
        <div className=" border-2 p-4 md:p-6 rounded-md bg-white">

          {/* Header */}
          <div className="flex justify-between md:items-center mb-5 md:flex-row flex-col space-y-5">
            <div>
              <h1 className="text-xl md:text-3xl mb-2 font-bold text-gray-900">Integrations</h1>
              <p className="text-gray-600 mt-1">Manage your AI and translation models</p>
            </div>

            <AddModelDialog>
              <button className="cursor-pointer bg-[#2B7FFF] hover:bg-[#1e6fe6] text-white font-medium px-4 py-2 rounded-lg shadow-md transition duration-200">
                + Add Model
              </button>
            </AddModelDialog>
          </div>

          {/* Card */}
          <div className=" p-2 space-y-6">

            <div className="">
              {/* Translation */}
              <div>
                <label className="font-semibold text-gray-700">Translation Model</label>
                <select
                  {...register('translation')}
                  disabled={!editing}
                  className={`w-full mt-2 p-3 rounded-sm border focus:ring-1 focus:ring-[#2B7FFF] focus:border-transparent text-gray-900 transition
                  ${!editing ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-gray-300'}`}
                >
                  <option value="none">None</option>
                  {models.map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* AI */}
              <div className='mt-5'>
                <label className="font-semibold text-gray-700">AI Integration Model</label>
                <select
                  {...register('aiIntegration')}
                  disabled={!editing}
                  className={`w-full mt-2  p-3 rounded-sm border focus:ring-1 focus:ring-[#2B7FFF]  focus:border-transparent text-gray-900 transition
                  ${!editing ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-gray-300'}`}
                >
                  <option value="none">None</option>
                  {models.map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4 mt-4">
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="cursor-pointer bg-[#2B7FFF] hover:bg-[#1e6fe6] text-white font-medium py-2 rounded-sm shadow-md transition duration-200 px-3"
                >
                  Edit Settings
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSubmit(onSave)}
                    className="cursor-pointer bg-[#6C63FF] hover:bg-[#594ce0] text-white font-medium py-2 px-3 rounded-sm shadow-md transition duration-200"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={onCancel}
                    className=" cursor-pointer bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-3 rounded-sm transition duration-200"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>

            {/* Messages */}
            {localError && <p className="text-red-600 mt-2">{localError}</p>}
            {error && <p className="text-red-600 mt-2">{error}</p>}
            {saved && <p className="text-green-600 mt-2">Settings saved</p>}
          </div>
        </div>
      </div>
    </AdminDashboardlayout>
  )
}

// Add Model Dialog - Redesigned
function AddModelDialog({ children }) {
  const dispatch = useDispatch()
  const { register, handleSubmit, reset } = useForm()
  const [saved, setSaved] = useState(false);
  const [localErr, setLocalErr] = useState(null);

  const onSubmit = async (data) => {
    setLocalErr(null)
    try {
      await dispatch(addModelAction({ name: data.name, apiKey: data.apiKey })).unwrap()
      setSaved(true)
      reset()
      dispatch(fetchConfig())
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      setLocalErr(err || 'Failed to add model')
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-900">Add New Model</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <input
            {...register('name')}
            placeholder="Model name"
            className="w-full p-4 rounded-xl border focus:ring-2 focus:ring-[#2B7FFF] outline-none focus:border-transparent text-gray-900 transition"
          />
          <input
            {...register('apiKey')}
            type="password"
            placeholder="API key"
            className="w-full p-4 rounded-xl border focus:ring-2 focus:ring-[#6C63FF] outline-none focus:border-transparent text-gray-900 transition"
          />

          <DialogFooter className="flex gap-2 mt-2">
            <DialogClose asChild>
              <button className="mr-0 cursor-pointer px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium  rounded-xl transition duration-200">
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              className="cursor-pointer px-4 py-3 bg-[#2B7FFF] hover:bg-[#1e6fe6] text-white font-medium  rounded-xl shadow-md transition duration-200"
            >
              Save
            </button>
          </DialogFooter>

          {saved && <p className="text-green-600 mt-2">Model added successfully</p>}
          {localErr && <p className="text-red-600 mt-2">{localErr}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default Integrations
