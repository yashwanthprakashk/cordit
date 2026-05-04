const Pagination = ({ page, totalPages, onPageChange }) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
      <button
        className="btn btn-primary btn-sm"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <span>Page {page} of {totalPages}</span>
      <button
        className="btn btn-primary btn-sm"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
};

export default Pagination;
