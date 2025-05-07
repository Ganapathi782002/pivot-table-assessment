import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { utils, writeFile } from 'xlsx';

const GeneratingFields = () => {
  const { state } = useLocation();
  const { fullData } = state || {};

  const [rowFields, setRowFields] = useState([]);
  const [columnFields, setColumnFields] = useState([]);
  const [valueFields, setValueFields] = useState([]);
  const [selectedRow, setSelectedRow] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [aggregationType, setAggregationType] = useState("Sum");
  const pivotTableRef = useRef(null);

  // Handle case where data is not available or insufficient
  if (!fullData || fullData.length < 2) {
    return <div>No data received or insufficient data</div>;
  }

  // Extract headers and structured rows
  const [headers, ...rows] = fullData;
  const structuredData = rows.map((row) =>
    headers.reduce((acc, key, idx) => {
      acc[key] = row[idx];
      return acc;
    }, {})
  );

  const addField = (setFieldFn, currentFields, field) => {
    if (field && !currentFields.includes(field)) {
      setFieldFn([...currentFields, field]);
    }
  };

  const removeField = (field, setFieldFn, currentFields) => {
    setFieldFn(currentFields.filter((f) => f !== field));
    // Reset the corresponding 'selected' state
    if (setFieldFn === setRowFields) {
      setSelectedRow("");
    } else if (setFieldFn === setColumnFields) {
      setSelectedColumn("");
    } else if (setFieldFn === setValueFields) {
      setSelectedValue("");
    }
  };

  const renderFieldDropdown = (
    label,
    options,
    selected,
    setSelected,
    setFieldFn,
    currentFields,
    includeAggregation = false,
    aggregationTypeState = "",
    setAggregationTypeFn = () => { }
  ) => (
    <div style={styles.dropdownSection}>
      <label style={styles.label}>{label}</label>
      <select
        style={styles.select}
        value={selected || ""}
        onChange={(e) => {
          const field = e.target.value;
          setSelected(field); // Update the selected field
          addField(setFieldFn, currentFields, field); // Add the selected field to the list
        }}
      >
        <option value="" disabled>
          Add a field
        </option>
        {options
          .filter(field => !currentFields.includes(field)) // Filter out already selected fields
          .map((field) => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
      </select>
      <div style={styles.selectedFieldsContainer}>
        {currentFields.map((field) => (
          <div key={field} style={styles.selectedField}>
            {field}
            <button
              onClick={() => removeField(field, setFieldFn, currentFields)}
              style={styles.removeButton}
            >
              X
            </button>
          </div>
        ))}
      </div>
      {includeAggregation && (
        <div style={styles.aggregationSection}>
          <label style={styles.label}>Aggregate values using</label>
          <select
            style={styles.select}
            value={aggregationTypeState}
            onChange={(e) => setAggregationTypeFn(e.target.value)}
          >
            <option value="Sum">Sum</option>
            <option value="Average">Average</option>
            <option value="Count">Count</option>
          </select>
        </div>
      )}
    </div>
  );

  const aggregateData = (data, rowFields, columnFields, valueFields, aggregationType) => {
    const rowKeys = new Set();
    const colKeys = new Set();
    const dataMap = {};
    const result = [];

    data.forEach(item => {
      const rowKey = rowFields.map(field => item[field]).join(' | ');
      const colKey = columnFields.map(field => item[field]).join(' | ');

      rowKeys.add(rowKey);
      colKeys.add(colKey);

      if (!dataMap[rowKey]) dataMap[rowKey] = {};
      if (!dataMap[rowKey][colKey]) dataMap[rowKey][colKey] = { count: 0 }; // Store count for averages

      valueFields.forEach(field => {
        const fieldValue = parseFloat(item[field]) || 0;
        dataMap[rowKey][colKey][field] = (dataMap[rowKey][colKey][field] || 0) + fieldValue;
        dataMap[rowKey][colKey].count++; // Increment count for each row contributing to this cell
      });
    });

    const rowKeysArray = Array.from(rowKeys).filter(key => key !== ''); // Filter out empty keys
    const colKeysArray = Array.from(colKeys).filter(key => key !== ''); // Filter out empty keys


    // Function to get aggregated value
    const getAggregatedValue = (rowKey, colKey, field) => {
      const values = dataMap[rowKey]?.[colKey] || {};
      let aggregatedValue = values[field] || 0;

      if (aggregationType === 'Average') {
        // Calculate average based on the count of contributing rows for this cell
        const count = values.count || 0;
        aggregatedValue = count > 0 ? aggregatedValue / count : 0;
      } else if (aggregationType === 'Count') {
        // Count refers to the number of rows that contribute to this cell
        aggregatedValue = values.count || 0;
      }
      return aggregatedValue.toFixed(2);
    };

    // Create the result array
    if (rowFields.length > 0 || columnFields.length > 0) {
      // Case 1: Row and Column fields selected
      if (rowFields.length > 0 && columnFields.length > 0) {
        rowKeysArray.forEach(rowKey => {
          const rowData = { [rowFields.join(' | ')]: rowKey };
          colKeysArray.forEach(colKey => {
            valueFields.forEach(field => {
              rowData[`${colKey} - ${field}`] = getAggregatedValue(rowKey, colKey, field);
            });
          });
          result.push(rowData);
        });

        // Add Column Grand Totals Row
        const colGrandTotal = { [rowFields.join(' | ')]: 'Grand Total' };
        valueFields.forEach(field => {
          colKeysArray.forEach(colKey => {
            let total = 0;
            rowKeysArray.forEach(rKey => {
              total += parseFloat(getAggregatedValue(rKey, colKey, field)) || 0;
            });
            colGrandTotal[`${colKey} - ${field}`] = total.toFixed(2);
          });
        });
        result.push(colGrandTotal);

        // Calculate Row Grand Totals and Overall Grand Total
        const overallGrandTotal = {};
        valueFields.forEach(field => {
          overallGrandTotal[field] = 0;
        });

        result.forEach(row => {
          if (row[rowFields.join(' | ')] !== 'Grand Total') {
            valueFields.forEach(field => {
              let rowTotal = 0;
              colKeysArray.forEach(colKey => {
                const cellValue = parseFloat(row[`${colKey} - ${field}`]) || 0;
                rowTotal += cellValue;
                overallGrandTotal[field] += cellValue;
              });
              row[`Grand Total - ${field}`] = rowTotal.toFixed(2);
            });
          }
        });

        // Update the Grand Total row with the overall grand total
        if (result.length > 0 && result[result.length - 1][rowFields.join(' | ')] === 'Grand Total') {
          valueFields.forEach(field => {
            result[result.length - 1][`Grand Total - ${field}`] = overallGrandTotal[field].toFixed(2);
          });
        }

      }
      // Case 2: Only Row fields selected
      else if (rowFields.length > 0 && valueFields.length > 0) {
        rowKeysArray.forEach(rowKey => {
          const rowData = { [rowFields.join(' | ')]: rowKey };
          valueFields.forEach(field => {
            let total = 0;
            // When only row fields are present, aggregate across all original data points for that row key
            const relevantData = data.filter(item => rowFields.map(f => item[f]).join(' | ') === rowKey);
            relevantData.forEach(item => {
                 const fieldValue = parseFloat(item[field]) || 0;
                 total += fieldValue;
            });

            if (aggregationType === 'Average' && relevantData.length > 0) {
                rowData[field] = (total / relevantData.length).toFixed(2);
            } else if (aggregationType === 'Count') {
                 rowData[field] = relevantData.length.toFixed(2);
            }
             else {
                rowData[field] = total.toFixed(2);
            }
          });
          result.push(rowData);
        });

        // Add Grand Total Row for only row fields
        const grandTotalRow = { [rowFields.join(' | ')]: 'Grand Total' };
        valueFields.forEach(field => {
          let total = 0;
           data.forEach(item => {
             const fieldValue = parseFloat(item[field]) || 0;
             total += fieldValue;
           });
           if (aggregationType === 'Average' && data.length > 0) {
               grandTotalRow[field] = (total / data.length).toFixed(2);
           } else if (aggregationType === 'Count') {
               grandTotalRow[field] = data.length.toFixed(2);
           } else {
               grandTotalRow[field] = total.toFixed(2);
           }
        });
        result.push(grandTotalRow);
      }
      // Case 3: Only Column fields selected
      else if (columnFields.length > 0 && valueFields.length > 0) {
        colKeysArray.forEach(colKey => {
          const rowData = { [columnFields.join(' | ')]: colKey };
          valueFields.forEach(field => {
            let total = 0;
            // When only column fields are present, aggregate across all original data points for that column key
             const relevantData = data.filter(item => columnFields.map(f => item[f]).join(' | ') === colKey);
             relevantData.forEach(item => {
                 const fieldValue = parseFloat(item[field]) || 0;
                 total += fieldValue;
             });

             if (aggregationType === 'Average' && relevantData.length > 0) {
                 rowData[field] = (total / relevantData.length).toFixed(2);
             } else if (aggregationType === 'Count') {
                 rowData[field] = relevantData.length.toFixed(2);
             }
             else {
                 rowData[field] = total.toFixed(2);
             }
          });
          result.push(rowData);
        });

         // Add Grand Total Row for only column fields
         const grandTotalRow = { [columnFields.join(' | ')]: 'Grand Total' };
         valueFields.forEach(field => {
           let total = 0;
           data.forEach(item => {
             const fieldValue = parseFloat(item[field]) || 0;
             total += fieldValue;
           });
           if (aggregationType === 'Average' && data.length > 0) {
               grandTotalRow[field] = (total / data.length).toFixed(2);
           } else if (aggregationType === 'Count') {
               grandTotalRow[field] = data.length.toFixed(2);
           } else {
               grandTotalRow[field] = total.toFixed(2);
           }
         });
         result.push(grandTotalRow);
      }
    }
    // Case 4: Only Value fields selected (display a single row with aggregated values)
     else if (valueFields.length > 0) {
        const rowData = { "Grand Total": "Grand Total" }; // Placeholder for clarity
        valueFields.forEach(field => {
            let total = 0;
            data.forEach(item => {
                const fieldValue = parseFloat(item[field]) || 0;
                total += fieldValue;
            });
            if (aggregationType === 'Average' && data.length > 0) {
                rowData[field] = (total / data.length).toFixed(2);
            } else if (aggregationType === 'Count') {
                 rowData[field] = data.length.toFixed(2);
            }
            else {
                rowData[field] = total.toFixed(2);
            }
        });
        result.push(rowData);
     }


    return { result, rowKeysArray, colKeysArray };
  };


  const downloadExcel = () => {
    if (!pivotTableRef.current) return;

    const wb = utils.book_new();
    const ws = utils.table_to_sheet(pivotTableRef.current);
    utils.book_append_sheet(wb, ws, "Pivot Table");
    writeFile(wb, "pivot_table.xlsx");
  };

  const showTable = rowFields.length > 0 || columnFields.length > 0 || valueFields.length > 0;


  const getTableHeader = (rowFields, colKeysArray, valueFields, columnFields) => {
    const headers = [];
    if (rowFields.length > 0) {
      headers.push(rowFields.join(' | '));
    } else if (columnFields.length > 0) {
      headers.push(columnFields.join(' | '));
    } else if (valueFields.length > 0 && rowFields.length === 0 && columnFields.length === 0) {
       headers.push("Grand Total"); // Header for the single row in value-only case
    }


    if (colKeysArray.length === 0 && valueFields.length > 0 && rowFields.length > 0) {
      valueFields.forEach(v => headers.push(v));
    } else if (colKeysArray.length > 0) {
      colKeysArray.forEach(ck => {
        valueFields.forEach(vf => headers.push(`${ck} - ${vf}`));
      });
    } else if (rowFields.length === 0 && columnFields.length > 0 && valueFields.length > 0) {
      valueFields.forEach(v => headers.push(v));
    } else if (rowFields.length > 0 && columnFields.length === 0 && valueFields.length > 0) {
       valueFields.forEach(v => headers.push(v));
    }
     else if (rowFields.length === 0 && columnFields.length === 0 && valueFields.length > 0) {
         valueFields.forEach(v => headers.push(v));
     }



    if (rowFields.length > 0 && columnFields.length > 0) {
      valueFields.forEach(field => {
        headers.push(`Grand Total - ${field}`);
      });
    }
    return headers;
  }


  return (
    <div style={styles.container}>
      <div style={styles.pivotContainer}>
        <h2 style={styles.pivotTablePlaceholder}>PIVOT TABLE ({aggregationType})</h2>
        {showTable ? (
          <>
            {(() => {
              const { result, rowKeysArray, colKeysArray } = aggregateData(
                structuredData,
                rowFields,
                columnFields,
                valueFields,
                aggregationType
              );
               const tableHeader = getTableHeader(rowFields, colKeysArray, valueFields, columnFields);

               if (result.length === 0) {
                 return <div style={styles.placeholderMessage}>No data to display for the selected fields.</div>;
               }


              return (
                <table style={styles.pivotTable} ref={pivotTableRef}>
                  <thead>
                    <tr>
                      {tableHeader.map((header, index) => (
                        <th key={index} style={styles.tableHeader}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.map((row, index) => {
                      const isGrandTotalRow = (rowFields.length > 0 && row[rowFields.join(' | ')] === 'Grand Total') ||
                                              (columnFields.length > 0 && row[columnFields.join(' | ')] === 'Grand Total') ||
                                              (rowFields.length === 0 && columnFields.length === 0 && valueFields.length > 0 && row["Grand Total"] === "Grand Total");

                      const rowStyle = isGrandTotalRow ? styles.tableRowGrand : styles.tableRow;
                      return (
                        <tr key={index} style={rowStyle}>
                          {tableHeader.map((header, cellIndex) => { // Use tableHeader to iterate through cells
                             const cellValue = row[header]; // Access cell value using the header
                            const isGrandTotalCell = isGrandTotalRow || (header && header.startsWith('Grand Total'));
                            const cellStyle = isGrandTotalCell ? styles.tableCellGrand : styles.tableCell;
                            return (
                              <td key={cellIndex} style={cellStyle}>
                                {cellValue || ''}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              );
            })()}
            <button style={styles.downloadButton} onClick={downloadExcel}>
              Download as Excel
            </button>
          </>
        ) : (
          <div style={styles.placeholderMessage}>
            <h2 style={styles.placeholderMessage}>
              To Construct a Pivot table
            </h2>
            Select at least one field in Row or Column and one field in Value.
          </div>
        )}
      </div>

      <div style={styles.selectorPane}>
        {renderFieldDropdown(
          "Row Fields",
          headers,
          selectedRow,
          setSelectedRow,
          setRowFields,
          rowFields
        )}
        {renderFieldDropdown(
          "Column Fields",
          headers,
          selectedColumn,
          setSelectedColumn,
          setColumnFields,
          columnFields
        )}
        {renderFieldDropdown(
          "Value Fields",
          headers,
          selectedValue,
          setSelectedValue,
          setValueFields,
          valueFields,
          true, // Include aggregation options
          aggregationType,
          setAggregationType
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    height: "100vh",
    width: "100%",
    backgroundColor: "#e0f7fa",
    overflow: "hidden",
  },
  pivotContainer: {
    flex: 1,
    padding: "20px",
    overflow: "auto",
    backgroundColor: "#fff",
    position: "relative",
  },
  pivotTablePlaceholder: {
    textAlign: "center",
    fontSize: "18px",
    color: "#888",
  },
  selectorPane: {
    width: "280px",
    padding: "20px",
    backgroundColor: "skyblue",
    borderLeft: "1px solid #ccc",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    overflowY: "auto",
  },
  dropdownSection: {
    marginBottom: "20px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "bold",
    marginBottom: "8px",
    color: "#333",
  },
  select: {
    width: "100%",
    padding: "8px",
    fontSize: "14px",
    borderRadius: "4px",
    border: "1px solid #ccc",
  },
  selectedFieldsContainer: {
    marginTop: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  selectedField: {
    display: "flex",
    justifyContent: "space-between",
    backgroundColor: "White",
    padding: "4px 8px",
    borderRadius: "10px",
    fontSize: "14px",
    color: "Black",
  },
  removeButton: {
    background: "red",
    color: "#000080", // Changed to a more visible color
    border: "none",
    borderRadius: "12px",
    padding: "2px 6px",
    cursor: "pointer",
    fontSize: "10px",
    marginLeft: "5px", // Added some margin
  },
  pivotTable: {
    width: "100%",
    borderCollapse: "collapse",
    backgroundColor: "#fff",
    fontSize: "13px",
    marginTop: "20px", // Added margin for spacing
  },
  tableHeader: {
    border: "1px solid #ccc",
    padding: "8px", // Increased padding
    backgroundColor: "#f0f0f0",
    textAlign: "center",
    fontWeight: "bold",
    whiteSpace: "nowrap", // Prevent header text wrapping
  },
   tableHeaderGrand: { // Merged with tableHeader style as they were identical
    border: "1px solid #ccc",
    padding: "8px",
    backgroundColor: "#f0f0f0",
    textAlign: "center",
    fontWeight: "bold",
    whiteSpace: "nowrap",
  },
  tableRow: {
    border: "1px solid #ccc",
  },
  tableRowGrand: {
    border: "1px solid #ccc",
    fontWeight: "bold",
    backgroundColor: "#f0f0f0", // Added background for grand total row
  },
  tableCell: {
    border: "1px solid #ccc",
    padding: "8px", // Increased padding
    textAlign: "center",
  },
  tableCellGrand: {
    border: "1px solid #ccc",
    padding: "8px",
    textAlign: "center",
    fontWeight: "bold",
    backgroundColor: "#f0f0f0",
  },
  placeholderMessage: {
    textAlign: "center",
    fontSize: "16px",
    color: "#888",
    paddingTop: "40px",
  },
  aggregationSection: {
    marginTop: "15px",
  },
  downloadButton: {
    backgroundColor: "#4CAF50",
    color: "white",
    padding: "10px 15px",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "14px",
    marginTop: "20px",
    alignSelf: "flex-start", // Align button to the left
  },
};

export default GeneratingFields;