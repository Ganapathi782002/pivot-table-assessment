import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { utils, writeFile } from 'xlsx';

const GeneratingFields = () => {
  const { state } = useLocation();
  const { fullData } = state || {};

  const [rowFields, setRowFields] = useState([]);
  const [columnFields, setColumnFields] = useState([]);
  const [valueFields, setValueFields] = useState([]); // Array of { field: string, aggregation: string }
  const [selectedRow, setSelectedRow] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [defaultAggregationType, setDefaultAggregationType] = useState("Sum"); // Default aggregation for new value fields
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

  // Helper function to add a field to the selected fields list
  const addField = (setFieldFn, currentFields, field) => {
    if (!field) return;

    if (setFieldFn === setValueFields) {
      // For value fields, add an object { field, aggregation }
      // Only add if the field name isn't already in the list
      if (!currentFields.some(item => item.field === field)) {
         setFieldFn([...currentFields, { field: field, aggregation: defaultAggregationType }]);
         setSelectedValue(""); // Reset selected value dropdown after adding
      }
    } else {
      // For row/column fields, add just the field name string
      if (!currentFields.includes(field)) {
        setFieldFn([...currentFields, field]);
      }
    }
  };

  // Helper function to remove a field from the selected fields list
  const removeField = (fieldToRemove, setFieldFn, currentFields) => {
    if (setFieldFn === setValueFields) {
       // Filter value fields by the field name
       setFieldFn(currentFields.filter((item) => item.field !== fieldToRemove));
    } else {
       // Filter row/column fields by the field name string
       setFieldFn(currentFields.filter((f) => f !== fieldToRemove));
    }
    // Reset the corresponding 'selected' state (optional, but good practice)
    if (setFieldFn === setRowFields) setSelectedRow("");
    else if (setFieldFn === setColumnFields) setSelectedColumn("");
    else if (setFieldFn === setValueFields) setSelectedValue("");
  };

  // Renders the dropdowns and selected fields lists for Row, Column, and Value fields
  const renderFieldDropdown = (
    label,
    options,
    selected,
    setSelected,
    setFieldFn,
    currentFields, // currentFields is [{field, aggregation}] for values, string[] for others
    includeAggregation = false,
    aggregationTypeState = "", // This is defaultAggregationType for value fields
    setAggregationTypeFn = () => { } // This is setDefaultAggregationType for value fields
  ) => (
    <div style={styles.dropdownSection}>
      <label style={styles.label}>{label}</label>
      <select
        style={styles.select}
        value={selected || ""}
        onChange={(e) => {
          const field = e.target.value;
          setSelected(field); // Update the selected field in dropdown
          // Add the selected field (with default aggregation for values)
          addField(setFieldFn, currentFields, field);
        }}
      >
        <option value="" disabled>
          Add a field
        </option>
        {/* Filter out fields that are already in the currentFields list */}
        {options
          .filter(field => setFieldFn === setValueFields ? !currentFields.some(item => item.field === field) : !currentFields.includes(field))
          .map((field) => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
      </select>

      {/* Display default aggregation selector only for Value Fields dropdown */}
      {includeAggregation && (
         <div style={styles.aggregationSection}>
           <label style={styles.label}>Default aggregation for new fields</label>
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

      <div style={styles.selectedFieldsContainer}>
        {/* Map through currentFields - handles both string array and array of objects */}
        {currentFields.map((item) => {
          const fieldName = setFieldFn === setValueFields ? item.field : item; // Get field name
          const currentAggregation = setFieldFn === setValueFields ? item.aggregation : null; // Get aggregation for value fields

          return (
            <div key={fieldName} style={styles.selectedField}>
              {fieldName}
              {/* Show aggregation and dropdown only for Value Fields */}
              {setFieldFn === setValueFields && (
                 <>
                   ({currentAggregation})
                   <select
                     style={{...styles.select, width: 'unset', marginLeft: '10px', padding: '2px', height: '25px', fontSize: '12px'}} // Adjust style
                     value={currentAggregation}
                     onChange={(e) => {
                       const newAggregation = e.target.value;
                       // Update the aggregation for this specific field in the state
                       setValueFields(valueFields.map(valField =>
                         valField.field === fieldName ? { ...valField, aggregation: newAggregation } : valField
                       ));
                     }}
                   >
                     <option value="Sum">Sum</option>
                     <option value="Average">Average</option>
                     <option value="Count">Count</option>
                   </select>
                 </>
               )}
              <button
                onClick={() => removeField(fieldName, setFieldFn, currentFields)}
                style={styles.removeButton}
              >
                X
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Aggregates data based on selected row, column, and value fields
  const aggregateData = (data, rowFields, columnFields, valueFields) => {
    const dataMap = {}; // Stores aggregated data per cell (combination of row keys and column keys)

    // Populate dataMap with sums and counts for each value field in each cell
    data.forEach(item => {
      const rowKey = rowFields.length > 0 ? rowFields.map(field => item[field]).join(' | ') : 'Grand Total';
      const colKey = columnFields.length > 0 ? columnFields.map(field => item[field]).join(' | ') : 'Grand Total';

      if (!dataMap[rowKey]) dataMap[rowKey] = {};
      if (!dataMap[rowKey][colKey]) dataMap[rowKey][colKey] = {};

      valueFields.forEach(({ field }) => { // Iterate through value fields
        const fieldValue = parseFloat(item[field]) || 0;
        if (!dataMap[rowKey][colKey][field]) {
          dataMap[rowKey][colKey][field] = { sum: 0, count: 0 };
        }
        dataMap[rowKey][colKey][field].sum += fieldValue;
        dataMap[rowKey][colKey][field].count++;
      });
    });

     // Helper function to get aggregated value based on sum, count, and aggregation type
     const getAggregatedValue = (sum, count, aggregation) => {
        if (aggregation === 'Average') {
            return count > 0 ? (sum / count).toFixed(2) : '0.00';
        } else if (aggregation === 'Count') {
            return count; // Count is usually an integer
        }
        return sum.toFixed(2); // Default is Sum
     };

     const result = [];

     // Get unique row and column key combinations from the dataMap for iterating
     const uniqueRowKeys = Object.keys(dataMap).filter(key => key !== 'Grand Total').sort();
     const uniqueColKeys = Array.from(new Set(Object.values(dataMap).flatMap(row => Object.keys(row)))).filter(key => key !== 'Grand Total').sort();


     // Generate data rows based on unique row keys
     uniqueRowKeys.forEach(rowKey => {
         const rowData = {};

          // Add row field values to the rowData object using the rowKey parts
          const rowKeyParts = rowKey.split(' | ');
           rowFields.forEach((field, index) => {
               rowData[field] = rowKeyParts[index];
           });


         // Add data cells for each unique column key and value field combination
          uniqueColKeys.forEach(colKey => {
              valueFields.forEach(({field, aggregation}) => {
                   const cellData = dataMap[rowKey]?.[colKey]?.[field] || { sum: 0, count: 0 };
                   // Use a key format that the rendering logic can match
                   rowData[`${colKey} - ${field} (${aggregation})`] = getAggregatedValue(cellData.sum, cellData.count, aggregation);
              });
          });

           // Add Row Grand Totals (aggregated across columns for each row)
            valueFields.forEach(({field, aggregation}) => {
                let rowTotalSum = 0;
                let rowTotalCount = 0;
                 uniqueColKeys.forEach(colKey => {
                     const fieldData = dataMap[rowKey]?.[colKey]?.[field] || { sum: 0, count: 0 };
                     rowTotalSum += fieldData.sum;
                     rowTotalCount += fieldData.count;
                 });
                 rowData[`Grand Total - ${field} (${aggregation})`] = getAggregatedValue(rowTotalSum, rowTotalCount, aggregation);
            });

         result.push(rowData);
     });


     // Add Grand Total row
     const grandTotalRow = {};
      // Add a flag to easily identify the grand total row during rendering
      grandTotalRow._isGrandTotal = true;

      // Add the Grand Total label in the first row field column (or a dedicated key if no row fields)
       if (rowFields.length > 0) {
           grandTotalRow[rowFields[0]] = 'Grand Total';
           // Fill other row field columns with empty strings for grand total row to maintain column count
            rowFields.slice(1).forEach(field => grandTotalRow[field] = '');
       } else if (columnFields.length > 0 || valueFields.length > 0) {
            grandTotalRow['Grand Total'] = 'Grand Total'; // Label for the row
       }


      // Calculate and add overall Grand Totals for value fields
      valueFields.forEach(({ field, aggregation }) => {
          let overallTotalSum = 0;
          let overallTotalCount = 0;
           structuredData.forEach(item => {
               const fieldValue = parseFloat(item[field]) || 0;
               overallTotalSum += fieldValue;
               overallTotalCount++;
           });
           const aggregatedValue = getAggregatedValue(overallTotalSum, overallTotalCount, aggregation);
           // Use a key format that the rendering logic can match for the overall grand total column
            if (columnFields.length > 0 || rowFields.length > 0) {
                grandTotalRow[`Grand Total - ${field} (${aggregation})`] = aggregatedValue;
            } else { // Case with only value fields selected
                 grandTotalRow[`${field} (${aggregation})`] = aggregatedValue;
            }
      });

       // Add column grand totals to the grandTotalRow
        uniqueColKeys.forEach(colKey => {
            valueFields.forEach(({ field, aggregation }) => {
                let colTotalSum = 0;
                let colTotalCount = 0;
                 // Aggregate across data rows for this colKey
                 uniqueRowKeys.forEach(rowKey => {
                     const fieldData = dataMap[rowKey]?.[colKey]?.[field] || { sum: 0, count: 0 };
                     colTotalSum += fieldData.sum;
                     colTotalCount += fieldData.count;
                 });
                 grandTotalRow[`${colKey} - ${field} (${aggregation})`] = getAggregatedValue(colTotalSum, colTotalCount, aggregation);
            });
        });


     result.push(grandTotalRow);


    return { result, uniqueRowKeys, uniqueColKeys }; // Return unique keys for header generation
  };


  // Helper to count lower-level combinations for colspan calculation
  const getLowerLevelCombinationsCount = (parentColKey, currentLevel, remainingColFields, data, allColumnFields) => {
       if (remainingColFields.length === 0) return 1; // Base case: one combination (the absence of further fields)

       const nextField = remainingColFields[0];
       const uniqueValues = Array.from(new Set(data.map(item => {
            const currentItemKeyParts = allColumnFields.slice(0, currentLevel + 1).map(f => item[f]);
            const currentItemKey = currentItemKeyParts.join(' | ');
            return currentItemKey.startsWith(parentColKey) ? item[nextField] : null;
       }).filter(val => val !== null)));

       let count = 0;
       uniqueValues.forEach(val => {
           const nextParentKey = parentColKey ? `${parentColKey} | ${val}` : val;
            count += getLowerLevelCombinationsCount(nextParentKey, currentLevel + 1, remainingColFields.slice(1), data, allColumnFields);
       });
       return count;
  };


  // Generates the multi-level header structure for the table
  const getTableHeader = (rowFields, columnFields, valueFields, uniqueColKeys, data) => {
      const headerRows = [];

      // Determine the number of header rows needed based on column field depth and value fields
       const maxColHeaderLevels = columnFields.length;
       const totalHeaderLevels = maxColHeaderLevels + (valueFields.length > 0 ? 1 : 0); // Levels for column fields + value fields


       // Create empty arrays for each header row level to prevent "push of undefined"
        for (let i = 0; i < totalHeaderLevels; i++) {
            headerRows.push([]);
        }


       // Add the top-left cell for row fields (if any)
       if (rowFields.length > 0) {
           // The row field header spans all column header rows and the value header row
           // Ensure headerRows[0] exists before pushing
            if (headerRows.length > 0) {
               headerRows[0].push({ text: rowFields.join(' | '), colspan: rowFields.length, rowspan: totalHeaderLevels, type: 'row-fields-header' });
            }
       } else if (columnFields.length === 0 && valueFields.length > 0) {
            // If no row or column fields, the first header is just a label for the single row
             if (headerRows.length > 0) {
                headerRows[0].push({ text: 'Grand Total', colspan: 1, rowspan: totalHeaderLevels, type: 'grand-total-label' });
             }
       }


       // Populate column headers and value headers based on unique column keys
        if (columnFields.length > 0) {
            // Recursive helper to populate column headers
            const populateColHeaders = (currentLevel, parentColKey = '') => {
                if (currentLevel >= columnFields.length) {
                    // Base case: reached the level for value headers
                    return;
                }

                const field = columnFields[currentLevel];
                // Get unique values for this field under the parent key from the original data
                const uniqueValues = Array.from(new Set(data.map(item => {
                     const currentItemKeyParts = columnFields.slice(0, currentLevel + 1).map(f => item[f]);
                     const currentItemKey = currentItemKeyParts.join(' | ');
                     return parentColKey ? (currentItemKey.startsWith(parentColKey + ' | ') ? item[field] : null) : item[field];
                }).filter(val => val !== null)));


                uniqueValues.forEach(val => {
                     const currentColKey = parentColKey ? `${parentColKey} | ${val}` : val;

                     // Calculate colspan for this header cell
                     let colspan = 0;
                     if (currentLevel === columnFields.length - 1) {
                          // If it's the last level of column fields, colspan is the number of value fields
                          colspan = valueFields.length || 1;
                     } else {
                          // Calculate colspan based on lower-level combinations
                           const remainingColFields = columnFields.slice(currentLevel + 1);
                           const lowerLevelCombinations = getLowerLevelCombinationsCount(currentColKey, currentLevel, remainingColFields, data, columnFields) || 1;
                           colspan = lowerLevelCombinations * (valueFields.length || 1);
                            if (valueFields.length === 0) colspan = lowerLevelCombinations;
                     }


                      // Add the header cell to the correct row
                      const headerRowIndex = currentLevel;
                      // Ensure the target header row exists before pushing
                       if (headerRows[headerRowIndex]) {
                          headerRows[headerRowIndex].push({ text: val, colspan: colspan, rowspan: 1, type: 'column-group', level: currentLevel });
                       }

                     // Recursively populate lower level headers
                     populateColHeaders(currentLevel + 1, currentColKey);
                });
            };

            populateColHeaders(0); // Start building from the first column field

            // Add value field headers below the last column field headers
             if (valueFields.length > 0) {
                  const valueHeaderRowIndex = columnFields.length;
                  // Add value headers under each unique full column key combination
                   uniqueColKeys.forEach(colKey => {
                       valueFields.forEach(({ field, aggregation }) => {
                            // Ensure the target header row exists before pushing
                             if (headerRows[valueHeaderRowIndex]) {
                                headerRows[valueHeaderRowIndex].push({ text: `${field} (${aggregation})`, colspan: 1, rowspan: 1, type: 'value' });
                             }
                       });
                   });
             }
       } else if (valueFields.length > 0) {
           // Only value fields selected (no column fields)
            const valueHeaderRowIndex = 0; // Value headers are in the first row
             valueFields.forEach(({ field, aggregation }) => {
                 // Ensure the target header row exists before pushing
                  if (headerRows[valueHeaderRowIndex]) {
                     headerRows[valueHeaderRowIndex].push({ text: `${field} (${aggregation})`, colspan: 1, rowspan: 1, type: 'value' });
                  }
             });
       }


      // Add Grand Total column header(s)
       if (valueFields.length > 0 && (rowFields.length > 0 || columnFields.length > 0)) {
            const grandTotalColspan = valueFields.length;
            const grandTotalRowspan = totalHeaderLevels - (columnFields.length); // Span remaining header rows below column fields

            // Add to the header row corresponding to the last level of column headers, or the first if no column fields
             const targetHeaderRowIndex = columnFields.length;
             // Ensure the target header row exists before pushing
              if (headerRows[targetHeaderRowIndex]) {
                  headerRows[targetHeaderRowIndex].push({ text: 'Grand Total', colspan: grandTotalColspan, rowspan: grandTotalRowspan, type: 'grand-total-column' });
              }
       }


      // Clean up empty header rows that might have been created (less likely with this structured approach)
       const finalHeaderRows = headerRows.filter(row => row.length > 0);


     return finalHeaderRows;
  };

  // Helper function to determine if a row field cell should be displayed (for rowspan)
  const shouldDisplayRowField = (data, rowIndex, rowField, allRowFields) => {
      if (rowIndex < 0 || rowIndex >= data.length) return false;
      if (rowIndex === 0) return true; // Always display for the first row

      const currentFieldLevel = allRowFields.indexOf(rowField);
      if (currentFieldLevel === -1) return true; // Should not happen if called correctly

       // Check if the combination of this field's value and all higher-level row fields' values
       // is different from the previous row's values.
       const currentGroupValues = allRowFields.slice(0, currentFieldLevel + 1).map(f => data[rowIndex][f]).join('|');
       const previousGroupValues = allRowFields.slice(0, currentFieldLevel + 1).map(f => data[rowIndex - 1][f]).join('|');

       return currentGroupValues !== previousGroupValues;
  };

  // Helper function to calculate rowspan for a row field cell
  const getRowspanForRowField = (data, rowIndex, rowField, allRowFields) => {
      if (rowIndex < 0 || rowIndex >= data.length) return 1;

       const currentFieldLevel = allRowFields.indexOf(rowField);
       if (currentFieldLevel === -1) return 1;

       let rowspan = 0;
       const currentGroupValues = allRowFields.slice(0, currentFieldLevel + 1).map(f => data[rowIndex][f]).join('|');

       for (let i = rowIndex; i < data.length; i++) {
           const currentRowGroupValues = allRowFields.slice(0, currentFieldLevel + 1).map(f => data[i][f]).join('|');
            if (currentRowGroupValues === currentGroupValues) {
                rowspan++;
            } else {
                break; // Stop counting when the group changes
            }
       }
       return rowspan > 0 ? rowspan : 1; // Minimum rowspan is 1
  };


  // Call aggregateData and get headers inside the render function
  const { result, uniqueColKeys } = aggregateData(
    structuredData,
    rowFields,
    columnFields,
    valueFields
  );
  // Pass structuredData to getTableHeader as it's needed for colspan calculations
  const tableHeader = getTableHeader(rowFields, columnFields, valueFields, uniqueColKeys, structuredData);


  const showTable = rowFields.length > 0 || columnFields.length > 0 || valueFields.length > 0;


  const downloadExcel = () => {
    if (!pivotTableRef.current) return;

    // Use table_to_sheet to convert the HTML table element
     const wb = utils.book_new();
     const ws = utils.table_to_sheet(pivotTableRef.current);
     utils.book_append_sheet(wb, ws, "Pivot Table");
     writeFile(wb, "pivot_table.xlsx");
  };


  return (
    <div style={styles.container}>
      <div style={styles.pivotContainer}>
        <h2 style={styles.pivotTablePlaceholder}>PIVOT TABLE</h2>
        {showTable && valueFields.length > 0 ? ( // Ensure value fields are selected to show the table
          <>
            {result.length === 0 && (rowFields.length > 0 || columnFields.length > 0) ? (
               <div style={styles.placeholderMessage}>No data to display for the selected fields.</div>
            ) : (
               <table style={styles.pivotTable} ref={pivotTableRef}>
                 <thead>
                   {/* Render multi-level headers */}
                   {tableHeader.map((headerRow, rowIndex) => (
                     <tr key={`header-row-${rowIndex}`}>
                       {headerRow.map((headerCell, cellIndex) => (
                         <th
                           key={`header-cell-${rowIndex}-${cellIndex}`}
                           style={styles.tableHeader}
                           colSpan={headerCell.colspan || 1} // Default colspan to 1 if not specified
                           rowSpan={headerCell.rowspan || 1} // Default rowspan to 1 if not specified
                         >
                           {headerCell.text}
                         </th>
                       ))}
                     </tr>
                   ))}
                 </thead>
                 <tbody>
                   {/* Render table body with nested rows */}
                   {result.map((row, rowIndex) => {
                     // Determine row type (data or grand total)
                      const isGrandTotalRow = row._isGrandTotal === true;

                      const rowStyle = isGrandTotalRow ? styles.tableRowGrand : styles.tableRow;

                     return (
                       <tr key={`data-row-${rowIndex}`} style={rowStyle}>
                         {/* Render row field cells with rowspan */}
                         {rowFields.map((rowField, rowFieldIndex) => {
                              // For Grand Total row, render a single cell spanning all row field columns
                             if (isGrandTotalRow) {
                                  if (rowFieldIndex === 0) { // Only render the first cell
                                      return (
                                           <td key={`row-${rowIndex}-label`} style={styles.tableCellGrand} colSpan={rowFields.length || 1}>
                                               Grand Total
                                           </td>
                                      );
                                  } else {
                                      return null; // Other row field cells are spanned
                                  }
                             }

                             // For data rows, determine if the cell should be displayed and its rowspan
                             const displayCell = shouldDisplayRowField(result, rowIndex, rowField, rowFields);
                             const rowspan = getRowspanForRowField(result, rowIndex, rowField, rowFields);

                             if (displayCell) {
                                 return (
                                     <td key={`row-${rowIndex}-field-${rowFieldIndex}`} style={styles.tableCell} rowSpan={rowspan}>
                                         {row[rowField]}
                                     </td>
                                 );
                             } else {
                                 return null; // Cell is spanned by the cell above
                             }
                         })}

                          {/* Render the single Grand Total label cell if no row fields */}
                          {!rowFields.length && isGrandTotalRow && (
                                <td key={`row-${rowIndex}-label`} style={styles.tableCellGrand}>
                                    Grand Total
                                </td>
                          )}


                         {/* Render data cells, column totals, and overall grand total */}
                         {/* Iterate through column keys and value fields to get data */}
                          {uniqueColKeys.map(colKey => (
                               valueFields.map(valueField => {
                                    // Key to access the data in the row object
                                    const dataKey = `${colKey} - ${valueField.field} (${valueField.aggregation})`;
                                    return (
                                         <td key={`cell-${rowIndex}-${colKey}-${valueField.field}`} style={isGrandTotalRow ? styles.tableCellGrand : styles.tableCell}>
                                              {row[dataKey] || '0.00'}
                                         </td>
                                    );
                               })
                          ))}

                           {/* Render Row Grand Total cells for data rows (already included in uniqueColKeys loop if columnFields > 0) */}
                           {/* If no column fields, render the value field directly */}
                           {!columnFields.length && valueFields.length > 0 && !isGrandTotalRow && (
                                valueFields.map(valueField => {
                                     const dataKey = `${valueField.field} (${valueField.aggregation})`; // Key for value-only case
                                      return (
                                           <td key={`cell-${rowIndex}-${valueField.field}`} style={styles.tableCell}>
                                               {row[dataKey] || '0.00'}
                                           </td>
                                      );
                                })
                           )}


                            {/* Render Grand Total column cells */}
                            { valueFields.length > 0 && (rowFields.length > 0 || columnFields.length > 0) && (
                                 valueFields.map(valueField => {
                                     const grandTotalDataKey = `Grand Total - ${valueField.field} (${valueField.aggregation})`;
                                     return (
                                          <td key={`grand-total-${rowIndex}-${valueField.field}`} style={isGrandTotalRow ? styles.tableCellGrand : styles.tableCell}>
                                              {row[grandTotalDataKey] || '0.00'}
                                          </td>
                                     );
                                 })
                            )}


                       </tr>
                     );
                   })}
                 </tbody>
               </table>
            )}
            <button style={styles.downloadButton} onClick={downloadExcel}>
              Download as Excel
            </button>
          </>
        ) : (
          <div style={styles.placeholderMessage}>
            <h2 style={styles.placeholderMessage}>
              To Construct a Pivot table
            </h2>
            Select at least one field in Value. Selecting fields in Row or Column will provide more detailed analysis.
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
          rowFields // rowFields is array of strings
        )}
        {renderFieldDropdown(
          "Column Fields",
          headers,
          selectedColumn,
          setSelectedColumn,
          setColumnFields,
          columnFields // columnFields is array of strings
        )}
        {renderFieldDropdown(
          "Value Fields",
          headers,
          selectedValue,
          setSelectedValue,
          setValueFields,
          valueFields, // valueFields is array of objects {field, aggregation}
          true, // Include aggregation options
          defaultAggregationType, // Pass default aggregation state
          setDefaultAggregationType // Pass function to update default aggregation
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
    alignItems: 'center', // Vertically center items
    backgroundColor: "White",
    padding: "4px 8px",
    borderRadius: "10px",
    fontSize: "14px",
    color: "Black",
  },
  removeButton: {
    background: "red",
    color: "white",
    border: "none",
    borderRadius: "12px",
    padding: "2px 6px",
    cursor: "pointer",
    fontSize: "10px",
    marginLeft: "5px",
  },
  pivotTable: {
    width: "100%",
    borderCollapse: "collapse",
    backgroundColor: "#fff",
    fontSize: "13px",
    marginTop: "20px",
  },
  tableHeader: {
    border: "1px solid #ccc",
    padding: "8px",
    backgroundColor: "#f0f0f0",
    textAlign: "center",
    fontWeight: "bold",
    whiteSpace: "nowrap", // Prevent header text wrapping
  },
  tableRow: {
    border: "1px solid #ccc",
  },
  tableRowGrand: {
    border: "1px solid #ccc",
    fontWeight: "bold",
    backgroundColor: "#f0f0f0",
  },
  tableCell: {
    border: "1px solid #ccc",
    padding: "8px",
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
    alignSelf: "flex-start",
  },
};

export default GeneratingFields;