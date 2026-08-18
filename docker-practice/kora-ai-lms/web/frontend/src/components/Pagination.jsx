import React from "react";
import ReactPaginate from "react-paginate";

const Pagination = ({ pageCount, handlePageChange }) => {
  return (
    <div className="flex justify-center mt-6">
      <ReactPaginate
        previousLabel={"← Previous"}
        nextLabel={"Next →"}
        breakLabel={"..."}
        pageCount={pageCount}
        marginPagesDisplayed={2}
        pageRangeDisplayed={3}
        onPageChange={handlePageChange}
        containerClassName={"flex space-x-2"}
        pageClassName={"px-3 py-2 border rounded bg-white hover:bg-gray-200"}
        activeClassName={"bg-blue-500 text-white"}
        previousClassName={"px-3 py-2 border rounded bg-white hover:bg-gray-200"}
        nextClassName={"px-3 py-2 border rounded bg-white hover:bg-gray-200"}
      />
    </div>
  );
};

export default Pagination;
