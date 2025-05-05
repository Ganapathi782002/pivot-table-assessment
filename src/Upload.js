import React, { useState } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate } from 'react-router-dom';

const UploadFile = () => {
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ];

    if (!validTypes.includes(selectedFile.type)) {
      toast.error('Invalid file format. Please upload an Excel or CSV file.');
      setFile(null);
      setPreviewData([]);
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      return;
    }

    setFile(selectedFile);
    toast.success(`${selectedFile.name} uploaded successfully!`);

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const firstFiveRows = jsonData.slice(0, 6);
      setPreviewData(firstFiveRows);
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  const handleButtonClick = () => {
    // Correct navigation to the new page without .js extension
    navigate('/crafting-pivot-table');
  };

  return (
    <div style={styles.container}>
      <div style={styles.uploadBox}>
        <h2 style={styles.heading}>Welcome to Pivot Craft</h2>
        <h3 style={styles.subHeading}>UPLOAD AN EXCEL OR CSV FILE</h3>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileChange}
          style={styles.input}
        />
      </div>

      {previewData.length > 0 && (
        <div style={styles.previewBox}>
          <h3 style={styles.previewTitle}>Preview of (first 5 rows)</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                {previewData[0].map((headerCell, index) => (
                  <th key={index} style={styles.headerCell}>
                    {headerCell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewData.slice(1).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, colIndex) => (
                    <td key={colIndex} style={styles.cell}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleButtonClick} style={styles.button}>
            Craft a Pivot Table
          </button>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: 'skyblue',
    minHeight: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    boxSizing: 'border-box',
  },
  uploadBox: {
    backgroundColor: '#ffffffcc',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    textAlign: 'center',
    minWidth: '200px',
    width: '85%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  heading: {
    marginBottom: '10px',
    color: '#333',
    fontFamily: "'Dancing Script', cursive",
    fontSize: '28px',
    fontWeight: 'bold',
  },
  subHeading: {
    marginBottom: '20px',
    color: '#333',
    fontFamily: "'Arial', sans-serif",
    fontSize: '20px',
    fontWeight: 'normal',
  },
  input: {
    padding: '8px',
    backgroundColor: '#d3d3d3',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginBottom: '20px',
  },
  button: {
    padding: '10px 20px',
    backgroundColor: '#1e3d58', // Navy blue
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '20px',
    transition: 'background-color 0.3s',
  },
  buttonHover: {
    backgroundColor: '#16344a', // Darker navy blue on hover
  },
  previewBox: {
    backgroundColor: '#fff',
    borderRadius: '10px',
    marginTop: '20px',
    padding: '20px',
    width: '95%',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center', // Align button to the center
  },
  previewTitle: {
    marginBottom: '10px',
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
    textAlign: 'left',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'auto',
  },
  headerCell: {
    border: '2px solid #333',
    padding: '10px',
    backgroundColor: '#e0e0e0',
    color: '#222',
    fontWeight: 'bold',
    fontSize: '14px',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  cell: {
    border: '1.5px solid #444',
    padding: '8px',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: '500',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },
};

export default UploadFile;
