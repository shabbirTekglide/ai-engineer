import React from 'react'
import ClipLoader from "react-spinners/ClipLoader";

const ReactSpinner = () => {
  return (
   <>
     <div className="fixed inset-0 bg-[rgba(0,_0,_0,_0.4)] flex items-center justify-center z-99">
        <ClipLoader size={50} color="#FFFFFF" />
      </div>
   </>
  )
}

export default ReactSpinner